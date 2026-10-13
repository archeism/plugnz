import type { SourceSnapshotReference } from './source-reference';
import { installationVerification, type InstallationVerification } from './installation-verification';
import {
  createDeploymentScopeIdentity,
  validateSourceBinding,
  type DeploymentScopeIdentity,
} from './deployment-scope';
import { unknownErrorDiagnostic } from './error-diagnostic';
import { OPEN_LIFECYCLE_JOURNAL_STATES, parseRecoveryOperationProof, type RecoveryOperationProof } from './recovery-proof';
import type { JournalState } from './state';
import { parseAdoptionAdmission, parseAdoptionRecord, type AdoptionAdmission, type AdoptionRecord } from './legacy-adoption-record';
import { canonicalAdoptionJson, type AdoptionDigest } from './legacy-adoption-proof';

export const LIFECYCLE_REPORT_SCHEMA_VERSION = 1 as const;

export const LIFECYCLE_PLAN_ACTIONS = [
  'install',
  'update',
  'unchanged',
  'route-migrate',
  'disable-nonconforming',
  'retain-prior',
  'retire-orphan',
  'not-attempted',
] as const;

export const LIFECYCLE_OPERATION_RESULTS = ['succeeded', 'failed', 'pending', 'not-attempted'] as const;
export const LIFECYCLE_RESOURCE_STATES = ['present', 'absent', 'retained', 'unknown', 'potentially-changed'] as const;
export const LIFECYCLE_ACTIVATION_STATES = ['active-conforming', 'active-nonconforming', 'inactive', 'retained-prior', 'unknown'] as const;
export const LIFECYCLE_ROUTES = ['native', 'managed', 'none'] as const;
export const LIFECYCLE_COVERAGE_KINDS = ['desired-pair', 'retirement'] as const;
export const LIFECYCLE_COMMANDS = ['add', 'update', 'remove', 'sync', 'retire-source'] as const;
export const LIFECYCLE_COMMAND_RESULTS = ['converged', 'incomplete', 'usage-error'] as const;
export const LIFECYCLE_TERMINAL_PHASES = ['parse', 'resolve', 'freeze', 'preflight', 'apply', 'readback', 'prune', 'finalize', 'complete'] as const;
export const LIFECYCLE_REASON_CATEGORIES = ['capability', 'internal', 'protocol', 'runtime', 'readback', 'recovery', 'usage'] as const;
export const LIFECYCLE_REASON_CODES = [
  'capability.unsupported',
  'capability.unverified',
  'internal.defect',
  'internal.invariant',
  'internal.corrupt-state',
  'internal.ambiguous-ownership',
  'protocol.invalid-report',
  'protocol.missing-outcome',
  'protocol.duplicate-outcome',
  'protocol.unexpected-outcome',
  'protocol.contradictory-outcome',
  'runtime.operation-failed',
  'readback.failed',
  'readback.mismatch',
  'recovery.required',
  'recovery.failed',
  'usage.invalid-argument',
  'usage.invalid-selection',
] as const;
export const LIFECYCLE_EXIT_CODES = { success: 0, incomplete: 1, usage: 2 } as const;

export type LifecyclePlanAction = (typeof LIFECYCLE_PLAN_ACTIONS)[number];
export type LifecycleOperationResult = (typeof LIFECYCLE_OPERATION_RESULTS)[number];
export type LifecycleResourceState = (typeof LIFECYCLE_RESOURCE_STATES)[number];
export type LifecycleActivationState = (typeof LIFECYCLE_ACTIVATION_STATES)[number];
export type LifecycleRoute = (typeof LIFECYCLE_ROUTES)[number];
export type LifecycleCoverageKind = (typeof LIFECYCLE_COVERAGE_KINDS)[number];
export type LifecycleCommandName = (typeof LIFECYCLE_COMMANDS)[number];
export type LifecycleCommandResult = (typeof LIFECYCLE_COMMAND_RESULTS)[number];
export type LifecycleTerminalPhase = (typeof LIFECYCLE_TERMINAL_PHASES)[number];
export type LifecycleExitCode = (typeof LIFECYCLE_EXIT_CODES)[keyof typeof LIFECYCLE_EXIT_CODES];

export type LifecycleReasonCategory = (typeof LIFECYCLE_REASON_CATEGORIES)[number];
export type LifecycleReasonCode = (typeof LIFECYCLE_REASON_CODES)[number];

export type LifecycleReason = {
  [Category in LifecycleReasonCategory]: {
    category: Category;
    code: Extract<LifecycleReasonCode, `${Category}.${string}`>;
    diagnostic: string;
  } & (Category extends 'capability'
    ? { capabilityId: string; evidenceId: string | null }
    : { capabilityId: null; evidenceId: null });
}[LifecycleReasonCategory];

type NonCapabilityReasonCategory = Exclude<LifecycleReasonCategory, 'capability'>;

/** Construct a reason only when its stable code and capability fields match its category. */
export function createLifecycleReason(
  category: 'capability',
  code: Extract<LifecycleReasonCode, `capability.${string}`>,
  diagnostic: string,
  capabilityId: string,
  evidenceId?: string | null,
): Extract<LifecycleReason, { category: 'capability' }>;
export function createLifecycleReason<Category extends NonCapabilityReasonCategory>(
  category: Category,
  code: Extract<LifecycleReasonCode, `${NoInfer<Category>}.${string}`>,
  diagnostic: string,
): Extract<LifecycleReason, { category: Category }>;
export function createLifecycleReason(
  category: LifecycleReasonCategory,
  code: LifecycleReasonCode,
  diagnostic: string,
  capabilityId?: string,
  evidenceId: string | null = null,
): LifecycleReason {
  if (!code.startsWith(`${category}.`)) throw new Error(`reason code '${code}' does not belong to category '${category}'`);
  if (diagnostic.trim().length === 0) throw new Error('reason diagnostic must contain non-whitespace text');
  if (category === 'capability') {
    if (capabilityId === undefined || capabilityId.length === 0) throw new Error('capability reason needs a capabilityId');
    return {
      category,
      code: code as Extract<LifecycleReasonCode, `capability.${string}`>,
      diagnostic,
      capabilityId,
      evidenceId,
    };
  }
  return { category, code, diagnostic, capabilityId: null, evidenceId: null } as LifecycleReason;
}

export interface LifecycleSourceSnapshotContext {
  id: string;
  reference: SourceSnapshotReference;
}

export interface LifecyclePlanOperation {
  operationId: string;
  coverage: LifecycleCoverageKind;
  scope: DeploymentScopeIdentity;
  sourceSnapshotId: string | null;
  package: string;
  nativeId: string | null;
  action: LifecyclePlanAction;
  route: LifecycleRoute;
  /** Exact read-only admission, not a delivered adoption or mutation permission. */
  adoption?: AdoptionAdmission;
}

