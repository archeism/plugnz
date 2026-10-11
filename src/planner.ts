import type { DeploymentScopeIdentity } from './deployment-scope';
import { unknownErrorDiagnostic } from './error-diagnostic';
import type {
  LifecycleHostAdapter,
  LifecycleTargetIdentity,
  RecordedOwnedActivation,
  TargetInstallationData,
  TargetInventoryObservation,
  TargetVersionObservation,
} from './lifecycle-host';
import {
  createLifecycleReason,
  parseLifecycleReport,
  type LifecycleCommandName,
  type LifecyclePlanAction,
  type LifecyclePlanOperation,
  type LifecycleReason,
  type LifecycleReport,
  type LifecycleRoute,
  type LifecycleSourceSnapshotContext,
  type LifecycleTerminalPhase,
} from './lifecycle-report';
import {
  createFrozenPackageSnapshot,
  createLifecyclePlanCoverage,
  createResolvedLifecyclePins,
} from './lifecycle-runtime';
import { ownedActivation } from './owned-activation';
import { bindRecordedPriorSource } from './prior-source-proof';
import { sameSourceBinding } from './scope-inventory';
import { CryptoHasher } from './runtime';
import {
  inventoryPackageSemantics,
  requiredSemanticsForOperation,
  SemanticInventoryError,
  type PackageSemanticInventory,
  type SourceType,
} from './semantic-inventory';
import { resolveSource, sourceBindingForArgument, type FrozenSource, type PluginSource } from './source';
import type { SourceBinding } from './source-reference';
import {
  hasRetirementAuthority,
  readLifecycleState,
  type ActivationRecord,
  type DeploymentScopeRecord,
  type DesiredGenerationRecord,
  type DesiredPackageRecord,
  type JournalAction,
  type LifecycleStateV2,
  type LoadedLifecycleState,
} from './state';
import {
  deploymentScopeForSyncManifestEntry,
  selectManifestPackages,
  SyncManifestValidationError,
  type SelectedManifestPackage,
  type SyncManifest,
  type SyncManifestEntry,
  type SyncManifestRetireSourceEntry,
  type SyncManifestSyncEntry,
} from './sync-manifest';
import { canonicalTargetContext, type PersistedTargetIdentity } from './target-identity';

export type LifecyclePlan =
  | {
      readonly kind: 'zero-write-failure';
      readonly report: LifecycleReport;
    }
  | {
      readonly kind: 'frozen';
      readonly requestedDryRun: boolean;
      readonly attemptId: string;
      /** Retained immutable roots; apply never fetches or freezes a mutable Source again. */
      readonly frozenSources: ReadonlyMap<string, FrozenSource>;
      /** Original add argument. Carries fetch credentials that must not enter the report. */
      readonly transportSource?: string;
      readonly report: LifecycleReport;
      readonly scopes: readonly {
        readonly scope: DeploymentScopeIdentity;
        /** Frozen physical target binding; public scope identity intentionally omits context. */
        readonly target?: LifecycleTargetIdentity;
        readonly selectorMode: 'all' | 'explicit' | 'retired';
        readonly desired: DesiredGenerationRecord | null;
        readonly prune: 'planned' | 'blocked';
        /** Manual package removal leaves the recorded Source authority unchanged. */
        readonly retirementPackages?: readonly { readonly packageId: string; readonly nativeId: string }[];
      }[];
      readonly operations: readonly {
        readonly operation: LifecyclePlanOperation;
        readonly reason: LifecycleReason | null;
        readonly journal:
          | { readonly kind: 'none' }
          | {
              readonly kind: 'required';
              readonly action: JournalAction;
              readonly mutation: boolean;
              readonly readback: boolean;
            };
      }[];
    };

export interface PlannerHost {
  readonly kinds: readonly string[];
  readonly adapter: LifecycleHostAdapter;
  readonly plannedNativeId: (plugin: PluginSource) => string;
  /** Private, read-only physical identity correlation; never grants Source ownership. */
  readonly samePhysicalNativeIdentity?: (plugin: PluginSource, prior: ActivationRecord, observation: TargetInventoryObservation) => SamePhysicalNativeIdentityEvidence | null;
  readonly announceDryRun?: (operation: LifecyclePlanOperation) => void;
}

export interface SamePhysicalNativeIdentityEvidence {
  readonly priorNativeId: string;
  readonly plannedNativeId: string;
  readonly observedRoot: string;
  readonly physicalRoot: string;
  readonly currentFingerprint: string;
}

export interface PlanLifecycleInput {
  readonly manifest: SyncManifest;
  readonly dryRun: boolean;
  readonly validatedAt: string;
  readonly hosts: readonly PlannerHost[];
  readonly command?: 'add' | 'update' | 'remove';
  /** Original add argument. Carries fetch credentials that must not enter the manifest. */
  readonly transportSource?: string;
  readonly removalSelection?: readonly { readonly scopeId: string; readonly packageId: string; readonly nativeId: string }[];
  /** Private recovery preflight; never execute this plan before pending journals settle. */
  readonly recoveryPreflight?: boolean;
  readonly retainedSources?: Map<string, FrozenSource>;
}

type FrozenOperation = Extract<LifecyclePlan, { kind: 'frozen' }>['operations'][number];
type PlannedScope = Extract<LifecyclePlan, { kind: 'frozen' }>['scopes'][number];
type Defect = { readonly kind: 'defect'; readonly reason: LifecycleReason; readonly terminalPhase?: LifecycleTerminalPhase };
type Classified = { readonly kind: 'classified'; readonly operation: FrozenOperation; readonly blocksPrune: boolean };
type Omissions = { readonly kind: 'omissions'; readonly operations: readonly FrozenOperation[] };

type PreparedSync = {
  readonly kind: 'sync';
  readonly entry: SyncManifestSyncEntry;
  readonly frozen: FrozenSource;
  readonly selected: readonly SelectedManifestPackage<PluginSource>[];
  readonly host: PlannerHost | null;
  readonly observation: TargetInventoryObservation | null;
  readonly scope: DeploymentScopeIdentity;
  readonly identity: readonly string[];
};

type PreparedRetire = {
  readonly kind: 'retire-source';
  readonly entry: SyncManifestRetireSourceEntry;
  readonly recorded: DeploymentScopeRecord;
  readonly host: PlannerHost | null;
  readonly observation: TargetInventoryObservation | null;
  readonly scope: DeploymentScopeIdentity;
  readonly identity: readonly string[];
  readonly retirementPackages?: readonly { readonly packageId: string; readonly nativeId: string }[];
};

type Prepared = PreparedSync | PreparedRetire;

