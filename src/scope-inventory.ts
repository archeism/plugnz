import type { SourceBinding } from './source-reference';
import { projectLegacyRecordProofs, type LegacyRecordProof } from './legacy-adoption-proof';
import type { AdoptionRecord } from './legacy-adoption-record';
import { isOpenLifecycleJournalState, parseOpenLifecycleJournals, projectRecoveryOperationProof, type OpenLifecycleJournals } from './recovery-proof';
import type {
  ActivationRecord,
  DeploymentScopeRecord,
  LifecycleAttemptRecord,
  LifecycleStateV2,
  TombstoneRecord,
} from './state';

export interface ScopeInventoryQuery {
  readonly scopeId?: string;
  readonly source?: SourceBinding;
  readonly targetKinds: readonly string[];
  readonly instance?: string;
}

export interface ScopeInventoryRow {
  readonly id: string;
  readonly source: DeploymentScopeRecord['source'];
  readonly target: DeploymentScopeRecord['target'];
  readonly authority: DeploymentScopeRecord['authority'];
  readonly lifecycle: DeploymentScopeRecord['lifecycle'];
  readonly selectorMode: DeploymentScopeRecord['selectorMode'];
  readonly desired: DeploymentScopeRecord['desired'] | null;
  readonly lastConverged: DeploymentScopeRecord['lastConverged'] | null;
  readonly lastAttemptId: string | null;
  readonly activations: readonly ActivationRecord[];
  readonly tombstones: readonly TombstoneRecord[];
  readonly attempt: LifecycleAttemptRecord | null;
  readonly openJournals?: OpenLifecycleJournals;
  readonly adoptionHistory?: { readonly schemaVersion: 1; readonly legacyRecords: readonly LegacyRecordProof[]; readonly records: readonly AdoptionRecord[] };
}

export interface ScopeInventory {
  readonly stateGeneration: number;
  readonly scopes: readonly ScopeInventoryRow[];
}

const SCOPE_ID = /^scope-v1-[0-9a-f]{64}$/u;

export function projectScopeInventory(state: LifecycleStateV2, query: ScopeInventoryQuery): ScopeInventory {
  const scopes = state.scopes.filter((scope) => matchesQuery(scope, query));
  return {
    stateGeneration: state.stateGeneration,
    scopes: scopes.map((scope) => ({
      id: scope.id,
      source: scope.source,
      target: scope.target,
      authority: scope.authority,
      lifecycle: scope.lifecycle,
      selectorMode: scope.selectorMode,
      desired: scope.desired ?? null,
      lastConverged: scope.lastConverged ?? null,
      lastAttemptId: scope.lastAttemptId ?? null,
      activations: state.activations.filter((activation) => activation.scopeId === scope.id),
      tombstones: state.tombstones.filter((tombstone) => tombstone.scopeId === scope.id),
      attempt: state.attempts.find((attempt) => attempt.id === scope.lastAttemptId) ?? null,
      ...openJournalsFor(scope, state),
      ...legacyHistoryFor(scope, state),
    })),
  };
}

function legacyHistoryFor(scope: DeploymentScopeRecord, state: LifecycleStateV2): Pick<ScopeInventoryRow, 'adoptionHistory'> {
  const legacyRecords = projectLegacyRecordProofs(state, scope);
  const records = state.legacyAdoptions?.records.filter(record => record.legacy.original.scope.id === scope.id) ?? [];
  return legacyRecords.length === 0 && records.length === 0 ? {} : { adoptionHistory: { schemaVersion: 1, legacyRecords, records } };
}

function openJournalsFor(scope: DeploymentScopeRecord, state: LifecycleStateV2): { openJournals?: OpenLifecycleJournals } {
  const operations = state.attempts.flatMap(attempt => attempt.journal
    .filter(row => row.scopeId === scope.id && isOpenLifecycleJournalState(row.state))
    .map(row => projectRecoveryOperationProof(scope, attempt, row)));
  return operations.length === 0 ? {} : { openJournals: parseOpenLifecycleJournals({ schemaVersion: 1, operations }) };
}

export function renderScopeInventory(inventory: ScopeInventory): string {
  const rows = inventory.scopes.map((scope) =>
    [scope.id, `${scope.target.kind}/${scope.target.instance}`, scope.lifecycle, `activations=${scope.activations.length}`].join('\t'),
  );
  return [`stateGeneration\t${inventory.stateGeneration}`, ...rows].join('\n');
}

function matchesQuery(scope: DeploymentScopeRecord, query: ScopeInventoryQuery): boolean {
  if (query.targetKinds.length > 0 && !query.targetKinds.includes(scope.target.kind)) return false;
  if (query.instance !== undefined && scope.target.instance !== query.instance) return false;
  if (query.scopeId !== undefined && scope.id !== query.scopeId) return false;
  if (query.source !== undefined && !sameSourceBinding(scope.source, query.source)) return false;
  return true;
}

export function isScopeId(value: string): boolean {
  return SCOPE_ID.test(value);
}

export function sameSourceBinding(left: SourceBinding, right: SourceBinding): boolean {
  switch (left.kind) {
    case 'local':
      return right.kind === 'local' && left.locator === right.locator;
    case 'git':
      return right.kind === 'git' && left.locator === right.locator && left.ref === right.ref;
    default: {
      const unreachable: never = left;
      throw new Error(`unknown source ${String(unreachable)}`);
    }
  }
}
