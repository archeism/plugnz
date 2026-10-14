import { hookAdapter as portableHookAdapter } from './codex-hooks';
import { portableHookProfile } from '../portable-hook-policy';
import { compilePortableHooksInStage, preflightPortableHooks } from '../hook-install';
/**
 * codex host writer — add/pin/remove for the store documented in
 * docs/hosts/codex.md.
 *
 * A sibling of the reader module so doctor's import graph never loads writer
 * code (AGENTS.md: doctor is read-only by construction;
 * test/doctor-imports.test.ts pins it).
 */
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { createCapabilityEvidenceProfile, type CapabilityEvidenceProfile, type CapabilityStatus } from '../capability-evidence';
import { projectPluginForCodex } from '../conversion';
import { fingerprintTree } from '../fingerprint';
import { codexMarketplaceMetadataFile, codexMarketplaceSourceFingerprint } from './codex-marketplace-proof';
import { capturePriorSourceRepair, priorSourceRepairAllows, recordedPriorSource, releasePriorSourceRepair, type PriorSourceProof } from '../prior-source-proof';
import type { AddOptions, HostWriter, InstalledPlugin, PinOptions, PinOutcome } from '../host';
import type {
  ActivationPreparationCapture,
  CleanupReference,
  CleanupResultData,
  DirectivesAppliedProjection,
  DurableLifecycleOperation,
  LifecycleHostDefinition,
  LifecycleReadbackData,
  LifecycleTargetIdentity,
  MutationResultData,
  NativeMutationScopeData,
  NativeProjectionData,
  NativeProjectionRequest,
  PinsAppliedProjection,
  PreparedActivationMutation,
  PreparedRetirementMutation,
  RetirementPreparationCapture,
  TargetInstallationData,
  TargetInventoryData,
} from '../lifecycle-host';
import { createLifecycleHostAdapter, createTargetInventoryObservation } from '../lifecycle-runtime';
import { pinPluginMcpFiles } from '../mcp-write';
import { codexHome } from '../paths';
import { CryptoHasher, spawnSync } from '../runtime';
import { PACKAGE_SEMANTICS, type CapabilityOperation, type PackageSemantic } from '../semantic-inventory';
import { readPluginManifest, type PluginSource, type ResolvedSource } from '../source';
import { codex, configFile, mcpCandidates, probeCodexVersion, resolveCodexBinary } from './codex';

const OWNERSHIP = '.plgnz-install.json';

export const codexWriter: HostWriter = {
  ...codex,
  supportsAdoption: true,
  plannedNativeId: (plugin) => `${plugin.name}@${plugin.marketplace || 'local'}`,
  legacyNativeIds: (plugin) => plugin.marketplace === undefined ? [plugin.name] : [],
  persistedNativeIdMayAlias: (persisted, requested) =>
    !persisted.includes('@') && (requested === persisted || requested === `${persisted}@local`),
  async add(plugin: PluginSource, resolved: ResolvedSource, opts?: AddOptions): Promise<void | 'unchanged'> {
    const marketplace = plugin.marketplace || 'local';
    const id = `${plugin.name}@${marketplace}`;
    const version = pluginVersion(plugin.dir);
    if (!validVersionSegment(version)) throw new Error(`unsafe Codex plugin version: ${version}`);
    const slot = join(codexHome(), 'plugins', 'cache', marketplace, plugin.name);
    const targetDir = join(slot, version);
    const configPath = configFile();
    assertManagedConfigPath(codexHome(), configPath);

    if (opts?.dryRun) {
      const stage = mkdtempSync(join(tmpdir(), 'plgnz-codex-dry-run-'));
      try {
        projectPluginForCodex(plugin.dir, stage);
        ensureNativeManifest(stage, plugin.name, version);
        validateStage(stage);
        writeFileSync(join(stage, OWNERSHIP), JSON.stringify({ source: resolved.sourceUri, pluginId: id, fingerprint: plugin.contentFingerprint ?? '' }));
        assertManagedPath(codexHome(), slot);
        if (existsSync(slot)) {
          assertNoSymlinks(slot);
          assertNoWinningForeignVersion(slot, version, id, resolved.sourceUri);
          const marker = readOwnership(targetDir);
          if (marker !== null && (marker.source !== resolved.sourceUri || marker.pluginId !== id)) throw new Error(`codex cache slot ${targetDir} has a different owned source identity; refusing to replace it`);
          if (existsSync(targetDir) && marker === null && !sameTree(stage, targetDir)) {
            if (!opts.adoptExisting) throw new Error(`codex cache slot ${targetDir} is unowned and differs from the staged representation; pass --adopt-existing to take ownership explicitly`);
            validateCachedIdentity(targetDir, plugin.name, version);
          }
        }
      }
      finally { rmSync(stage, { recursive: true, force: true }); }
      console.log(`[codex] would activate directory: ${targetDir}`);
      console.log(`[codex] would update config: ${configPath}`);
      return;
    }
    assertManagedPath(codexHome(), slot);
    mkdirSync(slot, { recursive: true });
    assertNoSymlinks(slot);
    assertNoWinningForeignVersion(slot, version, id, resolved.sourceUri);
    const marker = readOwnership(targetDir);
    if (marker !== null && (marker.source !== resolved.sourceUri || marker.pluginId !== id)) throw new Error(`codex cache slot ${targetDir} has a different owned source identity; refusing to replace it`);
    const stage = mkdtempSync(join(slot, '.plgnz-stage-'));
    try {
      projectPluginForCodex(plugin.dir, stage);
      ensureNativeManifest(stage, plugin.name, version);
      validateStage(stage);
      writeFileSync(join(stage, OWNERSHIP), JSON.stringify({ source: resolved.sourceUri, pluginId: id, fingerprint: plugin.contentFingerprint ?? '' }));
      const identicalUnowned = existsSync(targetDir) && marker === null && sameTree(stage, targetDir);
      if (existsSync(targetDir) && marker === null && !identicalUnowned) {
        if (!opts?.adoptExisting) throw new Error(`codex cache slot ${targetDir} is unowned and differs from the staged representation; pass --adopt-existing to take ownership explicitly`);
        validateCachedIdentity(targetDir, plugin.name, version);
      }
      const unchanged = marker !== null && marker.fingerprint === plugin.contentFingerprint && sameTree(stage, targetDir);
      if (unchanged) {
        const alreadyEnabled = isEnabled(configPath, id);
        try { if (!alreadyEnabled) enable(configPath, id); }
        finally { rmSync(stage, { recursive: true, force: true }); }
        return alreadyEnabled ? 'unchanged' : undefined;
      }
      const configBefore = readConfigSnapshot(configPath);
      const activation = activate(stage, targetDir, slot);
      try {
        enable(configPath, id);
      } catch (error) {
        try { restoreConfig(configPath, configBefore); }
        finally { activation.rollback(); }
        throw error;
      }
      // The new slot and config are now the active install. Backup disposal and
      // old-version cleanup may fail, but must never roll back by deleting the
      // new active slot after its backup has been partially or fully removed.
      activation.commit();
      cleanupOwnedVersions(slot, targetDir, id, resolved.sourceUri);
      return;
    } catch (error) {
      rmSync(stage, { recursive: true, force: true });
      throw error;
    }


  },
  async pin(plugin: InstalledPlugin, opts?: PinOptions): Promise<PinOutcome> {
    if (plugin.path === undefined || !existsSync(plugin.path)) return { changes: [], refusals: [] };
    return pinPluginMcpFiles(plugin.path, mcpCandidates(), opts);
  },
  async remove(id: string): Promise<void> {
    const configPath = configFile();
    assertManagedConfigPath(codexHome(), configPath);
    const at = id.indexOf('@');
    const owned: string[] = [];
    if (at !== -1) {
      const slot = join(codexHome(), 'plugins', 'cache', id.slice(at + 1), id.slice(0, at));
      if (existsSync(slot)) {
        assertNoSymlinks(slot);
        for (const version of readdirSync(slot)) {
          const candidate = join(slot, version);
          if (!statSync(candidate).isDirectory()) continue;
          if (readOwnership(candidate)?.pluginId === id) owned.push(candidate);
        }
      }
    }
    if (existsSync(configPath)) {
      const toml = readFileSync(configPath, 'utf8');
      const header = `[plugins."${id}"]`;
      const idx = toml.indexOf(header);
      if (idx !== -1) {
        const nextTable = toml.indexOf('\n[', idx + header.length);
        const end = nextTable === -1 ? toml.length : nextTable;
        const block = toml.slice(idx, end);
        const withoutEnabled = block.replace(enabledAssignment('true|false', true), '');
        const remaining = withoutEnabled.slice(header.length).trim();
        const replacement = remaining === '' ? '' : `${withoutEnabled.trimEnd()}\nenabled = false\n`;
        writeFileSync(configPath, toml.slice(0, idx) + replacement + toml.slice(end));
      }
    }
    for (const candidate of owned) rmSync(candidate, { recursive: true, force: true });
  }
};

/** Regex source: trailing spaces and an optional `#` comment. Callers anchor the line. */
const ENABLED_ASSIGNMENT_TAIL = String.raw`[ \t]*(?:#.*)?`;

function enabledAssignment(value: 'false' | 'true|false', consumeNewline = false): RegExp {
  return new RegExp(
    `^enabled\\s*=\\s*(?:${value})${ENABLED_ASSIGNMENT_TAIL}$${consumeNewline ? '\\n?' : ''}`,
    'mu',
  );
}

function enable(configPath: string, id: string): void {
    let toml = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
    parseConfigToml(toml, configPath);

    let newToml = toml;
    const header = `[plugins."${id}"]`;
    const idx = toml.indexOf(header);
    if (idx !== -1) {
      const nextTable = toml.indexOf('\n[', idx + header.length);
      const blockEnd = nextTable !== -1 ? nextTable : toml.length;
      const block = toml.slice(idx, blockEnd);
      const enabled = new RegExp(`^([ \\t]*enabled[ \\t]*=[ \\t]*)(true|false)(${ENABLED_ASSIGNMENT_TAIL})$`, 'gmu');
      const matches = [...block.matchAll(enabled)];
      if (matches.length > 1) throw new Error(`duplicate enabled keys in Codex plugin config: ${id}`);
      if (matches[0]?.[2] === 'false') {
        const newBlock = block.replace(enabled, '$1true$3');
        newToml = toml.slice(0, idx) + newBlock + toml.slice(blockEnd);
      } else if (matches.length === 0) {
        newToml = toml.slice(0, idx + header.length) + '\nenabled = true' + toml.slice(idx + header.length);
      }
    } else {
      if (!newToml.endsWith('\n') && newToml.length > 0) newToml += '\n';
      newToml += `[plugins."${id}"]\nenabled = true\n`;
    }

    mkdirSync(dirname(configPath), { recursive: true });
    parseConfigToml(newToml, configPath);
    writeFileSync(configPath, newToml);
}

