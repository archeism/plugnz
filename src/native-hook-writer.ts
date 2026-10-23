/** Native hook package mutation through the existing add/update/remove writer contract. */
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddOptions, HostReader, HostWriter, IgnoredAddComponent, RemoveOptions } from './host';
import type { PluginSource, ResolvedSource } from './source';
import type { HookAdapter } from './hooks';
import { readHookConfig } from './hooks';
import { buildHooks } from './hook-build';
import { preflightPortableHooks } from './hook-install';
import { inventoryPackageSemantics, requiredSemanticsForOperation, type PackageSemanticInventory } from './semantic-inventory';
import { createLifecycleReason } from './lifecycle-report';
import { admitPackageSemanticsFromProfiles, PackageCapabilityError, type CapabilityEvidenceProfile, type PackageAdmission } from './capability-evidence';
import { portableHookProfile } from './portable-hook-policy';
import { CompatibilityError } from './compatibility';
import { fingerprintSourceTree, fingerprintTree } from './fingerprint';
import type { PortableAgent } from './portable-agents';
import { spawnSync, which } from './runtime';
import {
  NATIVE_HOOK_MARKER, assertHookPath, hookPackagePath, hookRegistration, readHookOwner,
  registrationDocument, registrationEnabled, registrationText,
  type HookRegistration, type NativeHookOwner, type NativeHookStore,
} from './native-hook-store';

export function probeHookHostVersion(command: string, override: string): string | undefined {
  const binary = process.env[override] ?? which(command);
  if (!binary) return undefined;
  const result = spawnSync([binary, '--version'], { cwd: tmpdir(), timeout: 10_000 });
  if (result.exitCode !== 0) return undefined;
  const output = Array.from(result.stdout, byte => String.fromCharCode(byte)).join('').trim();
  return /\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/u.exec(output)?.[1];
}

/**
 * Optional portable-agent projection compiled into the same owned package store.
 * The hook behavior stays byte-identical when this seam is absent.
 */
export interface NativeHookAgentProjection {
  /** Admission profile for packages that plan portable agents on this host. */
  profile: CapabilityEvidenceProfile;
  /** Resolve this host's portable agents from the alias-frozen source; null means none. */
  plan(plugin: PluginSource): PortableAgent[] | null;
  /** Host-specific refusal checks that must run before any mutation. */
  preflight(plugin: PluginSource, resolved: ResolvedSource, agents: readonly PortableAgent[]): void;
  /** Build the complete payload without the ownership marker; return its root. */
  compile(plugin: PluginSource, resolved: ResolvedSource, agents: readonly PortableAgent[], output: string): string;
}

interface NativeHookWriterOptions {
  reader: HostReader;
  adapter: HookAdapter;
  store: NativeHookStore;
  probeVersion(): string | undefined;
  legacyRemove(id: string, options?: RemoveOptions): Promise<void>;
  agents?: NativeHookAgentProjection;
  /**
   * Adapter-owned package components this host deliberately does not project.
   * Ignored semantics leave admission, and an ignored-only package reports a
   * non-mutating skip instead of the standalone unsupported refusal.
   */
  ignoredComponents?(plugin: PluginSource): readonly IgnoredAddComponent[];
  /** Drop ignored component bytes from the compiled package before fingerprinting/activation. */
  pruneIgnored?(compiled: string, ignored: readonly IgnoredAddComponent[]): void;
}

