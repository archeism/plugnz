import { adoptionDigest, canonicalAdoptionJson, parseLegacyRecordProof, type AdoptionDigest, type LegacyRecordProof } from './legacy-adoption-proof';
import { parseLifecycleReadbackData, type SerializedLifecycleOperation } from './lifecycle-operation-record';
import { parseRecoveryOperationProof, type RecoveryOperationProof } from './recovery-proof';
import { validateSourceBinding, validateStableIdentityString, type SourceSnapshotReference } from './source-reference';
import { parsePersistedTargetIdentity, type PersistedTargetIdentity } from './target-identity';
import { parseCursorAdoptionNativeProof, type CursorAdoptionNativeProof } from './hosts/cursor-adoption-proof';
import type { LifecycleStateV2 } from './state';

export type AdoptionNativeProof = CursorAdoptionNativeProof;
export interface AdoptionAdmission {
  schemaVersion: 1; original: RecoveryOperationProof; legacyRecordDigest: AdoptionDigest;
  source: SourceSnapshotReference; target: PersistedTargetIdentity;
  packageName: string; packageVersion: string; projectedFingerprint: AdoptionDigest;
  native: AdoptionNativeProof;
  fresh: {
    attemptId: string; operationId: string; command: 'add' | 'sync'; baseStateGeneration: number;
    scopeId: string; packageName: string; nativeId: string; sourceSnapshotId: string;
    action: 'install' | 'route-migrate'; route: 'managed';
  };
  admissionId: AdoptionDigest;
}
export interface AdoptionSeal {
  schemaVersion: 1; admissionId: AdoptionDigest; adapterId: string; attemptId: string; operationId: string;
  scopeId: string; target: PersistedTargetIdentity; packageName: string; nativeId: string;
  action: 'install' | 'route-migrate'; route: 'managed'; source: SourceSnapshotReference;
  projectedFingerprint: AdoptionDigest; affectedNativeIds: string[];
  prior: SerializedLifecycleOperation['prior']; expected: SerializedLifecycleOperation['expected'];
}
export interface AdoptionCommit {
  schemaVersion: 1; admissionId: AdoptionDigest; sealDigest: AdoptionDigest;
  verifiedReadback: SerializedLifecycleOperation['expected']; stateGeneration: number;
  committedAt: string; commitId: AdoptionDigest;
}
export interface AdoptionRecord {
  schemaVersion: 1; legacy: LegacyRecordProof; admission: AdoptionAdmission;
  seal: AdoptionSeal | null; sealDigest: AdoptionDigest | null;
  phase: 'prepared' | 'not-attempted' | 'rolled-back' | 'committed'; commit: AdoptionCommit | null;
}
export interface LegacyAdoptions { schemaVersion: 1; records: AdoptionRecord[] }

/** Preserve first retention and every closed receipt across ledger replacements. */
export function assertLegacyAdoptionHistoryTransition(previous: LifecycleStateV2, next: LifecycleStateV2): void {
  for (const record of next.legacyAdoptions?.records ?? []) {
    const old = previous.legacyAdoptions?.records.find(retained => retained.admission.admissionId === record.admission.admissionId);
    if (record.phase === 'committed' && old?.phase !== 'committed' && record.commit?.stateGeneration !== next.stateGeneration) {
      fail('new adoption commit must bind the atomic replacement generation');
    }
  }
  for (const old of previous.legacyAdoptions?.records ?? []) {
    const retained = next.legacyAdoptions?.records.find(record => record.admission.admissionId === old.admission.admissionId);
    if (retained === undefined || canonicalAdoptionJson(retained.legacy) !== canonicalAdoptionJson(old.legacy)
      || canonicalAdoptionJson(retained.admission) !== canonicalAdoptionJson(old.admission)) fail('ledger replacement lost or redefined retained adoption history');
    if (old.phase !== 'prepared' && retained.phase !== old.phase
      || (old.seal !== null || old.phase !== 'prepared') && canonicalAdoptionJson(retained.seal) !== canonicalAdoptionJson(old.seal)
      || (old.sealDigest !== null || old.phase !== 'prepared') && retained.sealDigest !== old.sealDigest
      || (old.commit !== null || old.phase !== 'prepared') && canonicalAdoptionJson(retained.commit) !== canonicalAdoptionJson(old.commit)) fail('ledger replacement rewrote immutable adoption seal/settlement');
  }
}