function parseConfigToml(text: string, path: string): void {
  if (text.trim() === '') return;
  try { parseToml(text); }
  catch (error) { throw new Error(`invalid Codex config TOML: ${path} (${(error as Error).message})`); }
}

function isEnabled(configPath: string, id: string): boolean {
  if (!existsSync(configPath)) return false;
  const toml = readFileSync(configPath, 'utf8');
  const header = `[plugins."${id}"]`;
  const idx = toml.indexOf(header);
  if (idx === -1) return false;
  const nextTable = toml.indexOf('\n[', idx + header.length);
  const block = toml.slice(idx, nextTable === -1 ? toml.length : nextTable);
  return !enabledAssignment('false').test(block);
}

type ConfigSnapshot = { existed: false } | { existed: true; bytes: Uint8Array };

function readConfigSnapshot(path: string): ConfigSnapshot {
  if (!existsSync(path)) return { existed: false };
  const read = readFileSync as unknown as (file: string) => Uint8Array;
  return { existed: true, bytes: read(path) };
}

function restoreConfig(path: string, snapshot: ConfigSnapshot): void {
  if (!snapshot.existed) {
    rmSync(path, { force: true });
    return;
  }
  const write = writeFileSync as unknown as (file: string, bytes: Uint8Array) => void;
  write(path, snapshot.bytes);
}

function pluginVersion(dir: string): string {
  return readPluginManifest(dir)?.version ?? 'local';
}

function validVersionSegment(value: string): boolean {
  return value === 'local' || /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value);
}

interface CodexOwnership {
  source: string;
  pluginId: string;
  fingerprint: string;
  scopeId?: string;
  sourceType?: 'local' | 'git';
  sourceRevision?: string;
  route?: 'native' | 'managed';
}

function readOwnership(dir: string): CodexOwnership | null {
  const file = join(dir, OWNERSHIP);
  if (!existsSync(file)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof value !== 'object' || value === null) throw new Error('marker must be an object');
    const record = value as Record<string, unknown>;
    if (typeof record['source'] !== 'string' || typeof record['pluginId'] !== 'string' || typeof record['fingerprint'] !== 'string') throw new Error('marker fields are invalid');
    const marker: CodexOwnership = { source: record['source'], pluginId: record['pluginId'], fingerprint: record['fingerprint'] };
    if (['scopeId', 'sourceType', 'sourceRevision', 'route'].some(key => record[key] !== undefined)) {
      if (typeof record['scopeId'] !== 'string' || record['scopeId'].length === 0
        || (record['sourceType'] !== 'local' && record['sourceType'] !== 'git')
        || typeof record['sourceRevision'] !== 'string' || record['sourceRevision'].length === 0
        || (record['route'] !== 'native' && record['route'] !== 'managed')) throw new Error('lifecycle marker fields are invalid');
      return { ...marker, scopeId: record['scopeId'], sourceType: record['sourceType'], sourceRevision: record['sourceRevision'], route: record['route'] };
    }
    return marker;
  } catch (error) {
    throw new Error(`invalid plgnz ownership marker: ${file} (${(error as Error).message})`);
  }
}

function validateStage(stage: string): void {
  if (readPluginManifest(stage) === undefined) throw new Error('Codex stage has no Agent Plugins manifest');
  const skills = join(stage, 'skills');
  if (existsSync(skills) && !statSync(skills).isDirectory()) throw new Error('Codex stage skills path is not a directory');
}

function validateCachedIdentity(target: string, expectedName: string, expectedVersion: string): void {
  const candidates = [join(target, '.codex-plugin', 'plugin.json'), join(target, 'plugin.json'), join(target, '.plugin', 'plugin.json')];
  const manifest = candidates.find(existsSync);
  if (manifest === undefined) throw new Error(`unowned Codex cache slot has no manifest: ${target}`);
  const value: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`invalid cached Codex manifest: ${manifest}`);
  const record = value as Record<string, unknown>;
  if (record['name'] === expectedName && record['version'] === expectedVersion) return;
  if (manifest === candidates[0] && record['name'] === expectedName && nativeBuildVariant(expectedVersion, record['version'])) {
    const canonical = candidates.slice(1).find(existsSync);
    if (canonical !== undefined) {
      const canonicalValue: unknown = JSON.parse(readFileSync(canonical, 'utf8'));
      if (typeof canonicalValue === 'object' && canonicalValue !== null && !Array.isArray(canonicalValue)) {
        const identity = canonicalValue as Record<string, unknown>;
        if (identity['name'] === expectedName && identity['version'] === expectedVersion) return;
      }
    }
  }
  throw new Error(`cached Codex manifest identity does not match ${expectedName}@${expectedVersion}`);
}

function nativeBuildVariant(expected: string, actual: unknown): boolean {
  if (typeof actual !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(expected)) return false;
  const base = expected.split('+')[0]!;
  return actual.startsWith(`${base}+`) && /^(?:[0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*$/u.test(actual.slice(base.length + 1));
}

/** Codex's native loader requires its own manifest path; project only safe, relevant fields. */
function ensureNativeManifest(stage: string, fallbackName: string, fallbackVersion: string): void {
  const native = join(stage, '.codex-plugin', 'plugin.json');
  const sourceManifest = readPluginManifest(stage);
  if (sourceManifest === undefined) throw new Error('Codex stage has no Agent Plugins manifest');
  for (const path of ['plugin.json', '.plugin/plugin.json', '.claude-plugin/plugin.json']) {
    const file = join(stage, path);
    if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).mcpServers !== undefined) {
      throw new Error('Codex inline manifest MCP projection is unverified; use mcp.json or .mcp.json');
    }
  }
  const name = sourceManifest.name ?? fallbackName;
  const version = sourceManifest.version ?? fallbackVersion;
  const description = sourceManifest.description ?? `Plugin ${name}`;
  let overlay: Record<string, unknown> = {};
  if (existsSync(native)) {
    const value: unknown = JSON.parse(readFileSync(native, 'utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Codex native plugin manifest must be an object');
    overlay = value as Record<string, unknown>;
    if (overlay['name'] !== undefined && overlay['name'] !== name) throw new Error(`Codex native plugin name conflicts with Agent Plugins manifest: ${String(overlay['name'])}`);
    if (overlay['version'] !== undefined && overlay['version'] !== version) throw new Error(`Codex native plugin version conflicts with Agent Plugins manifest: ${String(overlay['version'])}`);
    if (overlay['skills'] !== undefined && overlay['skills'] !== './skills/' && overlay['skills'] !== './skills') {
      throw new Error(`unsupported Codex native skills pointer: ${String(overlay['skills'])}`);
    }
  }
  const pointer = overlay['mcpServers'];
  if (pointer !== undefined && (typeof pointer !== 'string' || !pointer.startsWith('./') || pointer.includes('\\') || pointer.split('/').includes('..') || !existsSync(join(stage, pointer)))) {
    throw new Error('Codex native MCP pointer must name an existing plugin-local file');
  }
  const mcpFiles = ['mcp.json', '.mcp.json', ...(typeof pointer === 'string' ? [pointer] : [])]
    .map(path => join(stage, path)).filter(existsSync);
  const declarations = mcpFiles.map(file => {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value) || !('mcpServers' in value)
      || value.mcpServers === null || typeof value.mcpServers !== 'object' || Array.isArray(value.mcpServers)) {
      throw new Error('Codex MCP declaration must contain a server object');
    }
    return mcpDeclarationIdentity(value.mcpServers);
  });
  if (declarations.some(value => value !== declarations[0])) throw new Error('conflicting Codex canonical and native MCP declarations');
  mkdirSync(dirname(native), { recursive: true });
  writeFileSync(native, JSON.stringify({ ...overlay, name, version, description, skills: overlay['skills'] ?? './skills/',
    ...(overlay['mcpServers'] === undefined && existsSync(join(stage, 'mcp.json')) && !existsSync(join(stage, '.mcp.json')) ? { mcpServers: './mcp.json' } : {}),
  }));
}

function mcpDeclarationIdentity(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(mcpDeclarationIdentity));
  if (value !== null && typeof value === 'object') return JSON.stringify(Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, item]) => [key, mcpDeclarationIdentity(item)]));
  return JSON.stringify(value) ?? 'null';
}

function assertManagedPath(root: string, target: string): void {
  if (target !== root && !target.startsWith(`${root}/`)) throw new Error(`Codex managed path escapes its home: ${target}`);
  const suffix = target === root ? '' : target.slice(root.length + 1);
  let current = root;
  for (const part of ['', ...suffix.split('/').filter(Boolean)]) {
    if (part !== '') current = join(current, part);
    if (!existsSync(current)) continue;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`Codex managed path component is a symlink: ${current}`);
    if (!stat.isDirectory()) throw new Error(`Codex managed path component is not a directory: ${current}`);
  }
}

function assertManagedConfigPath(root: string, path: string): void {
  assertManagedPath(root, dirname(path));
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`Codex managed config is a symlink: ${path}`);
  if (!stat.isFile()) throw new Error(`Codex managed config is not a file: ${path}`);
}

function activate(stage: string, target: string, slot: string): { commit(): void; rollback(): void } {
  if (!existsSync(target)) {
    renameSync(stage, target);
    return { commit: () => {}, rollback: () => rmSync(target, { recursive: true, force: true }) };
  }
  const backup = mkdtempSync(join(slot, '.plgnz-backup-'));
  const previous = join(backup, 'previous');
  renameSync(target, previous);
  try { renameSync(stage, target); }
  catch (error) {
    renameSync(previous, target);
    rmSync(backup, { recursive: true, force: true });
    throw error;
  }
  return {
    commit: () => rmSync(backup, { recursive: true, force: true }),
    rollback: () => {
      rmSync(target, { recursive: true, force: true });
      renameSync(previous, target);
      rmSync(backup, { recursive: true, force: true });
    },
  };
}