export interface LifecycleOperationOutcome extends LifecyclePlanOperation {
  result: LifecycleOperationResult;
  resourceState: LifecycleResourceState;
  activationState: LifecycleActivationState;
  changed: boolean;
  reason: LifecycleReason | null;
  /** Present when a successful outcome dropped recorded pins that the new source no longer contains. */
  notices?: readonly string[];
}

export interface LifecycleReportSummary {
  result: LifecycleCommandResult;
  terminalPhase: LifecycleTerminalPhase;
  mutationStarted: boolean;
  changed: boolean;
  failureCategory: LifecycleReasonCategory | null;
  reason: LifecycleReason | null;
  recoveryId: string | null;
  readbackId: string | null;
}

export interface LifecycleReport {
  /** Optional read-only installation evidence; never native execution consent. */
  verification?: InstallationVerification;
  schemaVersion: typeof LIFECYCLE_REPORT_SCHEMA_VERSION;
  command: {
    name: LifecycleCommandName;
    dryRun: boolean;
    sourceSnapshots: LifecycleSourceSnapshotContext[];
  };
  plan: LifecyclePlanOperation[];
  outcomes: LifecycleOperationOutcome[];
  summary: LifecycleReportSummary;
  recovery?: { readonly schemaVersion: 1; readonly receipts: readonly LifecycleRecoveryReceipt[] };
  adoptions?: { readonly schemaVersion: 1; readonly receipts: readonly AdoptionReceipt[] };
}

/** Historical adoption accounting is not mutation authority or another changed flag. */
export interface AdoptionReceipt {
  readonly original: RecoveryOperationProof;
  readonly legacyRecordDigest: AdoptionDigest;
  readonly admissionId: AdoptionDigest;
  readonly status: 'not-attempted' | 'pending' | 'rolled-back' | 'committed';
  readonly record: AdoptionRecord | null;
  readonly reason: LifecycleReason | null;
}

/** Historical recovery facts are not current Desired convergence outcomes. */
export interface LifecycleRecoveryReceipt {
  readonly original: RecoveryOperationProof;
  readonly status: 'completed' | 'pending' | 'not-attempted';
  readonly settlement: 'not-attempted' | 'commit' | 'rollback' | null;
  readonly finalJournalState: JournalState;
  readonly resourceState: LifecycleResourceState;
  readonly activationState: LifecycleActivationState;
  readonly mutationStarted: boolean;
  readonly changed: boolean;
  readonly readbackVerified: boolean;
  readonly reason: LifecycleReason | null;
}

export class LifecycleReportValidationError extends Error {
  constructor(readonly reason: LifecycleReason) {
    super(reason.diagnostic);
    this.name = 'LifecycleReportValidationError';
  }
}

export function exitCodeForLifecycleReport(report: LifecycleReport): LifecycleExitCode {
  if (report.summary.result === 'converged') return LIFECYCLE_EXIT_CODES.success;
  if (report.summary.result === 'usage-error') return LIFECYCLE_EXIT_CODES.usage;
  return LIFECYCLE_EXIT_CODES.incomplete;
}

