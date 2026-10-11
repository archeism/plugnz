import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import type { HostWriter, InstalledPlugin, PinOutcome } from './host';
import type { DurableLifecycleOperation, PreparedActivationMutation, StagedProjection, DirectivesAppliedProjection, PinsAppliedProjection } from './lifecycle-host';
import { createFrozenPackageSnapshot, createLifecyclePlanCoverage, createResolvedLifecyclePins, LifecycleHostPhaseError } from './lifecycle-runtime';
import { fingerprintTree } from './fingerprint';
import { inventoryPackageSemantics } from './semantic-inventory';
import { readLifecycleState, type ActivationRecord, type LifecycleAttemptRecord, type PendingPhase } from './state';
import { writeLifecycleState } from './state-write';

/** Pin the recorded active bytes offline, using the same sealed mutation SPI as update. */
export async function runOfflineLifecyclePin(host: HostWriter, plugin: InstalledPlugin, dryRun: boolean): Promise<PinOutcome> {
  const adapter = host.lifecyclePinAdapter;
  if (adapter === undefined || plugin.path === undefined) throw new Error('offline lifecycle pin has no adapter or active root');
  let state = readLifecycleState().state;
  const matches = state.activations.filter(row => row.nativeId === plugin.id && state.scopes.some(scope => scope.id === row.scopeId && scope.target.kind === host.id));
  if (matches.length !== 1) throw new Error('offline lifecycle pin requires one recorded owned activation');
  const activation = matches[0]!;
  const scope = state.scopes.find(row => row.id === activation.scopeId)!;
  if (activation.ownership.kind === 'legacy-claim' || activation.route.kind === 'legacy-unverified' || activation.sourceRevision === undefined || activation.pending !== undefined) throw new Error('offline lifecycle pin requires verified ownership with no pending recovery');
  if (activation.activationState !== 'active' || activation.readbackState !== 'verified') throw new Error('offline lifecycle pin requires a verified active installation');
  const preview = await host.pin(plugin, { dryRun: true });
  if (preview.refusals.length !== 0) return { changes: [], refusals: preview.refusals };
  if (preview.changes.length === 0) return preview;
  const now = new Date().toISOString();
  const frozenRoot = mkdtempSync(join(tmpdir(), 'plgnz-offline-pin-'));
  const attemptId = `pin-${basename(frozenRoot)}`;
  const operationId = `${attemptId}:${plugin.id}`;
  let handle: DurableLifecycleOperation | undefined;
  let preparation: StagedProjection | DirectivesAppliedProjection | PinsAppliedProjection | PreparedActivationMutation | undefined;
  let accepted = false, applying = false, committed = false;
  const attempt: LifecycleAttemptRecord = { id: attemptId, command: 'update', phase: 'accepted', mutationStarted: false, scopeIds: [scope.id], journal: [{ operationId, scopeId: scope.id, packageId: activation.packageId, nativeId: activation.nativeId, action: 'update', state: 'pending', route: activation.route, startedAt: now, updatedAt: now }], startedAt: now, updatedAt: now };
  const persist = (nextActivation: ActivationRecord): void => {
    if (readLifecycleState().state.stateGeneration !== state.stateGeneration) throw new Error('pin ledger changed concurrently; refusing stale commit');
    state = { ...state, stateGeneration: state.stateGeneration + 1, activations: state.activations.map(row => row.scopeId === activation.scopeId && row.nativeId === activation.nativeId ? nextActivation : row), attempts: [...state.attempts.filter(row => row.id !== attemptId), { ...attempt, journal: attempt.journal.map(row => ({ ...row })) }] };
    writeLifecycleState(state, { globalPreflight: 'succeeded' });
  };
  const pending = (phase: PendingPhase): void => persist({ ...activation, pending: { operation: 'update', phase, attemptId, startedAt: now }, readbackState: 'pending' });
  try {
    cpSync(plugin.path, frozenRoot, { recursive: true });
    const packageFingerprint = fingerprintTree(frozenRoot);
    if (packageFingerprint !== activation.fingerprints.installed) throw new Error('pin active bytes differ from recorded readback');
    const target = { kind: scope.target.kind, instance: scope.target.instance };
    const observed = await adapter.observeTarget(target);
    const installed = observed.installations.find(row => row.nativeId === plugin.id);
    if (installed?.ownership.kind !== 'owned' || installed.ownership.scopeId !== scope.id || installed.installedFingerprint !== packageFingerprint || installed.enablement !== 'enabled') throw new Error('pin native identity or bytes differ from the recorded owned activation');
    const version = await adapter.probeVersion(target);
    const sourceType = scope.source.kind;
    const inventory = inventoryPackageSemantics({ dir: frozenRoot, name: activation.packageId, ...(plugin.version === undefined ? {} : { version: plugin.version }), contentFingerprint: packageFingerprint });
    const snapshot = createFrozenPackageSnapshot({ operationId, attemptId, scopeId: scope.id, target, action: 'update', packageName: activation.packageId, nativeId: plugin.id, sourceType, immutableRevision: activation.sourceRevision, snapshotRoot: frozenRoot, packageRoot: frozenRoot, relativePackagePath: '.', snapshotFingerprint: packageFingerprint, packageFingerprint, ...(sourceType === 'git' ? { nativeGit: { locator: scope.source.locator, resolvedRevision: activation.sourceRevision } } : {}), inventory });
    const pins = createResolvedLifecyclePins(preview.changes.map(change => ({ server: change.server, executable: change.to })).sort((left, right) => left.server < right.server ? -1 : left.server > right.server ? 1 : 0));
    const nativeScope = await adapter.observeNativeMutationScope({ targetObservation: observed, operation: 'update', packageName: activation.packageId, nativeId: plugin.id, sourceType });
    const nativeProjection = await adapter.observeNativeProjection({ targetObservation: observed, operation: 'update', snapshot, pins });
    const selection = adapter.decideRoute({ target, operationId, attemptId, scopeId: scope.id, packageName: activation.packageId, nativeId: plugin.id, version, sourceType, targetObservation: observed, nativeScope, nativeProjection, planCoverage: createLifecyclePlanCoverage(observed, [{ nativeId: plugin.id, operationId, operation: 'update', mutationGroupId: operationId, authorization: 'observed-owned' }]), operation: 'update', snapshot, pins });
    if (selection.kind !== 'selected') throw new Error(`pin capability ${selection.status}: ${selection.gaps.map(gap => gap.capabilityId).join(', ')}`);
    if (selection.route !== 'managed') throw new Error('offline lifecycle pin requires a frozen Managed projection');
    if (dryRun) return preview;
    pending('accepted');
    accepted = true;
    preparation = await adapter.stageActivation({ selection, snapshot, pins });
    preparation = await adapter.applyLifecycleDirectives(preparation);
    preparation = await adapter.applyPins(preparation);
    const sealed = await adapter.sealActivation(preparation); preparation = sealed; handle = sealed.handle;
    attempt.phase = 'applying'; attempt.mutationStarted = true; attempt.journal[0]!.state = 'applying'; pending('applying');
    applying = true;
    await adapter.apply(sealed);
    const observation = await adapter.readback(handle);
    adapter.verify(handle, observation);
    if (observation.installedFingerprint === null || handle.projectedFingerprint === null) throw new Error('pin readback lacks exact installed/projected fingerprint');
    attempt.phase = 'finalizing'; attempt.journal[0]!.state = 'readback-verified';
    const pinnedActivation: ActivationRecord = { ...activation, route: { kind: handle.route, evidenceKey: { kind: 'capability-profile', key: handle.evidenceId } }, fingerprints: { ...activation.fingerprints, projected: handle.projectedFingerprint, installed: observation.installedFingerprint }, pins: [...new Set([...activation.pins, ...pins.map(pin => pin.server)])].sort(), readbackState: 'verified', readbackAt: now, updatedAt: now };
    persist(pinnedActivation); committed = true;
    try { await adapter.cleanup(handle, 'verified-commit'); }
    catch (error) { attempt.journal[0]!.state = 'cleanup-pending'; persist({ ...pinnedActivation, pending: { operation: 'update', phase: 'cleanup', attemptId, startedAt: now } }); await adapter.releaseRecovery(handle); throw error; }
    attempt.phase = 'completed'; attempt.journal[0]!.state = 'completed'; attempt.completedAt = now; persist(pinnedActivation);
    const activatedRoot = observation.contentRoots[0]?.path;
    return { ...preview, changes: preview.changes.map(change => ({ ...change, file: activatedRoot === undefined ? change.file : join(activatedRoot, relative(plugin.path!, change.file)) })) };
  } catch (error) {
    if (!committed && handle !== undefined && applying) {
      if (!(error instanceof LifecycleHostPhaseError && error.mutationStarted === false)) {
        attempt.phase = 'recovery-required'; attempt.journal[0]!.state = 'rollback'; pending('rollback');
        try {
          await adapter.rollback(handle); adapter.verifyRollback(handle, await adapter.readback(handle));
          await adapter.cleanup(handle, 'verified-rollback');
          attempt.phase = 'failed'; attempt.journal[0]!.state = 'rolled-back'; persist(activation);
        } catch (recoveryError) { await adapter.releaseRecovery(handle); throw new Error(`pin failed: ${(error as Error).message}; recovery remains pending: ${(recoveryError as Error).message}`); }
      } else {
        attempt.phase = 'failed'; attempt.journal[0]!.state = 'not-attempted'; attempt.mutationStarted = false; persist(activation);
        await adapter.cleanup(handle, 'aborted-preparation');
      }
    } else if (!committed && accepted) {
      try { if (preparation !== undefined) await adapter.cleanup(preparation, 'aborted-preparation'); }
      finally { attempt.phase = 'failed'; attempt.journal[0]!.state = 'not-attempted'; persist(activation); }
    }
    throw error;
  } finally {
    try { if (handle !== undefined) await adapter.releaseRecovery(handle); }
    finally { rmSync(frozenRoot, { recursive: true, force: true }); }
  }
}