function sameTree(left: string, right: string): boolean {
  const listing = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (current: string, prefix: string): void => {
      for (const entry of readdirSync(current).sort()) {
        if (entry === OWNERSHIP) continue;
        const path = join(current, entry);
        const relative = prefix === '' ? entry : `${prefix}/${entry}`;
        const stat = statSync(path);
        if (stat.isDirectory()) walk(path, relative);
        else if (stat.isFile()) out.push(`${relative}:${bytesKey(path)}`);
      }
    };
    walk(dir, '');
    return out;
  };
  return JSON.stringify(listing(left)) === JSON.stringify(listing(right));
}

function bytesKey(path: string): string {
  const read = readFileSync as unknown as (file: string) => Uint8Array;
  return Array.from(read(path)).join(',');
}

function assertNoWinningForeignVersion(slot: string, requested: string, id: string, source: string, handle?: DurableLifecycleOperation): void {
  for (const version of readdirSync(slot)) {
    const candidate = join(slot, version);
    if (!statSync(candidate).isDirectory() || version === requested) continue;
    const marker = readOwnership(candidate);
    if (wins(version, requested) && (marker?.pluginId !== id || marker.source !== source)
      && !(handle !== undefined && marker !== null && fingerprintTree(candidate) === handle.prior.installedFingerprint
        && priorSourceRepairAllows(handle, proof => historicalGitMarker(marker, proof)))) {
      throw new Error(`foreign Codex cache version ${version} would remain active over ${requested}`);
    }
  }
}

function cleanupOwnedVersions(slot: string, active: string, id: string, source: string, handle?: DurableLifecycleOperation): void {
  for (const version of readdirSync(slot)) {
    const candidate = join(slot, version);
    if (candidate === active || !statSync(candidate).isDirectory()) continue;
    const marker = readOwnership(candidate);
    // The lifecycle handle proves the active prior only. Older inactive code
    // may have the same marker identity without captured replacement authority.
    if (handle !== undefined && !handle.prior.contentRoots.some(root => root.path === candidate && root.fingerprint === fingerprintTree(candidate))) continue;
    if (marker?.pluginId === id && (marker.source === source || (handle !== undefined
      && fingerprintTree(candidate) === handle.prior.installedFingerprint
      && priorSourceRepairAllows(handle, proof => historicalGitMarker(marker, proof))))) rmSync(candidate, { recursive: true, force: true });
  }
}

function assertNoSymlinks(dir: string): void {
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`Codex managed slot contains symlink: ${path}`);
      if (stat.isDirectory()) walk(path);
    }
  };
  walk(dir);
}

function wins(left: string, right: string): boolean {
  if (left === 'local') return right !== 'local';
  if (right === 'local') return false;
  const parse = (value: string): { numbers: number[]; prerelease?: string } | null => {
    const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u);
    return match === null ? null : { numbers: [Number(match[1]), Number(match[2]), Number(match[3])], ...(match[4] === undefined ? {} : { prerelease: match[4] }) };
  };
  const l = parse(left); const r = parse(right);
  if (l !== null && r !== null) {
    for (let i = 0; i < 3; i += 1) if (l.numbers[i] !== r.numbers[i]) return (l.numbers[i] ?? 0) > (r.numbers[i] ?? 0);
    if (l.prerelease === undefined && r.prerelease !== undefined) return true;
    if (l.prerelease !== undefined && r.prerelease === undefined) return false;
    if (l.prerelease !== undefined && r.prerelease !== undefined) return comparePrerelease(l.prerelease, r.prerelease) > 0;
    return false;
  }
  return left > right;
}

/**
 * Catalog binding is the native-upgrade gate. A branch or tag is unbound.
 * A full 40-character object id is the only ref Codex treats as already resolved.
 */
type CodexCatalogBinding =
  | { readonly kind: 'sha-bound'; readonly marketplace: string; readonly sha: string; readonly source: string }
  | { readonly kind: 'unbound'; readonly marketplace: string }
  | { readonly kind: 'absent'; readonly marketplace: string };

const CODEX_ROUTE_VERSION = '0.162.0';
const NATIVE_UPGRADE_TIMEOUT_MS = 120_000;
/** The native primitive has no whole-checkout rollback; adapter compensation captures its Git state separately. */
export const codexMarketplaceCheckoutRollback = 'unverified' as const;

function nativeUpgradeTimeout(): number {
  const raw = process.env['OPEN_PLUGIN_CODEX_UPGRADE_TIMEOUT_MS'];
  if (raw === undefined || raw.trim() === '') return NATIVE_UPGRADE_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < NATIVE_UPGRADE_TIMEOUT_MS) return NATIVE_UPGRADE_TIMEOUT_MS;
  return parsed;
}
const RELOAD_EFFECTIVE = { requirement: 'reload', status: 'effective' } as const;
const UPDATE_SEMANTICS = ['ordinary-skills', 'resources', 'auto-update-control', 'readback', 'rollback', 'activation-reload'] as const satisfies readonly PackageSemantic[];
const MANAGED_SEMANTICS = [...UPDATE_SEMANTICS, 'retirement', 'retention-safety', 'model-invocation-control', 'commands', 'mcp'] as const satisfies readonly PackageSemantic[];

const codexEvidenceProfiles: readonly CapabilityEvidenceProfile[] = [
  portableHookProfile(portableHookAdapter, 'managed', ['install', 'update', 'retire']),
  codexRouteProfile('native', ['update'], UPDATE_SEMANTICS, ['docs/research/native-plugin-update-capabilities-2026-10-09.md', 'docs/evidence/codex-native-released-20261011.md']),
  codexRouteProfile('managed', ['install', 'update', 'retire'], MANAGED_SEMANTICS, [
    'docs/hosts/codex.md',
    'docs/adr/0004-retain-plugin-state-on-removal.md',
    'docs/evidence/codex-policy-mcp-20261013.json',
    'docs/evidence/codex-native-released-20261011.md',
  ]),
];

const codexLifecycleDefinition = {
  id: 'codex',
  evidenceProfiles: codexEvidenceProfiles,
  probeVersion: async () => probeCodexVersion(),
  observeTarget: async (target): Promise<TargetInventoryData> => ({
    target,
    installations: codex.listInstalled().map(installationRecord),
  }),
  observeNativeMutationScope: async (request): Promise<NativeMutationScopeData> => {
    const marketplace = marketplaceOf(request.nativeId);
    if (marketplace === null) return { kind: 'unavailable' };
    const affected = request.targetObservation.installations
      .map((installation) => installation.nativeId)
      .filter((nativeId) => marketplaceOf(nativeId) === marketplace);
    const [first, ...rest] = affected;
    if (first === undefined) return { kind: 'unavailable' };
    return { kind: 'bounded', mode: 'marketplace-wide', affectedNativeIds: [first, ...rest] };
  },
  observeNativeProjection: async (request): Promise<NativeProjectionData> => nativeProjection(request),
  revalidateTargetPrecondition: async (handle) => revalidateCodexTarget(handle),
  stageActivation: async (request) => stageCodexActivation(request),
  applyLifecycleDirectives: async () => [],
  applyPins: async (projection) => applyCodexPins(projection),
  captureActivationPreparation: async (projection, projectedFingerprint) => captureCodexActivation(projection, projectedFingerprint),
  captureDisablePreparation: async () => {
    throw new Error('codex lifecycle disable is not routed yet');
  },
  captureRetirementPreparation: async (request) => captureCodexRetirement(request),
  apply: async (prepared) => applyCodexActivation(prepared),
  disable: async () => {
    throw new Error('codex lifecycle disable is not routed yet');
  },
  retire: async (prepared) => retireCodex(prepared),
  readback: async (handle) => readCodexInstall(handle),
  rollback: async (handle) => restoreCodexRollback(handle),
  cleanup: async (reference) => cleanupCodexStage(reference),
} satisfies LifecycleHostDefinition;

export const codexLifecycle = createLifecycleHostAdapter(codexLifecycleDefinition);

function codexRouteProfile(
  route: 'native' | 'managed',
  operations: readonly CapabilityOperation[],
  supportedSemantics: readonly PackageSemantic[],
  evidence: readonly string[],
): CapabilityEvidenceProfile {
  const checkoutRollback = route === 'native' ? codexMarketplaceCheckoutRollback : 'supported';
  if (checkoutRollback !== 'unverified' && route === 'native') {
    throw new Error('codex marketplace checkout rollback must stay unverified');
  }
  const supported = new Set<PackageSemantic>(supportedSemantics);
  const semantics = {} as Record<PackageSemantic, CapabilityStatus>;
  for (const semantic of PACKAGE_SEMANTICS) semantics[semantic] = supported.has(semantic) ? 'supported' : 'unsupported';
  return createCapabilityEvidenceProfile({
    host: 'codex',
    detectedVersion: CODEX_ROUTE_VERSION,
    sourceTypes: ['git', 'local'],
    operations,
    route,
    operationStatus: 'supported',
    semantics,
    evidence,
  });
}

function revalidateCodexTarget(handle: DurableLifecycleOperation): { version: ReturnType<typeof probeCodexVersion>; targetObservationId: string } {
  const bundle = rollbackBundle(handle.attemptId, handle.operationId);
  if (handle.route === 'native') {
    for (const slot of readNativeCacheSnapshots(handle)) {
      assertNativeCacheParent(slot);
      if (nativeCacheFingerprint(slot.path) !== slot.fingerprint) throw new Error('Codex complete cache slot changed after rollback capture');
    }
  } else if (handle.expected.presence === 'present') {
    for (const root of handle.expected.contentRoots) assertRequestedCacheOwnership(root.path, handle.prior.contentRoots);
  }
  if (existsSync(join(bundle, 'marketplace.json'))) {
    const metadata = JSON.parse(readFileSync(join(bundle, 'marketplace.json'), 'utf8')) as { marketplace: string; fingerprint: string | null };
    const checkout = marketplaceCheckout(metadata.marketplace);
    const actual = existsSync(checkout) ? fingerprintTree(checkout) : null;
    if (actual !== metadata.fingerprint) throw new Error('Codex marketplace checkout changed after rollback capture');
  }
  const version = probeCodexVersion();
  const observation = createTargetInventoryObservation('codex', {
    target: handle.target,
    installations: codex.listInstalled().map(installationRecord),
  });
  return { version, targetObservationId: observation.observationId };
}