/** Parse the public lifecycle boundary. Structural and cross-row checks are intentionally centralized here. */
export function parseLifecycleReport(value: unknown): LifecycleReport {
  if (!isObject(value)) {
    throw invalid('lifecycle report must be an object');
  }
  exactFields(value, ['schemaVersion', 'command', 'plan', 'outcomes', 'summary', 'recovery', 'adoptions', 'verification'], 'lifecycle report');
  if (value['schemaVersion'] !== LIFECYCLE_REPORT_SCHEMA_VERSION) {
    throw invalid('lifecycle report schemaVersion must be 1');
  }
  if (!isObject(value['command']) || !Array.isArray(value['plan']) || !Array.isArray(value['outcomes']) || !isObject(value['summary'])) {
    throw invalid('lifecycle report must contain command, plan, outcomes, and summary');
  }
  const command = value['command'];
  const plan = value['plan'];
  const outcomes = value['outcomes'];
  const summary = value['summary'];
  assertCommand(command);
  const commandName = command['name'] as LifecycleCommandName;
  if (!plan.every(isObject) || !outcomes.every(isObject)) throw invalid('lifecycle plan and outcomes must contain objects');

  const planned = new Map<string, Record<string, unknown>>();
  const plannedPairs = new Set<string>();
  for (const operation of plan) {
    assertPlanOperation(operation, command['sourceSnapshots'] as LifecycleSourceSnapshotContext[], commandName);
    const operationId = operation['operationId'];
    if (typeof operationId !== 'string' || operationId.length === 0) throw invalid('every planned operation needs a nonempty operationId');
    if (planned.has(operationId)) throw invalid(`duplicate planned operation '${operationId}'`);
    const pair = JSON.stringify([(operation['scope'] as DeploymentScopeIdentity).id, operation['package']]);
    if (plannedPairs.has(pair)) throw invalid(`duplicate planned package pair for '${operation['package']}'`);
    plannedPairs.add(pair);
    planned.set(operationId, operation);
  }

  const adoptions = value['adoptions'] === undefined ? [] : parseAdoptionReceipts(value['adoptions'], command['dryRun'] as boolean);
  const freshRelations = new Set<string>();
  for (const receipt of adoptions) {
    const admission = receipt.record?.admission ?? plan.find(row => isObject(row['adoption'])
      && row['adoption']['admissionId'] === receipt.admissionId)?.['adoption'] as AdoptionAdmission | undefined;
    if (admission === undefined) throw contradiction('adoption receipt has no exact requested admission or resumed modern relation');
    const key = canonicalAdoptionJson([admission.fresh.attemptId, admission.fresh.operationId]);
    if (freshRelations.has(key)) throw contradiction('adoption receipts cannot reuse one fresh operation');
    freshRelations.add(key);
  }
  const seen = new Set<string>();
  for (const outcome of outcomes) {
    const adoption = adoptions.find(receipt => isObject(outcome['adoption']) && outcome['adoption']['admissionId'] === receipt.admissionId);
    assertOutcome(outcome, command['sourceSnapshots'] as LifecycleSourceSnapshotContext[], command['dryRun'] as boolean, commandName, adoption);
    const operationId = outcome['operationId'];
    if (typeof operationId !== 'string' || operationId.length === 0) throw invalid('every outcome needs a nonempty operationId');
    if (seen.has(operationId)) throw protocol('protocol.duplicate-outcome', `duplicate outcome for planned operation '${operationId}'`);
    seen.add(operationId);
    const operation = planned.get(operationId);
    if (operation === undefined) throw protocol('protocol.unexpected-outcome', `outcome '${operationId}' is not in the frozen plan`);
    if (!sameScope(outcome['scope'] as DeploymentScopeIdentity, operation['scope'] as DeploymentScopeIdentity)) {
      throw protocol('protocol.contradictory-outcome', `outcome '${operationId}' contradicts planned scope`);
    }
    for (const field of PLAN_IDENTITY_FIELDS) {
      if (outcome[field] !== operation[field]) {
        throw protocol('protocol.contradictory-outcome', `outcome '${operationId}' contradicts planned ${field}`);
      }
    }
    if (canonicalAdoptionJson(outcome['adoption'] ?? null) !== canonicalAdoptionJson(operation['adoption'] ?? null)) {
      throw contradiction(`outcome '${operationId}' contradicts planned adoption admission`);
    }
  }

  for (const operationId of planned.keys()) {
    if (!seen.has(operationId)) throw protocol('protocol.missing-outcome', `planned operation '${operationId}' has no outcome`);
  }

  const receipts = value['recovery'] === undefined ? [] : parseRecoveryReceipts(value['recovery'], command['dryRun'] as boolean);
  const historicalIds = new Set<string>();
  for (const receipt of receipts) {
    const id = receipt.original.operationId;
    const current = planned.get(id);
    const resumed = adoptions.some(row => row.record !== null && matchesAdoptionRecovery(row.record, receipt)
      && canonicalAdoptionJson(current?.['adoption'] ?? null) === canonicalAdoptionJson(row.record.admission));
    if (historicalIds.has(id) || current !== undefined && !resumed) throw contradiction('historical recovery operation identity is ambiguous');
    if (current !== undefined && outcomes.find(row => row['operationId'] === id)?.['changed'] !== false) {
      throw contradiction('resumed adoption mutation must be accounted once by its modern recovery receipt');
    }
    historicalIds.add(id);
  }
  for (const receipt of adoptions) {
    const id = receipt.original.operationId;
    if (historicalIds.has(id) || planned.has(id)) throw contradiction('adoption and recovery originals must be disjoint and unambiguous');
    historicalIds.add(id);
    const operation = plan.find(row => isObject(row['adoption']) && row['adoption']['admissionId'] === receipt.admissionId);
    const modern = receipt.record === null ? undefined : receipts.find(row => matchesAdoptionRecovery(receipt.record!, row));
    if (operation === undefined) {
      const fresh = receipt.record?.admission.fresh;
      if (fresh === undefined || modern === undefined || !plan.some(row => (row['scope'] as DeploymentScopeIdentity).id === fresh.scopeId
        && row['package'] === fresh.packageName && row['nativeId'] === fresh.nativeId)) {
        throw contradiction('adoption receipt has no exact requested admission or resumed modern relation');
      }
      assertAdoptionRecoveryStatus(receipt, modern);
      continue;
    }
    const admission = parseAdoptionAdmission(operation['adoption']);
    if (canonicalAdoptionJson(admission.original) !== canonicalAdoptionJson(receipt.original)
      || admission.legacyRecordDigest !== receipt.legacyRecordDigest
      || receipt.record !== null && canonicalAdoptionJson(receipt.record.admission) !== canonicalAdoptionJson(admission)) {
      throw contradiction('adoption receipt contradicts its exact admission or original');
    }
    const outcome = outcomes.find(row => row['operationId'] === operation['operationId'])!;
    const result = receipt.status === 'committed' ? 'succeeded' : receipt.status === 'pending' ? 'pending'
      : receipt.status === 'rolled-back' ? 'failed' : 'not-attempted';
    const pendingResume = receipt.status === 'pending' && modern?.status === 'pending' && outcome['result'] === 'not-attempted';
    if ((!pendingResume && (outcome['result'] !== result || canonicalAdoptionJson(outcome['reason']) !== canonicalAdoptionJson(receipt.reason)))
      || receipt.status === 'not-attempted' && outcome['changed'] !== false
      || receipt.status === 'pending' && !pendingResume && receipt.record?.seal === null
      || receipt.status === 'rolled-back' && !isRestoredAdoptionPrior(outcome['resourceState'], outcome['activationState'])) {
      throw contradiction('adoption receipt contradicts its exact current transaction outcome');
    }
    if (modern !== undefined) assertAdoptionRecoveryStatus(receipt, modern);
  }
  assertSummary(summary, outcomes, command['dryRun'] as boolean, receipts, adoptions);
  if (value['verification'] !== undefined) {
    if (commandName !== 'add' && commandName !== 'update') throw invalid('installation verification only applies to add/update');
    // Exact comparison rejects inflated approval/delivery claims, duplicate or
    // omitted rows, and evidence inconsistent with this invocation's outcomes.
    const expected = installationVerification(value as unknown as LifecycleReport);
    if (canonicalAdoptionJson(value['verification']) !== canonicalAdoptionJson(expected)) {
      throw contradiction('installation verification contradicts its outcomes or claims unobserved approval/delivery');
    }
  }

  return value as unknown as LifecycleReport;
}

/** Same fresh operation, not a package-name match or legacy recovery authority. */
function matchesAdoptionRecovery(record: AdoptionRecord, receipt: LifecycleRecoveryReceipt): boolean {
  const fresh = record.admission.fresh; const original = receipt.original;
  return original.attemptId === fresh.attemptId && original.operationId === fresh.operationId && original.command === fresh.command
    && original.package === fresh.packageName && original.nativeId === fresh.nativeId && original.action === fresh.action
    && canonicalAdoptionJson(original.scope) === canonicalAdoptionJson(record.legacy.original.scope)
    && original.sealed === (record.seal !== null) && (record.seal === null || original.route === record.seal.route);
}

function assertAdoptionRecoveryStatus(adoption: AdoptionReceipt, modern: LifecycleRecoveryReceipt): void {
  const matches = adoption.status === 'pending' ? modern.status === 'pending'
    && modern.settlement === (adoption.record?.phase === 'committed' ? 'commit' : null)
    && canonicalAdoptionJson(modern.reason) === canonicalAdoptionJson(adoption.reason)
    : modern.status === 'completed' && modern.settlement === (adoption.status === 'committed' ? 'commit'
      : adoption.status === 'rolled-back' ? 'rollback' : 'not-attempted');
  if (!matches) throw contradiction('adoption receipt contradicts its exact fresh modern recovery settlement');
  if (adoption.status === 'rolled-back' && !isRestoredAdoptionPrior(modern.resourceState, modern.activationState)) {
    throw contradiction('adoption rollback recovery contradicts its sealed active prior');
  }
}

function isRestoredAdoptionPrior(resource: unknown, activation: unknown): boolean {
  return resource === 'present' && activation === 'active-conforming' || resource === 'retained' && activation === 'retained-prior';
}