export async function planLifecycle(input: PlanLifecycleInput): Promise<LifecyclePlan> {
  const command = input.command ?? commandName(input.manifest);
  let loaded: LoadedLifecycleState;
  try {
    loaded = readLifecycleState();
  } catch (error) {
    return zeroWrite(command, input.dryRun, createLifecycleReason(
      'internal',
      'internal.corrupt-state',
      `state could not be loaded: ${unknownErrorDiagnostic(error)}`,
    ));
  }
  const duplicate = duplicateHostKind(input.hosts);
  if (duplicate !== null) return zeroWrite(command, input.dryRun, duplicate);

  const prepared: Prepared[] = [];
  const transportCache = input.retainedSources ?? new Map<string, FrozenSource>();
  const planningState = input.recoveryPreflight ? { ...loaded.state, activations: loaded.state.activations.map(row => {
    if (row.pending === undefined || !loaded.state.attempts.some(attempt => attempt.command !== 'legacy-recovery' && attempt.id === row.pending!.attemptId && attempt.journal.some(entry => entry.scopeId === row.scopeId && entry.packageId === row.packageId && entry.nativeId === row.nativeId && (entry.sealedOperation !== undefined || entry.state === 'pending')))) return row;
    const { pending: _pending, ...kept } = row; return kept;
  }) } : loaded.state;
  for (const entry of input.manifest.entries) {
    const result = await prepareEntry(entry, input.hosts, planningState, command, input.transportSource, transportCache);
    if (result.kind === 'defect') return zeroWrite(command, input.dryRun, result.reason, result.terminalPhase);
    if (input.removalSelection !== undefined) {
      if (command !== 'remove' || result.kind !== 'retire-source') {
        return zeroWrite(command, input.dryRun, createLifecycleReason('internal', 'internal.invariant', 'package retirement selection is valid only for manual removal'));
      }
      const selected = input.removalSelection.filter((row) => row.scopeId === result.scope.id);
      if (selected.length === 0 || selected.some((row) => !loaded.state.activations.some((activation) =>
        activation.scopeId === row.scopeId && activation.packageId === row.packageId && activation.nativeId === row.nativeId))) {
        return zeroWrite(command, input.dryRun, createLifecycleReason('internal', 'internal.invariant', 'manual removal selection no longer matches recorded ownership'));
      }
      const retirementPackages = selected.map(({ packageId, nativeId }) => ({ packageId, nativeId }))
        .sort((left, right) => left.packageId.localeCompare(right.packageId) || left.nativeId.localeCompare(right.nativeId));
      prepared.push({ ...result, retirementPackages,
        identity: ['remove-packages', result.scope.id, ...retirementPackages.flatMap((row) => [row.packageId, row.nativeId])] });
    } else prepared.push(result);
  }

  // A changed physical identity is not a fresh install. Only a separately proven
  // identity-migration transaction may supersede this recorded activation.
  for (const item of prepared) {
    if (item.kind !== 'sync') continue;
    for (const selected of item.selected) {
      const nativeId = plannedNativeIdFor(item, selected.plugin);
      if (nativeId instanceof Error) return zeroWrite(command, input.dryRun, createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(nativeId)));
      const samePhysicalIds = new Set<string>();
      try {
        if (item.observation !== null && item.host?.samePhysicalNativeIdentity !== undefined) {
          for (const row of loaded.state.activations) {
            if (row.scopeId !== item.scope.id || row.nativeId === nativeId) continue;
            const proof = item.host.samePhysicalNativeIdentity(selected.plugin, row, item.observation);
            const observed = item.observation.installations.find(installation => installation.nativeId === row.nativeId);
            if (proof !== null && proof.priorNativeId === row.nativeId && proof.plannedNativeId === nativeId
              && proof.physicalRoot.length > 0 && observed?.presence === 'present'
              && observed.packageName === selected.plugin.name && observed.ownership.kind === 'owned'
              && observed.ownership.scopeId === item.scope.id && observed.installedFingerprint === proof.currentFingerprint
              && observed.contentRoots.some(root => root.path === proof.observedRoot && root.fingerprint === proof.currentFingerprint)) samePhysicalIds.add(row.nativeId);
          }
        }
      } catch (error) {
        return zeroWrite(command, input.dryRun, createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error)));
      }
      const prior = loaded.state.activations.find(row => {
        if (row.scopeId !== item.scope.id || row.nativeId === nativeId || samePhysicalIds.has(row.nativeId)) return false;
        const observed = item.observation?.installations.find(installation => installation.nativeId === row.nativeId && installation.presence === 'present');
        if (row.packageId === selected.plugin.name) return row.ownership.kind !== 'legacy-claim' || observed !== undefined;
        // This correlation only refuses mutation; it grants no alias ownership.
        return row.ownership.kind === 'legacy-claim' && row.sourceRelativeDir !== undefined
          && row.sourceRelativeDir === (selected.plugin.relativeDir || '.') && observed?.packageName === selected.plugin.name;
      });
      if (prior !== undefined) return zeroWrite(command, input.dryRun, createLifecycleReason('internal', 'internal.invariant', `recorded native identity '${prior.nativeId}' differs from planned '${nativeId}'; a proven identity migration is required`));
      const ambiguousPrior = loaded.state.activations.find(row => row.scopeId === item.scope.id
        && row.nativeId !== nativeId && !samePhysicalIds.has(row.nativeId) && row.ownership.kind === 'legacy-claim'
        && item.observation?.installations.some(installation => installation.nativeId === row.nativeId
          && installation.presence === 'present' && installation.packageName === selected.plugin.name));
      if (ambiguousPrior !== undefined) return zeroWrite(command, input.dryRun, createLifecycleReason('internal', 'internal.invariant', `historical native identity '${ambiguousPrior.nativeId}' has unverified Source correspondence with planned '${nativeId}'; a proven identity migration is required`));
    }
  }

  const attemptId = lifecycleAttemptId(loaded.state.stateGeneration, prepared.map((item) => item.identity));
  const recovering = input.recoveryPreflight && loaded.state.attempts.some(attempt => attempt.command !== 'legacy-recovery' && attempt.journal.some(row =>
    prepared.some(item => item.scope.id === row.scopeId) && ['pending', 'applying', 'applied', 'readback-verified', 'rollback', 'cleanup-pending'].includes(row.state)));
  const scopes: PlannedScope[] = [];
  const operations: FrozenOperation[] = [];
  for (const item of prepared) {
    const pendingJournals = recovering ? loaded.state.attempts.filter(attempt => attempt.command !== 'legacy-recovery').flatMap(attempt => attempt.journal.filter(row => row.scopeId === item.scope.id && ['pending', 'applying', 'applied', 'readback-verified', 'rollback', 'cleanup-pending'].includes(row.state))) : [];
    const pendingNativeIds = new Set(pendingJournals.map(row => row.nativeId));
    const transitional: FrozenOperation[] = [];
    const transitionalDesired: DesiredPackageRecord[] = [];
    const blockedReason = createLifecycleReason('runtime', 'runtime.operation-failed', 'not attempted before pending lifecycle recovery settles');
    let classifiable = item;
    if (item.kind === 'sync' && pendingNativeIds.size > 0) {
      // Validate Source semantics even when only this native identity is transitional.
      const selectedPackages: SelectedManifestPackage<PluginSource>[] = [];
      for (const selected of item.selected) {
        const nativeId = plannedNativeIdFor(item, selected.plugin);
        if (nativeId instanceof Error) return zeroWrite(command, input.dryRun, createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(nativeId)));
        if (!pendingNativeIds.has(nativeId)) { selectedPackages.push(selected); continue; }
        try {
          const inventory = inventoryPackageSemantics(selected.plugin);
          transitionalDesired.push({ packageId: selected.plugin.name, nativeId,
            sourceRelativeDir: selected.plugin.relativeDir || '.',
            requiredCapabilities: [...requiredSemanticsForOperation(inventory, 'install')].sort(),
            adoptionRequested: selected.adoptionRequested,
          });
        }
        catch (error) { return zeroWrite(command, input.dryRun, error instanceof SemanticInventoryError ? error.reason : createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error))); }
        transitional.push(classified(
          operationIdentity('desired-pair', item.scope.id, selected.plugin.name, nativeId, `${item.frozen.snapshot.fingerprint}\0${attemptId}`),
          'desired-pair', item.scope, sourceSnapshotId(item.frozen), selected.plugin.name, nativeId,
          'not-attempted', 'none', blockedReason,
        ).operation);
      }
      classifiable = { ...item, selected: selectedPackages };
    }
    const classifiableState = pendingNativeIds.size === 0 ? loaded.state : { ...loaded.state, activations: loaded.state.activations.filter(row => row.scopeId !== item.scope.id || !pendingNativeIds.has(row.nativeId)) };
    for (const activation of classifiableState.activations.filter(row => row.scopeId === item.scope.id)) {
      const installation = item.observation?.installations.find(row => row.nativeId === activation.nativeId);
      if ((activation.route.kind === 'managed' || activation.route.kind === 'native') && installation?.observedRoute !== undefined && installation.observedRoute !== activation.route.kind) {
        return zeroWrite(command, input.dryRun, createLifecycleReason('internal', 'internal.invariant', `recorded route '${activation.route.kind}' contradicts observed owned route '${installation.observedRoute}' for '${activation.nativeId}'`));
      }
    }
    const planned = await planPrepared(classifiable, attemptId, input.validatedAt, classifiableState, command);
    if (planned.kind === 'defect') return zeroWrite(command, input.dryRun, planned.reason, planned.terminalPhase);
    for (const journal of pendingJournals) {
      if (journal.packageId === undefined || journal.nativeId === undefined || transitional.some(row => row.operation.nativeId === journal.nativeId)) continue;
      if (item.kind === 'retire-source' && (item.retirementPackages === undefined || item.retirementPackages.some(row => row.nativeId === journal.nativeId))
        || item.kind === 'sync' && command === 'sync' && loaded.state.activations.some(row => row.scopeId === item.scope.id && row.nativeId === journal.nativeId)) {
        transitional.push(classified(
          operationIdentity('retirement', item.scope.id, journal.packageId, journal.nativeId, attemptId),
          'retirement', item.scope, item.kind === 'sync' ? sourceSnapshotId(item.frozen) : null,
          journal.packageId, journal.nativeId, 'not-attempted', 'none', blockedReason,
        ).operation);
      }
    }
    scopes.push(item.kind === 'sync' && transitionalDesired.length > 0 ? {
      ...planned.scope,
      desired: desiredGeneration(loaded.state.scopes.find(row => row.id === item.scope.id), item.frozen.snapshot.revision, item.frozen.snapshot.fingerprint,
        item.selected.map(selected => [...planned.scope.desired!.packages, ...transitionalDesired].find(row => row.packageId === selected.plugin.name)!), input.validatedAt),
    } : planned.scope);
    operations.push(...planned.operations, ...transitional);
  }
  return frozenPlan(input, command, attemptId, scopes, operations, prepared, loaded.state);
}