function stageCodexActivation(request: Parameters<LifecycleHostDefinition['stageActivation']>[0]): { stagingId: string; stagingRoot: string } {
  const stagingId = `${request.snapshot.attemptId}:${request.snapshot.operationId}`;
  const stagingRoot = resolve(join(codexHome(), '.plgnz-lifecycle', stagingId));
  assertManagedPath(codexHome(), stagingRoot);
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  projectPluginForCodex(request.snapshot.packageRoot, stagingRoot);
  const version = pluginVersion(stagingRoot);
  if (!validVersionSegment(version)) throw new Error(`unsafe Codex plugin version: ${version}`);
  ensureNativeManifest(stagingRoot, request.snapshot.packageName, version);
  compilePortableHooksInStage(portableHookAdapter, stagingRoot, { retainCanonicalIdentity: true });
  validateStage(stagingRoot);
  const source = request.snapshot.nativeGit?.locator ?? `scope:${request.snapshot.scopeId}`;
  writeFileSync(join(stagingRoot, OWNERSHIP), JSON.stringify({
    source,
    pluginId: request.snapshot.nativeId,
    fingerprint: request.snapshot.packageFingerprint,
    scopeId: request.snapshot.scopeId,
    sourceType: request.snapshot.sourceType,
    sourceRevision: request.snapshot.immutableRevision,
    route: request.selection.route,
  }));
  return { stagingId, stagingRoot };
}

function applyCodexPins(projection: DirectivesAppliedProjection): readonly string[] {
  if (projection.pins.length === 0) return [];
  const outcome = pinPluginMcpFiles(projection.stagingRoot, mcpCandidates());
  if (outcome.refusals.length > 0) throw new Error(`codex pin refused ${outcome.refusals.map((refusal) => refusal.server).join(', ')}`);
  return projection.pins.map((pin) => pin.server);
}

function captureCodexActivation(projection: PinsAppliedProjection, projectedFingerprint: string): ActivationPreparationCapture {
  const version = pluginVersion(projection.stagingRoot);
  const destination = cacheDestination(projection.nativeId, version);
  const prior = readInstall({
    target: projection.target,
    scopeId: projection.scopeId,
    packageName: projection.packageName,
    nativeId: projection.nativeId,
  });
  capturePriorSourceRepair(projection, prior.installedFingerprint);
  saveCodexRollback(projection.attemptId, projection.operationId, projection.affectedNativeIds);
  if (projection.route === 'native') {
    captureNativeCacheSnapshots(projection);
    captureMarketplaceRollback(projection);
  }
  return {
    prior,
    expected: {
      ...prior,
      route: projection.route,
      presence: 'present',
      enablement: 'enabled',
      activation: 'active',
      transition: RELOAD_EFFECTIVE,
      installedFingerprint: projectedFingerprint,
      contentRoots: [{ label: 'plugin', path: destination, fingerprint: projectedFingerprint }],
    },
    rollbackReference: codexRollbackReference(projection.attemptId, projection.operationId),
    rollbackCoverageOperationIds: projection.affectedOperationIds,
  };
}

function captureCodexRetirement(request: Parameters<LifecycleHostDefinition['captureRetirementPreparation']>[0]): RetirementPreparationCapture {
  const prior = readInstall({
    target: request.activation.target,
    scopeId: request.activation.scopeId,
    packageName: request.activation.packageName,
    nativeId: request.activation.nativeId,
    route: 'managed',
  });
  saveCodexRollback(request.attemptId, request.operationId, request.selection.affectedNativeIds);
  return {
    prior,
    rollbackReference: codexRollbackReference(request.attemptId, request.operationId),
    rollbackCoverageOperationIds: request.selection.affectedOperationIds,
    transition: RELOAD_EFFECTIVE,
  };
}

function applyCodexActivation(prepared: PreparedActivationMutation): MutationResultData {
  switch (prepared.handle.route) {
    case 'native':
      return applyNativeMarketplaceUpgrade(prepared);
    case 'managed':
      return applyManagedCodexActivation(prepared);
    default: {
      const unreachable: never = prepared.handle.route;
      throw new Error(`unreachable Codex lifecycle route: ${String(unreachable)}`);
    }
  }
}

function applyManagedCodexActivation(prepared: PreparedActivationMutation): MutationResultData {
  const { handle, stagingRoot } = prepared;
  const version = pluginVersion(stagingRoot);
  if (!validVersionSegment(version)) throw new Error(`unsafe Codex plugin version: ${version}`);
  const marketplace = marketplaceOf(handle.nativeId);
  if (marketplace === null) throw new Error(`codex native id has no marketplace: ${handle.nativeId}`);
  const name = handle.nativeId.slice(0, handle.nativeId.indexOf('@'));
  const slot = join(codexHome(), 'plugins', 'cache', marketplace, name);
  const targetDir = join(slot, version);
  const configPath = configFile();
  assertManagedConfigPath(codexHome(), configPath);
  assertManagedPath(codexHome(), slot);
  mkdirSync(slot, { recursive: true });
  assertNoSymlinks(slot);
  const source = readOwnership(stagingRoot)?.source ?? handle.sourceLocator ?? handle.sourceRevision;
  assertNoWinningForeignVersion(slot, version, handle.nativeId, source, handle);
  const marker = readOwnership(targetDir);
  if (marker !== null && (marker.source !== source || marker.pluginId !== handle.nativeId)
    && !(fingerprintTree(targetDir) === handle.prior.installedFingerprint && priorSourceRepairAllows(handle, proof => historicalGitMarker(marker, proof)))) {
    throw new Error(`codex cache slot ${targetDir} has a different owned source identity; refusing to replace it`);
  }
  const before = cacheFingerprint(handle.nativeId);
  const configBefore = readConfigSnapshot(configPath);
  const activation = activate(stagingRoot, targetDir, slot);
  try {
    enable(configPath, handle.nativeId);
  } catch (error) {
    try { restoreConfig(configPath, configBefore); }
    finally { activation.rollback(); }
    throw error;
  }
  activation.commit();
  cleanupOwnedVersions(slot, targetDir, handle.nativeId, source, handle);
  return {
    receiptId: `apply:${handle.attemptId}:${handle.operationId}`,
    changed: before !== cacheFingerprint(handle.nativeId),
  };
}

function applyNativeMarketplaceUpgrade(prepared: PreparedActivationMutation): MutationResultData {
  const marketplace = marketplaceOf(prepared.handle.nativeId);
  if (marketplace === null) throw new Error(`codex native id has no marketplace: ${prepared.handle.nativeId}`);
  const binding = catalogBinding(marketplace);
  if (binding.kind !== 'sha-bound' || prepared.handle.sourceLocator !== binding.source || prepared.handle.sourceRevision !== binding.sha) {
    throw new Error(`codex marketplace upgrade refused: ${catalogRefusal(binding, prepared.handle.sourceLocator === null ? undefined : { locator: prepared.handle.sourceLocator, resolvedRevision: prepared.handle.sourceRevision })}`);
  }
  const before = fingerprintAffected(prepared.handle.affectedNativeIds);
  const binary = resolveCodexBinary();
  if (binary === null) throw new Error('codex marketplace upgrade stderr-only failure: codex binary is unavailable');
  const result = spawnSync([binary, 'plugin', 'marketplace', 'upgrade', marketplace, '--json'], {
    env: codexCommandEnv(),
    timeout: nativeUpgradeTimeout(),
  });
  const stdout = decodeBytes(result.stdout);
  const stderr = decodeBytes(result.stderr).trim();
  captureAttemptedMarketplace(prepared.handle);
  const parsed = parseUpgradeJson(stdout);
  const rewritten = fingerprintAffected(prepared.handle.affectedNativeIds);
  const errors = parsed?.errors ?? [];
  const success = result.exitCode === 0 && parsed !== null && errors.length === 0;
  if (!success) {
    const changed = prepared.handle.affectedNativeIds.filter((nativeId) => before.get(nativeId) !== rewritten.get(nativeId));
    if (changed.length > 0 || errors.length > 0) {
      const unchanged = prepared.handle.affectedNativeIds.filter((nativeId) => !changed.includes(nativeId));
      const detail = errors.length > 0 ? errors.map((error) => error.message).join('; ') : stderr;
      throw new Error(`codex marketplace upgrade partial mutation changed ${changed.join(', ')}; unchanged ${unchanged.join(', ')}: ${detail}`);
    }
    throw new Error(`codex marketplace upgrade stderr-only failure: ${stderr}`);
  }
  restampNativeUpgrade(prepared);
  const after = fingerprintAffected(prepared.handle.affectedNativeIds);
  const missed = prepared.handle.affectedNativeIds.filter((nativeId) => before.get(nativeId) !== null && after.get(nativeId) === null);
  if (missed.length > 0) throw new Error(`codex marketplace upgrade readback missed ${missed.join(', ')}`);
  return {
    receiptId: `apply:${prepared.handle.attemptId}:${prepared.handle.operationId}`,
    changed: before.get(prepared.handle.nativeId) !== after.get(prepared.handle.nativeId),
  };
}

async function retireCodex(prepared: PreparedRetirementMutation): Promise<MutationResultData> {
  const before = cacheFingerprint(prepared.handle.nativeId);
  await codexWriter.remove(prepared.handle.nativeId);
  return {
    receiptId: `retire:${prepared.handle.attemptId}:${prepared.handle.operationId}`,
    changed: before !== cacheFingerprint(prepared.handle.nativeId),
  };
}

function restampNativeUpgrade(prepared: PreparedActivationMutation): void {
  const markerPath = join(prepared.stagingRoot, OWNERSHIP);
  if (!existsSync(markerPath)) return;
  const marker = readFileSync(markerPath, 'utf8');
  const version = pluginVersion(prepared.stagingRoot);
  if (validVersionSegment(version)) {
    const destination = cacheDestination(prepared.handle.nativeId, version);
    if (existsSync(destination) && statSync(destination).isDirectory()) {
      assertManagedPath(codexHome(), destination);
      writeFileSync(join(destination, OWNERSHIP), marker);
    }
  }
  for (const nativeId of prepared.handle.affectedNativeIds) {
    if (nativeId === prepared.handle.nativeId) continue;
    const path = codex.listInstalled().find((plugin) => plugin.id === nativeId)?.path;
    if (path === undefined || !existsSync(path)) continue;
    const existing = readOwnership(path);
    if (existing?.pluginId === nativeId) continue;
    const prior = priorInstallMarker(prepared, nativeId);
    const ownedPrior = prior?.pluginId === nativeId ? prior : null;
    if (ownedPrior === null) continue;
    assertManagedPath(codexHome(), path);
    writeFileSync(join(path, OWNERSHIP), JSON.stringify({
      ...ownedPrior,
      pluginId: nativeId,
    }));
  }
}

