import { CryptoHasher } from './runtime';
import { parseRecoveryOperationProof, projectRecoveryOperationProof, type RecoveryOperationProof } from './recovery-proof';
import { validateLifecycleState, type ActivationRecord, type DeploymentScopeRecord, type JournalEntryRecord, type LifecycleAttemptRecord, type LifecycleStateV2 } from './state';

export type AdoptionDigest = `sha256:${string}`;
export interface LegacyAttemptHeader {
  id: string;
  command: 'legacy-recovery';
  phase: LifecycleAttemptRecord['phase'];
  mutationStarted: boolean;
  scopeIds: string[];
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}
export interface LegacySnapshot {
  scope: Pick<DeploymentScopeRecord, 'id' | 'source' | 'target'>;
  attempt: LegacyAttemptHeader;
  journal: JournalEntryRecord;
  activation: ActivationRecord;
}
export interface LegacyRecordProof {
  schemaVersion: 1;
  original: RecoveryOperationProof;
  snapshot: LegacySnapshot;
  recordDigest: AdoptionDigest;
}

/** Canonical bytes are protocol, not JSON.stringify's integer-key ordering. */
export function canonicalAdoptionJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('adoption canonical number must be finite');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertUnicode(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1
      || Array.from({ length: value.length }, (_, index) => index).some(index => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        return descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !descriptor.enumerable;
      })) throw new Error('adoption canonical array contains sparse or unsupported properties');
    return `[${value.map(canonicalAdoptionJson).join(',')}]`;
  }
  if (typeof value !== 'object' || value === undefined
    || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error('adoption canonical value must be plain JSON');
  }
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).some(key => typeof key !== 'string')
    || Object.getOwnPropertyNames(row).some(key => !Object.getOwnPropertyDescriptor(row, key)?.enumerable
      || Object.getOwnPropertyDescriptor(row, key)?.get !== undefined
      || Object.getOwnPropertyDescriptor(row, key)?.set !== undefined)) throw new Error('adoption canonical object contains unsupported properties');
  const keys = Object.keys(row).sort(scalarOrder);
  return `{${keys.map(key => `${canonicalAdoptionJson(key)}:${canonicalAdoptionJson(row[key])}`).join(',')}}`;
}

export function adoptionDigest(domain: string, value: unknown): AdoptionDigest {
  assertUnicode(domain);
  return `sha256:${new CryptoHasher('sha256').update(`${domain}\0${canonicalAdoptionJson(value)}`).digest('hex')}`;
}

/** Before any retained relation exists, preview the validated original, never ownership. */
export function projectLegacyRecordProofs(state: LifecycleStateV2, scope: DeploymentScopeRecord): LegacyRecordProof[] {
  return state.attempts.flatMap(attempt => {
    if (attempt.command !== 'legacy-recovery') return [];
    return attempt.journal.filter(row => row.scopeId === scope.id && ['pending', 'applying', 'applied', 'readback-verified', 'rollback', 'cleanup-pending'].includes(row.state)).map(row => {
      const activations = state.activations.filter(activation => activation.scopeId === scope.id
        && activation.packageId === row.packageId && activation.nativeId === row.nativeId
        && activation.pending?.attemptId === attempt.id);
      if (activations.length !== 1) throw new Error('legacy original has no exact single retained activation');
      const snapshot: LegacySnapshot = {
        scope: { id: scope.id, source: scope.source, target: scope.target },
        attempt: { id: attempt.id, command: 'legacy-recovery', phase: attempt.phase, mutationStarted: attempt.mutationStarted,
          scopeIds: [...attempt.scopeIds].sort(), startedAt: attempt.startedAt ?? null,
          updatedAt: attempt.updatedAt ?? null, completedAt: attempt.completedAt ?? null },
        journal: row, activation: activations[0]!,
      };
      return parseLegacyRecordProof({ schemaVersion: 1, original: projectRecoveryOperationProof(scope, attempt, row), snapshot,
        recordDigest: adoptionDigest('plugnz/legacy-record/v1', snapshot) });
    });
  });
}