async function prepareEntry(
  entry: SyncManifestEntry,
  hosts: readonly PlannerHost[],
  state: LifecycleStateV2,
  command: LifecycleCommandName,
  transportSource: string | undefined,
  transportCache: Map<string, FrozenSource>,
): Promise<Prepared | Defect> {
  switch (entry.operation) {
    case 'sync':
      return prepareSync(entry, hosts, state, command, transportSource, transportCache);
    case 'retire-source':
      return prepareRetire(entry, hosts, state);
    default: {
      const unreachable: never = entry;
      throw new Error(`unknown manifest operation ${String(unreachable)}`);
    }
  }
}

async function prepareSync(
  entry: SyncManifestSyncEntry,
  hosts: readonly PlannerHost[],
  state: LifecycleStateV2,
  command: LifecycleCommandName,
  transportSource: string | undefined,
  transportCache: Map<string, FrozenSource>,
): Promise<PreparedSync | Defect> {
  let frozen: FrozenSource;
  try {
    frozen = resolvePlannedSource(entry.source, transportSource, transportCache);
  } catch (error) {
    const diagnostic = unknownErrorDiagnostic(error);
    if (command === 'add' || command === 'update') {
      return defect(createLifecycleReason('runtime', 'runtime.operation-failed', diagnostic), 'resolve');
    }
    return defect(createLifecycleReason('usage', 'usage.invalid-argument', diagnostic));
  }
  let selected: SelectedManifestPackage<PluginSource>[];
  try {
    selected = selectManifestPackages(entry, frozen.plugins);
  } catch (error) {
    if (error instanceof SyncManifestValidationError) return defect(error.reason);
    throw error;
  }
  const scope = deploymentScopeForSyncManifestEntry(entry);
  const recordedScope = state.scopes.find(row => row.id === scope.id);
  if (recordedScope?.target.context !== undefined
    && JSON.stringify(canonicalTargetContext(recordedScope.target.context))
      !== JSON.stringify(entry.target.context === undefined ? undefined : canonicalTargetContext(entry.target.context))) {
    return defect(createLifecycleReason('internal', 'internal.invariant',
      `target context changed for recorded scope '${scope.id}'; use a distinct target instance or retire the recorded scope explicitly`));
  }
  const pending = pendingDefect(state, scope.id, new Set(selected.map((item) => item.plugin.name)), command);
  if (pending !== null) return defect(pending);
  const host = hosts.find((candidate) => candidate.kinds.includes(entry.target.kind)) ?? null;
  if (host === null) {
    return {
      kind: 'sync',
      entry,
      frozen,
      selected,
      host,
      observation: null,
      scope,
      identity: plannedAttemptIdentity(scope.id, frozen.snapshot.fingerprint, selected.map((item) => item.plugin.name)),
    };
  }
  let observation: TargetInventoryObservation;
  try {
    observation = await host.adapter.observeTarget(lifecycleTarget(entry.target));
  } catch (error) {
    return defect(createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error)));
  }
  for (const installation of observation.installations) {
    if (installation.ownership.kind === 'ambiguous') {
      return defect(createLifecycleReason(
        'internal',
        'internal.ambiguous-ownership',
        `package '${installation.nativeId}' on ${entry.target.kind}/${entry.target.instance} has ambiguous ownership`,
      ));
    }
  }
  for (const item of selected) {
    let nativeId: string;
    try {
      nativeId = host.plannedNativeId(item.plugin);
    } catch (error) {
      return defect(createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error)));
    }
    const ownedByOther = foreignOwnership(observation, nativeId, scope.id, entry.target);
    if (ownedByOther !== null) return defect(ownedByOther);
  }
  const nativeIds = selected.map((item) => host.plannedNativeId(item.plugin));
  if (new Set(nativeIds).size !== nativeIds.length) {
    return defect(createLifecycleReason('usage', 'usage.invalid-selection', `sync scope '${scope.id}' resolved duplicate native identities`));
  }
  return {
    kind: 'sync',
    entry,
    frozen,
    selected,
    host,
    observation,
    scope,
    identity: plannedAttemptIdentity(scope.id, frozen.snapshot.fingerprint, selected.map((item) => item.plugin.name)),
  };
}

async function prepareRetire(
  entry: SyncManifestRetireSourceEntry,
  hosts: readonly PlannerHost[],
  state: LifecycleStateV2,
): Promise<PreparedRetire | Defect> {
  const recorded = state.scopes.find((scope) => scope.id === entry.scopeId);
  if (recorded === undefined) {
    return defect(createLifecycleReason('usage', 'usage.invalid-selection', `unknown deployment scope '${entry.scopeId}'`));
  }
  if (recorded.target.kind !== entry.target.kind || recorded.target.instance !== entry.target.instance) {
    return defect(createLifecycleReason(
      'usage',
      'usage.invalid-selection',
      `retire-source cannot retarget scope '${entry.scopeId}'`,
    ));
  }
  const pending = pendingDefect(state, recorded.id);
  if (pending !== null) return defect(pending);
  const host = hosts.find((candidate) => candidate.kinds.includes(entry.target.kind)) ?? null;
  let observation: TargetInventoryObservation | null = null;
  if (host !== null) {
    try {
      observation = await host.adapter.observeTarget(lifecycleTarget(recorded.target));
    } catch (error) {
      return defect(createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error)));
    }
    for (const installation of observation.installations) {
      if (installation.ownership.kind === 'ambiguous') {
        return defect(createLifecycleReason(
          'internal',
          'internal.ambiguous-ownership',
          `package '${installation.nativeId}' on ${entry.target.kind}/${entry.target.instance} has ambiguous ownership`,
        ));
      }
    }
  }
  return {
    kind: 'retire-source',
    entry,
    recorded,
    host,
    observation,
    scope: { id: recorded.id, source: recorded.source, target: { kind: recorded.target.kind, instance: recorded.target.instance } },
    identity: plannedAttemptIdentity(recorded.id),
  };
}

async function planPrepared(
  item: Prepared,
  attemptId: string,
  validatedAt: string,
  state: LifecycleStateV2,
  command: LifecycleCommandName,
): Promise<{ readonly kind: 'planned'; readonly scope: PlannedScope; readonly operations: readonly FrozenOperation[] } | Defect> {
  switch (item.kind) {
    case 'sync':
      return planSync(item, attemptId, validatedAt, state, command);
    case 'retire-source':
      return planRetire(item, attemptId, state);
    default: {
      const unreachable: never = item;
      throw new Error(`unknown prepared entry ${String(unreachable)}`);
    }
  }
}