function priorInstallMarker(
  prepared: PreparedActivationMutation,
  nativeId: string,
): CodexOwnership | null {
  const bundle = rollbackBundle(prepared.handle.attemptId, prepared.handle.operationId);
  const manifestPath = join(bundle, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = parseRollbackManifest(readFileSync(manifestPath, 'utf8'));
  const install = manifest.installs.find((item) => item.nativeId === nativeId);
  if (install === undefined || !install.existed) return null;
  return readOwnership(join(bundle, 'cache', install.saved));
}

function projectionMatchesPackage(packageRoot: string, packageName: string): boolean {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-codex-identity-'));
  const stage = join(root, 'stage');
  try {
    mkdirSync(stage);
    projectPluginForCodex(packageRoot, stage);
    const version = pluginVersion(stage);
    if (!validVersionSegment(version)) return false;
    ensureNativeManifest(stage, packageName, version);
    return sameTree(packageRoot, stage);
  } catch {
    return false;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function readCodexInstall(handle: DurableLifecycleOperation): LifecycleReadbackData {
  return readInstall({
    target: handle.target,
    scopeId: handle.scopeId,
    packageName: handle.packageName,
    nativeId: handle.nativeId,
    route: cacheFingerprint(handle.nativeId) === handle.prior.installedFingerprint ? handle.prior.route : handle.route,
  });
}

function cleanupCodexStage(reference: CleanupReference): CleanupResultData {
  releasePriorSourceRepair(reference);
  const stage = resolve(join(codexHome(), '.plgnz-lifecycle', `${reference.attemptId}:${reference.operationId}`));
  if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  const rollback = rollbackBundle(reference.attemptId, reference.operationId);
  assertManagedPath(codexHome(), rollback);
  if (existsSync(rollback)) rmSync(rollback, { recursive: true, force: true });
  return { cleanupId: `cleanup:${reference.attemptId}:${reference.operationId}`, completed: true };
}

function readInstall(identity: {
  readonly target: LifecycleTargetIdentity;
  readonly scopeId: string;
  readonly packageName: string;
  readonly nativeId: string;
  readonly route?: LifecycleReadbackData['route'];
}): LifecycleReadbackData {
  const plugin = codex.listInstalled().find((item) => item.id === identity.nativeId);
  const retention = retentionObservation(identity.nativeId);
  const shared = {
    adapterId: 'codex',
    target: identity.target,
    scopeId: identity.scopeId,
    packageName: identity.packageName,
    nativeId: identity.nativeId,
    transition: RELOAD_EFFECTIVE,
    retention,
  };
  if (plugin?.path === undefined) {
    return {
      ...shared,
      route: identity.route ?? 'none',
      presence: 'absent',
      enablement: plugin?.enabled === true ? 'enabled' : 'disabled',
      activation: 'inactive',
      installedFingerprint: null,
      contentRoots: [],
    };
  }
  const installedFingerprint = fingerprintTree(plugin.path);
  const marker = readOwnership(plugin.path);
  const owned = marker?.pluginId === identity.nativeId;
  return {
    ...shared,
    route: owned && marker.route !== undefined ? marker.route : identity.route ?? (owned ? 'managed' : 'none'),
    presence: 'present',
    enablement: plugin.enabled ? 'enabled' : 'disabled',
    activation: plugin.enabled ? 'active' : 'inactive',
    installedFingerprint,
    contentRoots: [{ label: 'plugin', path: plugin.path, fingerprint: installedFingerprint }],
  };
}

function retentionObservation(nativeId: string): LifecycleReadbackData['retention'] {
  return {
    pluginData: retainedTree(pluginDataRoots(nativeId)),
    inactiveMetadata: inactiveMetadata(nativeId),
  };
}

function pluginDataRoots(nativeId: string): readonly string[] {
  const marketplace = marketplaceOf(nativeId);
  if (marketplace === null) return [];
  const name = nativeId.slice(0, nativeId.indexOf('@'));
  const hash = new CryptoHasher('sha256');
  hash.update(`${marketplace}\0${name}`);
  const prefix = hash.digest('hex').slice(0, 32);
  return [
    join(codexHome(), 'plugins', 'data', `${name}-${marketplace}`),
    join(codexHome(), 'plugins', 'data', 'agent-plugins', prefix),
  ];
}

function retainedTree(paths: readonly string[]): LifecycleReadbackData['retention']['pluginData'] {
  const present = paths.filter((path) => existsSync(path));
  const [only, ...rest] = present;
  if (only === undefined) return { state: 'absent', fingerprint: null };
  if (rest.length === 0) return { state: 'present', fingerprint: fingerprintTree(only) };
  const hash = new CryptoHasher('sha256');
  for (const path of [only, ...rest].sort()) hash.update(`${fingerprintTree(path)}\0`);
  return { state: 'present', fingerprint: hash.digest('hex') };
}

function inactiveMetadata(nativeId: string): LifecycleReadbackData['retention']['inactiveMetadata'] {
  const extra = pluginConfigExtras(nativeId);
  const keys = Object.keys(extra).sort();
  if (keys.length === 0) return { state: 'absent', fingerprint: null };
  const hash = new CryptoHasher('sha256');
  hash.update(JSON.stringify(Object.fromEntries(keys.map((key) => [key, extra[key]]))));
  return { state: 'present', fingerprint: hash.digest('hex') };
}

function pluginConfigExtras(nativeId: string): Record<string, unknown> {
  const entry = table(table(readConfigDocument()?.['plugins'])?.[nativeId]);
  if (entry === null) return {};
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'enabled') continue;
    extra[key] = value;
  }
  return extra;
}

function cacheDestination(nativeId: string, version: string): string {
  const marketplace = marketplaceOf(nativeId);
  if (marketplace === null) throw new Error(`codex native id has no marketplace: ${nativeId}`);
  const name = nativeId.slice(0, nativeId.indexOf('@'));
  return join(codexHome(), 'plugins', 'cache', marketplace, name, version);
}

function cacheFingerprint(nativeId: string): string | null {
  const path = codex.listInstalled().find((plugin) => plugin.id === nativeId)?.path;
  if (path === undefined || !existsSync(path)) return null;
  try {
    return fingerprintTree(path);
  } catch {
    return null;
  }
}

function fingerprintAffected(nativeIds: readonly string[]): Map<string, string | null> {
  return new Map(nativeIds.map((nativeId) => [nativeId, cacheFingerprint(nativeId)]));
}

function codexCommandEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env['CODEX_HOME'] = codexHome();
  return env;
}

function decodeBytes(bytes: Uint8Array): string {
  return [...bytes].map((byte) => String.fromCharCode(byte)).join('');
}

function parseUpgradeJson(stdout: string): { readonly errors: readonly { readonly marketplaceName: string; readonly message: string }[] } | null {
  try {
    const value: unknown = JSON.parse(stdout);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record['errors']) || !Array.isArray(record['selectedMarketplaces'])) return null;
    const errors: { marketplaceName: string; message: string }[] = [];
    for (const item of record['errors']) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
      const error = item as Record<string, unknown>;
      if (typeof error['marketplaceName'] !== 'string' || typeof error['message'] !== 'string') return null;
      errors.push({ marketplaceName: error['marketplaceName'], message: error['message'] });
    }
    if (record['selectedMarketplaces'].some((name) => typeof name !== 'string')) return null;
    return { errors };
  } catch {
    return null;
  }
}

function codexRollbackReference(attemptId: string, operationId: string): string {
  const reference = `codex:${attemptId}:${operationId}`;
  const bundle = rollbackBundle(attemptId, operationId);
  const capture = join(bundle, 'native-cache.json');
  if (!existsSync(capture)) return reference;
  const digest = new CryptoHasher('sha256').update(readFileSync(capture, 'utf8')).update('\0')
    .update(readFileSync(join(bundle, 'manifest.json'), 'utf8')).digest('hex');
  return `${reference}:native-cache-sha256:${digest}`;
}

function rollbackBundle(attemptId: string, operationId: string): string {
  return resolve(join(codexHome(), '.plgnz-rollback', attemptId, operationId));
}