export function parseAdoptionAdmission(value: unknown): AdoptionAdmission {
  const row = object(value); exact(row, ['schemaVersion', 'original', 'legacyRecordDigest', 'source', 'target', 'packageName', 'packageVersion', 'projectedFingerprint', 'native', 'fresh', 'admissionId']);
  version(row); const original = parseRecoveryOperationProof(row.original);
  if (original.command !== 'legacy-recovery' || original.sealed) fail('admission requires an unsealed legacy original');
  const source = sourceReference(row.source); const target = parsePersistedTargetIdentity(row.target, 'adoption target');
  stable(row.packageName); stable(row.packageVersion); digest(row.legacyRecordDigest); digest(row.projectedFingerprint);
  const fresh = object(row.fresh); exact(fresh, ['attemptId', 'operationId', 'command', 'baseStateGeneration', 'scopeId', 'packageName', 'nativeId', 'sourceSnapshotId', 'action', 'route']);
  for (const key of ['attemptId', 'operationId', 'scopeId', 'packageName', 'nativeId', 'sourceSnapshotId']) stable(fresh[key]);
  member(fresh.command, ['add', 'sync']); member(fresh.action, ['install', 'route-migrate']); member(fresh.route, ['managed']); generation(fresh.baseStateGeneration, 0);
  const native = parseCursorAdoptionNativeProof(row.native);
  if (native.adapterId !== target.kind) fail('admission native adapter differs from its target host');
  if (row.projectedFingerprint !== native.projectedPayloadFingerprint) fail('admission projected fingerprint differs from its exact native payload proof');
  if (fresh.scopeId !== original.scope.id || fresh.packageName !== row.packageName || fresh.nativeId !== native.newNativeId
    || native.oldLedgerNativeId !== original.nativeId || native.packageName !== row.packageName || native.packageVersion !== row.packageVersion
    || target.kind !== original.scope.target.kind || target.instance !== original.scope.target.instance
    || canonicalAdoptionJson(source.binding) !== canonicalAdoptionJson(original.scope.source)) fail('admission original/source/target/fresh identity mismatch');
  const { admissionId: _id, ...payload } = row;
  if (row.admissionId !== adoptionDigest('plugnz/legacy-admission/v1', payload)) fail('admission digest mismatch');
  return detached(row) as unknown as AdoptionAdmission;
}

export function parseAdoptionRecord(value: unknown): AdoptionRecord {
  const row = object(value); exact(row, ['schemaVersion', 'legacy', 'admission', 'seal', 'sealDigest', 'phase', 'commit']); version(row);
  const legacy = parseLegacyRecordProof(row.legacy); const admission = parseAdoptionAdmission(row.admission);
  if (canonicalAdoptionJson(legacy.original) !== canonicalAdoptionJson(admission.original) || legacy.recordDigest !== admission.legacyRecordDigest
    || canonicalAdoptionJson(legacy.snapshot.scope.target) !== canonicalAdoptionJson(admission.target)) fail('relation does not retain its exact original');
  if (admission.source.binding.kind === 'local' && admission.native.marker.source !== admission.source.binding.locator
    || canonicalAdoptionJson(admission.native.pins) !== canonicalAdoptionJson(legacy.snapshot.activation.pins)
    || legacy.snapshot.activation.fingerprints.source !== undefined
      && legacy.snapshot.activation.fingerprints.source !== admission.native.marker.fingerprint) fail('native marker/pins differ from retained original');
  member(row.phase, ['prepared', 'not-attempted', 'rolled-back', 'committed']);
  if ((row.seal === null) !== (row.sealDigest === null)) fail('seal and digest must both be present or null');
  let seal: AdoptionSeal | null = null;
  if (row.seal !== null) {
    seal = parseSeal(row.seal, admission);
    if (row.sealDigest !== adoptionDigest('plugnz/legacy-adoption-seal/v1', seal)) fail('seal digest mismatch');
  }
  if (row.phase === 'not-attempted' && row.commit !== null || row.phase === 'rolled-back' && (seal === null || row.commit !== null)
    || row.phase === 'prepared' && row.commit !== null || row.phase === 'committed' && (seal === null || row.commit === null)) fail('relation phase contradicts seal/commit');
  if (row.commit !== null) {
    const commit = object(row.commit); exact(commit, ['schemaVersion', 'admissionId', 'sealDigest', 'verifiedReadback', 'stateGeneration', 'committedAt', 'commitId']); version(commit);
    generation(commit.stateGeneration, admission.fresh.baseStateGeneration + 1); stable(commit.committedAt);
    if (typeof commit.committedAt !== 'string' || !Number.isFinite(Date.parse(commit.committedAt))) fail('invalid commit timestamp');
    parseLifecycleReadbackData(commit.verifiedReadback);
    if (commit.admissionId !== admission.admissionId || commit.sealDigest !== row.sealDigest
      || canonicalAdoptionJson(commit.verifiedReadback) !== canonicalAdoptionJson(seal!.expected)) fail('commit does not verify the exact sealed candidate');
    const { commitId: _id, ...payload } = commit;
    if (commit.commitId !== adoptionDigest('plugnz/legacy-adoption-commit/v1', payload)) fail('commit digest mismatch');
  }
  return detached(row) as unknown as AdoptionRecord;
}