async function planSync(
  item: PreparedSync,
  attemptId: string,
  validatedAt: string,
  state: LifecycleStateV2,
  command: LifecycleCommandName,
): Promise<{ readonly kind: 'planned'; readonly scope: PlannedScope; readonly operations: readonly FrozenOperation[] } | Defect> {
  const existing = state.scopes.find((scope) => scope.id === item.scope.id);
  const packages: DesiredPackageRecord[] = [];
  const classified: Classified[] = [];
  for (const selected of item.selected) {
    let inventory: PackageSemanticInventory;
    try {
      inventory = inventoryPackageSemantics(selected.plugin);
    } catch (error) {
      if (!(error instanceof SemanticInventoryError)) {
        return defect(createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error)));
      }
      const nativeId = plannedNativeIdFor(item, selected.plugin);
      if (nativeId instanceof Error) return defect(createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(nativeId)));
      const activation = findActivation(state, item.scope.id, selected.plugin.name, nativeId);
      if (command !== 'update' || activation === undefined) return defect(error.reason);
      packages.push({
        packageId: selected.plugin.name,
        nativeId,
        sourceRelativeDir: selected.plugin.relativeDir && selected.plugin.relativeDir.length > 0 ? selected.plugin.relativeDir : '.',
        requiredCapabilities: [],
        adoptionRequested: selected.adoptionRequested,
      });
      classified.push(uninventoriedUpdate(item, selected.plugin.name, nativeId, attemptId));
      continue;
    }
    const nativeId = item.host === null ? selected.plugin.name : item.host.plannedNativeId(selected.plugin);
    packages.push({
      packageId: selected.plugin.name,
      nativeId,
      sourceRelativeDir: selected.plugin.relativeDir && selected.plugin.relativeDir.length > 0 ? selected.plugin.relativeDir : '.',
      requiredCapabilities: [...requiredSemanticsForOperation(inventory, 'install')].sort(),
      adoptionRequested: selected.adoptionRequested,
    });
    const row = await classifyDesired(item, selected, inventory, nativeId, attemptId, state, command === 'update');
    if (row.kind === 'defect') return row;
    classified.push(row);
  }
  const blocks = command === 'add' || command === 'update' || classified.some((row) => row.blocksPrune) || !canPruneOmissions(existing);
  const retirements = blocks ? { kind: 'omissions' as const, operations: [] } : await planOmissions(item, attemptId, state, packages);
  if (retirements.kind === 'defect') return retirements;
  return {
    kind: 'planned',
    scope: {
      scope: item.scope,
      target: item.observation?.target ?? item.entry.target,
      selectorMode: item.entry.selectors === undefined ? 'all' : 'explicit',
      desired: desiredGeneration(existing, item.frozen.snapshot.revision, item.frozen.snapshot.fingerprint, packages, validatedAt),
      prune: blocks || retirements.operations.some((row) => row.operation.action !== 'retire-orphan') ? 'blocked' : 'planned',
    },
    operations: [...classified.map((row) => row.operation), ...retirements.operations],
  };
}

async function classifyDesired(
  item: PreparedSync,
  selected: SelectedManifestPackage<PluginSource>,
  inventory: PackageSemanticInventory,
  nativeId: string,
  attemptId: string,
  state: LifecycleStateV2,
  reapplyMatchingUpdate: boolean,
): Promise<Classified | Defect> {
  const operationId = operationIdentity('desired-pair', item.scope.id, selected.plugin.name, nativeId, `${item.frozen.snapshot.fingerprint}\0${attemptId}`);
  const snapshotId = sourceSnapshotId(item.frozen);
  const activation = findActivation(state, item.scope.id, selected.plugin.name, nativeId);
  if (item.host === null || item.observation === null) {
    return classified(operationId, 'desired-pair', item.scope, snapshotId, selected.plugin.name, nativeId, 'not-attempted', 'none', createLifecycleReason(
      'capability',
      'capability.unverified',
      `target '${item.entry.target.kind}' has no lifecycle adapter`,
      'lifecycle-adapter',
    ));
  }
  const installation = item.observation.installations.find((row) => row.nativeId === nativeId);
  const collision = foreignOwnership(item.observation, nativeId, item.scope.id, item.entry.target);
  if (collision !== null) return defect(collision);
  const recordedRoute = activation?.route.kind === 'managed' || activation?.route.kind === 'native' ? activation.route.kind : null;
  if (recordedRoute !== null && installation?.observedRoute !== undefined && installation.observedRoute !== recordedRoute) {
    return defect(createLifecycleReason('internal', 'internal.invariant', `recorded route '${recordedRoute}' contradicts observed owned route '${installation.observedRoute}' for '${nativeId}'`));
  }
  if (installation?.presence === 'present' && installation.ownership.kind === 'unmanaged' && !selected.adoptionRequested) {
    return defect(createLifecycleReason(
      'internal',
      'internal.ambiguous-ownership',
      `package '${nativeId}' on ${item.entry.target.kind}/${item.entry.target.instance} is not ownership-proven`,
    ));
  }
  const replacing = installation?.presence === 'present' && installation.ownership.kind === 'owned';
  if (replacing && item.scope.source.kind === 'git' && installation?.source?.locator != null
    && installation.source.locator !== item.scope.source.locator) {
    return defect(createLifecycleReason('internal', 'internal.ambiguous-ownership', 'owned native Git origin differs from the recorded deployment Source'));
  }
  const capabilityOperation = replacing ? 'update' : 'install';
  let version: TargetVersionObservation;
  try {
    version = await item.host.adapter.probeVersion(item.observation.target);
  } catch (error) {
    return defect(createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error)));
  }
  const decision = await selectPairRoute(item, selected.plugin, inventory, nativeId, operationId, attemptId, capabilityOperation, version, state.scopes.find(row => row.id === item.scope.id), activation);
  if (decision.kind === 'defect') return decision;
  if (decision.kind === 'gap') {
    // A byte-identical live prior needs no update primitive. Revalidate the
    // desired semantic projection on its exact existing route, never substitute
    // another route or use this path for explicit update/repair.
    if (!reapplyMatchingUpdate && recordedRoute !== null && installation?.observedRoute === recordedRoute
      && priorKind(activation) === 'conforming' && activation?.pending === undefined
      && installation.ownership.kind === 'owned' && installation.ownership.scopeId === item.scope.id
      && installation.presence === 'present' && installation.activation === 'active' && installation.enablement === 'enabled'
      && sameBytes(activation, installation, selected.plugin)
      && activation?.sourceRevision === item.frozen.snapshot.revision
      && installation.source?.immutableRevision === activation.sourceRevision
      && installation.source.type === sourceTypeOf(item.entry.source)
      && (item.scope.source.kind !== 'git' || installation.source.locator === item.scope.source.locator)) {
      const unchanged = await selectPairRoute(item, selected.plugin, inventory, nativeId, operationId, attemptId, 'install', version, state.scopes.find(row => row.id === item.scope.id), activation, true);
      if (unchanged.kind === 'defect') return unchanged;
      if (unchanged.kind === 'selected' && unchanged.route === recordedRoute && !unchanged.provenanceRepair) {
        return classified(operationId, 'desired-pair', item.scope, snapshotId, selected.plugin.name, nativeId, 'unchanged', recordedRoute, null);
      }
    }
    const prior = priorKind(activation);
    if (prior === 'nonconforming') {
      const disabled = await selectDisable(item, nativeId, operationId, attemptId, version, activation, installation);
      if (disabled.kind === 'defect') return disabled;
      if (disabled.kind === 'selected') {
        return classified(operationId, 'desired-pair', item.scope, snapshotId, selected.plugin.name, nativeId, 'disable-nonconforming', disabled.route, decision.reason);
      }
    }
    if (prior === 'conforming' && activation !== undefined && (activation.route.kind === 'managed' || activation.route.kind === 'native')) {
      return classified(operationId, 'desired-pair', item.scope, snapshotId, selected.plugin.name, nativeId, 'retain-prior', activation.route.kind, decision.reason);
    }
    return classified(operationId, 'desired-pair', item.scope, snapshotId, selected.plugin.name, nativeId, 'not-attempted', 'none', decision.reason);
  }
  if (recordedRoute !== null && recordedRoute !== decision.route && installation?.observedRoute === undefined) {
    return classified(operationId, 'desired-pair', item.scope, snapshotId, selected.plugin.name, nativeId, 'retain-prior', recordedRoute,
      createLifecycleReason('capability', 'capability.unverified', 'route migration has no independently observed prior route', 'migration-prior-route'));
  }
  const matchingBytes = !decision.provenanceRepair && sameBytes(activation, installation, selected.plugin)
    && installation?.activation === 'active' && installation.enablement === 'enabled';
  const action = chosenAction(replacing, recordedRoute, decision.route, matchingBytes, reapplyMatchingUpdate);
  return classified(operationId, 'desired-pair', item.scope, snapshotId, selected.plugin.name, nativeId, action, decision.route, null);
}

