/** Hermes portable package plus native discovery/command companion lifecycle. */
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createCapabilityEvidenceProfile } from '../capability-evidence';
import { projectPluginForHermes } from '../conversion';
import { fingerprintTree } from '../fingerprint';
import { capturePriorSourceRepair, priorSourceRepairAllows, recordedPriorSource, releasePriorSourceRepair, type PriorSourceProof } from '../prior-source-proof';
import type { AddOptions, HostWriter, InstalledPlugin, PinOptions, PinOutcome } from '../host';
import {
  decideHermesNativeUpdate,
  hermesCommandCompanionId,
  hermesNativeUpdateProof,
  hermesPluginDataNamespace,
} from '../hermes-identity';
import type {
  ActivationPreparationRequest,
  CleanupDisposition,
  CleanupReference,
  DurableLifecycleOperation,
  LifecycleHostDefinition,
  LifecycleMutationAction,
  LifecycleReadbackData,
  LifecycleTargetIdentity,
  NativeMutationScopeRequest,
  NativeProjectionRequest,
  RetentionObservation,
  TargetVersionObservation,
} from '../lifecycle-host';
import { createLifecycleHostAdapter, createTargetInventoryObservation } from '../lifecycle-runtime';
import { hermesConfigPath, hermesRoot } from '../paths';
import { CryptoHasher, spawnSync, which } from '../runtime';
import type { PluginSource, ResolvedSource } from '../source';
import { PACKAGE_SEMANTICS, type PackageSemantic } from '../semantic-inventory';
import { hermes, hermesInstanceIdentity, hermesPluginsDir, hermesProvenManagedRevisions, listHermesInstance } from './hermes';
import { pinPluginMcpFiles } from '../mcp-write';
import { hermesNativeBootstrap, hermesEditableFinderBody, hermesUvConsoleBody } from './hermes-launcher-templates';

import { yamlParse, yamlStringify } from '../yaml';


const MARKER = '.plgnz-install.json';
type Ownership = { source: string; pluginId: string; fingerprint: string };
type Change = { commit(): void; rollback(): void };

export const hermesWriter: HostWriter = {
  ...hermes,
  supportsAdoption: true,
  plannedNativeId: (plugin) => plugin.marketplace === undefined ? plugin.name : `${plugin.name}@${plugin.marketplace}`,
  async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions): Promise<void | 'unchanged'> {
    const id = plugin.name;
    const ownershipId = plugin.marketplace === undefined ? id : `${id}@${plugin.marketplace}`;
    const companionId = hermesCommandCompanionId(id);
    assertId(id); assertId(companionId);
    const root = hermesPluginsDir();
    const target = join(root, id); const companion = join(root, companionId);
    assertManagedPath(root, target); assertManagedPath(root, companion);
    effectiveConfigPath();
    if (!opts?.dryRun) mkdirSync(root, { recursive: true });
    const stageRoot = mkdtempSync(join(opts?.dryRun ? tmpdir() : root, '.plgnz-hermes-stage-'));
    const packageStage = join(stageRoot, 'package'); const companionStage = join(stageRoot, 'commands');
    mkdirSync(packageStage); mkdirSync(companionStage);
    try {
      projectPluginForHermes(plugin.dir, packageStage, companionStage);
      validatePackage(packageStage, id);
      const hasCompanion = readdirSync(companionStage).length > 0;
      if (hasCompanion) validateCompanion(companionStage, companionId);
      const ownership: Ownership = { source: resolved.sourceUri, pluginId: ownershipId, fingerprint: plugin.contentFingerprint ?? '' };
      writeFileSync(join(packageStage, MARKER), JSON.stringify(ownership));
      if (hasCompanion) writeFileSync(join(companionStage, MARKER), JSON.stringify(ownership));
      assertReplaceable(target, packageStage, id, ownershipId, resolved.sourceUri, opts?.adoptExisting === true, validatePackage);
      if (hasCompanion) assertReplaceable(companion, companionStage, companionId, ownershipId, resolved.sourceUri, opts?.adoptExisting === true, validateCompanion);
      else if (existsSync(companion)) assertReplaceable(companion, undefined, companionId, ownershipId, resolved.sourceUri, opts?.adoptExisting === true, validateCompanion);
      const primaryMarker = readOwnership(target); const companionMarker = readOwnership(companion);
      const unchangedPrimary = primaryMarker?.pluginId === ownershipId && primaryMarker.fingerprint === ownership.fingerprint && sameTree(packageStage, target);
      const unchangedCompanion = hasCompanion
        ? companionMarker?.pluginId === ownershipId && companionMarker.fingerprint === ownership.fingerprint && sameTree(companionStage, companion)
        : !existsSync(companion);
      if (opts?.dryRun) return unchangedPrimary && unchangedCompanion ? 'unchanged' : undefined;
      if (unchangedPrimary && unchangedCompanion) {
        updatePluginConfig(effectiveConfigPath(), [id, ...(hasCompanion ? [companionId] : [])], []);
        return 'unchanged';
      }
      const changes: Change[] = [];
      try {
        changes.push(replaceTarget(packageStage, target, root));
        if (hasCompanion) changes.push(replaceTarget(companionStage, companion, root));
        else if (existsSync(companion)) changes.push(removeTarget(companion, root));
        updatePluginConfig(effectiveConfigPath(), [id, ...(hasCompanion ? [companionId] : [])], hasCompanion ? [] : [companionId]);
        for (const change of changes) change.commit();
      } catch (error) {
        for (const change of changes.reverse()) change.rollback();
        throw error;
      }
      return;
    } finally { rmSync(stageRoot, { recursive: true, force: true }); }
  },
  async pin(plugin: InstalledPlugin, opts?: PinOptions): Promise<PinOutcome> {
    return plugin.path === undefined ? { changes: [], refusals: [] } : pinPluginMcpFiles(plugin.path, [{ kind: 'spec', file: 'mcp.json' }], opts);
  },
  async remove(id: string): Promise<void> {
    const nativeId = nativePluginId(id);
    const root = hermesPluginsDir(); const target = join(root, nativeId); const companionId = hermesCommandCompanionId(nativeId); const companion = join(root, companionId);
    assertManagedPath(root, target); assertManagedPath(root, companion);
    effectiveConfigPath();
    const marker = readOwnership(target);
    if (marker === null || marker.pluginId !== id) return;
    const changes: Change[] = [];
    try {
      if (existsSync(target)) changes.push(removeTarget(target, root));
      const companionMarker = readOwnership(companion); const disable = [nativeId];
      if (companionMarker !== null && companionMarker.pluginId === marker.pluginId && companionMarker.source === marker.source && companionMarker.fingerprint === marker.fingerprint) { changes.push(removeTarget(companion, root)); disable.push(companionId); }
      else if (!existsSync(companion)) disable.push(companionId);
      updatePluginConfig(effectiveConfigPath(), [], disable);
      for (const change of changes) change.commit();
    } catch (error) {
      for (const change of changes.reverse()) change.rollback();
      throw error;
    }
  },
};

function assertReplaceable(target: string, stage: string | undefined, expected: string, ownershipId: string, source: string, adopt: boolean, validate: (root: string, expected: string) => void): void {
  if (!existsSync(target)) return;
  const marker = readOwnership(target);
  if (marker !== null) {
    const packageId = expected.replace(/\.plgnz-commands$/u, '');
    if (marker.source !== source || !matches(marker.pluginId, packageId, ownershipId)) throw new Error(`Hermes plugin ${expected} belongs to another source; refusing to replace it`);
    return;
  }
  if (stage !== undefined && sameTree(stage, target)) return;
  if (!adopt) throw new Error(`Hermes plugin ${expected} is unowned and differs from the staged representation; pass --adopt-existing to take ownership explicitly`);
  validate(target, expected);
}