export function parseLegacyAdoptions(value: unknown, state: LifecycleStateV2): LegacyAdoptions {
  const row = object(value); exact(row, ['schemaVersion', 'records']); version(row);
  if (!Array.isArray(row.records)) fail('records must be an array');
  const records = row.records.map(parseAdoptionRecord);
  const snapshots = new Map<string, string>(); const committed = new Set<string>(); const pending = new Set<string>();
  const admissions = new Set<string>(); const freshIds = new Set<string>();
  for (const record of records) {
    const original = record.legacy.original; const originalKey = canonicalAdoptionJson([original.attemptId, original.operationId]);
    const snapshot = canonicalAdoptionJson(record.legacy);
    if (snapshots.has(originalKey) && snapshots.get(originalKey) !== snapshot) fail('conflicting immutable original snapshots');
    snapshots.set(originalKey, snapshot);
    if (admissions.has(record.admission.admissionId)) fail('duplicate admission identity'); admissions.add(record.admission.admissionId);
    const freshKey = canonicalAdoptionJson([record.admission.fresh.attemptId, record.admission.fresh.operationId]);
    if (freshIds.has(freshKey)) fail('duplicate fresh relation identity'); freshIds.add(freshKey);
    const scope = state.scopes.find(scope => scope.id === original.scope.id);
    const oldAttempt = state.attempts.find(attempt => attempt.id === original.attemptId);
    const oldJournal = oldAttempt?.journal.find(journal => journal.operationId === original.operationId);
    if (scope === undefined || canonicalAdoptionJson({ id: scope.id, source: scope.source, target: scope.target }) !== canonicalAdoptionJson(record.legacy.snapshot.scope)
      || oldAttempt?.command !== 'legacy-recovery' || !oldAttempt.scopeIds.includes(scope.id)
      || oldJournal === undefined || canonicalAdoptionJson(oldJournal) !== canonicalAdoptionJson(record.legacy.snapshot.journal)) fail('original historical record was changed or lost');
    const fresh = record.admission.fresh; const attempt = state.attempts.find(attempt => attempt.id === fresh.attemptId);
    if (fresh.baseStateGeneration >= state.stateGeneration) fail('retained admission must follow its frozen base generation');
    const journal = attempt?.journal.find(journal => journal.operationId === fresh.operationId);
    if (attempt?.command !== fresh.command || !attempt.scopeIds.includes(fresh.scopeId) || journal?.scopeId !== fresh.scopeId
      || journal.packageId !== fresh.packageName || journal.nativeId !== fresh.nativeId || journal.action !== fresh.action) fail('relation has no exact fresh journal');
    if (record.seal === null) {
      if (journal.sealedOperation !== undefined || !['pending', 'not-attempted'].includes(journal.state)) fail('unsealed relation cannot authorize mutation');
    } else if (journal.sealedOperation === undefined || canonicalAdoptionJson(projectAdoptionSeal(record.admission, journal.sealedOperation)) !== canonicalAdoptionJson(record.seal)) fail('relation seal differs from actual fresh handle');
    if (record.phase === 'prepared' && !['pending', 'applying', 'applied', 'readback-verified', 'rollback', 'cleanup-pending'].includes(journal.state)
      || record.phase === 'not-attempted' && journal.state !== 'not-attempted'
      || record.phase === 'rolled-back' && (journal.state !== 'rolled-back' || journal.settlement !== 'rollback')
      || record.phase === 'committed' && (!['cleanup-pending', 'completed'].includes(journal.state) || journal.settlement !== 'commit')) fail('relation phase differs from durable fresh settlement');
    if (record.phase === 'committed') {
      if (committed.has(originalKey)) fail('duplicate committed supersession'); committed.add(originalKey);
      if (record.commit!.stateGeneration > state.stateGeneration) fail('commit generation is in the future');
      if (state.activations.some(activation => activation.scopeId === original.scope.id && activation.packageId === original.package
        && activation.nativeId === original.nativeId && activation.ownership.kind === 'legacy-claim')) fail('committed supersession retained the active legacy alias');
      if (state.stateGeneration === record.commit!.stateGeneration) {
        const activation = state.activations.find(activation => activation.scopeId === fresh.scopeId && activation.packageId === fresh.packageName && activation.nativeId === fresh.nativeId);
        if (activation?.ownership.kind !== 'adopted' || activation.sourceRevision !== record.admission.source.revision
          || activation.fingerprints.projected !== record.seal!.expected.installedFingerprint
          || activation.fingerprints.installed !== record.seal!.expected.installedFingerprint
          || activation.activationState !== 'active' || activation.readbackState !== 'verified' || activation.route.kind !== 'managed'
          || activation.route.evidenceKey.key !== record.admission.native.evidenceId
          || activation.ownership.adoptedAt !== record.commit!.committedAt || activation.ownership.verifiedAt !== record.commit!.committedAt
          || canonicalAdoptionJson(activation.pins) !== canonicalAdoptionJson(record.admission.native.pins)
          || journal.state !== 'cleanup-pending' || activation.pending?.phase !== 'cleanup'
          || activation.pending.attemptId !== fresh.attemptId || activation.pending.operation !== fresh.action) fail('atomic adoption commit lacks its verified canonical activation and cleanup intent');
      }
    } else {
      const activation = state.activations.find(activation => activation.scopeId === original.scope.id && activation.packageId === original.package && activation.nativeId === original.nativeId);
      // After another relation commits, historical rolled-back relations remain
      // valid even though the old alias legitimately disappeared.
      const hasCommit = records.some(other => other.phase === 'committed' && other.legacy.original.attemptId === original.attemptId && other.legacy.original.operationId === original.operationId);
      if (!hasCommit && (activation === undefined || canonicalAdoptionJson(activation) !== canonicalAdoptionJson(record.legacy.snapshot.activation))) fail('legacy activation no longer matches retained original');
    }
    if (record.phase === 'prepared') { if (pending.has(originalKey)) fail('multiple open admissions for one original'); pending.add(originalKey); }
  }
  for (const key of pending) if (committed.has(key)) fail('committed original cannot admit another prepared replacement');
  return { schemaVersion: 1, records };
}