async function planOmissions(
  item: PreparedSync,
  attemptId: string,
  state: LifecycleStateV2,
  desired: readonly DesiredPackageRecord[],
): Promise<Omissions | Defect> {
  const packageIds = new Set(desired.map((row) => row.packageId));
  const nativeIds = new Set(desired.map((row) => row.nativeId));
  const omissions = state.activations
    .filter((activation) => activation.scopeId === item.scope.id && !packageIds.has(activation.packageId) && !nativeIds.has(activation.nativeId))
    .sort((left, right) => left.packageId < right.packageId ? -1 : left.packageId > right.packageId ? 1 : 0);
  const operations: FrozenOperation[] = [];
  for (const activation of omissions) {
    if (!hasRetirementAuthority(activation)) continue;
    const installation = item.observation?.installations.find((row) => row.nativeId === activation.nativeId);
    if (installation?.ownership.kind === 'owned' && installation.ownership.scopeId !== item.scope.id) {
      return defect(createLifecycleReason(
        'internal',
        'internal.ambiguous-ownership',
        `package '${activation.nativeId}' on ${item.entry.target.kind}/${item.entry.target.instance} is owned by scope '${installation.ownership.scopeId}'`,
      ));
    }
    if (!hostRevalidated(installation, item.scope.id) || item.host === null || item.observation === null) {
      operations.push(notAttemptedRetirement(
        operationIdentity('retirement', item.scope.id, activation.packageId, activation.nativeId, activation.sourceRevision ?? 'unrecorded'),
        item.scope,
        activation,
        `ownership of '${activation.packageId}' was not revalidated`,
      ));
      continue;
    }
    const retired = await selectRetirement(item.host, item.observation, item.scope, activation, attemptId, null);
    if (retired.kind === 'defect') return retired;
    operations.push(retired.operation);
  }
  return { kind: 'omissions', operations };
}

async function planRetire(
  item: PreparedRetire,
  attemptId: string,
  state: LifecycleStateV2,
): Promise<{ readonly kind: 'planned'; readonly scope: PlannedScope; readonly operations: readonly FrozenOperation[] } | Defect> {
  const activations = state.activations
    .filter((activation) => activation.scopeId === item.recorded.id
      && (item.retirementPackages === undefined || item.retirementPackages.some((row) =>
        row.packageId === activation.packageId && row.nativeId === activation.nativeId)))
    .sort((left, right) => left.packageId < right.packageId ? -1 : left.packageId > right.packageId ? 1 : 0);
  const operations: FrozenOperation[] = [];
  for (const activation of activations) {
    const installation = item.observation?.installations.find((row) => row.nativeId === activation.nativeId);
    if (installation?.ownership.kind === 'owned' && installation.ownership.scopeId !== item.scope.id) {
      return defect(createLifecycleReason(
        'internal',
        'internal.ambiguous-ownership',
        `package '${activation.nativeId}' on ${item.entry.target.kind}/${item.entry.target.instance} is owned by scope '${installation.ownership.scopeId}'`,
      ));
    }
    if (!hasRetirementAuthority(activation) || !hostRevalidated(installation, item.scope.id) || item.host === null || item.observation === null) {
      operations.push(classified(
        operationIdentity('retirement', item.scope.id, activation.packageId, activation.nativeId, activation.sourceRevision ?? 'unrecorded'),
        'retirement',
        item.scope,
        null,
        activation.packageId,
        activation.nativeId,
        'not-attempted',
        'none',
        createLifecycleReason('internal', 'internal.invariant', `ownership of '${activation.packageId}' was not revalidated`),
      ).operation);
      continue;
    }
    const retired = await selectRetirement(item.host, item.observation, item.scope, activation, attemptId, item.recorded.source);
    if (retired.kind === 'defect') return retired;
    operations.push(retired.operation);
  }
  return {
    kind: 'planned',
    scope: {
      scope: item.scope,
      target: item.observation?.target ?? item.recorded.target,
      selectorMode: 'retired',
      desired: null,
      ...(item.retirementPackages === undefined ? {} : { retirementPackages: item.retirementPackages }),
      prune: operations.length > 0 && operations.every((row) => row.operation.action === 'retire-orphan') ? 'planned' : 'blocked',
    },
    operations,
  };
}

async function selectPairRoute(
  item: PreparedSync,
  plugin: PluginSource,
  inventory: PackageSemanticInventory,
  nativeId: string,
  operationId: string,
  attemptId: string,
  operation: 'install' | 'update',
  version: TargetVersionObservation,
  recordedScope?: DeploymentScopeRecord,
  activation?: ActivationRecord,
  observeExistingOnly = false,
): Promise<{ readonly kind: 'selected'; readonly route: 'native' | 'managed'; readonly provenanceRepair: boolean } | { readonly kind: 'gap'; readonly reason: LifecycleReason } | Defect> {
  if (item.host === null || item.observation === null) {
    return { kind: 'gap', reason: createLifecycleReason('capability', 'capability.unverified', 'missing lifecycle adapter', 'lifecycle-adapter') };
  }
  if (plugin.contentFingerprint === undefined) {
    return defect(createLifecycleReason('internal', 'internal.invariant', `package '${plugin.name}' has no content fingerprint`));
  }
  try {
    const pins = createResolvedLifecyclePins([]);
    const snapshot = createFrozenPackageSnapshot({
      operationId,
      attemptId,
      scopeId: item.scope.id,
      target: item.observation.target,
      action: operation,
      packageName: plugin.name,
      nativeId,
      sourceType: sourceTypeOf(item.entry.source),
      immutableRevision: item.frozen.snapshot.revision,
      ...(item.scope.source.kind === 'git' ? { nativeGit: { locator: item.scope.source.locator, resolvedRevision: item.frozen.snapshot.revision } } : {}),
      snapshotRoot: item.frozen.snapshotDir,
      packageRoot: plugin.dir,
      relativePackagePath: plugin.relativeDir && plugin.relativeDir.length > 0 ? plugin.relativeDir : '.',
      snapshotFingerprint: item.frozen.snapshot.fingerprint,
      packageFingerprint: plugin.contentFingerprint,
      inventory,
    });
    const provenanceRepair = bindRecordedPriorSource(snapshot, item.scope, recordedScope, activation, item.observation.installations.find(row => row.nativeId === nativeId));
    const installed = item.observation.installations.find(row => row.nativeId === nativeId);
    if (item.scope.source.kind === 'git' && installed?.presence === 'present' && installed.ownership.kind === 'owned'
      && (installed.source === null || installed.source.locator === null) && !provenanceRepair) {
      return defect(createLifecycleReason('internal', 'internal.invariant', 'owned Git installation has incomplete native provenance and no exact recorded prior Source proof'));
    }
    const planCoverage = createLifecyclePlanCoverage(item.observation, [{
      nativeId,
      operationId,
      operation,
      mutationGroupId: operationId,
      authorization: operation === 'update' || observeExistingOnly ? 'observed-owned' : 'planned-create',
    }]);
    const nativeScope = await item.host.adapter.observeNativeMutationScope({
      targetObservation: item.observation,
      operation,
      packageName: plugin.name,
      nativeId,
      sourceType: sourceTypeOf(item.entry.source),
    });
    const nativeProjection = await item.host.adapter.observeNativeProjection({
      targetObservation: item.observation,
      operation,
      snapshot,
      pins,
    });
    const decision = item.host.adapter.decideRoute({
      target: item.observation.target,
      operation,
      operationId,
      attemptId,
      scopeId: item.scope.id,
      packageName: plugin.name,
      nativeId,
      version,
      sourceType: sourceTypeOf(item.entry.source),
      targetObservation: item.observation,
      nativeScope,
      nativeProjection,
      planCoverage,
      snapshot,
      pins,
    });
    if (decision.kind === 'capability-gap') return { kind: 'gap', reason: decision.gaps[0] };
    return { kind: 'selected', route: decision.route, provenanceRepair };
  } catch (error) {
    return defect(createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error)));
  }
}