function validatePackage(root: string, expected: string): void {
  assertTree(root);
  const manifest = join(root, 'plugin.json');
  if (!existsSync(manifest)) throw new Error('Hermes stage has no Agent Plugins manifest');
  let value: unknown;
  try { value = JSON.parse(readFileSync(manifest, 'utf8')); } catch (error) { throw new Error(`invalid Hermes plugin manifest: ${(error as Error).message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as Record<string, unknown>).name !== expected) throw new Error(`Hermes manifest identity does not match ${expected}`);
  if ((value as Record<string, unknown>)['$schema'] !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') throw new Error(`Hermes portable manifest must use the Agent Plugins v1 schema: ${manifest}`);
}

function validateCompanion(root: string, expected: string): void {
  assertTree(root);
  const manifest = join(root, 'plugin.yaml');
  if (!existsSync(manifest) || !existsSync(join(root, '__init__.py'))) throw new Error(`Hermes native companion is incomplete: ${root}`);
  const value: unknown = yamlParse(readFileSync(manifest, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as Record<string, unknown>).name !== expected) throw new Error(`Hermes companion identity does not match ${expected}`);
}

function readOwnership(target: string): Ownership | null {
  const file = join(target, MARKER); if (!existsSync(file)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('marker must be an object');
    const row = value as Record<string, unknown>;
    if (typeof row.source !== 'string' || typeof row.pluginId !== 'string' || typeof row.fingerprint !== 'string') throw new Error('marker fields are invalid');
    return row as Ownership;
  } catch (error) { throw new Error(`invalid Hermes ownership marker: ${file} (${(error as Error).message})`); }
}

function replaceTarget(stage: string, target: string, root: string): Change {
  if (!existsSync(target)) { renameSync(stage, target); return { commit: () => {}, rollback: () => rmSync(target, { recursive: true, force: true }) }; }
  const backupRoot = mkdtempSync(join(root, '.plgnz-hermes-backup-')); const backup = join(backupRoot, 'previous');
  renameSync(target, backup);
  try { renameSync(stage, target); } catch (error) { renameSync(backup, target); rmSync(backupRoot, { recursive: true, force: true }); throw error; }
  return { commit: () => rmSync(backupRoot, { recursive: true, force: true }), rollback: () => { rmSync(target, { recursive: true, force: true }); renameSync(backup, target); rmSync(backupRoot, { recursive: true, force: true }); } };
}

function removeTarget(target: string, root: string): Change {
  const backupRoot = mkdtempSync(join(root, '.plgnz-hermes-remove-')); const backup = join(backupRoot, 'previous');
  renameSync(target, backup);
  return { commit: () => rmSync(backupRoot, { recursive: true, force: true }), rollback: () => { if (!existsSync(target)) renameSync(backup, target); rmSync(backupRoot, { recursive: true, force: true }); } };
}

function updatePluginConfig(configured: string, enable: string[], disable: string[]): void {
  const actual = existsSync(configured) && lstatSync(configured).isSymbolicLink() ? realpathSync(configured) : configured;
  const exists = existsSync(actual); const original = exists ? readFileSync(actual, 'utf8') : '';
  let parsed: Record<string, unknown> = {};
  if (original.trim() !== '') {
    const value: unknown = yamlParse(original);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Hermes config is not a mapping: ${configured}`);
    parsed = value as Record<string, unknown>;
  }
  const pluginsValue = parsed['plugins'];
  if (pluginsValue !== undefined && pluginsValue !== null && (typeof pluginsValue !== 'object' || Array.isArray(pluginsValue))) throw new Error(`Hermes plugins config is not a mapping: ${configured}`);
  const plugins = (pluginsValue ?? {}) as Record<string, unknown>;
  const list = (key: 'enabled' | 'disabled'): string[] => {
    const value = plugins[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`Hermes plugins.${key} is not a string list: ${configured}`);
    return [...new Set(value as string[])];
  };
  const enabled = new Set(list('enabled')); const disabled = new Set(list('disabled'));
  for (const id of enable) { enabled.add(id); disabled.delete(id); }
  for (const id of disable) { enabled.delete(id); disabled.add(id); }
  plugins['enabled'] = [...enabled].sort(); plugins['disabled'] = [...disabled].sort(); parsed['plugins'] = plugins;
  const next = yamlStringify(parsed);
  const verified: unknown = yamlParse(next);
  if (!verified || typeof verified !== 'object' || Array.isArray(verified)) throw new Error(`Hermes config serialization failed: ${configured}`);
  const verifiedPlugins = (verified as Record<string, unknown>)['plugins'];
  if (!verifiedPlugins || typeof verifiedPlugins !== 'object' || Array.isArray(verifiedPlugins) ||
      JSON.stringify((verifiedPlugins as Record<string, unknown>)['enabled']) !== JSON.stringify(plugins['enabled']) ||
      JSON.stringify((verifiedPlugins as Record<string, unknown>)['disabled']) !== JSON.stringify(plugins['disabled'])) {
    throw new Error(`Hermes config serialization changed plugin activation: ${configured}`);
  }
  mkdirSync(dirname(actual), { recursive: true });
  const temp = join(dirname(actual), `.plgnz-hermes-config-${Date.now()}-${Math.random().toString(16).slice(2)}.yaml`);
  try {
    writeFileSync(temp, next);
    if (exists) chmodSync(temp, (statSync(actual) as unknown as { mode: number }).mode & 0o777);
    renameSync(temp, actual);
  } finally { rmSync(temp, { force: true }); }
}

function effectiveConfigPath(): string {
  const native = resolve(join(hermesRoot(), 'config.yaml'));
  const configured = resolve(hermesConfigPath());
  if (native === configured) return configured;
  if (!existsSync(native) || !existsSync(configured)) throw new Error(`Hermes only reads ${native}; configured path ${configured} must already resolve to the same file`);
  const nativeReal = realpathSync(native); const configuredReal = realpathSync(configured);
  if (nativeReal === configuredReal) return configured;
  throw new Error(`Hermes only reads ${native}; configured path ${configured} is a different file`);
}

function sameTree(left: string, right: string): boolean {
  if (!existsSync(right)) return false;
  const list = (root: string): string[] => {
    const out: string[] = [];
    const walk = (dir: string, prefix: string): void => { for (const name of readdirSync(dir).sort()) { if (name === MARKER) continue; const path = join(dir, name), relative = prefix ? `${prefix}/${name}` : name, stat = lstatSync(path); if (stat.isSymbolicLink()) throw new Error(`Hermes plugin contains symlink: ${path}`); if (stat.isDirectory()) walk(path, relative); else if (stat.isFile()) out.push(`${relative}:${Array.from(readBytes(path)).join(',')}`); else throw new Error(`Hermes plugin contains unsupported file: ${path}`); } };
    walk(root, ''); return out;
  };
  return JSON.stringify(list(left)) === JSON.stringify(list(right));
}