function parseAdoptionReceipts(value: unknown, dryRun: boolean): AdoptionReceipt[] {
  if (!isObject(value)) throw invalid('adoptions must be an object');
  exactFields(value, ['schemaVersion', 'receipts'], 'adoptions');
  if (value['schemaVersion'] !== 1 || !Array.isArray(value['receipts'])) throw invalid('adoptions requires schemaVersion 1 and receipts');
  try { canonicalAdoptionJson(value); }
  catch (error) { throw invalid(`invalid adoption receipt JSON: ${unknownErrorDiagnostic(error)}`); }
  if (dryRun) throw contradiction('dry run cannot carry adoption receipts');
  const admissions = new Set<string>();
  return value['receipts'].map(item => {
    if (!isObject(item)) throw invalid('adoption receipt must be an object');
    exactFields(item, ['original', 'legacyRecordDigest', 'admissionId', 'status', 'record', 'reason'], 'adoption receipt');
    let original: RecoveryOperationProof;
    let record: AdoptionRecord | null;
    try { original = parseRecoveryOperationProof(item['original']); record = item['record'] === null ? null : parseAdoptionRecord(item['record']); }
    catch (error) { throw invalid(`invalid adoption receipt proof: ${unknownErrorDiagnostic(error)}`); }
    if (original.command !== 'legacy-recovery' || original.sealed || original.package === null || original.nativeId === null) {
      throw contradiction('adoption receipt requires an exact unsealed legacy original');
    }
    for (const field of ['legacyRecordDigest', 'admissionId']) {
      if (typeof item[field] !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(item[field])) throw invalid(`invalid adoption receipt ${field}`);
    }
    if (!oneOf(['not-attempted', 'pending', 'rolled-back', 'committed'], item['status'])
      || !(item['reason'] === null || isObject(item['reason']))) throw invalid('adoption receipt has missing or invalid status/reason');
    if (item['reason'] !== null) assertReason(item['reason'] as Record<string, unknown>);
    if (admissions.has(item['admissionId'] as string)) throw contradiction('duplicate adoption receipt admission');
    admissions.add(item['admissionId'] as string);
    if ((item['status'] === 'committed') !== (item['reason'] === null)) throw contradiction('adoption receipt status contradicts its reason');
    if (record === null && item['status'] !== 'not-attempted'
      || record !== null && (canonicalAdoptionJson(record.legacy.original) !== canonicalAdoptionJson(original)
        || record.legacy.recordDigest !== item['legacyRecordDigest'] || record.admission.admissionId !== item['admissionId'])) {
      throw contradiction('adoption receipt record contradicts its exact original or admission');
    }
    if (record !== null && (item['status'] === 'pending' ? !['prepared', 'committed'].includes(record.phase) : record.phase !== item['status'])) {
      throw contradiction('adoption receipt status contradicts its retained record phase');
    }
    return { ...item, original, record } as unknown as AdoptionReceipt;
  });
}

function parseRecoveryReceipts(value: unknown, dryRun: boolean): LifecycleRecoveryReceipt[] {
  if (!isObject(value)) throw invalid('recovery must be an object');
  exactFields(value, ['schemaVersion', 'receipts'], 'recovery');
  if (value['schemaVersion'] !== 1 || !Array.isArray(value['receipts'])) throw invalid('recovery requires schemaVersion 1 and receipts');
  if (dryRun) throw contradiction('dry run cannot carry recovery receipts');
  return value['receipts'].map(item => {
    if (!isObject(item)) throw invalid('recovery receipt must be an object');
    exactFields(item, ['original', 'status', 'settlement', 'finalJournalState', 'resourceState', 'activationState', 'mutationStarted', 'changed', 'readbackVerified', 'reason'], 'recovery receipt');
    let original: RecoveryOperationProof;
    try { original = parseRecoveryOperationProof(item['original']); }
    catch (error) { throw invalid(`invalid recovery original: ${unknownErrorDiagnostic(error)}`); }
    if (!oneOf(['completed', 'pending', 'not-attempted'], item['status'])
      || !(item['settlement'] === null || oneOf(['not-attempted', 'commit', 'rollback'], item['settlement']))
      || !oneOf(['pending', 'applying', 'applied', 'readback-verified', 'rollback', 'rolled-back', 'cleanup-pending', 'completed', 'failed', 'not-attempted'], item['finalJournalState'])
      || !oneOf(LIFECYCLE_RESOURCE_STATES, item['resourceState']) || !oneOf(LIFECYCLE_ACTIVATION_STATES, item['activationState'])
      || typeof item['mutationStarted'] !== 'boolean' || typeof item['changed'] !== 'boolean' || typeof item['readbackVerified'] !== 'boolean'
      || !(item['reason'] === null || isObject(item['reason']))) throw invalid('recovery receipt contains invalid or missing fields');
    if (item['reason'] !== null) assertReason(item['reason'] as Record<string, unknown>);
    if (original.command === 'legacy-recovery' && (item['status'] === 'completed' || item['settlement'] !== null)) {
      throw contradiction('legacy recovery proof cannot authorize successful or verified settlement');
    }
    if (item['changed'] && !item['mutationStarted']) throw contradiction('changed recovery receipt requires mutationStarted');
    if (item['status'] === 'completed') {
      if (item['reason'] !== null || item['settlement'] === null) throw contradiction('completed recovery requires a successful settlement');
      const expected = item['settlement'] === 'commit' ? 'completed' : item['settlement'] === 'rollback' ? 'rolled-back' : 'not-attempted';
      if (item['finalJournalState'] !== expected) throw contradiction('completed recovery contradicts its final journal settlement');
    } else if (item['reason'] === null) throw contradiction('uncompleted recovery requires a reason');
    if (item['status'] === 'pending' && (!oneOf(OPEN_LIFECYCLE_JOURNAL_STATES, item['finalJournalState'])
      || !isObject(item['reason']) || (item['reason']['code'] !== 'recovery.required' && item['reason']['category'] !== 'readback'))) {
      throw contradiction('pending recovery requires a durable open journal and recovery/readback reason');
    }
    if (item['settlement'] === 'commit' || item['settlement'] === 'rollback') {
      if (!original.sealed || !item['readbackVerified']) throw contradiction('verified recovery settlement requires sealed authority and readback');
      if (item['status'] === 'pending' && item['finalJournalState'] !== 'cleanup-pending') throw contradiction('verified pending recovery must remain durably cleanup-pending');
    }
    if (item['settlement'] === 'commit') {
      const retired = original.action === 'retire-orphan' || original.action === 'remove';
      const disabled = original.action === 'disable-nonconforming';
      const activated = original.action === 'install' || original.action === 'update' || original.action === 'route-migrate';
      const matches = retired ? item['resourceState'] === 'absent' && item['activationState'] === 'inactive'
        : disabled ? item['resourceState'] === 'retained' && item['activationState'] === 'inactive'
        : activated && item['resourceState'] === 'present' && item['activationState'] === 'active-conforming';
      if (!matches) throw contradiction('committed recovery contradicts the original native action terminal state');
    }
    if (item['status'] === 'not-attempted' && (item['settlement'] !== null || item['finalJournalState'] !== original.journalState
      || item['mutationStarted'] || item['changed'] || item['readbackVerified'] || item['resourceState'] !== 'unknown' || item['activationState'] !== 'unknown')) {
      throw contradiction('unattempted recovery cannot claim observations, settlement, or mutation');
    }
    if (item['settlement'] === 'not-attempted' && (original.command === 'legacy-recovery' || original.package === null || original.nativeId === null
      || original.sealed || original.journalState !== 'pending'
      || item['status'] !== 'completed' || item['mutationStarted'] || item['changed'] || item['readbackVerified']
      || item['resourceState'] !== 'unknown' || item['activationState'] !== 'unknown')) throw contradiction('accepted-intent settlement cannot claim native apply');
    if (item['readbackVerified'] && !isKnownSafeReadbackState(item['resourceState'], item['activationState'])) {
      throw contradiction('verified recovery requires a canonical known-safe resource and activation state');
    }
    return { ...item, original } as unknown as LifecycleRecoveryReceipt;
  });
}