async function selectDisable(
  item: PreparedSync,
  nativeId: string,
  operationId: string,
  attemptId: string,
  version: TargetVersionObservation,
  activation: ActivationRecord | undefined,
  installation: TargetInstallationData | undefined,
): Promise<{ readonly kind: 'selected'; readonly route: 'native' | 'managed' } | { readonly kind: 'gap' } | Defect> {
  if (item.host === null || item.observation === null || activation === undefined || installation === undefined) return { kind: 'gap' };
  const recorded = recordedActivation(item.scope, item.entry.source, activation, installation, item.observation.target);
  if (recorded === null) return { kind: 'gap' };
  const decision = await decideRecordedRoute(item.host, item.observation, recorded, operationId, attemptId, 'disable', version);
  if (decision.kind === 'defect') return decision;
  if (decision.kind === 'gap') return { kind: 'gap' };
  return decision;
}

async function selectRetirement(
  host: PlannerHost,
  observation: TargetInventoryObservation,
  scope: DeploymentScopeIdentity,
  activation: ActivationRecord,
  attemptId: string,
  source: SourceBinding | null,
): Promise<{ readonly kind: 'planned'; readonly operation: FrozenOperation } | Defect> {
  const operationId = operationIdentity('retirement', scope.id, activation.packageId, activation.nativeId, `${activation.sourceRevision ?? 'unrecorded'}\0${attemptId}`);
  const installation = observation.installations.find((row) => row.nativeId === activation.nativeId);
  if (installation === undefined) {
    return { kind: 'planned', operation: notAttemptedRetirement(operationId, scope, activation, 'ownership was not revalidated') };
  }
  let version: TargetVersionObservation;
  try {
    version = await host.adapter.probeVersion(observation.target);
  } catch (error) {
    return defect(createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error)));
  }
  const recorded = recordedActivation(scope, source ?? scope.source, activation, installation, observation.target);
  if (recorded === null) {
    return { kind: 'planned', operation: notAttemptedRetirement(operationId, scope, activation, 'ownership was not revalidated') };
  }
  const decision = await decideRecordedRoute(host, observation, recorded, operationId, attemptId, 'retire', version);
  if (decision.kind === 'defect') return decision;
  if (decision.kind === 'gap') {
    const reason = decision.reason;
    return {
      kind: 'planned',
      operation: {
        operation: planOperation(operationId, 'retirement', scope, null, activation.packageId, activation.nativeId, 'not-attempted', 'none'),
        reason,
        journal: { kind: 'none' },
      },
    };
  }
  return {
    kind: 'planned',
    operation: classified(operationId, 'retirement', scope, null, activation.packageId, activation.nativeId, 'retire-orphan', decision.route, null).operation,
  };
}

async function decideRecordedRoute(
  host: PlannerHost,
  observation: TargetInventoryObservation,
  recorded: RecordedOwnedActivation,
  operationId: string,
  attemptId: string,
  operation: 'disable' | 'retire',
  version: TargetVersionObservation,
): Promise<{ readonly kind: 'selected'; readonly route: 'native' | 'managed' } | { readonly kind: 'gap'; readonly reason: LifecycleReason } | Defect> {
  try {
    const planCoverage = createLifecyclePlanCoverage(observation, [{
      nativeId: recorded.nativeId,
      operationId,
      operation,
      mutationGroupId: operationId,
      authorization: 'observed-owned',
    }]);
    const nativeScope = await host.adapter.observeNativeMutationScope({
      targetObservation: observation,
      operation,
      packageName: recorded.packageName,
      nativeId: recorded.nativeId,
      sourceType: recorded.sourceType,
    });
    const nativeProjection = await host.adapter.observeNativeProjection({
      targetObservation: observation,
      operation,
      operationId,
      attemptId,
      activation: recorded,
    });
    const decision = host.adapter.decideRoute({
      target: observation.target,
      operation,
      operationId,
      attemptId,
      scopeId: recorded.scopeId,
      packageName: recorded.packageName,
      nativeId: recorded.nativeId,
      version,
      sourceType: recorded.sourceType,
      targetObservation: observation,
      nativeScope,
      nativeProjection,
      planCoverage,
      activation: recorded,
    });
    if (decision.kind === 'capability-gap') return { kind: 'gap', reason: decision.gaps[0] };
    return { kind: 'selected', route: decision.route };
  } catch (error) {
    return defect(createLifecycleReason('internal', 'internal.defect', unknownErrorDiagnostic(error)));
  }
}

function recordedActivation(
  scope: DeploymentScopeIdentity,
  source: SourceBinding,
  activation: ActivationRecord,
  installation: TargetInstallationData,
  target: LifecycleTargetIdentity,
): RecordedOwnedActivation | null {
  return ownedActivation(scope, source, activation, installation, target);
}

function frozenPlan(
  input: PlanLifecycleInput,
  command: LifecycleCommandName,
  attemptId: string,
  scopes: readonly PlannedScope[],
  operations: readonly FrozenOperation[],
  prepared: readonly Prepared[],
  state: LifecycleStateV2,
): LifecyclePlan {
  const snapshots: LifecycleSourceSnapshotContext[] = [];
  const frozenSources = new Map<string, FrozenSource>();
  const seen = new Set<string>();
  for (const item of prepared) {
    if (item.kind !== 'sync') continue;
    const id = sourceSnapshotId(item.frozen);
    if (seen.has(id)) continue;
    seen.add(id);
    snapshots.push({ id, reference: item.frozen.snapshot });
    frozenSources.set(id, item.frozen);
  }
  const outcomes = operations.map((row) => {
    const outcome = outcomeFor(row);
    return input.dryRun ? { ...outcome, ...observedStates(row.operation, prepared, state) } : outcome;
  });
  const failed = outcomes.filter((outcome) => outcome.result !== 'succeeded');
  const converged = failed.length === 0;
  const failureCategory = converged ? null : failed[0]?.reason?.category ?? 'internal';
  const report = parseLifecycleReport({
    schemaVersion: 1,
    command: { name: command, dryRun: input.dryRun, sourceSnapshots: snapshots },
    plan: operations.map((row) => row.operation),
    outcomes,
    summary: {
      result: converged ? 'converged' : 'incomplete',
      terminalPhase: converged ? 'complete' : 'preflight',
      mutationStarted: false,
      changed: false,
      failureCategory,
      reason: null,
      recoveryId: null,
      readbackId: null,
    },
  });
  return {
    kind: 'frozen',
    requestedDryRun: input.dryRun,
    attemptId,
    frozenSources,
    report,
    scopes,
    operations,
    ...(input.transportSource === undefined ? {} : { transportSource: input.transportSource }),
  };
}