function readBytes(path: string): Uint8Array { return (readFileSync as unknown as (file: string) => Uint8Array)(path); }
function assertTree(root: string): void { const stat = lstatSync(root); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Hermes plugin source is not a real directory: ${root}`); for (const name of readdirSync(root)) { if (name === MARKER) continue; const path = join(root, name), entry = lstatSync(path); if (entry.isSymbolicLink()) throw new Error(`Hermes plugin contains symlink: ${path}`); if (entry.isDirectory()) assertTree(path); else if (!entry.isFile()) throw new Error(`Hermes plugin contains unsupported entry: ${path}`); } }
function assertManagedPath(root: string, target: string): void { const base = resolve(root), selected = resolve(target); if (selected !== base && !selected.startsWith(`${base}/`)) throw new Error(`Hermes managed path escapes its store: ${target}`); let current = base; for (const part of selected.slice(base.length).split('/').filter(Boolean)) { if (existsSync(current)) { const stat = lstatSync(current); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Hermes managed path component is unsafe: ${current}`); } current = join(current, part); } if (existsSync(current)) { const stat = lstatSync(current); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Hermes managed path component is unsafe: ${current}`); } }
function assertId(id: string): void { if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(id)) throw new Error(`unsafe Hermes plugin identity: ${id}`); }
function nativePluginId(logicalId: string): string {
  const parts = logicalId.split('@');
  if (parts.length > 2 || parts[0] === undefined || parts[0] === '') throw new Error(`unsafe Hermes plugin identity: ${logicalId}`);
  assertId(parts[0]);
  if (parts[1] !== undefined) assertId(parts[1]);
  return parts[0];
}
function matches(marker: string, id: string, ownership: string): boolean { return marker === id || marker === ownership; }

const EFFECTIVE = { requirement: 'none' as const, status: 'effective' as const };
/** Parse only literal POSIX launcher arguments; never expand or execute them. */
function launcherWords(body: string): string[] | undefined {
  const words: string[] = [];
  let word = '', active = false, quote = '';
  for (let at = 0; at < body.length; at++) {
    const ch = body[at]!;
    if (quote === "'") {
      if (ch === "'") quote = ''; else word += ch;
    } else if (quote === '"') {
      if (ch === '"') quote = '';
      else if (ch === '\\') { if (++at >= body.length) return undefined; word += body[at]; }
      else if (ch === '$' && !(word === '' && body.slice(at, at + 3) === '$@"')) return undefined;
      else if (ch === '`') return undefined;
      else word += ch;
    } else if (ch === "'" || ch === '"') { quote = ch; active = true; }
    else if (/\s/u.test(ch)) { if (active) { words.push(word); word = ''; active = false; } }
    else if (ch === '\\') { if (++at >= body.length) return undefined; word += body[at]; active = true; }
    else if (/[;$`|&<>]/u.test(ch)) return undefined;
    else { word += ch; active = true; }
  }
  if (quote !== '') return undefined;
  if (active) words.push(word);
  return words;
}

function literalPythonPath(literal: string): string | undefined {
  if (literal.startsWith('"')) {
    try { const value: unknown = JSON.parse(literal); return typeof value === 'string' ? value : undefined; }
    catch { return undefined; }
  }
  if (!/^'(?:[^'\\]|\\['\\])*'$/u.test(literal)) return undefined;
  return literal.slice(1, -1).replace(/\\(['\\])/gu, '$1');
}

/** The finder may vary its literal data, not the executable import algorithm. */
function verifiedEditableFinder(text: string, root: string, version: string): boolean {
  const literal = String.raw`(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
  const mapping = /^MAPPING: dict\[str, str\] = (.*)$/mu.exec(text);
  const namespaces = /^NAMESPACES: dict\[str, list\[str\]\] = (.*)$/mu.exec(text);
  if (mapping?.[1] === undefined || namespaces?.[1] === undefined) return false;
  const entry = `${literal}:\\s*${literal}`;
  const list = `\\[(?:${literal}(?:,\\s*${literal})*)?\\]`;
  const namespace = `${literal}:\\s*${list}`;
  if (!new RegExp(`^\\{(?:${entry}(?:,\\s*${entry})*)?\\}$`, 'u').test(mapping[1])
    || !new RegExp(`^\\{(?:${namespace}(?:,\\s*${namespace})*)?\\}$`, 'u').test(namespaces[1])) return false;
  const data = [...mapping[1].matchAll(new RegExp(`(${literal}):\\s*(${literal})`, 'gu'))];
  if (!data.some(row => literalPythonPath(row[1]!) === 'hermes_cli' && literalPythonPath(row[2]!) === join(root, 'hermes_cli'))) return false;
  const canonical = (keyLiteral: string, pathLiteral: string): boolean => {
    const key = literalPythonPath(keyLiteral), path = literalPythonPath(pathLiteral);
    return key !== undefined && /^[a-zA-Z0-9_.-]+$/u.test(key) && path === join(root, ...key.split('.'));
  };
  if (data.some(row => !canonical(row[1]!, row[2]!))) return false;
  for (const row of namespaces[1].matchAll(new RegExp(`(${literal}):\\s*\\[([^\\]]*)\\]`, 'gu'))) {
    if ([...row[2]!.matchAll(new RegExp(literal, 'gu'))].some(path => !canonical(row[1]!, path[0]))) return false;
  }
  return text.replace(mapping[0], '__MAPPING__').replace(namespaces[0], '__NAMESPACES__')
    .replaceAll(`__editable__.hermes_agent-${version}.finder`, '__EDITABLE_NAME__') === hermesEditableFinderBody;
}

/** Only the proved root-level, unambiguous venv configuration is admitted. */
function isolatedVenvConfig(text: string): boolean {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const row = /^\s*([^=]+?)\s*=\s*(.*?)\s*$/u.exec(line);
    if (row === null) return false;
    const key = row[1]!.trim().toLowerCase();
    if (key === '' || values.has(key)) return false;
    values.set(key, row[2]!.toLowerCase());
  }
  return values.get('include-system-site-packages') === 'false';
}

/** Python imports packages, source, sourceless bytecode and platform extensions.
 * Conservatively refuse tagged extension suffixes without executing Python to
 * discover the selected interpreter's dynamic import suffix list. */
function hasImportShadow(directory: string, modules: string[], allowed: string[] = []): boolean {
  return readdirSync(directory).some(entry => !allowed.includes(entry) && modules.some(module =>
    entry === module || entry === `${module}_d.pyd` || (entry.startsWith(`${module}.`)
      && /\.(?:py|pyc|so|pyd)$/u.test(entry))));
}

/** A clean Git index alone does not bind Python imports: untracked extension
 * modules and packages can precede the tracked .py files. Check the source
 * module tree for both launchers without importing it or running Python.
 * Venv import roots are checked separately; bytecode caches and inert data do
 * not override source modules and are not a reason to reject a checkout. */
function verifiedSourceImportClosure(root: string): boolean {
  let remaining = 20_000;
  const visit = (directory: string, top: boolean): boolean => {
    const entries = readdirSync(directory);
    remaining -= entries.length;
    if (remaining < 0) return false;
    const packages = entries.filter(entry => /^[a-zA-Z_]\w*$/u.test(entry)
      && entry !== '__pycache__' && statSync(join(directory, entry)).isDirectory());
    const modules = ['__init__', ...packages, ...entries.filter(entry => entry.endsWith('.py')).map(entry => entry.slice(0, -3))];
    if (top) modules.push('hermes_cli', 'hermes_bootstrap', 'hermes_constants', 'pm');
    const allowed = entries.filter(entry => entry.endsWith('.py'));
    allowed.push(...packages.filter(module => !entries.includes(`${module}.py`)));
    // A package initializer resolves inside the package; a package named
    // after another source module resolves before that source module.
    if (hasImportShadow(directory, modules, allowed)) return false;
    for (const entry of entries) {
      // Hermes's native TUI install creates npm workspace symlinks here.
      // This dependency tree is not the tracked Python import source tree.
      // Keep the root's module-name collision check above (node_modules.py).
      if (entry.startsWith('.') || entry === '__pycache__' || entry === 'node_modules') continue;
      const path = join(directory, entry);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        if (entry.endsWith('.py') || statSync(path).isDirectory()) return false;
      } else if (stat.isDirectory() && !visit(path, false)) return false;
    }
    return true;
  };
  return visit(root, true);
}