export function createNativeHookWriter(options: NativeHookWriterOptions): HostWriter {
  const { reader, adapter, store } = options;
  const profile = portableHookProfile(adapter, 'managed', ['install', 'update']);
  const idFor = (plugin: PluginSource): string => plugin.name + '@' + (plugin.marketplace ?? 'local');
  const checkTarget = (id: string, source: string): void => {
    const target = hookPackagePath(store, id), registration = hookRegistration(store, id);
    assertHookPath(store, target); assertHookPath(store, registration.path);
    if (reader.listInstalled().some(item => item.id === id && item.path !== target)) {
      throw new Error('Native hook identity already belongs to a historical standalone install; remove that owned install before retrying: ' + id);
    }
    const owner = existsSync(target) ? readHookOwner(target) : null;
    if (existsSync(target) && (owner === null || owner.pluginId !== id || owner.source !== source)) {
      throw new Error('Native hook package is not owned for this source: ' + target);
    }
    if (owner?.payloadFingerprint !== undefined && fingerprintSourceTree(target, [NATIVE_HOOK_MARKER]) !== owner.payloadFingerprint) {
      throw new Error('Native package payload was modified after installation; refusing to replace it: ' + target);
    }
    const raw = registrationText(registration);
    if (registration.kind === 'module' && raw !== undefined && raw !== registration.content) {
      throw new Error('Native hook loader is foreign or changed: ' + registration.path);
    }
    if (owner === null && registrationEnabled(registration, raw)) throw new Error('Native hook registration exists without its owned package');
  };
  const preflightAdd = async (plugin: PluginSource, resolved: ResolvedSource, announce = true): Promise<void> => {
    const hooks = readHookConfig(plugin.dir) !== undefined;
    const agents = options.agents?.plan(plugin) ?? null;
    const ignored = options.ignoredComponents?.(plugin) ?? [];
    if (!hooks && agents === null && ignored.length === 0) {
      throw new CompatibilityError(store.id, 'hooks', 'unsupported', 'docs/hooks.md',
        store.id + (options.agents === undefined
          ? ' installation supports portable plugnz.hooks.json packages; standalone skill and command installation remains unsupported'
          : ' installation supports portable plugnz.hooks.json packages or portable plugnz.agents.json agents; standalone skill and command installation remains unsupported'));
    }
    if (hooks && agents !== null) {
      throw new CompatibilityError(store.id, 'hooks', 'unsupported', 'docs/portable-agents.md',
        store.id + ' does not combine portable hooks and portable agents in one package; split the package or remove one behavior');
    }
    const delivery = withoutIgnoredComponents(inventoryPackageSemantics(plugin), ignored);
    const skip = !hooks && agents === null;
    if (skip) {
      // Nothing is deliverable, so no route version gate applies; unsupported
      // package semantics must still refuse rather than disappearing silently.
      admitIgnoredOnlyPackage(store.id, delivery, profile);
    } else {
      const admission = admitPackageSemanticsFromProfiles({
        host: store.id, detectedVersion: options.probeVersion(), sourceType: resolved.isGit ? 'git' : 'local',
        route: 'managed', operation: 'install', inventory: delivery,
      }, [agents === null ? profile : options.agents!.profile]);
      if (admission.status === 'refused') throw new PackageCapabilityError(store.id, admission);
    }
    if (skip) {
      if (announce) for (const item of ignored) console.error(item.warning);
      return;
    }
    if (existsSync(join(plugin.dir, NATIVE_HOOK_MARKER))) throw new Error('Source contains reserved native hook ownership metadata');
    if (agents === null) preflightPortableHooks(adapter, plugin.dir);
    else options.agents!.preflight(plugin, resolved, agents);
    checkTarget(idFor(plugin), resolved.sourceUri);
    if (announce) for (const item of ignored) console.error(item.warning);
  };
  return {
    ...reader,
    plannedNativeId: idFor,
    preflightAdd: (plugin, resolved) => preflightAdd(plugin, resolved, true),
    addDisposition(plugin: PluginSource) {
      const ignored = options.ignoredComponents?.(plugin) ?? [];
      if (ignored.length === 0) return undefined;
      const deliverable = readHookConfig(plugin.dir) !== undefined || (options.agents?.plan(plugin) ?? null) !== null;
      return { ignored, skip: !deliverable };
    },
    async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions) {
      // The public callers preflight (and announce ignored-component warnings) once.
      await preflightAdd(plugin, resolved, false);
      const ignored = options.ignoredComponents?.(plugin) ?? [];
      if (ignored.length > 0 && readHookConfig(plugin.dir) === undefined && (options.agents?.plan(plugin) ?? null) === null) {
        throw new CompatibilityError(store.id, 'hooks', 'unsupported', 'docs/portable-agents.md',
          store.id + ' cannot deliver an ignored-only package without a caller-visible skip decision; no native mutation was attempted (ignored: '
            + ignored.map(item => item.component).join(', ') + ')');
      }
      const id = idFor(plugin), target = hookPackagePath(store, id), registration = hookRegistration(store, id);
      const temporary = mkdtempSync(join(tmpdir(), 'plugnz-native-hooks-'));
      try {
        const agents = options.agents?.plan(plugin) ?? null;
        const compiled = agents === null
          ? buildHooks(plugin.dir, [adapter.id], join(temporary, 'compiled')).targets[0]!.path
          : options.agents!.compile(plugin, resolved, agents, join(temporary, 'compiled'));
        options.pruneIgnored?.(compiled, ignored);
        writeFileSync(join(compiled, NATIVE_HOOK_MARKER), ownerMarker(plugin, resolved, id, agents, compiled));
        const unchanged = existsSync(target) && fingerprintTree(target) === fingerprintTree(compiled) && registrationEnabled(registration);
        if (opts?.dryRun) {
          console.log('[' + store.id + '] would register native ' + (agents === null ? 'hooks' : 'agents') + ': ' + target);
          return unchanged ? 'unchanged' as const : undefined;
        }
        if (unchanged) return 'unchanged' as const;
        checkTarget(id, resolved.sourceUri);
        assertHookPath(store, store.packages());
        mkdirSync(store.packages(), { recursive: true });
        const transaction = mkdtempSync(join(store.packages(), '.plugnz-hook-stage-'));
        const stage = join(transaction, 'candidate'), backup = join(transaction, 'previous');
        cpSync(compiled, stage, { recursive: true });
        const before = registrationText(registration), after = nextRegistration(registration, before, true);
        const expectedFingerprint = fingerprintTree(stage);
        let activated = false, moved = false, committed = false;
        try {
          if (existsSync(target)) { renameSync(target, backup); moved = true; }
          renameSync(stage, target); activated = true;
          writeRegistration(registration, before, after);
          committed = true;
        } catch (error) {
          restoreRegistration(registration, before, after);
          if (activated) {
            if (fingerprintTree(target) !== expectedFingerprint) throw new Error('Native hook package changed during failed activation; retained recovery files: ' + transaction);
            rmSync(target, { recursive: true, force: true });
          }
          if (moved) renameSync(backup, target);
          throw error;
        } finally {
          // Once registration is durable, cleanup must not restore the old package.
          if (committed || !existsSync(backup)) rmSync(transaction, { recursive: true, force: true });
        }
      } finally { rmSync(temporary, { recursive: true, force: true }); }
    },
    async remove(id: string, removeOptions?: RemoveOptions) {
      const target = hookPackagePath(store, id);
      assertHookPath(store, target);
      if (!existsSync(target)) return options.legacyRemove(id, removeOptions);
      const owner = readHookOwner(target);
      if (owner === null || owner.pluginId !== id || (removeOptions?.source !== undefined && owner.source !== removeOptions.source)) {
        throw new Error('Native hook package ownership does not authorize removal: ' + target);
      }
      if (owner.payloadFingerprint !== undefined && fingerprintSourceTree(target, [NATIVE_HOOK_MARKER]) !== owner.payloadFingerprint) {
        throw new Error('Native package payload was modified after installation; refusing removal: ' + target);
      }
      const registration = hookRegistration(store, id);
      assertHookPath(store, registration.path);
      const before = registrationText(registration);
      if (registration.kind === 'module' && before !== undefined && before !== registration.content) {
        throw new Error('Native hook loader changed; refusing removal: ' + registration.path);
      }
      const after = nextRegistration(registration, before, false);
      const transaction = mkdtempSync(join(store.packages(), '.plugnz-hook-remove-'));
      const backup = join(transaction, 'previous');
      let committed = false;
      try {
        renameSync(target, backup);
        try { writeRegistration(registration, before, after); committed = true; }
        catch (error) {
          restoreRegistration(registration, before, after);
          if (!existsSync(target)) renameSync(backup, target);
          throw error;
        }
      } finally { if (committed || !existsSync(backup)) rmSync(transaction, { recursive: true, force: true }); }
    },
    async pin() { return { changes: [], refusals: [] }; },
  };
}