const PLAN_IDENTITY_FIELDS = [
  'coverage',
  'sourceSnapshotId',
  'package',
  'nativeId',
  'action',
  'route',
] as const;

function invalid(diagnostic: string): LifecycleReportValidationError {
  return protocol('protocol.invalid-report', diagnostic);
}

function contradiction(diagnostic: string): LifecycleReportValidationError {
  return protocol('protocol.contradictory-outcome', diagnostic);
}

function protocol(code: Extract<LifecycleReasonCode, `protocol.${string}`>, diagnostic: string): LifecycleReportValidationError {
  return new LifecycleReportValidationError({ category: 'protocol', code, diagnostic, capabilityId: null, evidenceId: null });
}

function assertCommand(command: Record<string, unknown>): void {
  exactFields(command, ['name', 'dryRun', 'sourceSnapshots'], 'lifecycle command');
  if (!oneOf(LIFECYCLE_COMMANDS, command['name']) || typeof command['dryRun'] !== 'boolean' || !Array.isArray(command['sourceSnapshots'])) {
    throw invalid('lifecycle command must contain a known name, dryRun boolean, and sourceSnapshots array');
  }
  const ids = new Set<string>();
  for (const context of command['sourceSnapshots']) {
    if (!isObject(context) || !nonempty(context['id']) || !isObject(context['reference'])) throw invalid('source snapshot context is malformed');
    exactFields(context, ['id', 'reference'], 'source snapshot context');
    if (ids.has(context['id'])) throw invalid(`duplicate source snapshot '${context['id']}'`);
    ids.add(context['id']);
    const reference = context['reference'];
    exactFields(reference, ['binding', 'revision', 'fingerprint'], `source snapshot '${context['id']}' reference`);
    if (!isObject(reference['binding']) || !nonempty(reference['revision']) || !nonempty(reference['fingerprint'])) throw invalid(`source snapshot '${context['id']}' is malformed`);
    const binding = reference['binding'];
    assertSourceBinding(binding, `source snapshot '${context['id']}'`);
  }
}

const PLAN_OPERATION_FIELDS = [
  'operationId',
  'coverage',
  'scope',
  'sourceSnapshotId',
  'package',
  'nativeId',
  'action',
  'route',
  'adoption',
] as const;

const OUTCOME_FIELDS = [
  ...PLAN_OPERATION_FIELDS,
  'result',
  'resourceState',
  'activationState',
  'changed',
  'reason',
  'notices',
] as const;

function assertPlanOperation(
  operation: Record<string, unknown>,
  snapshots: readonly LifecycleSourceSnapshotContext[],
  command: LifecycleCommandName,
  shape: 'plan' | 'outcome' = 'plan',
): void {
  exactFields(operation, shape === 'plan' ? PLAN_OPERATION_FIELDS : OUTCOME_FIELDS, `lifecycle ${shape}`);
  if (!nonempty(operation['operationId']) || !oneOf(LIFECYCLE_COVERAGE_KINDS, operation['coverage']) ||
      !isObject(operation['scope']) || !nullableString(operation['sourceSnapshotId']) ||
      !nonempty(operation['package']) ||
      !nullableString(operation['nativeId']) || !oneOf(LIFECYCLE_PLAN_ACTIONS, operation['action']) || !oneOf(LIFECYCLE_ROUTES, operation['route'])) {
    throw invalid('planned operation contains a missing or invalid field');
  }
  assertScope(operation['scope']);
  if (operation['sourceSnapshotId'] !== null && !snapshots.some((snapshot) => snapshot.id === operation['sourceSnapshotId'])) {
    throw invalid(`planned operation '${operation['operationId']}' references an unknown source snapshot`);
  }
  const snapshot = snapshots.find((candidate) => candidate.id === operation['sourceSnapshotId']);
  if (snapshot !== undefined && !sameSourceBinding(snapshot.reference.binding, (operation['scope'] as unknown as DeploymentScopeIdentity).source)) {
    throw invalid(`planned operation '${operation['operationId']}' scope contradicts its source snapshot`);
  }
  if (operation['adoption'] !== undefined) {
    const admission = parseAdoptionAdmission(operation['adoption']);
    const scope = operation['scope'] as unknown as DeploymentScopeIdentity;
    if (operation['coverage'] !== 'desired-pair' || snapshot === undefined
      || admission.fresh.command !== command || admission.fresh.operationId !== operation['operationId']
      || admission.fresh.scopeId !== scope.id || admission.fresh.packageName !== operation['package']
      || admission.fresh.nativeId !== operation['nativeId'] || admission.fresh.sourceSnapshotId !== operation['sourceSnapshotId']
      || admission.fresh.action !== operation['action'] || admission.fresh.route !== operation['route']
      || canonicalAdoptionJson(admission.source) !== canonicalAdoptionJson(snapshot.reference)
      || admission.target.kind !== scope.target.kind || admission.target.instance !== scope.target.instance) {
      throw contradiction(`planned operation '${operation['operationId']}' contradicts its exact adoption admission`);
    }
  }
  if (operation['coverage'] === 'retirement' && operation['action'] !== 'retire-orphan' && operation['action'] !== 'not-attempted') {
    throw invalid(`orphan retirement '${operation['operationId']}' has a non-retirement action`);
  }
  if (operation['coverage'] === 'desired-pair' && operation['action'] === 'retire-orphan') {
    throw invalid(`Desired pair '${operation['operationId']}' has a retirement action`);
  }
  if ((command === 'add' || command === 'update') && operation['coverage'] !== 'desired-pair') {
    throw invalid(`${command} cannot contain retirement coverage`);
  }
  if ((command === 'remove' || command === 'retire-source') && operation['coverage'] !== 'retirement') {
    throw invalid(`${command} cannot contain desired-pair coverage`);
  }
  if ((operation['action'] === 'not-attempted') !== (operation['route'] === 'none')) {
    throw contradiction(`planned operation '${operation['operationId']}' must pair action not-attempted with route none`);
  }
}