/** Read the selected launcher's actual import binding; mere comments/markers do not qualify. */
function hermesExecutableSource(binary: string, depth = 0): string | undefined {
  if (depth > 4 || !isAbsolute(binary) || !existsSync(binary)) return undefined;
  const executable = realpathSync(binary);
  if (!statSync(executable).isFile()) return undefined;
  const text = readFileSync(executable, 'utf8');
  if (text.startsWith('#!/bin/sh\nexec ')) {
    const args = launcherWords(text.slice('#!/bin/sh\nexec '.length));
    if (args?.length === 2 && args[1] === '$@') return hermesExecutableSource(args[0]!, depth + 1);
    if (args?.length !== 5 || args[1] !== '-I' || args[2] !== '-c' || args[4] !== '$@'
      || !isAbsolute(args[0]!) || !/^python(?:\d+(?:\.\d+)*)?$/u.test(basename(args[0]!))
      || !existsSync(args[0]!)) return undefined;
    const code = args[3]!;
    // Native _launchers._launcher_script starts here and invokes this entry point.
    if (!code.startsWith('import os, re, sys\n')
      || !/\nfrom hermes_cli\.main import main\n/u.test(code)
      || !/\nsys\.exit\(main\(\)\)\s*$/u.test(code)) return undefined;
    const bindings = [...code.matchAll(/^sys\.path\.insert\(0, ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\)$/gmu)];
    if (bindings.length !== 1) return undefined;
    const root = literalPythonPath(bindings[0]![1]!);
    if (root === undefined || code.replaceAll(bindings[0]![1]!, "'/__PLUGNZ_HERMES_ROOT__'") !== hermesNativeBootstrap) return undefined;
    return root !== undefined && isAbsolute(root) && existsSync(join(root, 'hermes_cli', 'main.py'))
      && realpathSync(join(root, 'hermes_cli', 'main.py')).startsWith(`${realpathSync(root)}/`)
      && verifiedSourceImportClosure(realpathSync(root))
      ? realpathSync(root) : undefined;
  }
  // Python console entry points installed editably by pip/uv bind through local
  // distribution metadata. Do not run Python, import a finder, or evaluate .pth.
  const interpreter = /^#!([^\n]+)\n/u.exec(text)?.[1];
  if (interpreter === undefined || !isAbsolute(interpreter) || !existsSync(interpreter)
    || !/^python(?:\d+(?:\.\d+)*)?$/u.test(basename(interpreter))
    || text.slice(text.indexOf('\n') + 1) !== hermesUvConsoleBody) return undefined;
  const venv = dirname(dirname(executable));
  if (dirname(interpreter) !== join(venv, 'bin') || !existsSync(join(venv, 'pyvenv.cfg'))) return undefined;
  if (existsSync(join(venv, 'bin', 'pyvenv.cfg')) || !isolatedVenvConfig(readFileSync(join(venv, 'pyvenv.cfg'), 'utf8'))
    || process.env['PYTHONHOME'] || process.env['PYTHONPATH']) return undefined;
  if (hasImportShadow(join(venv, 'bin'), ['hermes_cli', 'sitecustomize', 'usercustomize', '_virtualenv'])) return undefined;
  const lib = join(venv, 'lib');
  if (!existsSync(lib)) return undefined;
  const roots: string[] = [];
  for (const python of readdirSync(lib).filter(name => /^python\d+\.\d+$/u.test(name))) {
    const packages = join(lib, python, 'site-packages');
    if (!existsSync(packages)) continue;
    if (hasImportShadow(packages, ['hermes_cli', 'sitecustomize', 'usercustomize', '_virtualenv'], ['_virtualenv.py'])) return undefined;
    for (const name of readdirSync(packages).filter(name => /^hermes_agent-[^/]+\.dist-info$/u.test(name))) {
      const distribution = join(packages, name);
      const metadata = join(distribution, 'direct_url.json');
      const entry = join(distribution, 'entry_points.txt');
      if (!existsSync(metadata) || !existsSync(entry) || !/^hermes\s*=\s*hermes_cli\.main:main$/mu.test(readFileSync(entry, 'utf8'))) continue;
      const direct: unknown = JSON.parse(readFileSync(metadata, 'utf8'));
      if (typeof direct !== 'object' || direct === null || !('url' in direct) || typeof direct.url !== 'string'
        || !('dir_info' in direct) || typeof direct.dir_info !== 'object' || direct.dir_info === null
        || !('editable' in direct.dir_info) || direct.dir_info.editable !== true || !direct.url.startsWith('file:///')) continue;
      const root = decodeURIComponent(direct.url.slice('file://'.length));
      if (!isAbsolute(root) || !existsSync(join(root, 'hermes_cli', 'main.py'))) continue;
      const sourceModules = ['hermes_cli', 'hermes_bootstrap', 'hermes_constants', 'pm',
        ...readdirSync(root).filter(name => name.endsWith('.py')).map(name => name.slice(0, -3)),
        ...readdirSync(root).filter(name => existsSync(join(root, name, '__init__.py')))];
      if (hasImportShadow(packages, sourceModules) || hasImportShadow(join(venv, 'bin'), sourceModules)) return undefined;
      if (hasImportShadow(root, ['hermes_cli', 'sitecustomize', 'usercustomize', '_virtualenv'], ['hermes_cli'])) return undefined;
      const version = name.slice('hermes_agent-'.length, -'.dist-info'.length);
      const finder = `__editable___hermes_agent_${version.replace(/[^a-zA-Z0-9]/gu, '_')}_finder`;
      if (hasImportShadow(packages, [finder], [`${finder}.py`])
        || hasImportShadow(join(venv, 'bin'), [finder]) || hasImportShadow(root, [finder])) return undefined;
      let binding = false;
      for (const pthName of readdirSync(packages).filter(name => name.endsWith('.pth'))) {
        const pth = readFileSync(join(packages, pthName), 'utf8').trim();
        if (pthName === `_virtualenv.pth` && pth === 'import _virtualenv') {
          const helper = join(packages, '_virtualenv.py');
          if (!existsSync(helper) || new CryptoHasher('sha256').update(readFileSync(helper, 'utf8')).digest('hex')
            !== 'cfb3db86aaa53bb62b5ff764970bec2d71c9228590a0ebec57f6ec926cc0bf1a') return undefined;
        } else if (pthName === `__editable__.hermes_agent-${version}.pth` && pth === root) binding = true;
        else if (pthName === `__editable__.hermes_agent-${version}.pth` && pth === `import ${finder}; ${finder}.install()`
          && existsSync(join(packages, `${finder}.py`))
          && verifiedEditableFinder(readFileSync(join(packages, `${finder}.py`), 'utf8'), root, version)) binding = true;
        else return undefined;
      }
      if (binding && realpathSync(join(root, 'hermes_cli', 'main.py')).startsWith(`${realpathSync(root)}/`)
        && verifiedSourceImportClosure(realpathSync(root))) roots.push(realpathSync(root));
    }
  }
  return roots.length === 1 ? roots[0] : undefined;
}