/** A preview plans future work, but reports only the state actually observed. */
function observedStates(
  operation: LifecyclePlanOperation,
  prepared: readonly Prepared[],
  state: LifecycleStateV2,
): Pick<LifecycleReport['outcomes'][number], 'resourceState' | 'activationState'> {
  const item = prepared.find((candidate) => candidate.scope.id === operation.scope.id);
  if (item?.observation === null || item === undefined) return { resourceState: 'unknown', activationState: 'unknown' };
  const installation = item.observation.installations.find((row) => row.nativeId === operation.nativeId);
  if (installation === undefined || installation.presence === 'absent') return { resourceState: 'absent', activationState: 'inactive' };
  if (installation.enablement === 'disabled' || installation.activation === 'inactive') return { resourceState: 'present', activationState: 'inactive' };
  if (installation.enablement === 'unknown' || installation.activation === 'unknown') return { resourceState: 'present', activationState: 'unknown' };
  if (installation.activation === 'nonconforming') return { resourceState: 'present', activationState: 'active-nonconforming' };
  const activation = findActivation(state, operation.scope.id, operation.package, operation.nativeId ?? '');
  const plugin = item.kind === 'sync' ? item.selected.find((selected) => selected.plugin.name === operation.package)?.plugin : undefined;
  const conforming = operation.coverage === 'retirement'
    ? activation?.fingerprints.installed === installation.installedFingerprint
    : plugin !== undefined && sameBytes(activation, installation, plugin);
  return { resourceState: 'present', activationState: conforming ? 'active-conforming' : 'active-nonconforming' };
}

function outcomeFor(row: FrozenOperation): LifecycleReport['outcomes'][number] {
  const operation = row.operation;
  switch (operation.action) {
    case 'not-attempted':
      return { ...operation, result: 'failed', resourceState: 'unknown', activationState: 'unknown', changed: false, reason: row.reason };
    case 'retain-prior':
      return { ...operation, result: 'failed', resourceState: 'retained', activationState: 'retained-prior', changed: false, reason: row.reason };
    case 'disable-nonconforming':
      return {
        ...operation,
        result: 'failed',
        resourceState: 'retained',
        activationState: 'active-nonconforming',
        changed: false,
        reason: row.reason,
      };
    case 'retire-orphan':
      return { ...operation, result: 'succeeded', resourceState: 'absent', activationState: 'inactive', changed: false, reason: null };
    case 'install':
    case 'update':
    case 'unchanged':
    case 'route-migrate':
      return { ...operation, result: 'succeeded', resourceState: 'present', activationState: 'active-conforming', changed: false, reason: null };
    default: {
      const unreachable: never = operation.action;
      throw new Error(`unknown plan action ${String(unreachable)}`);
    }
  }
}

function plannedNativeIdFor(item: PreparedSync, plugin: PluginSource): string | Error {
  if (item.host === null) return plugin.name;
  try {
    return item.host.plannedNativeId(plugin);
  } catch (error) {
    return error instanceof Error ? error : new Error(unknownErrorDiagnostic(error));
  }
}

function uninventoriedUpdate(item: PreparedSync, packageName: string, nativeId: string, attemptId: string): Classified {
  return classified(
    operationIdentity('desired-pair', item.scope.id, packageName, nativeId, `${item.frozen.snapshot.fingerprint}\0${attemptId}`),
    'desired-pair',
    item.scope,
    sourceSnapshotId(item.frozen),
    packageName,
    nativeId,
    'update',
    'managed',
    null,
  );
}

function classified(
  operationId: string,
  coverage: LifecyclePlanOperation['coverage'],
  scope: DeploymentScopeIdentity,
  sourceSnapshotId: string | null,
  packageName: string,
  nativeId: string | null,
  action: LifecyclePlanAction,
  route: LifecycleRoute,
  reason: LifecycleReason | null,
): Classified {
  return {
    kind: 'classified',
    blocksPrune: blocksPrune(action),
    operation: {
      operation: planOperation(operationId, coverage, scope, sourceSnapshotId, packageName, nativeId, action, route),
      reason,
      journal: journalFor(action),
    },
  };
}

function planOperation(
  operationId: string,
  coverage: LifecyclePlanOperation['coverage'],
  scope: DeploymentScopeIdentity,
  sourceSnapshotId: string | null,
  packageName: string,
  nativeId: string | null,
  action: LifecyclePlanAction,
  route: LifecycleRoute,
): LifecyclePlanOperation {
  return { operationId, coverage, scope, sourceSnapshotId, package: packageName, nativeId, action, route };
}

function notAttemptedRetirement(operationId: string, scope: DeploymentScopeIdentity, activation: ActivationRecord, diagnostic: string): FrozenOperation {
  return classified(
    operationId,
    'retirement',
    scope,
    null,
    activation.packageId,
    activation.nativeId,
    'not-attempted',
    'none',
    createLifecycleReason('internal', 'internal.invariant', diagnostic),
  ).operation;
}

function chosenAction(
  replacing: boolean,
  recordedRoute: 'native' | 'managed' | null,
  selectedRoute: 'native' | 'managed',
  bytesMatch: boolean,
  reapplyMatchingUpdate: boolean,
): LifecyclePlanAction {
  if (!replacing) return 'install';
  if (recordedRoute !== null && recordedRoute !== selectedRoute) return 'route-migrate';
  if (bytesMatch && recordedRoute === selectedRoute && !reapplyMatchingUpdate) return 'unchanged';
  return 'update';
}

function sameBytes(activation: ActivationRecord | undefined, installation: TargetInstallationData | undefined, plugin: PluginSource): boolean {
  if (activation === undefined || installation?.installedFingerprint === undefined || installation.installedFingerprint === null) return false;
  return activation.fingerprints.source === plugin.contentFingerprint && activation.fingerprints.installed === installation.installedFingerprint;
}

function priorKind(activation: ActivationRecord | undefined): 'none' | 'conforming' | 'nonconforming' | 'unverified' {
  if (activation === undefined) return 'none';
  if (activation.route.kind !== 'managed' && activation.route.kind !== 'native') return 'unverified';
  if (activation.ownership.kind !== 'created' && activation.ownership.kind !== 'adopted') return 'unverified';
  if (activation.activationState === 'nonconforming') return 'nonconforming';
  if (activation.activationState === 'active' && activation.readbackState === 'verified') return 'conforming';
  return 'unverified';
}

function journalFor(action: LifecyclePlanAction): FrozenOperation['journal'] {
  switch (action) {
    case 'not-attempted':
      return { kind: 'none' };
    case 'unchanged':
    case 'retain-prior':
      return { kind: 'required', action, mutation: false, readback: false };
    case 'install':
    case 'update':
    case 'route-migrate':
    case 'disable-nonconforming':
    case 'retire-orphan':
      return { kind: 'required', action, mutation: true, readback: true };
    default: {
      const unreachable: never = action;
      throw new Error(`unknown plan action ${String(unreachable)}`);
    }
  }
}

function blocksPrune(action: LifecyclePlanAction): boolean {
  switch (action) {
    case 'not-attempted':
    case 'retain-prior':
    case 'disable-nonconforming':
      return true;
    case 'install':
    case 'update':
    case 'unchanged':
    case 'route-migrate':
    case 'retire-orphan':
      return false;
    default: {
      const unreachable: never = action;
      throw new Error(`unknown plan action ${String(unreachable)}`);
    }
  }
}

function canPruneOmissions(scope: DeploymentScopeRecord | undefined): boolean {
  return scope?.authority === 'authoritative' && scope.lastConverged !== undefined;
}

function desiredGeneration(
  existing: DeploymentScopeRecord | undefined,
  revision: string,
  sourceFingerprint: string,
  packages: readonly DesiredPackageRecord[],
  validatedAt: string,
): DesiredGenerationRecord {
  if (existing?.desired !== undefined
    && existing.desired.revision === revision
    && existing.desired.sourceFingerprint === sourceFingerprint
    && JSON.stringify(existing.desired.packages) === JSON.stringify(packages)) {
    return existing.desired;
  }
  return {
    generation: existing?.desired === undefined ? 1 : existing.desired.generation + 1,
    revision,
    sourceFingerprint,
    packages: [...packages],
    validatedAt,
  };
}