function assertOutcome(
  outcome: Record<string, unknown>,
  snapshots: readonly LifecycleSourceSnapshotContext[],
  dryRun: boolean,
  command: LifecycleCommandName,
  adoptionReceipt?: AdoptionReceipt,
): void {
  assertPlanOperation(outcome, snapshots, command, 'outcome');
  if (!oneOf(LIFECYCLE_OPERATION_RESULTS, outcome['result']) || !oneOf(LIFECYCLE_RESOURCE_STATES, outcome['resourceState']) ||
      !oneOf(LIFECYCLE_ACTIVATION_STATES, outcome['activationState']) || typeof outcome['changed'] !== 'boolean' ||
      !(outcome['reason'] === null || isObject(outcome['reason']))) {
    throw invalid(`outcome '${outcome['operationId']}' contains a missing or invalid field`);
  }
  const reason = outcome['reason'];
  if (reason !== null) assertReason(reason as Record<string, unknown>);
  const matchingTransaction = adoptionReceipt?.record != null
    && canonicalAdoptionJson(adoptionReceipt.record.admission) === canonicalAdoptionJson(outcome['adoption'] ?? null);
  if (outcome['adoption'] !== undefined && !matchingTransaction && (outcome['result'] !== 'not-attempted' || outcome['changed'] !== false)) {
    throw contradiction(`read-only admission '${outcome['operationId']}' cannot claim delivered adoption without a verified transaction receipt`);
  }
  if (isObject(reason) && reason['category'] === 'readback' &&
      outcome['resourceState'] === 'potentially-changed' && outcome['result'] !== 'pending') {
    throw contradiction(`unresolved readback outcome '${outcome['operationId']}' must remain pending`);
  }
  if (isObject(reason) && reason['category'] === 'readback' && outcome['result'] === 'failed' &&
      !isKnownSafeReadbackState(outcome['resourceState'], outcome['activationState'])) {
    throw contradiction(`terminal readback outcome '${outcome['operationId']}' needs a known-safe resource and activation state`);
  }
  if (isObject(reason) && reason['code'] === 'recovery.required' && outcome['result'] !== 'pending') {
    throw contradiction(`recovery.required outcome '${outcome['operationId']}' must remain pending`);
  }
  if (isObject(reason) && reason['code'] === 'recovery.failed' && outcome['result'] !== 'failed') {
    throw contradiction(`recovery.failed outcome '${outcome['operationId']}' must be terminally failed`);
  }
  if (reason !== null && (reason as Record<string, unknown>)['category'] === 'usage') {
    throw contradiction(`usage reason cannot belong to pair outcome '${outcome['operationId']}'`);
  }
  const notices = outcome['notices'];
  if (notices !== undefined) {
    if (!Array.isArray(notices) || notices.some((item) => typeof item !== 'string' || item.length === 0)) {
      throw invalid(`outcome '${outcome['operationId']}' notices must be non-empty strings`);
    }
    if (outcome['result'] !== 'succeeded') throw contradiction(`outcome '${outcome['operationId']}' can report a dropped pin only after success`);
  }
  if (outcome['result'] === 'succeeded' && reason !== null) throw contradiction(`successful outcome '${outcome['operationId']}' cannot have a failure reason`);
  if (outcome['result'] !== 'succeeded' && reason === null) throw contradiction(`non-success outcome '${outcome['operationId']}' needs a reason`);
  if (outcome['route'] === 'none' && outcome['result'] === 'succeeded') {
    throw contradiction(`successful outcome '${outcome['operationId']}' needs a native or managed route`);
  }
  if (outcome['action'] === 'not-attempted' &&
      (outcome['route'] !== 'none' || outcome['changed'] !== false || outcome['result'] === 'succeeded' || outcome['result'] === 'pending')) {
    throw contradiction(`preflight refusal '${outcome['operationId']}' must be a non-successful, non-mutating no-route action`);
  }
  if (!dryRun && outcome['action'] === 'not-attempted' &&
      (outcome['resourceState'] !== 'unknown' || outcome['activationState'] !== 'unknown')) {
    throw contradiction(`preflight refusal '${outcome['operationId']}' cannot claim a terminal resource or activation state`);
  }
  const containment = outcome['action'] === 'retain-prior' || outcome['action'] === 'disable-nonconforming';
  const appliedDisablement = outcome['action'] === 'disable-nonconforming' && outcome['changed'] === true;
  if (outcome['action'] === 'disable-nonconforming' && outcome['result'] === 'succeeded') {
    throw contradiction(`disablement '${outcome['operationId']}' cannot claim Desired convergence`);
  }
  if (!dryRun && outcome['action'] === 'disable-nonconforming' && outcome['resourceState'] === 'retained'
    && outcome['activationState'] === 'inactive' && outcome['changed'] !== true) {
    throw contradiction(`disablement '${outcome['operationId']}' cannot claim inactive containment without a verified mutation`);
  }
  if (containment && !dryRun && (outcome['action'] === 'retain-prior' || (isObject(reason) && reason['category'] === 'capability'))) {
    const expectedResourceState = 'retained';
    const expectedActivationState = outcome['action'] === 'retain-prior'
      ? 'retained-prior'
      : appliedDisablement ? 'inactive' : 'active-nonconforming';
    if (outcome['result'] !== 'failed' || outcome['resourceState'] !== expectedResourceState || outcome['activationState'] !== expectedActivationState) {
      throw contradiction(`containment outcome '${outcome['operationId']}' must fail the desired operation while reporting its retained terminal state`);
    }
  }
  if (appliedDisablement && dryRun) {
    throw contradiction(`disable-nonconforming outcome '${outcome['operationId']}' cannot report a containment mutation on a dry run`);
  }
  if (isObject(reason) && reason['category'] === 'capability') {
    if (outcome['action'] !== 'not-attempted' && outcome['action'] !== 'retain-prior' && outcome['action'] !== 'disable-nonconforming') {
      throw contradiction(`capability outcome '${outcome['operationId']}' must use an explicit refusal or containment action`);
    }
    if (outcome['action'] === 'disable-nonconforming') {
      if (appliedDisablement && dryRun) {
        throw contradiction(`capability disablement '${outcome['operationId']}' cannot describe an applied containment mutation on a dry run`);
      }
    } else if (outcome['changed'] === true || outcome['resourceState'] === 'potentially-changed') {
      throw contradiction(`capability refusal '${outcome['operationId']}' cannot describe work that changed or may have changed`);
    }
  }
  if (outcome['result'] === 'succeeded') {
    if (outcome['coverage'] === 'desired-pair' && outcome['nativeId'] === null) {
      throw contradiction(`successful Desired outcome '${outcome['operationId']}' needs an exact native identity`);
    }
    const terminalStateMatches = outcome['coverage'] === 'retirement'
      ? outcome['resourceState'] === 'absent' && outcome['activationState'] === 'inactive'
      : outcome['resourceState'] === 'present' && outcome['activationState'] === 'active-conforming';
    if (!dryRun && !terminalStateMatches) throw contradiction(`successful outcome '${outcome['operationId']}' contradicts its terminal resource or activation state`);
  }
  if (dryRun && (outcome['resourceState'] === 'potentially-changed'
    || (outcome['resourceState'] === 'absent' && outcome['activationState'] !== 'inactive')
    || (outcome['resourceState'] === 'unknown' && outcome['activationState'] !== 'unknown'))) {
    throw contradiction(`dry-run outcome '${outcome['operationId']}' contradicts its observed resource or activation state`);
  }
  if (outcome['result'] === 'not-attempted' && outcome['resourceState'] === 'potentially-changed') {
    throw contradiction(`not-attempted outcome '${outcome['operationId']}' cannot be potentially changed`);
  }
  if ((dryRun || outcome['result'] === 'not-attempted' || outcome['action'] === 'unchanged' || outcome['action'] === 'retain-prior' || outcome['route'] === 'none') && outcome['changed'] === true) {
    throw contradiction(`outcome '${outcome['operationId']}' cannot report changed=true`);
  }
}