/** Observe provenance without launching Hermes: startup may repair its checkout. */
function observeHermesRevision(): TargetVersionObservation {
  const binary = process.env['OPEN_PLUGIN_HERMES_BIN'] ?? which('hermes');
  if (!binary || !existsSync(binary)) return { kind: 'unknown', diagnostic: 'Select an existing Hermes launcher with OPEN_PLUGIN_HERMES_BIN; a profile config does not identify its runtime' };
  try {
    const root = hermesExecutableSource(binary);
    if (root === undefined) return { kind: 'unparseable', diagnostic: 'Hermes launcher source binding is unverified; select its actual executable with OPEN_PLUGIN_HERMES_BIN and prove its whole native/uv body and editable import closure against docs/hosts/hermes.md before admission. Hermes was not executed' };
    const git = which('git');
    if (git === null) return { kind: 'unknown' };
    const env = { ...process.env, GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete (env as Record<string, string | undefined>)[key];
    const output = (args: string[]): string | undefined => {
      const result = spawnSync([git, '-C', root, ...args], { env, stdout: 'pipe', stderr: 'pipe', timeout: 10_000 });
      return result.exitCode === 0 ? new TextDecoder().decode(result.stdout) : undefined;
    };
    const lines = output(['rev-parse', '--show-toplevel', 'HEAD'])?.trim().split('\n');
    if (lines?.length !== 2 || lines[0] === undefined || lines[1] === undefined || !/^[a-f0-9]{40}$/u.test(lines[1])) return { kind: 'unknown' };
    if (realpathSync(lines[0]) !== root) return { kind: 'unparseable' };
    const dirty = output(['-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--untracked-files=no']);
    if (dirty === undefined) return { kind: 'unknown' };
    const revision = dirty.trim() === '' ? lines[1] : `${lines[1]}+dirty`;
    return { kind: 'detected', version: revision, probeId: `hermes-launcher-git-${revision}` };
  } catch { return { kind: 'unknown' }; }
}

const HERMES_SUPPORTED = new Set<PackageSemantic>([
  'ordinary-skills', 'mcp', 'commands', 'model-invocation-control', 'auto-update-control', 'resources',
  'retirement', 'retention-safety', 'readback', 'rollback', 'activation-reload', 'reversible-disable',
]);

const hermesManagedProfiles = hermesProvenManagedRevisions.map(detectedVersion => createCapabilityEvidenceProfile({
  host: 'hermes',
  detectedVersion,
  sourceTypes: ['local', 'git'],
  operations: ['install', 'update', 'disable', 'retire'],
  route: 'managed',
  operationStatus: 'supported',
  semantics: Object.fromEntries(PACKAGE_SEMANTICS.map(semantic => [semantic, HERMES_SUPPORTED.has(semantic) ? 'supported' : 'unsupported'])) as Record<PackageSemantic, 'supported' | 'unsupported'>,
  evidence: [
    detectedVersion === 'c0d7294769a38c17ceae51d8f7995e66e1dcae27'
      ? 'docs/evidence/hermes-native-loader-c0d7294-20260923.json'
      : detectedVersion === '6e7b83a2f1c093e992a8d838ed77ea320fbd8e51'
        ? 'docs/evidence/hermes-native-loader-6e7b83a-20261013.json'
        : 'docs/evidence/hermes-native-loader-dce1e9b-20261011.json',
    'docs/hosts/hermes.md',
    'docs/research/native-plugin-update-capabilities-2026-10-09.md',
  ],
}));

type HermesStore = { readonly root: string; readonly configPath: string; readonly pluginsDir: string };
type Marker = Ownership & { sourceType?: 'local' | 'git'; sourceRevision?: string; sourceLocator?: string | null; scopeId?: string };
type ConfigSlice = {
  readonly packageName: string;
  readonly companionId: string;
  readonly packageEnabled: boolean;
  readonly packageDisabled: boolean;
  readonly companionEnabled: boolean;
  readonly companionDisabled: boolean;
  readonly entryPresent: boolean;
  readonly entry: unknown;
};

function storeFor(target: LifecycleTargetIdentity): HermesStore {
  const identity = hermesInstanceIdentity({ kind: target.kind, instance: target.instance, ...(target.context === undefined ? {} : { context: { ...target.context } }) });
  return { root: identity.root, configPath: resolveInstanceConfig(identity.root, identity.configPath), pluginsDir: join(identity.root, 'plugins') };
}

function resolveInstanceConfig(root: string, configPath: string): string {
  const native = resolve(join(root, 'config.yaml'));
  const configured = resolve(configPath);
  if (native === configured) return configured;
  if (!existsSync(native) || !existsSync(configured)) throw new Error(`Hermes only reads ${native}; configured path ${configured} must already resolve to the same file`);
  if (realpathSync(native) === realpathSync(configured)) return configured;
  throw new Error(`Hermes only reads ${native}; configured path ${configured} is a different file`);
}

function actualConfig(configPath: string): string {
  return existsSync(configPath) && lstatSync(configPath).isSymbolicLink() ? realpathSync(configPath) : configPath;
}

function workDir(store: HermesStore, attemptId: string, operationId: string): string {
  return join(store.root, '.plgnz-lifecycle', encodeURIComponent(attemptId), encodeURIComponent(operationId));
}

function packagePaths(store: HermesStore, packageName: string): { packageDir: string; companionId: string; companionDir: string } {
  assertId(packageName);
  const companionId = hermesCommandCompanionId(packageName);
  assertId(companionId);
  return { packageDir: join(store.pluginsDir, packageName), companionId, companionDir: join(store.pluginsDir, companionId) };
}

function assertPackageIdentity(packageName: string, nativeId: string): void {
  const companionId = hermesCommandCompanionId(packageName);
  assertId(packageName);
  assertId(companionId);
  if (nativeId === packageName) return;
  if (!nativeId.startsWith(`${packageName}@`)) throw new Error(`Hermes native id does not match package ${packageName}`);
  const market = nativeId.slice(packageName.length + 1);
  if (market === '' || market.includes('@')) throw new Error(`Hermes native id does not match package ${packageName}`);
  assertId(market);
}

function readMarker(target: string): Marker | null {
  const marker = readOwnership(target);
  if (marker === null) return null;
  const value = JSON.parse(readFileSync(join(target, MARKER), 'utf8')) as Record<string, unknown>;
  const sourceType = value.sourceType;
  const sourceRevision = value.sourceRevision;
  const sourceLocator = value.sourceLocator;
  const scopeId = value.scopeId;
  if (sourceType !== undefined && sourceType !== 'local' && sourceType !== 'git') throw new Error(`invalid Hermes ownership marker: ${join(target, MARKER)}`);
  if (sourceRevision !== undefined && typeof sourceRevision !== 'string') throw new Error(`invalid Hermes ownership marker: ${join(target, MARKER)}`);
  if (sourceLocator !== undefined && sourceLocator !== null && typeof sourceLocator !== 'string') throw new Error(`invalid Hermes ownership marker: ${join(target, MARKER)}`);
  if (scopeId !== undefined && typeof scopeId !== 'string') throw new Error(`invalid Hermes ownership marker: ${join(target, MARKER)}`);
  return {
    ...marker,
    ...(sourceType === 'local' || sourceType === 'git' ? { sourceType } : {}),
    ...(typeof sourceRevision === 'string' ? { sourceRevision } : {}),
    ...(sourceLocator === null || typeof sourceLocator === 'string' ? { sourceLocator } : {}),
    ...(typeof scopeId === 'string' ? { scopeId } : {}),
  };
}

type LifecycleOwner = { readonly pluginId: string; readonly scopeId: string; readonly sourceType: 'local' | 'git'; readonly locator: string | null };

function ownerFromHandle(handle: { readonly nativeId: string; readonly scopeId: string; readonly sourceType: 'local' | 'git'; readonly sourceLocator: string | null }): LifecycleOwner {
  return { pluginId: handle.nativeId, scopeId: handle.scopeId, sourceType: handle.sourceType, locator: handle.sourceLocator };
}

function installedOwner(marker: Marker): LifecycleOwner | null {
  if (marker.scopeId === undefined || (marker.sourceType !== 'local' && marker.sourceType !== 'git')) return null;
  if (marker.sourceType === 'git') {
    if (typeof marker.sourceLocator !== 'string') return null;
    return { pluginId: marker.pluginId, scopeId: marker.scopeId, sourceType: 'git', locator: marker.sourceLocator };
  }
  if (marker.sourceLocator !== undefined && marker.sourceLocator !== null) return null;
  return { pluginId: marker.pluginId, scopeId: marker.scopeId, sourceType: 'local', locator: null };
}

function sameLifecycleOwner(marker: Marker, claim: LifecycleOwner): boolean {
  const installed = installedOwner(marker);
  return installed !== null
    && installed.pluginId === claim.pluginId
    && installed.scopeId === claim.scopeId
    && installed.sourceType === claim.sourceType
    && installed.locator === claim.locator;
}

function assertLifecycleOwned(target: string, claim: LifecycleOwner, handle?: DurableLifecycleOperation): void {
  if (!existsSync(target)) return;
  const marker = readMarker(target);
  if (marker === null) throw new Error(`Hermes plugin ${claim.pluginId} is unowned and differs from the staged representation; pass --adopt-existing to take ownership explicitly`);
  const repairing = handle !== undefined && priorSourceRepairAllows(handle, proof => historicalGitMarker(marker, proof));
  if (!sameLifecycleOwner(marker, claim) && !repairing) throw new Error(`Hermes plugin ${claim.pluginId} belongs to another source; refusing to replace it`);
}

function historicalGitMarker(marker: Marker, proof: Readonly<PriorSourceProof>): boolean {
  return marker.source === proof.revision && marker.pluginId === proof.nativeId && marker.scopeId === proof.scopeId
    && marker.fingerprint === proof.sourceFingerprint && marker.sourceType === 'git'
    && marker.sourceRevision === proof.revision && marker.sourceLocator == null;
}

function copyReplace(stage: string, target: string, root: string): Change {
  const scratch = mkdtempSync(join(root, '.plgnz-hermes-copy-'));
  const copy = join(scratch, 'copy');
  cpSync(stage, copy, { recursive: true });
  const swapped = replaceTarget(copy, target, root);
  return {
    commit() { swapped.commit(); rmSync(scratch, { recursive: true, force: true }); },
    rollback() { swapped.rollback(); rmSync(scratch, { recursive: true, force: true }); },
  };
}

function flagSet(configPath: string, key: 'enabled' | 'disabled'): Set<string> {
  const actual = actualConfig(configPath);
  if (!existsSync(actual)) return new Set();
  const parsed: unknown = yamlParse(readFileSync(actual, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Hermes config is not a mapping: ${configPath}`);
  const plugins = (parsed as Record<string, unknown>)['plugins'];
  if (plugins === undefined || plugins === null) return new Set();
  if (typeof plugins !== 'object' || Array.isArray(plugins)) throw new Error(`Hermes plugins config is not a mapping: ${configPath}`);
  const values = (plugins as Record<string, unknown>)[key];
  if (values === undefined || values === null) return new Set();
  if (!Array.isArray(values) || values.some(item => typeof item !== 'string')) throw new Error(`Hermes plugins.${key} is not a string list: ${configPath}`);
  return new Set(values as string[]);
}

function activationMatches(configPath: string, packageName: string, companionId: string, hasCompanion: boolean): boolean {
  const enabled = flagSet(configPath, 'enabled');
  const disabled = flagSet(configPath, 'disabled');
  const packageOn = enabled.has(packageName) && !disabled.has(packageName);
  const companionOn = enabled.has(companionId) && !disabled.has(companionId);
  return packageOn && companionOn === hasCompanion;
}

function entryValue(configPath: string, packageName: string): unknown {
  const actual = actualConfig(configPath);
  if (!existsSync(actual)) return undefined;
  const parsed: unknown = yamlParse(readFileSync(actual, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const plugins = (parsed as Record<string, unknown>)['plugins'];
  if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) return undefined;
  const entries = (plugins as Record<string, unknown>)['entries'];
  if (entries === undefined || entries === null) return undefined;
  if (typeof entries !== 'object' || Array.isArray(entries)) throw new Error(`Hermes plugins.entries is not a mapping: ${configPath}`);
  if (!Object.hasOwn(entries, packageName)) return undefined;
  return (entries as Record<string, unknown>)[packageName];
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, canonicalValue(record[key])]));
  }
  return value;
}

function sha256(value: string): string {
  const hash = new CryptoHasher('sha256');
  hash.update(value);
  return hash.digest('hex');
}

function retentionFor(store: HermesStore, packageName: string): RetentionObservation {
  const dataDir = join(store.root, 'plugin-data', hermesPluginDataNamespace(packageName));
  const pluginData = existsSync(dataDir) && lstatSync(dataDir).isDirectory()
    ? { state: 'present' as const, fingerprint: fingerprintTree(dataDir) }
    : { state: 'absent' as const, fingerprint: null };
  const entry = entryValue(store.configPath, packageName);
  const inactiveMetadata = entry === undefined
    ? { state: 'absent' as const, fingerprint: null }
    : { state: 'present' as const, fingerprint: sha256(JSON.stringify(canonicalValue(entry))) };
  return { pluginData, inactiveMetadata };
}

function atomicFingerprint(packageDir: string, companionDir: string | undefined): string {
  const temp = mkdtempSync(join(tmpdir(), 'plgnz-hermes-atomic-'));
  try {
    cpSync(packageDir, join(temp, 'package'), { recursive: true });
    if (companionDir !== undefined && existsSync(companionDir)) cpSync(companionDir, join(temp, 'commands'), { recursive: true });
    return fingerprintTree(temp);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

function readConfigDocument(configPath: string): Record<string, unknown> | null {
  const actual = actualConfig(configPath);
  if (!existsSync(actual)) return null;
  const text = readFileSync(actual, 'utf8');
  if (text.trim() === '') return {};
  const parsed: unknown = yamlParse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Hermes config is not a mapping: ${configPath}`);
  return parsed as Record<string, unknown>;
}

function pluginMapping(doc: Record<string, unknown>): Record<string, unknown> {
  const plugins = doc['plugins'];
  if (plugins === undefined || plugins === null) return {};
  if (typeof plugins !== 'object' || Array.isArray(plugins)) throw new Error('Hermes plugins config is not a mapping');
  return plugins as Record<string, unknown>;
}

function listed(plugins: Record<string, unknown>, key: 'enabled' | 'disabled'): string[] {
  const value = plugins[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`Hermes plugins.${key} is not a string list`);
  return value as string[];
}

function captureConfigSlice(configPath: string, packageName: string, companionId: string): ConfigSlice {
  const plugins = pluginMapping(readConfigDocument(configPath) ?? {});
  const enabled = new Set(listed(plugins, 'enabled'));
  const disabled = new Set(listed(plugins, 'disabled'));
  const entries = plugins['entries'];
  const entryRecord = entries !== null && typeof entries === 'object' && !Array.isArray(entries) ? entries as Record<string, unknown> : undefined;
  const entryPresent = entryRecord !== undefined && Object.hasOwn(entryRecord, packageName);
  const entry = entryPresent ? entryRecord[packageName] : null;
  return {
    packageName,
    companionId,
    packageEnabled: enabled.has(packageName),
    packageDisabled: disabled.has(packageName),
    companionEnabled: enabled.has(companionId),
    companionDisabled: disabled.has(companionId),
    entryPresent,
    entry,
  };
}

function membership(list: unknown, id: string, present: boolean): string[] | undefined {
  if (list !== undefined && list !== null && (!Array.isArray(list) || list.some(item => typeof item !== 'string'))) {
    throw new Error('Hermes plugins list is not a string list');
  }
  const values = list === undefined || list === null ? [] : list as string[];
  if (present) return values.includes(id) ? values : [...values, id];
  if (!values.includes(id)) return list === undefined || list === null ? undefined : values;
  return values.filter(item => item !== id);
}

function writeConfigDocument(configPath: string, doc: Record<string, unknown>): void {
  const actual = actualConfig(configPath);
  const exists = existsSync(actual);
  const mode = exists ? (statSync(actual) as unknown as { mode: number }).mode & 0o777 : null;
  mkdirSync(dirname(actual), { recursive: true });
  const temp = join(dirname(actual), `.plgnz-hermes-rollback-${Date.now()}-${Math.random().toString(16).slice(2)}.yaml`);
  try {
    writeFileSync(temp, yamlStringify(doc));
    if (mode !== null) chmodSync(temp, mode);
    renameSync(temp, actual);
  } finally { rmSync(temp, { force: true }); }
}

function restoreConfigSlice(configPath: string, slice: ConfigSlice): void {
  const doc = readConfigDocument(configPath) ?? {};
  const plugins = pluginMapping(doc);
  doc['plugins'] = plugins;
  let enabled = membership(plugins['enabled'], slice.packageName, slice.packageEnabled);
  enabled = membership(enabled, slice.companionId, slice.companionEnabled);
  let disabled = membership(plugins['disabled'], slice.packageName, slice.packageDisabled);
  disabled = membership(disabled, slice.companionId, slice.companionDisabled);
  if (enabled === undefined) delete plugins['enabled'];
  else plugins['enabled'] = enabled;
  if (disabled === undefined) delete plugins['disabled'];
  else plugins['disabled'] = disabled;
  const raw = plugins['entries'];
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) throw new Error(`Hermes plugins.entries is not a mapping: ${configPath}`);
  const entries: Record<string, unknown> = raw === undefined || raw === null ? {} : { ...(raw as Record<string, unknown>) };
  if (slice.entryPresent) entries[slice.packageName] = slice.entry;
  else delete entries[slice.packageName];
  if (Object.keys(entries).length === 0) delete plugins['entries'];
  else plugins['entries'] = entries;
  writeConfigDocument(configPath, doc);
}

function saveRollback(store: HermesStore, reference: string, packageName: string, packageDir: string, companionDir: string): void {
  rmSync(reference, { recursive: true, force: true });
  mkdirSync(reference, { recursive: true });
  const companionId = hermesCommandCompanionId(packageName);
  writeFileSync(join(reference, 'config-slice.json'), JSON.stringify(captureConfigSlice(store.configPath, packageName, companionId)));
  if (existsSync(packageDir)) cpSync(packageDir, join(reference, 'package'), { recursive: true });
  if (existsSync(companionDir)) cpSync(companionDir, join(reference, 'commands'), { recursive: true });
}

function restoreRollback(store: HermesStore, reference: string, packageDir: string, companionDir: string): void {
  const slice = JSON.parse(readFileSync(join(reference, 'config-slice.json'), 'utf8')) as ConfigSlice;
  rmSync(packageDir, { recursive: true, force: true });
  rmSync(companionDir, { recursive: true, force: true });
  if (existsSync(join(reference, 'package'))) cpSync(join(reference, 'package'), packageDir, { recursive: true });
  if (existsSync(join(reference, 'commands'))) cpSync(join(reference, 'commands'), companionDir, { recursive: true });
  restoreConfigSlice(store.configPath, slice);
}

function sourceIdentity(marker: Marker | null): { type: 'local' | 'git'; immutableRevision: string; locator: string | null } | null {
  if (marker?.sourceType === 'local' && marker.sourceRevision !== undefined) return { type: 'local', immutableRevision: marker.sourceRevision, locator: null };
  if (marker?.sourceType === 'git' && marker.sourceRevision !== undefined && (typeof marker.sourceLocator === 'string' || (marker.sourceLocator == null && marker.source === marker.sourceRevision))) return { type: 'git', immutableRevision: marker.sourceRevision, locator: marker.sourceLocator ?? null };
  return null;
}

function inspect(store: HermesStore, nativeId: string, packageName: string, routeWhenAbsent: LifecycleReadbackData['route']): LifecycleReadbackData {
  const installed = listHermesInstance(store.root, store.configPath).find(plugin => plugin.id === nativeId);
  const present = installed?.path !== undefined;
  const disabled = flagSet(store.configPath, 'disabled');
  const contentRoots = present && installed?.contentRoots !== undefined
    ? Object.entries(installed.contentRoots).map(([label, path]) => ({ label, path, fingerprint: fingerprintTree(path) }))
    : [];
  const companion = installed?.contentRoots?.['commands'];
  return {
    adapterId: 'hermes',
    target: { kind: 'hermes', instance: '', context: { root: store.root, configPath: store.configPath } },
    scopeId: '',
    packageName,
    nativeId,
    route: present ? 'managed' : routeWhenAbsent,
    presence: present ? 'present' : 'absent',
    enablement: present ? (installed?.enabled === true ? 'enabled' : 'disabled') : (disabled.has(packageName) ? 'disabled' : 'not-applicable'),
    activation: present && installed?.enabled === true ? 'active' : 'inactive',
    transition: EFFECTIVE,
    installedFingerprint: present && installed?.path !== undefined ? atomicFingerprint(installed.path, companion) : null,
    contentRoots,
    retention: retentionFor(store, packageName),
  };
}

function withIdentity(base: LifecycleReadbackData, target: LifecycleTargetIdentity, scopeId: string, packageName: string, nativeId: string): LifecycleReadbackData {
  return { ...base, target, scopeId, packageName, nativeId };
}

function retirementAction(action: LifecycleMutationAction): boolean {
  return action === 'remove' || action === 'retire-orphan';
}

function markerBody(input: { nativeId: string; fingerprint: string; sourceType: 'local' | 'git'; revision: string; locator: string | null; scopeId: string }): Marker {
  return { source: input.locator ?? input.revision, pluginId: input.nativeId, fingerprint: input.fingerprint, sourceType: input.sourceType, sourceRevision: input.revision, sourceLocator: input.locator, scopeId: input.scopeId };
}

const hermesLifecycleDefinition: LifecycleHostDefinition = {
  id: 'hermes',
  evidenceProfiles: hermesManagedProfiles,
  async probeVersion(target) {
    try {
      const store = storeFor(target);
      const actual = actualConfig(store.configPath);
      if (!existsSync(actual) || !statSync(actual).isFile()) return { kind: 'unknown' };
      const text = readFileSync(actual, 'utf8');
      if (text.trim() !== '') {
        let parsed: unknown;
        try { parsed = yamlParse(text); } catch { return { kind: 'unparseable' }; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'unparseable' };
      }
      return observeHermesRevision();
    } catch { return { kind: 'unknown' }; }
  },
  async observeTarget(target) {
    const store = storeFor(target);
    const installations = listHermesInstance(store.root, store.configPath).map(plugin => {
      const packageDir = plugin.path ?? join(store.pluginsDir, plugin.name);
      const marker = readMarker(packageDir);
      const companion = plugin.contentRoots?.['commands'];
      const contentRoots = Object.entries(plugin.contentRoots ?? { package: packageDir }).map(([label, path]) => ({ label, path, fingerprint: fingerprintTree(path) }));
      return {
        nativeId: plugin.id,
        packageName: plugin.name,
        ownership: marker === null
          ? { kind: 'unmanaged' as const }
          : { kind: 'owned' as const, proof: 'created' as const, scopeId: marker.scopeId ?? 'legacy', proofId: `hermes:${marker.pluginId}` },
        presence: 'present' as const,
        enablement: plugin.enabled === true ? 'enabled' as const : 'disabled' as const,
        activation: plugin.enabled === true ? 'active' as const : 'inactive' as const,
        ...(marker?.pluginId === plugin.id && marker.scopeId !== undefined ? { observedRoute: 'managed' as const } : {}),
        installedFingerprint: atomicFingerprint(packageDir, companion),
        installedVersion: plugin.version ?? null,
        source: sourceIdentity(marker),
        contentRoots,
      };
    });
    return { target, installations };
  },
  async observeNativeMutationScope(request: NativeMutationScopeRequest) {
    assertPackageIdentity(request.packageName, request.nativeId);
    return { kind: 'bounded', mode: 'exact-package', affectedNativeIds: [request.nativeId] };
  },
  async observeNativeProjection(request: NativeProjectionRequest) {
    if ('snapshot' in request) {
      const proof = recordedPriorSource(request.snapshot);
      if (proof !== undefined) {
        const installed = request.targetObservation.installations.find(row => row.nativeId === request.snapshot.nativeId);
        for (const root of installed?.contentRoots ?? []) {
          const marker = readMarker(root.path);
          if (marker === null || !historicalGitMarker(marker, proof)) throw new Error('Hermes historical Git marker does not match recorded prior Source proof');
        }
      }
    }
    const decision = decideHermesNativeUpdate(hermesNativeUpdateProof);
    switch (decision.route) {
      case 'managed': return { kind: 'requires-managed', reasonId: decision.refusedGate };
      case 'native': return { kind: 'equivalent', proofId: 'hermes-native-update-gates' };
      default: { const unreachable: never = decision; return unreachable; }
    }
  },
  async revalidateTargetPrecondition(handle) {
    const version = await hermesLifecycleDefinition.probeVersion(handle.target);
    const data = await hermesLifecycleDefinition.observeTarget(handle.target);
    return { version, targetObservationId: createTargetInventoryObservation('hermes', data).observationId };
  },
  async stageActivation(request: ActivationPreparationRequest<'managed' | 'native'>) {
    const store = storeFor(request.snapshot.target);
    assertPackageIdentity(request.snapshot.packageName, request.snapshot.nativeId);
    const stagingRoot = join(workDir(store, request.snapshot.attemptId, request.snapshot.operationId), 'stage');
    rmSync(stagingRoot, { recursive: true, force: true });
    const packageStage = join(stagingRoot, 'package');
    const companionStage = join(stagingRoot, 'commands');
    mkdirSync(packageStage, { recursive: true });
    projectPluginForHermes(request.snapshot.packageRoot, packageStage, companionStage);
    if (existsSync(companionStage) && readdirSync(companionStage).length === 0) rmSync(companionStage, { recursive: true });
    const hasCompanion = existsSync(companionStage);
    validatePackage(packageStage, request.snapshot.packageName);
    if (hasCompanion) validateCompanion(companionStage, hermesCommandCompanionId(request.snapshot.packageName));
    const marker = markerBody({
      nativeId: request.snapshot.nativeId,
      fingerprint: request.snapshot.packageFingerprint,
      sourceType: request.snapshot.sourceType,
      revision: request.snapshot.immutableRevision,
      locator: request.snapshot.nativeGit?.locator ?? null,
      scopeId: request.snapshot.scopeId,
    });
    writeFileSync(join(packageStage, MARKER), JSON.stringify(marker));
    if (hasCompanion) writeFileSync(join(companionStage, MARKER), JSON.stringify(marker));
    return { stagingId: `${request.snapshot.attemptId}:${request.snapshot.operationId}`, stagingRoot };
  },
  async applyLifecycleDirectives() { return []; },
  async applyPins(projection) {
    if (projection.pins.length === 0) return [];
    const mcp = join(projection.stagingRoot, 'package', 'mcp.json');
    if (!existsSync(mcp)) throw new Error(`Hermes pin set has no mcp.json: ${mcp}`);
    const value = JSON.parse(readFileSync(mcp, 'utf8')) as { mcpServers?: Record<string, { command?: string }> };
    const servers = value.mcpServers ?? {};
    for (const pin of projection.pins) {
      const server = servers[pin.server];
      if (server === undefined || typeof server.command !== 'string') throw new Error(`Hermes pin server is not in mcp.json: ${pin.server}`);
      server.command = pin.executable;
    }
    writeFileSync(mcp, `${JSON.stringify(value, null, 2)}\n`);
    return projection.pins.map(pin => pin.server);
  },
  async captureActivationPreparation(projection, projectedFingerprint) {
    const store = storeFor(projection.target);
    const paths = packagePaths(store, projection.packageName);
    const prior = withIdentity(inspect(store, projection.nativeId, projection.packageName, 'none'), projection.target, projection.scopeId, projection.packageName, projection.nativeId);
    capturePriorSourceRepair(projection, prior.installedFingerprint);
    const hasCompanion = existsSync(join(projection.stagingRoot, 'commands'));
    const contentRoots = [{ label: 'package', path: paths.packageDir, fingerprint: fingerprintTree(join(projection.stagingRoot, 'package')) }];
    if (hasCompanion) contentRoots.push({ label: 'commands', path: paths.companionDir, fingerprint: fingerprintTree(join(projection.stagingRoot, 'commands')) });
    const rollbackReference = join(workDir(store, projection.attemptId, projection.operationId), 'rollback');
    saveRollback(store, rollbackReference, projection.packageName, paths.packageDir, paths.companionDir);
    return {
      prior,
      expected: { ...prior, route: projection.route, presence: 'present', enablement: 'enabled', activation: 'active', transition: EFFECTIVE, installedFingerprint: projectedFingerprint, contentRoots, retention: prior.retention },
      rollbackReference,
      rollbackCoverageOperationIds: projection.affectedOperationIds,
    };
  },
  async captureDisablePreparation(request) {
    const store = storeFor(request.activation.target);
    const paths = packagePaths(store, request.activation.packageName);
    const prior = withIdentity(inspect(store, request.activation.nativeId, request.activation.packageName, 'none'), request.activation.target, request.activation.scopeId, request.activation.packageName, request.activation.nativeId);
    const rollbackReference = join(workDir(store, request.attemptId, request.operationId), 'rollback');
    saveRollback(store, rollbackReference, request.activation.packageName, paths.packageDir, paths.companionDir);
    return { prior, rollbackReference, rollbackCoverageOperationIds: request.selection.affectedOperationIds, transition: EFFECTIVE };
  },
  async captureRetirementPreparation(request) {
    const store = storeFor(request.activation.target);
    const paths = packagePaths(store, request.activation.packageName);
    const prior = withIdentity(inspect(store, request.activation.nativeId, request.activation.packageName, 'none'), request.activation.target, request.activation.scopeId, request.activation.packageName, request.activation.nativeId);
    const rollbackReference = join(workDir(store, request.attemptId, request.operationId), 'rollback');
    saveRollback(store, rollbackReference, request.activation.packageName, paths.packageDir, paths.companionDir);
    return { prior, rollbackReference, rollbackCoverageOperationIds: request.selection.affectedOperationIds, transition: EFFECTIVE };
  },
  async apply(prepared) {
    const store = storeFor(prepared.handle.target);
    const paths = packagePaths(store, prepared.handle.packageName);
    assertPackageIdentity(prepared.handle.packageName, prepared.handle.nativeId);
    assertManagedPath(store.pluginsDir, paths.packageDir);
    assertManagedPath(store.pluginsDir, paths.companionDir);
    const stagedPackage = join(prepared.stagingRoot, 'package');
    const stagedCompanion = join(prepared.stagingRoot, 'commands');
    const hasCompanion = existsSync(stagedCompanion);
    const owner = ownerFromHandle(prepared.handle);
    assertLifecycleOwned(paths.packageDir, owner, prepared.handle);
    if (hasCompanion) assertLifecycleOwned(paths.companionDir, owner, prepared.handle);
    else if (existsSync(paths.companionDir)) assertLifecycleOwned(paths.companionDir, owner, prepared.handle);
    mkdirSync(store.pluginsDir, { recursive: true });
    const unchanged = existsSync(paths.packageDir)
      && atomicFingerprint(paths.packageDir, hasCompanion ? paths.companionDir : undefined) === fingerprintTree(prepared.stagingRoot)
      && activationMatches(store.configPath, prepared.handle.packageName, paths.companionId, hasCompanion);
    if (unchanged) return { receiptId: `apply:${prepared.handle.attemptId}:${prepared.handle.operationId}`, changed: false };
    const changes: Change[] = [];
    try {
      changes.push(copyReplace(stagedPackage, paths.packageDir, store.pluginsDir));
      if (hasCompanion) changes.push(copyReplace(stagedCompanion, paths.companionDir, store.pluginsDir));
      else if (existsSync(paths.companionDir)) changes.push(removeTarget(paths.companionDir, store.pluginsDir));
      updatePluginConfig(store.configPath, [prepared.handle.packageName, ...(hasCompanion ? [paths.companionId] : [])], hasCompanion ? [] : [paths.companionId]);
      for (const change of changes) change.commit();
    } catch (error) {
      for (const change of [...changes].reverse()) change.rollback();
      throw error;
    }
    return { receiptId: `apply:${prepared.handle.attemptId}:${prepared.handle.operationId}`, changed: true };
  },
  async disable(prepared) {
    const store = storeFor(prepared.handle.target);
    const paths = packagePaths(store, prepared.handle.packageName);
    updatePluginConfig(store.configPath, [], [prepared.handle.packageName, paths.companionId]);
    return { receiptId: `disable:${prepared.handle.attemptId}:${prepared.handle.operationId}`, changed: true };
  },
  async retire(prepared) {
    const store = storeFor(prepared.handle.target);
    const paths = packagePaths(store, prepared.handle.packageName);
    assertManagedPath(store.pluginsDir, paths.packageDir);
    assertManagedPath(store.pluginsDir, paths.companionDir);
    const source = prepared.handle.sourceLocator ?? prepared.handle.sourceRevision;
    const changes: Change[] = [];
    try {
      if (existsSync(paths.packageDir)) {
        assertLifecycleOwned(paths.packageDir, ownerFromHandle(prepared.handle));
        changes.push(removeTarget(paths.packageDir, store.pluginsDir));
      }
      if (existsSync(paths.companionDir)) {
        const marker = readMarker(paths.companionDir);
        if (marker !== null && marker.pluginId === prepared.handle.nativeId && marker.source === source) changes.push(removeTarget(paths.companionDir, store.pluginsDir));
      }
      updatePluginConfig(store.configPath, [], [prepared.handle.packageName, paths.companionId]);
      for (const change of changes) change.commit();
    } catch (error) {
      for (const change of [...changes].reverse()) change.rollback();
      throw error;
    }
    return { receiptId: `retire:${prepared.handle.attemptId}:${prepared.handle.operationId}`, changed: true };
  },
  async readback(handle) {
    const store = storeFor(handle.target);
    const absentRoute = retirementAction(handle.action) ? handle.route : 'none';
    return withIdentity(inspect(store, handle.nativeId, handle.packageName, absentRoute), handle.target, handle.scopeId, handle.packageName, handle.nativeId);
  },
  async rollback(handle) {
    const store = storeFor(handle.target);
    const paths = packagePaths(store, handle.packageName);
    restoreRollback(store, handle.rollbackReference, paths.packageDir, paths.companionDir);
    return { receiptId: `rollback:${handle.attemptId}:${handle.operationId}`, changed: true };
  },
  async cleanup(reference: CleanupReference, _disposition: CleanupDisposition) {
    releasePriorSourceRepair(reference);
    const store = storeFor(reference.target);
    rmSync(workDir(store, reference.attemptId, reference.operationId), { recursive: true, force: true });
    return { cleanupId: `cleanup:${reference.attemptId}:${reference.operationId}`, completed: true };
  },
};

export const hermesLifecycle = createLifecycleHostAdapter(hermesLifecycleDefinition);