export function projectAdoptionSeal(admission: AdoptionAdmission, handle: SerializedLifecycleOperation): AdoptionSeal {
  const seal = { schemaVersion: 1 as const, admissionId: admission.admissionId, adapterId: handle.adapterId,
    attemptId: handle.attemptId, operationId: handle.operationId, scopeId: handle.scopeId, target: handle.target,
    packageName: handle.packageName, nativeId: handle.nativeId, action: handle.action, route: handle.route,
    source: admission.source, projectedFingerprint: `sha256:${handle.projectedFingerprint}`,
    affectedNativeIds: [...handle.affectedNativeIds], prior: handle.prior, expected: handle.expected };
  if (handle.sourceType !== admission.source.binding.kind || handle.sourceRevision !== admission.source.revision
    || handle.sourceLocator !== (admission.source.binding.kind === 'git' ? admission.source.binding.locator : null)
    || handle.packageVersion !== admission.packageVersion) fail('sealed source/version differs from admission');
  if (admission.native.version.kind !== 'detected' || handle.detectedVersion !== admission.native.version.version
    || handle.versionProbeId !== admission.native.version.probeId || handle.evidenceId !== admission.native.evidenceId
    || handle.mutationGroupId !== admission.fresh.operationId || handle.mutationInvocationOperationId !== admission.fresh.operationId
    || canonicalAdoptionJson(handle.affectedOperationIds) !== canonicalAdoptionJson([admission.fresh.operationId])) fail('sealed evidence/mutation coverage differs from admission');
  return parseSeal(seal, admission);
}

