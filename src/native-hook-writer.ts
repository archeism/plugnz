/** Native hook package mutation through the existing add/update/remove writer contract. */
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddOptions, HostReader, HostWriter, RemoveOptions } from './host';
import type { PluginSource, ResolvedSource } from './source';
import type { HookAdapter } from './hooks';
import { readHookConfig } from './hooks';
import { buildHooks } from './hook-build';
import { preflightPortableHooks } from './hook-install';
import { inventoryPackageSemantics } from './semantic-inventory';
import { admitPackageSemanticsFromProfiles, PackageCapabilityError } from './capability-evidence';
import { portableHookProfile } from './portable-hook-policy';
import { CompatibilityError } from './compatibility';
import { fingerprintTree } from './fingerprint';
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

interface NativeHookWriterOptions {
  reader: HostReader;
  adapter: HookAdapter;
  store: NativeHookStore;
  probeVersion(): string | undefined;
  legacyRemove(id: string, options?: RemoveOptions): Promise<void>;
}

export function createNativeHookWriter(options: NativeHookWriterOptions): HostWriter {
  const { reader, adapter, store } = options;
  const profile = portableHookProfile(adapter, 'managed', ['install', 'update']);
  const idFor = (plugin: PluginSource): string => plugin.name + '@' + (plugin.marketplace ?? 'local');
  const checkTarget = (id: string, source: string): void => {
    const target = hookPackagePath(store, id), registration = hookRegistration(store, id);
    assertHookPath(store, target); assertHookPath(store, registration.path);
    const owner = existsSync(target) ? readHookOwner(target) : null;
    if (existsSync(target) && (owner === null || owner.pluginId !== id || owner.source !== source)) {
      throw new Error('Native hook package is not owned for this source: ' + target);
    }
    const raw = registrationText(registration);
    if (registration.kind === 'module' && raw !== undefined && raw !== registration.content) {
      throw new Error('Native hook loader is foreign or changed: ' + registration.path);
    }
    if (owner === null && registrationEnabled(registration, raw)) throw new Error('Native hook registration exists without its owned package');
  };
  const preflightAdd = async (plugin: PluginSource, resolved: ResolvedSource): Promise<void> => {
    if (readHookConfig(plugin.dir) === undefined) {
      throw new CompatibilityError(store.id, 'hooks', 'unsupported', 'docs/hooks.md',
        store.id + ' installation supports portable plugnz.hooks.json packages; standalone skill and command installation remains unsupported');
    }
    const admission = admitPackageSemanticsFromProfiles({
      host: store.id, detectedVersion: options.probeVersion(), sourceType: resolved.isGit ? 'git' : 'local',
      route: 'managed', operation: 'install', inventory: inventoryPackageSemantics(plugin),
    }, [profile]);
    if (admission.status === 'refused') throw new PackageCapabilityError(store.id, admission);
    if (existsSync(join(plugin.dir, NATIVE_HOOK_MARKER))) throw new Error('Source contains reserved native hook ownership metadata');
    preflightPortableHooks(adapter, plugin.dir);
    checkTarget(idFor(plugin), resolved.sourceUri);
  };
  return {
    ...reader,
    plannedNativeId: idFor,
    preflightAdd,
    async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions) {
      await preflightAdd(plugin, resolved);
      const id = idFor(plugin), target = hookPackagePath(store, id), registration = hookRegistration(store, id);
      const temporary = mkdtempSync(join(tmpdir(), 'plugnz-native-hooks-'));
      try {
        const built = buildHooks(plugin.dir, [adapter.id], join(temporary, 'compiled'));
        const compiled = built.targets[0]!.path;
        writeFileSync(join(compiled, NATIVE_HOOK_MARKER), JSON.stringify({
          kind: 'portable-hooks', schemaVersion: 1, pluginId: id, source: resolved.sourceUri,
          sourceSha: resolved.sha, fingerprint: plugin.contentFingerprint ?? fingerprintTree(plugin.dir),
        } satisfies NativeHookOwner) + '\n');
        const unchanged = existsSync(target) && fingerprintTree(target) === fingerprintTree(compiled) && registrationEnabled(registration);
        if (opts?.dryRun) {
          console.log('[' + store.id + '] would register native hooks: ' + target);
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

function nextRegistration(registration: HookRegistration, raw: string | undefined, enabled: boolean): string | undefined {
  if (registration.kind === 'module') return enabled ? registration.content : undefined;
  const value = registrationDocument(registration, raw);
  const previous = (value[registration.field] as string[] | undefined) ?? [];
  const entries = previous.filter(entry => entry !== registration.entry);
  if (enabled) entries.push(registration.entry);
  if (entries.length === 0 && !Object.hasOwn(value, registration.field) && !enabled) return raw;
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