/** Hook packages keep their exact historical marker bytes; agent packages add payload proof. */
function ownerMarker(
  plugin: PluginSource,
  resolved: ResolvedSource,
  id: string,
  agents: readonly PortableAgent[] | null,
  compiled: string,
): string {
  const shared = {
    schemaVersion: 1 as const,
    pluginId: id,
    source: resolved.sourceUri,
    sourceSha: resolved.sha,
    fingerprint: plugin.contentFingerprint ?? fingerprintTree(plugin.dir),
  };
  const value: NativeHookOwner = agents === null
    ? { kind: 'portable-hooks', ...shared }
    : {
        kind: 'portable-agents', ...shared,
        payloadFingerprint: fingerprintSourceTree(compiled, [NATIVE_HOOK_MARKER]),
        agents: agents.map(agent => `${plugin.name}:${agent.name}`),
      };
  return JSON.stringify(value) + '\n';
}

/** Admission view of only what this host actually delivers; ignored semantics never enter it. */
function withoutIgnoredComponents(inventory: PackageSemanticInventory, ignored: readonly IgnoredAddComponent[]): PackageSemanticInventory {
  const components = new Set(ignored.map(item => item.component));
  if (components.size === 0) return inventory;
  const stripped: PackageSemanticInventory = {
    ...inventory,
    components: {
      ...inventory.components,
      agents: components.has('agents') ? [] : inventory.components.agents,
    },
    componentDefinitions: components.has('agents')
      ? inventory.componentDefinitions.filter(definition => definition.kind !== 'agent')
      : inventory.componentDefinitions,
    requiredSemantics: inventory.requiredSemantics.filter(semantic => !components.has(semantic)),
  };
  if (!components.has('agents')) return stripped;
  const { portableAgents: _ignoredAgents, ...rest } = stripped;
  return rest;
}