function parseSeal(value: unknown, admission: AdoptionAdmission): AdoptionSeal {
  const row = object(value); exact(row, ['schemaVersion', 'admissionId', 'adapterId', 'attemptId', 'operationId', 'scopeId', 'target', 'packageName', 'nativeId', 'action', 'route', 'source', 'projectedFingerprint', 'affectedNativeIds', 'prior', 'expected']); version(row);
  const expected = parseLifecycleReadbackData(row.expected); const prior = parseLifecycleReadbackData(row.prior);
  const fresh = admission.fresh;
  if (row.admissionId !== admission.admissionId || row.adapterId !== admission.native.adapterId || row.attemptId !== fresh.attemptId || row.operationId !== fresh.operationId
    || row.scopeId !== fresh.scopeId || row.packageName !== fresh.packageName || row.nativeId !== fresh.nativeId || row.action !== fresh.action || row.route !== fresh.route
    || row.projectedFingerprint !== admission.projectedFingerprint || canonicalAdoptionJson(row.target) !== canonicalAdoptionJson(admission.target)
    || canonicalAdoptionJson(row.source) !== canonicalAdoptionJson(admission.source)) fail('seal identity/source differs from admission');
  const nativeIds = strings(row.affectedNativeIds); if (nativeIds.length !== 1 || nativeIds[0] !== admission.native.newNativeId) fail('same-root seal must cover exact native identity');
  for (const observation of [prior, expected]) {
    if (observation.adapterId !== row.adapterId || observation.scopeId !== fresh.scopeId || observation.packageName !== fresh.packageName
      || observation.nativeId !== fresh.nativeId || canonicalAdoptionJson(observation.target) !== canonicalAdoptionJson(admission.target)
      || canonicalAdoptionJson(observation.retention) !== canonicalAdoptionJson(admission.native.retention)) fail('seal readback identity/retention mismatch');
  }
  if (prior.presence !== 'present' || prior.activation !== 'active' || prior.enablement !== 'enabled'
    || expected.presence !== 'present' || expected.activation !== 'active' || expected.enablement !== 'enabled'
    || expected.route !== 'managed' || `sha256:${expected.installedFingerprint}` !== admission.projectedFingerprint) fail('adoption candidate must be present active conforming');
  const nativeRoots = admission.native.roots.map(root => ({ label: root.label, path: root.path, fingerprint: root.fullFingerprint.slice(7) }));
  if (canonicalAdoptionJson(prior.contentRoots) !== canonicalAdoptionJson(nativeRoots)
    || prior.installedFingerprint !== nativeRoots[0]!.fingerprint) fail('prior roots differ from proven original');
  if (expected.contentRoots.length !== nativeRoots.length || expected.contentRoots.some((root, index) => root.label !== nativeRoots[index]?.label
    || root.path !== nativeRoots[index]?.path || root.fingerprint !== expected.installedFingerprint)) fail('candidate escapes proven same root');
  return detached(row) as unknown as AdoptionSeal;
}

function sourceReference(value: unknown): SourceSnapshotReference {
  const row = object(value); exact(row, ['binding', 'revision', 'fingerprint']);
  const binding = object(row.binding); exact(binding, binding.kind === 'git' ? ['kind', 'locator', 'ref'] : ['kind', 'locator']);
  validateSourceBinding(binding as unknown as SourceSnapshotReference['binding']); stable(row.revision); rawDigest(row.fingerprint);
  return row as unknown as SourceSnapshotReference;
}
function object(value: unknown): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('expected object'); return value as Record<string, unknown>; }
function exact(row: Record<string, unknown>, fields: readonly string[]): void { if (Object.keys(row).some(key => !fields.includes(key)) || fields.some(key => !(key in row))) fail('missing or unknown fields'); }
function version(row: Record<string, unknown>): void { if (row.schemaVersion !== 1) fail('schemaVersion must be 1'); }
function stable(value: unknown): void { if (typeof value !== 'string') fail('expected stable text'); validateStableIdentityString(value as string, 'adoption identity'); }
function digest(value: unknown): void { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail('invalid canonical digest'); }
function rawDigest(value: unknown): void { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) fail('invalid raw fingerprint'); }
function generation(value: unknown, minimum: number): void { if (!Number.isSafeInteger(value) || (value as number) < minimum) fail('invalid state generation'); }
function member(value: unknown, choices: readonly string[]): void { if (typeof value !== 'string' || !choices.includes(value)) fail('unsupported enum'); }
function strings(value: unknown): string[] { if (!Array.isArray(value)) fail('expected identity array'); for (const item of value as unknown[]) stable(item); if (new Set(value as string[]).size !== (value as string[]).length) fail('duplicate identity'); return value as string[]; }
function detached(value: unknown): unknown { return JSON.parse(canonicalAdoptionJson(value)); }
function fail(message: string): never { throw new Error(`invalid legacy adoption record: ${message}`); }