export function parseLegacyRecordProof(value: unknown): LegacyRecordProof {
  const root = object(value, 'legacy record proof');
  exact(root, ['schemaVersion', 'original', 'snapshot', 'recordDigest'], 'legacy record proof');
  if (root['schemaVersion'] !== 1) throw new Error('legacy record proof requires schemaVersion 1');
  const original = parseRecoveryOperationProof(root['original']);
  if (original.command !== 'legacy-recovery' || original.sealed || original.package === null || original.nativeId === null) throw new Error('legacy record proof cannot invent sealed recovery authority');
  const snapshot = object(root['snapshot'], 'legacy snapshot');
  exact(snapshot, ['scope', 'attempt', 'journal', 'activation'], 'legacy snapshot');
  const scope = object(snapshot['scope'], 'legacy scope'); exact(scope, ['id', 'source', 'target'], 'legacy scope');
  const header = object(snapshot['attempt'], 'legacy header');
  exact(header, ['id', 'command', 'phase', 'mutationStarted', 'scopeIds', 'startedAt', 'updatedAt', 'completedAt'], 'legacy header');
  const journal = object(snapshot['journal'], 'legacy journal');
  if ('sealedOperation' in journal || 'settlement' in journal) throw new Error('legacy snapshot cannot contain sealed authority or settlement');
  const activation = object(snapshot['activation'], 'legacy activation');
  const attempt: Record<string, unknown> = { ...header, journal: [journal] };
  for (const key of ['startedAt', 'updatedAt', 'completedAt']) if (attempt[key] === null) delete attempt[key];
  // Reuse canonical state validators for every nested existing field. Other shared
  // attempt scopes need their actual validated identity, not invented placeholders.
  if (!Array.isArray(header['scopeIds']) || header['scopeIds'].some(id => typeof id !== 'string' || !/^scope-v1-[0-9a-f]{64}$/u.test(id))
    || canonicalAdoptionJson(header['scopeIds']) !== canonicalAdoptionJson([...header['scopeIds']].sort())) throw new Error('legacy header scopeIds must be sorted');
  const narrowed = { ...attempt, scopeIds: [scope['id']] };
  const validated = validateLifecycleState({ version: 2, stateGeneration: 1,
    scopes: [{ ...scope, authority: 'legacy-import', lifecycle: 'active', selectorMode: 'legacy-unknown' }],
    activations: [activation], attempts: [narrowed], tombstones: [] });
  const validatedAttempt = validated.attempts[0]!;
  if (header['command'] !== 'legacy-recovery' || header['id'] !== original.attemptId
    || !header['scopeIds'].includes(scope['id']) || new Set(header['scopeIds']).size !== header['scopeIds'].length
    || validated.activations[0]!.ownership.kind !== 'legacy-claim'
    || canonicalAdoptionJson(projectRecoveryOperationProof(validated.scopes[0]!, validatedAttempt, validatedAttempt.journal[0]!)) !== canonicalAdoptionJson(original)) {
    throw new Error('legacy snapshot original identity differs from retained claim');
  }
  const digest = adoptionDigest('plugnz/legacy-record/v1', snapshot);
  if (root['recordDigest'] !== digest) throw new Error('legacy record digest differs from exact snapshot');
  // Return detached JSON so caller mutation cannot change an established snapshot.
  return JSON.parse(canonicalAdoptionJson({ ...root, original })) as LegacyRecordProof;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, fields: readonly string[], label: string): void {
  if (Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !(key in value))) throw new Error(`${label} has missing or unknown fields`);
}
function assertUnicode(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('adoption canonical text has malformed Unicode');
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('adoption canonical text has malformed Unicode');
  }
}
function scalarOrder(left: string, right: string): number {
  const a = Array.from(left, char => char.codePointAt(0)!); const b = Array.from(right, char => char.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index]! - b[index]!;
  return a.length - b.length;
}
