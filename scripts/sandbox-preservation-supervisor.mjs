// Private large-acquisition monitor. Filesystem projection runs in a worker so
// a slow walk cannot delay the supervisor's whole-filesystem guard or kill.
import { Worker } from 'node:worker_threads';
import { retentionStopReason } from './sandbox-preservation-budget.mjs';

export function startLargeRetentionSupervisor({ root, suppliers, config, profile, baseline, used, stop,
  recordAllocated = () => {}, intervalMs = 500, measurementDeadlineMs = 750 }) {
  let closed = false, halted = false, worker = null, deadline = null;
  const requestStop = reason => { if (closed || halted) return; halted = true; stop(reason); };
  const finishCycle = () => { clearTimeout(deadline); deadline = null; };
  const launchMeasurement = () => {
    if (closed || halted) return;
    let current;
    try {
      current = worker = new Worker(new URL('./sandbox-preservation-monitor.mjs', import.meta.url),
        { workerData: { root, suppliers } });
    } catch (error) {
      finishCycle(); requestStop(`measurement-failed: ${String(error)}`); return;
    }
    let settled = false;
    const settleWorker = () => {
      if (settled) return false;
      settled = true;
      if (worker === current) worker = null;
      return true;
    };
    current.once('message', result => {
      if (!settleWorker()) return;
      if (result.unstable === 'ENOENT') {
        // The original cycle deadline remains armed across complete rescans.
        queueMicrotask(launchMeasurement); return;
      }
      finishCycle();
      if (result.error !== undefined) requestStop(`measurement-failed: ${result.error}`);
      else {
        const reason = retentionStopReason(result.measurement, config, profile);
        if (reason !== null) requestStop(reason); else queueMicrotask(sample);
      }
    });
    current.once('error', error => {
      if (!settleWorker()) return;
      finishCycle(); requestStop(`measurement-failed: ${String(error)}`);
    });
    current.once('exit', code => {
      if (code === 0 || !settleWorker()) return;
      finishCycle(); requestStop(`measurement-worker-exit-${code}`);
    });
  };
  const sample = () => {
    if (closed || halted) return;
    try {
      const allocated = used(); recordAllocated(allocated);
      if (allocated - baseline >= config.diskGrowthBytes - config.diskReserveBytes) {
        requestStop('disk-budget'); return;
      }
      if (worker !== null || deadline !== null) return;
      deadline = setTimeout(() => {
        const current = worker; worker = null; finishCycle();
        requestStop('retention-measurement-deadline'); if (current !== null) void current.terminate();
      }, measurementDeadlineMs);
      launchMeasurement();
    } catch (error) { requestStop(`measurement-failed: ${String(error)}`); }
  };
  sample();
  const interval = setInterval(sample, intervalMs);
  return async () => {
    closed = true; clearInterval(interval); clearTimeout(deadline);
    if (worker !== null) await worker.terminate();
  };
}