function isKnownSafeReadbackState(resourceState: unknown, activationState: unknown): boolean {
  return (resourceState === 'present' && activationState === 'active-conforming') ||
    (resourceState === 'retained' && (activationState === 'retained-prior' || activationState === 'inactive')) ||
    (resourceState === 'absent' && activationState === 'inactive');
}

function assertSummary(summary: Record<string, unknown>, outcomes: readonly Record<string, unknown>[], dryRun: boolean, receipts: readonly LifecycleRecoveryReceipt[] = [], adoptions: readonly AdoptionReceipt[] = []): void {
  exactFields(summary, ['result', 'terminalPhase', 'mutationStarted', 'changed', 'failureCategory', 'reason', 'recoveryId', 'readbackId'], 'lifecycle summary');
  if (!oneOf(LIFECYCLE_COMMAND_RESULTS, summary['result']) || !oneOf(LIFECYCLE_TERMINAL_PHASES, summary['terminalPhase']) ||
      typeof summary['mutationStarted'] !== 'boolean' || typeof summary['changed'] !== 'boolean' ||
      !(summary['failureCategory'] === null || oneOf(LIFECYCLE_REASON_CATEGORIES, summary['failureCategory'])) ||
      !(summary['reason'] === null || isObject(summary['reason'])) || !nullableString(summary['recoveryId']) || !nullableString(summary['readbackId'])) {
    throw invalid('lifecycle summary contains a missing or invalid field');
  }
  const reason = summary['reason'];
  if (reason !== null) assertReason(reason as Record<string, unknown>);
  if (reason !== null && (reason as Record<string, unknown>)['category'] !== summary['failureCategory']) {
    throw contradiction('summary failureCategory contradicts its reason');
  }
  const nonSuccess = outcomes.some((outcome) => outcome['result'] !== 'succeeded') || receipts.some(row => row.status !== 'completed')
    || adoptions.some(row => row.status !== 'committed');
  const anyChanged = outcomes.some((outcome) => outcome['changed'] === true) || receipts.some(row => row.changed);
  const potentiallyChanged = outcomes.some((outcome) => outcome['resourceState'] === 'potentially-changed');
  const earlyPhase = summary['terminalPhase'] === 'parse' || summary['terminalPhase'] === 'resolve' ||
    summary['terminalPhase'] === 'freeze' || summary['terminalPhase'] === 'preflight';
  const pendingOutcomes = outcomes.filter((outcome) => outcome['result'] === 'pending');
  const recoveryOutcomes = outcomes.filter((outcome) =>
    isObject(outcome['reason']) && outcome['reason']['category'] === 'recovery');
  const recoveryRequiredOutcomes = recoveryOutcomes.filter((outcome) =>
    (outcome['reason'] as Record<string, unknown>)['code'] === 'recovery.required');
  const pendingReceipts = receipts.filter(row => row.status === 'pending');
  if (receipts.some(row => row.mutationStarted) && summary['mutationStarted'] !== true) throw contradiction('recovery mutation requires aggregate mutationStarted');
  const readbackOutcomes = outcomes.filter((outcome) =>
    isObject(outcome['reason']) && outcome['reason']['category'] === 'readback');
  const appliedDisablements = outcomes.filter((outcome) =>
    outcome['action'] === 'disable-nonconforming' && outcome['changed'] === true);
  const pairFailureCategories = new Set(outcomes
    .filter((outcome) => outcome['result'] !== 'succeeded')
    .map((outcome) => (outcome['reason'] as Record<string, unknown>)['category']));
  if (summary['changed'] !== anyChanged) throw contradiction('summary changed flag contradicts its outcomes');
  if ((dryRun || summary['mutationStarted'] === false) && summary['changed'] === true) throw contradiction('summary cannot report changed=true before mutation');
  if (potentiallyChanged && summary['mutationStarted'] === false) throw contradiction('potentially changed work requires mutationStarted=true');
  if (dryRun && summary['mutationStarted'] === true) throw contradiction('dry-run summary cannot report mutationStarted=true');
  if (earlyPhase && (summary['mutationStarted'] === true || summary['changed'] === true || potentiallyChanged)) {
    throw contradiction(`${String(summary['terminalPhase'])} summary cannot report mutation or potentially changed work`);
  }
  if (appliedDisablements.length > 0 && (summary['mutationStarted'] !== true || summary['changed'] !== true)) {
    throw contradiction('applied disable-nonconforming containment requires a recorded mutation');
  }
  if (pendingOutcomes.some((outcome) => !isObject(outcome['reason']) ||
      (outcome['reason']['code'] !== 'recovery.required' && outcome['reason']['category'] !== 'readback'))) {
    throw contradiction('pending outcomes require a recovery.required or readback reason');
  }
  if (pendingOutcomes.length > 0 && summary['mutationStarted'] !== true) {
    throw contradiction('pending outcomes require mutationStarted=true');
  }
  const claimsRecoveryRequired = recoveryRequiredOutcomes.length > 0 ||
    (isObject(reason) && reason['code'] === 'recovery.required');
  if (claimsRecoveryRequired && pendingReceipts.length === 0 && summary['mutationStarted'] !== true) {
    throw contradiction('recovery.required work requires mutationStarted=true');
  }
  if (claimsRecoveryRequired && pendingReceipts.length === 0 && !recoveryRequiredOutcomes.some((outcome) =>
    outcome['result'] === 'pending' || outcome['resourceState'] === 'potentially-changed')) {
    throw contradiction('recovery.required work needs a pending or potentially changed recovery outcome');
  }
  const recoveryRequired = pendingReceipts.length > 0 || pendingOutcomes.length > 0 || recoveryOutcomes.length > 0 ||
    (isObject(reason) && reason['category'] === 'recovery');
  if (recoveryRequired && summary['recoveryId'] === null) {
    throw contradiction('pending or recovery-required work needs a recoveryId');
  }
  if (typeof summary['recoveryId'] === 'string' && !recoveryRequired) {
    throw contradiction('summary recoveryId requires pending or recovery-required work');
  }
  if (recoveryRequired && !pendingReceipts.some(row => row.original.operationId === summary['recoveryId']) && ![...recoveryOutcomes, ...pendingOutcomes].some((outcome) => outcome['operationId'] === summary['recoveryId'])) {
    throw contradiction('summary recoveryId does not identify pending or recovery-required work');
  }
  const historicalReadback = receipts.some(row => row.original.operationId === summary['readbackId'] && row.readbackVerified);
  const readbackRequired = historicalReadback || summary['terminalPhase'] === 'readback' || readbackOutcomes.length > 0 ||
    appliedDisablements.length > 0 || (isObject(reason) && reason['category'] === 'readback');
  if (readbackRequired && summary['readbackId'] === null) {
    throw contradiction('readback work needs a readbackId');
  }
  if (typeof summary['readbackId'] === 'string' && !readbackRequired) {
    throw contradiction('summary readbackId requires readback work');
  }
  if (readbackRequired && !historicalReadback && ![...readbackOutcomes, ...appliedDisablements].some((outcome) => outcome['operationId'] === summary['readbackId'])) {
    throw contradiction('summary readbackId does not identify readback work');
  }
  if (summary['result'] === 'converged' && (nonSuccess || summary['failureCategory'] !== null || reason !== null)) {
    throw contradiction('converged summary contradicts a failure outcome or reason');
  }
  if (summary['result'] === 'converged' && summary['terminalPhase'] !== 'complete') {
    throw contradiction('converged summary must reach the complete phase');
  }
  if (summary['result'] === 'incomplete' && summary['failureCategory'] === null) throw contradiction('incomplete summary needs a failureCategory');
  if (summary['result'] === 'incomplete' && !nonSuccess && reason === null) throw contradiction('command-global incomplete summary needs a reason');
  if (summary['result'] === 'incomplete' && reason === null && !pairFailureCategories.has(summary['failureCategory'])) {
    throw contradiction('summary failureCategory does not match any failed pair');
  }
  if (reason !== null && (reason as Record<string, unknown>)['category'] === 'usage' && summary['result'] !== 'usage-error') {
    throw contradiction('usage reason requires a usage-error summary');
  }
  if (summary['result'] === 'usage-error' && (summary['failureCategory'] !== 'usage' || reason === null || outcomes.length > 0 ||
      summary['mutationStarted'] !== false || summary['terminalPhase'] !== 'parse')) {
    throw contradiction('usage-error summary must be a non-mutating, outcome-free parse failure carrying a usage reason');
  }
}