/**
 * An ignored-only package has no native route to gate by host version. Refuse
 * only package semantics this host cannot deliver at all (standalone skills,
 * commands, MCP, native agent definitions), so unrelated failures stay visible.
 */
function admitIgnoredOnlyPackage(host: string, inventory: PackageSemanticInventory, profile: CapabilityEvidenceProfile): void {
  const requirements = requiredSemanticsForOperation(inventory, 'install');
  const gaps: PackageAdmission['gaps'] = requirements.flatMap((semantic) => {
    if (semantic === 'hooks' && inventory.hookDeclarations.length > 0) {
      return [createLifecycleReason(
        'capability',
        'capability.unsupported',
        `target '${host}' ${profile.detectedVersion} ${profile.route} install cannot deliver authored hook declarations without portable plugnz.hooks.json`,
        'hooks',
        profile.evidenceId,
      )];
    }
    const status = profile.semantics[semantic];
    if (status === 'supported') return [];
    return [createLifecycleReason(
      'capability',
      status === 'unsupported' ? 'capability.unsupported' : 'capability.unverified',
      `target '${host}' ${profile.detectedVersion} ${profile.route} install is ${status} for ${semantic}`,
      semantic,
      profile.evidenceId,
    )];
  });
  if (inventory.autoUpdate.length > 0) {
    gaps.push(createLifecycleReason(
      'capability',
      'capability.unsupported',
      'portable hook installation does not project authored native auto-update directives',
      'auto-update-control',
      profile.evidenceId,
    ));
  }
  if (gaps.length === 0) return;
  throw new PackageCapabilityError(host, { status: 'refused', profile, requirements, gaps });
}

function nextRegistration(registration: HookRegistration, raw: string | undefined, enabled: boolean): string | undefined {
  if (registration.kind === 'module') return enabled ? registration.content : undefined;
  const value = registrationDocument(registration, raw);
  const previous = (value[registration.field] as string[] | undefined) ?? [];
  // Updating package bytes must not move an existing extension in load order or
  // rewrite unrelated settings. Removal still deletes every owned occurrence.
  const present = previous.includes(registration.entry);
  if (enabled === present) return raw;
  const entries = enabled ? [...previous, registration.entry] : previous.filter(entry => entry !== registration.entry);
  value[registration.field] = entries;
  return JSON.stringify(value, null, 2) + '\n';
}
function writeRegistration(registration: HookRegistration, before: string | undefined, after: string | undefined): void {
  if (registrationText(registration) !== before) throw new Error('Native hook registration changed concurrently: ' + registration.path);
  if (after === before) return;
  writeExactFile(registration.path, after);
}
function restoreRegistration(registration: HookRegistration, before: string | undefined, after: string | undefined): void {
  const current = registrationText(registration);
  if (current === before) return;
  if (current !== after) throw new Error('Native hook registration changed concurrently; preserving recovery files');
  writeExactFile(registration.path, before);
}
function writeExactFile(path: string, text: string | undefined): void {
  if (text === undefined) { rmSync(path, { force: true }); return; }
  const mode = existsSync(path) ? lstatSync(path).mode & 0o777 : 0o644;
  mkdirSync(dirname(path), { recursive: true });
  const temporary = mkdtempSync(join(dirname(path), '.plugnz-hook-write-'));
  try {
    const staged = join(temporary, 'value');
    writeFileSync(staged, text); chmodSync(staged, mode); renameSync(staged, path);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