/** Complete physical cache proof, including modes; Source fingerprints stay portable. */
function nativeCacheFingerprint(root: string, ignoreOwnership = false): string {
  const hash = new CryptoHasher('sha256');
  const read = readFileSync as unknown as (file: string) => Uint8Array;
  const walk = (path: string, relative: string): void => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Codex native cache contains an unsafe resource: ${path}`);
    hash.update(`${stat.isDirectory() ? 'd' : 'f'}\0${relative}\0${stat.mode & 0o7777}\0`);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).sort()) {
        if (ignoreOwnership && relative === '' && entry === OWNERSHIP) {
          const marker = lstatSync(join(path, entry));
          if (marker.isSymbolicLink() || !marker.isFile()) throw new Error('Codex attempted cache ownership marker is unsafe');
          continue;
        }
        walk(join(path, entry), relative === '' ? entry : `${relative}/${entry}`);
      }
    } else hash.update(new CryptoHasher('sha256').update(read(path)).digest('hex'));
  };
  walk(root, '');
  return hash.digest('hex');
}

function nativeSlotIsOwned(installation: TargetInstallationData, source: string): boolean {
  if (installation.ownership.kind !== 'owned' || installation.presence !== 'present' || installation.contentRoots.length !== 1) return false;
  const packageName = installation.packageName;
  if (packageName === null) return false;
  const slot = pluginSlot(installation.nativeId);
  const active = installation.contentRoots[0]!;
  if (slot === null || dirname(active.path) !== slot || fingerprintTree(active.path) !== installation.installedFingerprint) return false;
  assertManagedPath(codexHome(), slot);
  const owner = readOwnership(active.path);
  if (owner?.pluginId !== installation.nativeId || owner.source !== source
    || (owner.scopeId !== undefined && owner.scopeId !== installation.ownership.scopeId)) return false;
  const activeProof = nativeCacheFingerprint(active.path);
  // Inventory has no historical Source authority. An inactive copy is proven
  // only when its complete bytes, modes and marker match the observed active
  // Source; older revisions and unknown metadata require Managed preservation.
  return readdirSync(slot).every(version => {
    const path = join(slot, version);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error('Codex native cache slot is redirected');
    if (!validVersionSegment(version) || !stat.isDirectory()) return false;
    try { validateCachedIdentity(path, packageName, version); }
    catch { return false; }
    return nativeCacheFingerprint(path) === activeProof;
  });
}

interface NativeCacheSnapshot {
  readonly nativeId: string;
  readonly path: string;
  readonly saved: string;
  readonly fingerprint: string;
  readonly parentIdentity: string;
  readonly parentMode: number;
}

function nativeCacheParentIdentity(path: string): string {
  const stat = statSync(dirname(path)) as ReturnType<typeof statSync> & { dev: number; ino: number };
  return `${stat.dev}:${stat.ino}`;
}

function assertNativeCacheParent(slot: NativeCacheSnapshot): void {
  assertManagedPath(codexHome(), dirname(slot.path));
  if (nativeCacheParentIdentity(slot.path) !== slot.parentIdentity || (statSync(dirname(slot.path)).mode & 0o7777) !== slot.parentMode) {
    throw new Error('Codex native cache parent changed outside the captured attempt');
  }
}

function captureNativeCacheSnapshots(projection: PinsAppliedProjection): void {
  const bundle = rollbackBundle(projection.attemptId, projection.operationId);
  const source = projection.snapshot.nativeGit?.locator;
  const installations = codex.listInstalled().map(installationRecord);
  const slots = projection.affectedNativeIds.map((nativeId, index): NativeCacheSnapshot => {
    const installed = installations.find(row => row.nativeId === nativeId);
    if (installed === undefined || source === undefined || !nativeSlotIsOwned(installed, source)) throw new Error('Codex complete native cache ownership changed before capture');
    const path = pluginSlot(nativeId)!;
    const fingerprint = nativeCacheFingerprint(path);
    const saved = String(index);
    const snapshot = join(bundle, 'native-cache', saved);
    const parentIdentity = nativeCacheParentIdentity(path);
    const parentMode = statSync(dirname(path)).mode & 0o7777;
    cpSync(path, snapshot, { recursive: true });
    // Recursive copy may create missing destination parents with the default mode.
    chmodSync(snapshot, statSync(path).mode & 0o7777);
    if (nativeCacheFingerprint(snapshot) !== fingerprint || nativeCacheFingerprint(path) !== fingerprint) throw new Error('Codex complete native cache changed during capture');
    const slot = { nativeId, path, saved, fingerprint, parentIdentity, parentMode };
    assertNativeCacheParent(slot);
    return slot;
  });
  writeFileSync(join(bundle, 'native-cache.json'), JSON.stringify(slots));
}

function readNativeCacheSnapshots(handle: DurableLifecycleOperation): readonly NativeCacheSnapshot[] {
  const file = join(rollbackBundle(handle.attemptId, handle.operationId), 'native-cache.json');
  if (!existsSync(file)) throw new Error('Codex complete native cache rollback capture is missing');
  if (handle.rollbackReference !== codexRollbackReference(handle.attemptId, handle.operationId)) throw new Error('Codex complete native cache authority differs from its sealed rollback reference');
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(value) || value.length !== handle.affectedNativeIds.length) throw new Error('Codex complete native cache rollback capture is invalid');
  return value.map((entry: unknown, index: number) => {
    const row = table(entry);
    const nativeId = handle.affectedNativeIds[index]!;
    if (row === null || row['nativeId'] !== nativeId || row['path'] !== pluginSlot(nativeId) || row['saved'] !== String(index)
      || typeof row['fingerprint'] !== 'string' || !/^[0-9a-f]{64}$/u.test(row['fingerprint'])
      || typeof row['parentIdentity'] !== 'string' || !/^\d+:\d+$/u.test(row['parentIdentity'])
      || typeof row['parentMode'] !== 'number' || !Number.isInteger(row['parentMode']) || row['parentMode'] < 0 || row['parentMode'] > 0o7777) throw new Error('Codex complete native cache rollback identity is invalid');
    return { nativeId, path: row['path'] as string, saved: String(index), fingerprint: row['fingerprint'], parentIdentity: row['parentIdentity'], parentMode: row['parentMode'] };
  });
}

function restoreNativeCacheSnapshots(handle: DurableLifecycleOperation, slots: readonly (NativeCacheSnapshot & { readonly currentFingerprint: string })[]): void {
  const bundle = rollbackBundle(handle.attemptId, handle.operationId);
  for (const slot of slots) {
    assertNativeCacheParent(slot);
    if (nativeCacheFingerprint(slot.path) !== slot.currentFingerprint) throw new Error('Codex complete native cache changed before restore');
    const saved = join(bundle, 'native-cache', slot.saved);
    const scratch = mkdtempSync(join(dirname(slot.path), '.plgnz-cache-restore-'));
    try {
      cpSync(saved, scratch, { recursive: true });
      chmodSync(scratch, statSync(saved).mode & 0o7777);
      if (nativeCacheFingerprint(scratch) !== slot.fingerprint) throw new Error('Codex complete native cache restore staging drifted');
      activate(scratch, slot.path, dirname(slot.path)).commit();
      if (nativeCacheFingerprint(slot.path) !== slot.fingerprint) throw new Error('Codex complete native cache rollback did not verify');
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  }
}

function saveCodexRollback(attemptId: string, operationId: string, nativeIds: readonly string[]): void {
  const bundle = rollbackBundle(attemptId, operationId);
  assertManagedPath(codexHome(), bundle);
  rmSync(bundle, { recursive: true, force: true });
  mkdirSync(bundle, { recursive: true });
  const toml = existsSync(configFile()) ? readFileSync(configFile(), 'utf8') : '';
  const tables = nativeIds.map((nativeId) => ({ nativeId, block: extractPluginTable(toml, nativeId) }));
  const installs = nativeIds.map((nativeId, index) => {
    const slot = pluginSlot(nativeId);
    const versions = slot === null ? [] : slotVersions(slot);
    const cachePath = codex.listInstalled().find((plugin) => plugin.id === nativeId)?.path;
    if (cachePath === undefined) return { nativeId, existed: false as const, slot, versions };
    const saved = String(index);
    cpSync(cachePath, join(bundle, 'cache', saved), { recursive: true });
    return { nativeId, existed: true as const, cachePath, saved, slot, versions };
  });
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify({ tables, installs }));
}

function restoreCodexRollback(handle: DurableLifecycleOperation): MutationResultData {
  const bundle = rollbackBundle(handle.attemptId, handle.operationId);
  const manifestPath = join(bundle, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`codex lifecycle rollback bundle is missing: ${handle.operationId}`);
  const manifest = parseRollbackManifest(readFileSync(manifestPath, 'utf8'));
  assertMarketplaceRollbackCurrent(handle);
  const nativeSlots = handle.route === 'native' ? assertNativeRollbackSurfaces(handle, manifest, bundle) : null;
  const before = rollbackSurface(manifest.installs.map((install) => install.nativeId));
  restorePluginTables(manifest.tables);
  if (nativeSlots !== null) restoreNativeCacheSnapshots(handle, nativeSlots);
  else for (const install of manifest.installs) {
    if (!install.existed) {
      const current = codex.listInstalled().find((plugin) => plugin.id === install.nativeId)?.path;
      if (current !== undefined) {
        assertManagedPath(codexHome(), current);
        rmSync(current, { recursive: true, force: true });
      }
    } else {
      assertManagedPath(codexHome(), install.cachePath);
      rmSync(install.cachePath, { recursive: true, force: true });
      mkdirSync(dirname(install.cachePath), { recursive: true });
      cpSync(join(bundle, 'cache', install.saved), install.cachePath, { recursive: true });
    }
    removeUnsnapshotVersions(install.slot, install.versions);
  }
  restoreMarketplaceRollback(handle);
  const after = rollbackSurface(manifest.installs.map((install) => install.nativeId));
  return { receiptId: `rollback:${handle.attemptId}:${handle.operationId}`, changed: before !== after };
}

function marketplaceCheckout(marketplace: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(marketplace)) throw new Error('unsafe Codex marketplace identity');
  const path = resolve(join(codexHome(), '.tmp', 'marketplaces', marketplace));
  assertManagedPath(codexHome(), path);
  return path;
}

function assertNativeRollbackSurfaces(handle: DurableLifecycleOperation, manifest: ReturnType<typeof parseRollbackManifest>, bundle: string): readonly (NativeCacheSnapshot & { readonly currentFingerprint: string })[] {
  const config = existsSync(configFile()) ? readFileSync(configFile(), 'utf8') : '';
  for (const table of manifest.tables) {
    if (extractPluginTable(config, table.nativeId) !== table.block) throw new Error('Codex affected plugin config changed outside the captured native attempt; refusing rollback before any restore write');
  }
  const projections = handle.affectedOperationIds.map(id => join(codexHome(), '.plgnz-lifecycle', `${handle.attemptId}:${id}`));
  return readNativeCacheSnapshots(handle).map(slot => {
    assertNativeCacheParent(slot);
    assertManagedPath(codexHome(), slot.path);
    const saved = join(bundle, 'native-cache', slot.saved);
    if (nativeCacheFingerprint(saved) !== slot.fingerprint) throw new Error('Codex retained complete cache rollback bytes or modes drifted');
    const currentFingerprint = nativeCacheFingerprint(slot.path);
    if (currentFingerprint === slot.fingerprint) return { ...slot, currentFingerprint };
    const projected = projections.find(path => existsSync(path) && readOwnership(path)?.pluginId === slot.nativeId);
    let containsCandidate = false;
    for (const version of readdirSync(slot.path)) {
      const path = join(slot.path, version);
      if (!validVersionSegment(version) || !lstatSync(path).isDirectory()) throw new Error('Codex complete cache contains an unproven resource; refusing rollback before any restore write');
      const priorVersion = join(saved, version);
      if (existsSync(priorVersion) && nativeCacheFingerprint(path) === nativeCacheFingerprint(priorVersion)) continue;
      if (projected === undefined || version !== pluginVersion(projected)
        || (readOwnership(path) === null
          ? nativeCacheFingerprint(path, true) !== nativeCacheFingerprint(projected, true)
          : nativeCacheFingerprint(path) !== nativeCacheFingerprint(projected))) {
        throw new Error('Codex complete cache changed outside the captured native attempt; refusing rollback before any restore write');
      }
      containsCandidate = true;
    }
    // Released Codex only discards old versions as part of installing the exact
    // candidate. A missing prior or changed slot mode alone is not our write.
    if (!containsCandidate || projected === undefined
      || ![statSync(saved).mode & 0o7777, statSync(projected).mode & 0o7777].includes(statSync(slot.path).mode & 0o7777)) {
      throw new Error('Codex complete cache has no proven attempted replacement; refusing rollback before any restore write');
    }
    return { ...slot, currentFingerprint };
  });
}

function captureMarketplaceRollback(projection: PinsAppliedProjection): void {
  const marketplace = marketplaceOf(projection.nativeId);
  if (marketplace === null) throw new Error('native Codex mutation has no bounded marketplace');
  const checkout = marketplaceCheckout(marketplace);
  const bundle = rollbackBundle(projection.attemptId, projection.operationId);
  const fingerprint = existsSync(checkout) ? fingerprintTree(checkout) : null;
  if (fingerprint !== null) {
    const snapshot = join(bundle, 'marketplace');
    cpSync(checkout, snapshot, { recursive: true });
    if (fingerprintTree(snapshot) !== fingerprint || fingerprintTree(checkout) !== fingerprint) throw new Error('Codex marketplace checkout changed during rollback capture');
  }
  writeFileSync(join(bundle, 'marketplace.json'), JSON.stringify({ marketplace, fingerprint, sourceFingerprint: projection.snapshot.snapshotFingerprint }));
}

/** Capture only a clean checkout of the exact immutable Source consumed by this call. */
function captureAttemptedMarketplace(handle: DurableLifecycleOperation): void {
  const metadata = join(rollbackBundle(handle.attemptId, handle.operationId), 'marketplace.json');
  if (!existsSync(metadata)) return;
  const marketplace = marketplaceOf(handle.nativeId);
  if (marketplace === null || handle.sourceLocator === null) return;
  const checkout = marketplaceCheckout(marketplace);
  if (!existsSync(checkout)) return;
  const capture = JSON.parse(readFileSync(metadata, 'utf8')) as Record<string, unknown>;
  if (typeof capture['sourceFingerprint'] !== 'string' || !/^[0-9a-f]{64}$/u.test(capture['sourceFingerprint'])) throw new Error('invalid Codex captured Source fingerprint');
  const git = (args: readonly string[]): string | null => {
    const result = spawnSync(['git', '-C', checkout, ...args]);
    return result.exitCode === 0 ? decodeBytes(result.stdout).trim() : null;
  };
  if (git(['rev-parse', 'HEAD']) !== handle.sourceRevision
    || git(['config', '--get', 'remote.origin.url']) !== handle.sourceLocator
    || codexMarketplaceSourceFingerprint(checkout, { locator: handle.sourceLocator, revision: handle.sourceRevision }) !== capture['sourceFingerprint']) return;
  writeFileSync(metadata, JSON.stringify({ ...capture, attemptedFingerprint: fingerprintTree(checkout) }));
}

/** Validate before any cache/config restoration, never overwrite a later foreign checkout. */
function assertMarketplaceRollbackCurrent(handle: DurableLifecycleOperation): void {
  const metadata = join(rollbackBundle(handle.attemptId, handle.operationId), 'marketplace.json');
  if (!existsSync(metadata)) return;
  const row = JSON.parse(readFileSync(metadata, 'utf8')) as Record<string, unknown>;
  const marketplace = marketplaceOf(handle.nativeId);
  if (marketplace === null || row['marketplace'] !== marketplace
    || (row['fingerprint'] !== null && (typeof row['fingerprint'] !== 'string' || !/^[0-9a-f]{64}$/u.test(row['fingerprint'])))
    || (row['attemptedFingerprint'] !== undefined && (typeof row['attemptedFingerprint'] !== 'string' || !/^[0-9a-f]{64}$/u.test(row['attemptedFingerprint'])))) throw new Error('invalid Codex marketplace rollback capture');
  const checkout = marketplaceCheckout(marketplace);
  const current = existsSync(checkout) ? fingerprintTree(checkout) : null;
  if (current !== row['fingerprint'] && current !== row['attemptedFingerprint']) {
    throw new Error('Codex marketplace checkout changed outside the captured native attempt; refusing rollback before any restore write');
  }
  if (row['fingerprint'] !== null && fingerprintTree(join(rollbackBundle(handle.attemptId, handle.operationId), 'marketplace')) !== row['fingerprint']) {
    throw new Error('Codex retained marketplace rollback bytes drifted');
  }
}

function restoreMarketplaceRollback(handle: DurableLifecycleOperation): void {
  const bundle = rollbackBundle(handle.attemptId, handle.operationId);
  const metadata = join(bundle, 'marketplace.json');
  if (!existsSync(metadata)) return;
  const capture: unknown = JSON.parse(readFileSync(metadata, 'utf8'));
  if (typeof capture !== 'object' || capture === null || Array.isArray(capture)) throw new Error('invalid Codex marketplace rollback capture');
  const row = capture as Record<string, unknown>;
  const marketplace = marketplaceOf(handle.nativeId);
  if (row['marketplace'] !== marketplace || marketplace === null
    || (row['fingerprint'] !== null && (typeof row['fingerprint'] !== 'string' || !/^[0-9a-f]{64}$/u.test(row['fingerprint'])))) throw new Error('invalid Codex marketplace rollback identity');
  const checkout = marketplaceCheckout(marketplace);
  if (row['fingerprint'] === null) {
    if (existsSync(checkout)) rmSync(checkout, { recursive: true });
    return;
  }
  const snapshot = join(bundle, 'marketplace');
  if (fingerprintTree(snapshot) !== row['fingerprint']) throw new Error('Codex retained marketplace rollback bytes drifted');
  const parent = dirname(checkout);
  mkdirSync(parent, { recursive: true });
  const scratch = mkdtempSync(join(parent, '.plgnz-marketplace-restore-'));
  try {
    cpSync(snapshot, scratch, { recursive: true });
    // cpSync into an existing mkdtemp directory retains its 0700 root mode.
    chmodSync(scratch, statSync(snapshot).mode & 0o777);
    if (fingerprintTree(scratch) !== row['fingerprint']) throw new Error('Codex marketplace restore staging drifted');
    activate(scratch, checkout, parent).commit();
    if (fingerprintTree(checkout) !== row['fingerprint']) throw new Error('Codex marketplace rollback did not verify');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

function pluginSlot(nativeId: string): string | null {
  const marketplace = marketplaceOf(nativeId);
  if (marketplace === null) return null;
  const name = nativeId.slice(0, nativeId.indexOf('@'));
  if (name.length === 0) return null;
  return join(codexHome(), 'plugins', 'cache', marketplace, name);
}

function slotVersions(slot: string): string[] {
  if (!existsSync(slot)) return [];
  return readdirSync(slot).filter((version) => {
    try {
      return lstatSync(join(slot, version)).isDirectory();
    } catch {
      return false;
    }
  }).sort();
}

function removeUnsnapshotVersions(slot: string | null, versions: readonly string[]): void {
  if (slot === null || !existsSync(slot)) return;
  assertManagedPath(codexHome(), slot);
  const kept = new Set(versions);
  for (const version of slotVersions(slot)) {
    if (kept.has(version)) continue;
    const dir = join(slot, version);
    assertManagedPath(codexHome(), dir);
    rmSync(dir, { recursive: true, force: true });
  }
}

function rollbackSurface(nativeIds: readonly string[]): string {
  const config = existsSync(configFile()) ? readFileSync(configFile(), 'utf8') : 'absent';
  const slots = nativeIds.map((nativeId) => {
    const slot = pluginSlot(nativeId);
    if (slot === null || !existsSync(slot)) return `${nativeId}:`;
    return `${nativeId}:${slotVersions(slot).map((version) => {
      const path = join(slot, version);
      try {
        return `${version}=${fingerprintTree(path)}`;
      } catch {
        return `${version}=unreadable`;
      }
    }).join(',')}`;
  }).join('\n');
  return `${config}\n${slots}`;
}

function pluginTableHeader(id: string): string {
  return `[plugins."${id}"]`;
}

function extractPluginTable(toml: string, id: string): string | null {
  const header = pluginTableHeader(id);
  const idx = toml.indexOf(header);
  if (idx === -1) return null;
  const next = toml.indexOf('\n[', idx + header.length);
  const end = next === -1 ? toml.length : next;
  return toml.slice(idx, end).trim();
}

function restorePluginTables(tables: readonly { readonly nativeId: string; readonly block: string | null }[]): void {
  const configPath = configFile();
  const current = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  let next = current;
  for (const table of tables) next = applyPluginTable(next, table.nativeId, table.block);
  if (next === current) return;
  if (next.trim() === '') {
    rmSync(configPath, { force: true });
    return;
  }
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, next.endsWith('\n') ? next : `${next}\n`);
}

function applyPluginTable(toml: string, id: string, block: string | null): string {
  if (extractPluginTable(toml, id) === block) return toml;
  const header = pluginTableHeader(id);
  const idx = toml.indexOf(header);
  let removed = toml;
  if (idx !== -1) {
    const next = toml.indexOf('\n[', idx + header.length);
    const end = next === -1 ? toml.length : next;
    removed = toml.slice(0, idx) + toml.slice(end);
  }
  if (block === null) return removed;
  const base = removed.replace(/\s+$/u, '');
  return base.length === 0 ? `${block}\n` : `${base}\n\n${block}\n`;
}

function parseRollbackManifest(text: string): {
  readonly tables: readonly { readonly nativeId: string; readonly block: string | null }[];
  readonly installs: readonly (
    | { readonly nativeId: string; readonly existed: false; readonly slot: string | null; readonly versions: readonly string[] }
    | { readonly nativeId: string; readonly existed: true; readonly cachePath: string; readonly saved: string; readonly slot: string | null; readonly versions: readonly string[] }
  )[];
} {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('codex rollback manifest is invalid');
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record['tables']) || !Array.isArray(record['installs'])) throw new Error('codex rollback manifest is invalid');
  const tables = record['tables'].map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('codex rollback manifest table is invalid');
    const table = item as Record<string, unknown>;
    if (typeof table['nativeId'] !== 'string' || (table['block'] !== null && typeof table['block'] !== 'string')) {
      throw new Error('codex rollback manifest table is invalid');
    }
    return { nativeId: table['nativeId'], block: table['block'] };
  });
  const installs = record['installs'].map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error('codex rollback manifest install is invalid');
    const install = item as Record<string, unknown>;
    if (typeof install['nativeId'] !== 'string' || typeof install['existed'] !== 'boolean') throw new Error('codex rollback manifest install is invalid');
    const slot = parseRollbackSlot(install['slot']);
    const versions = parseRollbackVersions(install['versions']);
    if (!install['existed']) return { nativeId: install['nativeId'], existed: false as const, slot, versions };
    if (typeof install['cachePath'] !== 'string' || typeof install['saved'] !== 'string') throw new Error('codex rollback manifest install is invalid');
    return { nativeId: install['nativeId'], existed: true as const, cachePath: install['cachePath'], saved: install['saved'], slot, versions };
  });
  return { tables, installs };
}

function parseRollbackSlot(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) throw new Error('codex rollback manifest install is invalid');
  return value;
}

function parseRollbackVersions(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error('codex rollback manifest install is invalid');
  return value;
}

function installationRecord(plugin: InstalledPlugin): TargetInstallationData {
  const owned = plugin.path === undefined ? null : readOwnership(plugin.path);
  const ownership = owned?.pluginId === plugin.id
    ? { kind: 'owned' as const, proof: 'created' as const, scopeId: owned.scopeId ?? `codex:${plugin.id}`, proofId: `marker:${plugin.id}` }
    : { kind: 'unmanaged' as const };
  if (plugin.path === undefined) {
    return {
      nativeId: plugin.id,
      packageName: plugin.name,
      ownership,
      presence: 'absent',
      enablement: plugin.enabled ? 'enabled' : 'disabled',
      activation: 'inactive',
      installedFingerprint: null,
      installedVersion: plugin.version ?? null,
      source: null,
      contentRoots: [],
    };
  }
  const installedFingerprint = fingerprintTree(plugin.path);
  return {
    nativeId: plugin.id,
    packageName: plugin.name,
    ownership,
    presence: 'present',
    enablement: plugin.enabled ? 'enabled' : 'disabled',
    activation: plugin.enabled ? 'active' : 'inactive',
    installedFingerprint,
    installedVersion: plugin.version ?? null,
    ...(owned?.pluginId === plugin.id && owned.scopeId !== undefined && owned.route !== undefined ? { observedRoute: owned.route } : {}),
    source: owned?.pluginId === plugin.id && owned.sourceType !== undefined && owned.sourceRevision !== undefined
      ? { type: owned.sourceType, immutableRevision: owned.sourceRevision, locator: owned.sourceType === 'git' && owned.source !== `scope:${owned.scopeId}` ? owned.source : null } : null,
    contentRoots: [{ label: 'plugin', path: plugin.path, fingerprint: installedFingerprint }],
  };
}

function nativeProjection(request: NativeProjectionRequest): NativeProjectionData {
  if ('snapshot' in request) preflightPortableHooks(portableHookAdapter, request.snapshot.packageRoot);
  if ('snapshot' in request) {
    const installed = request.targetObservation.installations.find(row => row.nativeId === request.snapshot.nativeId);
    const destination = cacheDestination(request.snapshot.nativeId, pluginVersion(request.snapshot.packageRoot));
    assertRequestedCacheOwnership(destination, installed?.contentRoots ?? []);
    const configuredMarketplace = marketplaceOf(request.snapshot.nativeId);
    if (configuredMarketplace !== null) catalogBinding(configuredMarketplace); // Invalid config blocks Managed as well as Native.
    const proof = recordedPriorSource(request.snapshot);
    if (proof !== undefined) {
      const installed = request.targetObservation.installations.find(row => row.nativeId === request.snapshot.nativeId);
      for (const root of installed?.contentRoots ?? []) {
        const marker = readOwnership(root.path);
        if (marker === null || !historicalGitMarker(marker, proof)) throw new Error('Codex historical Git marker does not match recorded prior Source proof');
      }
      return { kind: 'requires-managed', reasonId: 'recorded-prior-origin-repair' };
    }
  }
  if (!('snapshot' in request) || request.operation !== 'update') {
    return { kind: 'requires-managed', reasonId: 'native-upgrade-update-only' };
  }
  if (request.pins.length > 0) return { kind: 'requires-managed', reasonId: 'pins-present' };
  if (existsSync(join(request.snapshot.snapshotRoot, codexMarketplaceMetadataFile))) {
    // The native checkout overwrites this root file; it cannot consume that Source exactly.
    return { kind: 'requires-managed', reasonId: 'native-reserved-source-metadata' };
  }
  const marketplace = marketplaceOf(request.snapshot.nativeId);
  if (marketplace === null) return { kind: 'requires-managed', reasonId: 'catalog-absent' };
  const binding = catalogBinding(marketplace);
  const git = request.snapshot.nativeGit;
  if (binding.kind === 'sha-bound' && git !== undefined && git.resolvedRevision === binding.sha && git.locator === binding.source) {
    const installations = request.targetObservation.installations.filter(row => marketplaceOf(row.nativeId) === marketplace);
    if (!installations.every(row => nativeSlotIsOwned(row, git.locator))) return { kind: 'requires-managed', reasonId: 'native-cache-slot-ownership-unproven' };
    if (!projectionMatchesPackage(request.snapshot.packageRoot, request.snapshot.packageName)) {
      return { kind: 'requires-managed', reasonId: 'projection-not-identity' };
    }
    const installed = request.targetObservation.installations.find(row => row.nativeId === request.snapshot.nativeId);
    const root = codex.listInstalled().find(row => row.id === request.snapshot.nativeId)?.path;
    if (installed?.source?.immutableRevision === git.resolvedRevision && root !== undefined && !sameTree(root, request.snapshot.packageRoot)) {
      // Released Codex may reuse its same-revision cache even when owned code
      // has drifted. Choose repair before mutation, never fall through on failure.
      return { kind: 'requires-managed', reasonId: 'native-same-revision-cache-drift' };
    }
    return { kind: 'equivalent', proofId: `codex-marketplace:${binding.marketplace}:${binding.sha}` };
  }
  return { kind: 'requires-managed', reasonId: catalogRefusal(binding, git) };
}

function assertRequestedCacheOwnership(destination: string, observedRoots: readonly { readonly path: string }[]): void {
  assertManagedPath(codexHome(), destination);
  if (existsSync(destination) && !observedRoots.some(root => root.path === destination)) {
    throw new Error('Codex inactive requested version has no captured active ownership; refusing to replace it');
  }
  const slot = dirname(destination);
  if (!existsSync(slot)) return;
  const requested = destination.slice(slot.length + 1);
  for (const version of readdirSync(slot)) {
    const path = join(slot, version);
    if (lstatSync(path).isDirectory() && wins(version, requested) && !observedRoots.some(root => root.path === path)) {
      throw new Error(`Codex inactive cache version ${version} has no captured retirement authority and would remain active over ${requested}`);
    }
  }
}

function historicalGitMarker(marker: CodexOwnership, proof: Readonly<PriorSourceProof>): boolean {
  return marker.source === `scope:${proof.scopeId}` && marker.scopeId === proof.scopeId && marker.pluginId === proof.nativeId
    && marker.fingerprint === proof.sourceFingerprint && marker.sourceType === 'git' && marker.sourceRevision === proof.revision && marker.route === proof.route;
}

function catalogBinding(marketplace: string): CodexCatalogBinding {
  const config = readConfigDocument();
  const entry = table(table(config?.['marketplaces'])?.[marketplace]);
  if (entry === null) return { kind: 'absent', marketplace };
  // Native rollback proves the complete frozen Source, not a sparse checkout.
  const sparsePaths = entry['sparse_paths'];
  if (sparsePaths !== undefined) {
    if (!Array.isArray(sparsePaths) || sparsePaths.some(path => typeof path !== 'string')) throw new Error('invalid Codex marketplace sparse_paths: expected an array of strings');
    if (sparsePaths.length !== 0) return { kind: 'unbound', marketplace };
  }
  const ref = entry['source_type'] === 'git' && typeof entry['ref'] === 'string' ? entry['ref'] : null;
  const source = typeof entry['source'] === 'string' ? entry['source'] : null;
  const sha = ref?.toLowerCase() ?? '';
  if (source !== null && /^[0-9a-f]{40}$/u.test(sha)) return { kind: 'sha-bound', marketplace, sha, source };
  return { kind: 'unbound', marketplace };
}

function catalogRefusal(
  binding: CodexCatalogBinding,
  git: { readonly resolvedRevision: string; readonly locator: string } | undefined,
): string {
  switch (binding.kind) {
    case 'absent':
      return 'catalog-absent';
    case 'unbound':
      return 'catalog-unbound';
    case 'sha-bound':
      if (git === undefined || git.resolvedRevision !== binding.sha) return 'catalog-sha-mismatch';
      return 'catalog-source-mismatch';
    default: {
      const unreachable: never = binding;
      throw new Error(`unreachable Codex catalog binding: ${String(unreachable)}`);
    }
  }
}

function marketplaceOf(nativeId: string): string | null {
  const at = nativeId.indexOf('@');
  if (at <= 0 || at === nativeId.length - 1) return null;
  return nativeId.slice(at + 1);
}

function readConfigDocument(): Record<string, unknown> | null {
  if (!existsSync(configFile())) return null;
  try {
    const parsed: unknown = parseToml(readFileSync(configFile(), 'utf8'));
    return table(parsed);
  } catch {
    return null;
  }
}

function table(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function comparePrerelease(left: string, right: string): number {
  const l = left.split('.'); const r = right.split('.');
  for (let index = 0; index < Math.max(l.length, r.length); index += 1) {
    const a = l[index]; const b = r[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const an = /^\d+$/u.test(a); const bn = /^\d+$/u.test(b);
    if (an && bn) return Number(a) - Number(b);
    if (an) return -1;
    if (bn) return 1;
    return a.localeCompare(b);
  }
  return 0;
}