function assertReason(reason: Record<string, unknown>): void {
  exactFields(reason, ['category', 'code', 'diagnostic', 'capabilityId', 'evidenceId'], 'lifecycle reason');
  if (!oneOf(LIFECYCLE_REASON_CATEGORIES, reason['category']) || !oneOf(LIFECYCLE_REASON_CODES, reason['code']) ||
      !hasText(reason['diagnostic']) || !nullableText(reason['capabilityId']) || !nullableText(reason['evidenceId'])) {
    throw invalid('lifecycle reason contains a missing or invalid field');
  }
  if ((reason['code'] as string).slice(0, (reason['code'] as string).indexOf('.')) !== reason['category']) {
    throw invalid(`reason code '${reason['code']}' does not belong to category '${reason['category']}'`);
  }
  if (reason['category'] === 'capability' && reason['capabilityId'] === null) throw invalid('capability reason needs a capabilityId');
  if (reason['category'] !== 'capability' && (reason['capabilityId'] !== null || reason['evidenceId'] !== null)) {
    throw invalid('only capability reasons may carry capability or evidence identifiers');
  }
}

function assertScope(scope: Record<string, unknown>): void {
  exactFields(scope, ['id', 'source', 'target'], 'deployment scope');
  if (!nonempty(scope['id']) || !isObject(scope['source']) || !isObject(scope['target'])) {
    throw invalid('planned operation has a malformed deployment scope');
  }
  assertSourceBinding(scope['source'], 'planned operation deployment scope');
  exactFields(scope['target'], ['kind', 'instance'], 'deployment scope target');
  let canonical: DeploymentScopeIdentity;
  try {
    canonical = createDeploymentScopeIdentity(
      scope['source'] as unknown as DeploymentScopeIdentity['source'],
      scope['target'] as unknown as DeploymentScopeIdentity['target'],
    );
  } catch (error) {
    throw invalid(`planned operation has an invalid deployment scope: ${unknownErrorDiagnostic(error)}`);
  }
  if (!sameScope(scope as unknown as DeploymentScopeIdentity, canonical)) {
    throw invalid('planned operation deployment scope id contradicts its Source and target identity');
  }
}

function assertSourceBinding(binding: Record<string, unknown>, label: string): void {
  if (binding['kind'] === 'local') {
    exactFields(binding, ['kind', 'locator'], `${label} Source binding`);
    if (!nonempty(binding['locator'])) throw invalid(`${label} local Source binding needs a locator`);
  } else if (binding['kind'] === 'git') {
    exactFields(binding, ['kind', 'locator', 'ref'], `${label} Source binding`);
    if (!nonempty(binding['locator']) || !nonempty(binding['ref'])) throw invalid(`${label} git Source binding needs a locator and ref`);
  } else {
    throw invalid(`${label} Source binding has an unknown kind`);
  }
  try {
    validateSourceBinding(binding as unknown as DeploymentScopeIdentity['source']);
  } catch (error) {
    throw invalid(`${label} has an invalid Source binding: ${unknownErrorDiagnostic(error)}`);
  }
}

function sameScope(left: DeploymentScopeIdentity, right: DeploymentScopeIdentity): boolean {
  return left.id === right.id && sameSourceBinding(left.source, right.source) &&
    left.target.kind === right.target.kind && left.target.instance === right.target.instance;
}

function sameSourceBinding(left: DeploymentScopeIdentity['source'], right: DeploymentScopeIdentity['source']): boolean {
  return left.kind === right.kind && left.locator === right.locator &&
    (left.kind === 'local' || (right.kind === 'git' && left.ref === right.ref));
}

function oneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || nonempty(value);
}

function nullableText(value: unknown): value is string | null {
  return value === null || hasText(value);
}

function exactFields(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const fields = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !fields.has(key));
  if (unknown !== undefined) throw invalid(`${label} has unsupported field '${unknown}'`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
