// Private large-acquisition monitor. Filesystem projection runs in a worker so
// a slow walk cannot delay the supervisor's whole-filesystem guard or kill.
import { Worker } from 'node:worker_threads';
import { retentionStopReason } from './sandbox-preservation-budget.mjs';

export function startLargeRetentionSupervisor({ root, suppliers, config, profile, baseline, used, stop,
  recordAllocated = () => {}, intervalMs = 500, measurementDeadlineMs = 750 }) {
  let closed = false, halted = false, worker = null, deadline = null;
  const requestStop = reason => { if (closed || halted) return; halted = true; stop(reason); };
  const sample = () => {
    if (closed || halted) return;
    try {
      const allocated = used(); recordAllocated(allocated);
      if (allocated - baseline >= config.diskGrowthBytes - config.diskReserveBytes) {
        requestStop('disk-budget'); return;
      }
      if (worker !== null) return;
      const current = worker = new Worker(new URL('./sandbox-preservation-monitor.mjs', import.meta.url),
        { workerData: { root, suppliers } });
      let settled = false;
      const settle = () => {
        if (settled) return false;
        settled = true; clearTimeout(deadline); deadline = null;
        if (worker === current) worker = null;
        return true;
      };
      deadline = setTimeout(() => {
        if (!settle()) return;
        requestStop('retention-measurement-deadline'); void current.terminate();
      }, measurementDeadlineMs);
      current.once('message', result => {
        if (!settle()) return;
        if (result.error !== undefined) requestStop(`measurement-failed: ${result.error}`);
        else {
          const reason = retentionStopReason(result.measurement, config, profile);
          if (reason !== null) requestStop(reason); else queueMicrotask(sample);
        }
      });
      current.once('error', error => { if (settle()) requestStop(`measurement-failed: ${String(error)}`); });
      current.once('exit', code => { if (code !== 0 && settle()) requestStop(`measurement-worker-exit-${code}`); });
    } catch (error) { requestStop(`measurement-failed: ${String(error)}`); }
  };
  sample();
  const interval = setInterval(sample, intervalMs);
  return async () => {
    closed = true; clearInterval(interval); clearTimeout(deadline);
    if (worker !== null) await worker.terminate();
  };
}