function findActivation(state: LifecycleStateV2, scopeId: string, packageName: string, nativeId: string): ActivationRecord | undefined {
  return state.activations.find((activation) => activation.scopeId === scopeId && (activation.packageId === packageName || activation.nativeId === nativeId));
}

function hostRevalidated(installation: TargetInstallationData | undefined, scopeId: string): boolean {
  return installation?.presence === 'present'
    && installation.ownership.kind === 'owned'
    && installation.ownership.scopeId === scopeId
    && (installation.ownership.proof === 'created' || installation.ownership.proof === 'adopted');
}

function foreignOwnership(
  observation: TargetInventoryObservation,
  nativeId: string,
  scopeId: string,
  target: { readonly kind: string; readonly instance: string },
): LifecycleReason | null {
  const installation = observation.installations.find((row) => row.nativeId === nativeId);
  if (installation?.ownership.kind !== 'owned' || installation.ownership.scopeId === scopeId) return null;
  return createLifecycleReason(
    'internal',
    'internal.ambiguous-ownership',
    `package '${nativeId}' on ${target.kind}/${target.instance} is owned by scope '${installation.ownership.scopeId}'`,
  );
}

function pendingDefect(
  state: LifecycleStateV2,
  scopeId: string,
  repairablePackageNames?: ReadonlySet<string>,
  command?: LifecycleCommandName,
): LifecycleReason | null {
  const activation = state.activations.find((row) =>
    row.scopeId === scopeId
    && row.pending !== undefined
    && !repairsLegacyMarketplaceAlias(row, repairablePackageNames)
    && !recoversPendingUpdate(row, repairablePackageNames, command));
  if (activation?.pending === undefined) return null;
  return createLifecycleReason(
    'internal',
    'internal.invariant',
    `package '${activation.packageId}' has pending ${activation.pending.operation} work that requires recovery before planning`,
  );
}

/** Update retries the package whose install intent is already pending. Sync still refuses it. */
function recoversPendingUpdate(
  activation: ActivationRecord,
  packageNames: ReadonlySet<string> | undefined,
  command: LifecycleCommandName | undefined,
): boolean {
  return command === 'update' && packageNames !== undefined && packageNames.has(activation.packageId);
}

/** A v1 marketplace id (`name@marketplace`) can be repaired by installing the canonical package. */
function repairsLegacyMarketplaceAlias(activation: ActivationRecord, packageNames: ReadonlySet<string> | undefined): boolean {
  if (packageNames === undefined || packageNames.size === 0) return false;
  if (activation.route.kind !== 'legacy-unverified' || activation.ownership.kind !== 'legacy-claim') return false;
  const separator = activation.nativeId.indexOf('@');
  if (separator <= 0 || activation.packageId !== activation.nativeId) return false;
  return packageNames.has(activation.nativeId.slice(0, separator));
}

function duplicateHostKind(hosts: readonly PlannerHost[]): LifecycleReason | null {
  const bound = new Set<string>();
  for (const host of hosts) {
    for (const kind of host.kinds) {
      if (bound.has(kind)) {
        return createLifecycleReason('internal', 'internal.invariant', `target kind '${kind}' is bound more than once`);
      }
      bound.add(kind);
    }
  }
  return null;
}

function zeroWrite(command: LifecycleCommandName, dryRun: boolean, reason: LifecycleReason, terminalPhase?: LifecycleTerminalPhase): LifecyclePlan {
  const usage = reason.category === 'usage';
  return {
    kind: 'zero-write-failure',
    report: parseLifecycleReport({
      schemaVersion: 1,
      command: { name: command, dryRun, sourceSnapshots: [] },
      plan: [],
      outcomes: [],
      summary: {
        result: usage ? 'usage-error' : 'incomplete',
        terminalPhase: usage ? 'parse' : terminalPhase ?? 'preflight',
        mutationStarted: false,
        changed: false,
        failureCategory: reason.category,
        reason,
        recoveryId: null,
        readbackId: null,
      },
    }),
  };
}

function commandName(manifest: SyncManifest): LifecycleCommandName {
  return manifest.entries.every((entry) => entry.operation === 'retire-source') ? 'retire-source' : 'sync';
}

export function resolvePlannedSource(
  binding: SourceBinding,
  transportSource: string | undefined,
  cache: Map<string, FrozenSource>,
): FrozenSource {
  const argument = transportArgument(binding, transportSource) ?? sourceArgument(binding);
  const cached = cache.get(argument);
  if (cached !== undefined) return cached;
  const frozen = resolveSource(argument);
  cache.set(argument, frozen);
  return frozen;
}

function transportArgument(binding: SourceBinding, transportSource: string | undefined): string | undefined {
  if (transportSource === undefined) return undefined;
  try {
    if (!sameSourceBinding(sourceBindingForArgument(transportSource), binding)) return undefined;
  } catch {
    return undefined;
  }
  return transportSource;
}

function sourceArgument(source: SourceBinding): string {
  if (source.kind === 'local') return source.locator;
  return source.ref === 'HEAD' ? source.locator : `${source.locator}#${source.ref}`;
}

function sourceTypeOf(source: SourceBinding): SourceType {
  switch (source.kind) {
    case 'local':
    case 'git':
      return source.kind;
    default: {
      const unreachable: never = source;
      throw new Error(`unknown source ${String(unreachable)}`);
    }
  }
}

function lifecycleTarget(target: PersistedTargetIdentity): LifecycleTargetIdentity {
  if (target.context === undefined) return { kind: target.kind, instance: target.instance };
  return { kind: target.kind, instance: target.instance, context: target.context };
}

function sourceSnapshotId(frozen: FrozenSource): string {
  const binding = frozen.snapshot.binding;
  return `snapshot-v1-${digest([
    binding.kind,
    binding.locator,
    binding.kind === 'git' ? binding.ref : '',
    frozen.snapshot.fingerprint,
  ])}`;
}

function operationIdentity(coverage: string, scopeId: string, packageName: string, nativeId: string, fingerprint: string): string {
  return `operation-v1-${digest([coverage, scopeId, packageName, nativeId, fingerprint])}`;
}

function lifecycleAttemptId(stateGeneration: number, identities: readonly (readonly string[])[]): string {
  return `attempt-v1-${digest([String(stateGeneration), ...identities.flat()])}`;
}

export function lifecycleAttemptIdForPlannedScopes(
  stateGeneration: number,
  scopes: readonly PlannedAttemptScope[],
): string {
  return lifecycleAttemptId(stateGeneration, scopes.map((planned) => planned.retirementPackages !== undefined
    ? ['remove-packages', planned.scope.id, ...planned.retirementPackages.flatMap((row) => [row.packageId, row.nativeId])]
    : plannedAttemptIdentity(
    planned.scope.id,
    planned.desired?.sourceFingerprint,
    planned.desired?.packages.map((pkg) => pkg.packageId),
    planned.selectorMode === 'retired' || planned.desired === null,
  )));
}

type PlannedAttemptScope = {
  readonly scope: { readonly id: string };
  readonly selectorMode: 'all' | 'explicit' | 'retired';
  readonly desired: { readonly sourceFingerprint: string; readonly packages: readonly { readonly packageId: string }[] } | null;
  readonly retirementPackages?: readonly { readonly packageId: string; readonly nativeId: string }[];
};

function plannedAttemptIdentity(
  scopeId: string,
  sourceFingerprint?: string,
  packageIds?: readonly string[],
  retired = false,
): readonly string[] {
  if (retired || sourceFingerprint === undefined || packageIds === undefined) return ['retire-source', scopeId];
  return ['sync', scopeId, sourceFingerprint, ...packageIds];
}

function digest(parts: readonly string[]): string {
  const hash = new CryptoHasher('sha256');
  for (const part of parts) {
    hash.update(String(part.length));
    hash.update('\0');
    hash.update(part);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function defect(reason: LifecycleReason, terminalPhase?: LifecycleTerminalPhase): Defect {
  return terminalPhase === undefined ? { kind: 'defect', reason } : { kind: 'defect', reason, terminalPhase };
}
