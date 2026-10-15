/**
 * cursor host reader.
 *
 * Reader only — the writer (add/pin/remove) lives in
 * src/hosts/cursor-writer.ts so loading a reader never evaluates writer code
 * (AGENTS.md: doctor is read-only by construction).
 *
 * Real store layout (measured 2026-09-16, evidence in docs/hosts/cursor.md):
 *   ~/.cursor/mcp.json                      — user-level {mcpServers:{…}}
 *   ~/.cursor/plugins/local/<name>/         — dereferenced plugin copies (the route
 *                                              `npx plugins --target cursor` does NOT take;
 *                                              house evidence: install rejected)
 *   ~/.cursor/plugins/{cache,marketplaces}/ — cursor-native dirs, observed but not read in v0
 *
 * Plugin MCP is declared in `.mcp.json` (and a spec `mcp.json` copy) at the
 * plugin root. Cursor is a GUI host: `launchctl getenv PATH` is unset, so bare
 * commands cannot be assumed to resolve (spec §7.2.1) — doctor flags them and
 * `pin` rewrites them to absolute paths; `add` pins a fresh copy the same way.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { isExecutableFile } from '../exec';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { cursorRoot, homeRoot } from '../paths';
import { collectPluginServers, collectUserServers, readJson, type PluginMcpCandidate } from '../mcp';
import { parsePersistedTargetIdentity, type PersistedTargetIdentity } from '../target-identity';
import { invalidTargetArgument, invalidTargetSelection, type TargetProfile } from '../target-profile';

export const cursorTargetProfile: TargetProfile<'cursor'> = {
  kind: 'cursor',
  parseSyncTarget(value, label) {
    return parseCursorTarget(value, label);
  },
  parseRetirementTarget(value, label) {
    const target = parseCursorTarget(value, label);
    return { kind: 'cursor', instance: target.instance };
  },
  canonicalContext: () => undefined,
  physicalKey: (target) => JSON.stringify([target.kind, target.instance]),
  overlaps: (left, right) => left.kind === right.kind && left.instance === right.instance,
};

function parseCursorTarget(value: unknown, label: string): PersistedTargetIdentity {
  const target = parsePersistedTargetIdentity(value, label);
  if (target.kind !== 'cursor') invalidTargetSelection(`${label} kind must be 'cursor'`);
  if (target.context !== undefined) invalidTargetArgument(`${label} cursor does not accept target context`);
  return { kind: 'cursor', instance: target.instance };
}

export function cursorInstanceRoot(instance = 'default'): string {
  if (instance === 'default') return cursorRoot();
  const configured = process.env['OPEN_PLUGIN_CURSOR_INSTANCE_ROOT'];
  if (configured === undefined || configured.length === 0) {
    throw new Error(`cursor instance '${instance}' has no configured root`);
  }
  return join(configured, instance);
}

export function localDir(instance = 'default'): string {
  return join(cursorInstanceRoot(instance), 'plugins', 'local');
}

/** Where a plugin copy may declare MCP servers, in cursor's priority order. */
export function mcpCandidates(): PluginMcpCandidate[] {
  return [
    { kind: 'spec', file: '.mcp.json' },
    { kind: 'spec', file: 'mcp.json' },
  ];
}

function userConfigFile(): string {
  return join(cursorRoot(), 'mcp.json');
}

export const cursor: HostReader = {
  id: 'cursor',
  gui: true,

  detect(): boolean {
    return locateCursorProbeBinary().kind === 'path' || existsSync(cursorRoot());
  },

  detectInstalled(): boolean {
    return locateCursorProbeBinary().kind === 'path';
  },

  stores(): string[] {
    return [localDir()];
  },

  listInstalled(): InstalledPlugin[] {
    if (!existsSync(localDir())) return [];
    const out: InstalledPlugin[] = [];
    for (const entry of readdirSync(localDir())) {
      const dir = join(localDir(), entry);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const manifest = join(dir, '.cursor-plugin', 'plugin.json');
      if (!existsSync(manifest)) continue;
      const plugin: InstalledPlugin = { id: entry, name: entry, path: dir };
      const marketplace = ownershipMarketplace(dir, entry);
      if (marketplace !== undefined) plugin.marketplace = marketplace;
      const parsed = readJson(manifest);
      const version = parsed !== null ? parsed['version'] : undefined;
      if (typeof version === 'string') plugin.version = version;
      out.push(plugin);
    }
    return out;
  },

  mcpEntries(): McpServerEntry[] {
    const entries: McpServerEntry[] = [];
    entries.push(...collectUserServers(userConfigFile(), cursorRoot()));
    for (const plugin of this.listInstalled()) {
      if (plugin.path === undefined || !existsSync(plugin.path)) continue;
      entries.push(...collectPluginServers(plugin.id, plugin.path, mcpCandidates()));
    }
    return entries;
  },
};

export function locateCursorProbeBinary():
  | { readonly kind: 'refused' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'path'; readonly path: string } {
  const override = process.env['OPEN_PLUGIN_CURSOR_BIN'];
  if (override !== undefined) {
    if (override.length === 0 || !isExecutableFile(override)) return { kind: 'refused' };
    return { kind: 'path', path: override };
  }
  const found = cursorProbeCandidates().find(isExecutableFile);
  return found === undefined ? { kind: 'absent' } : { kind: 'path', path: found };
}

export function cursorProbePath(env: Record<string, string | undefined> = process.env): string {
  const isolated = env['OPEN_PLUGIN_HOME'];
  if (isolated !== undefined && isolated.length > 0) return join(homeRoot(), 'bin');
  return env['PATH'] ?? '';
}

/** Executable installation surfaces; candidates are probes, not version claims. */
export function cursorProbeCandidates(env: Record<string, string | undefined> = process.env): string[] {
  const candidates: string[] = [];
  const pathDirs = cursorProbePath(env).split(delimiter).filter((dir) => dir.length > 0);
  for (const name of process.platform === 'win32' ? ['cursor.exe', 'cursor-agent.exe'] : ['cursor', 'cursor-agent']) {
    candidates.push(...pathDirs.map((dir) => join(dir, name)));
  }
  const isolated = env['OPEN_PLUGIN_HOME'];
  const isolatedRun = isolated !== undefined && isolated.length > 0;
  if (process.platform === 'darwin') {
    candidates.push(join(homeRoot(), 'Applications', 'Cursor.app', 'Contents', 'MacOS', 'Cursor'));
    if (!isolatedRun) candidates.push('/Applications/Cursor.app/Contents/MacOS/Cursor');
  } else if (process.platform === 'linux') {
    candidates.push(join(homeRoot(), '.local', 'bin', 'cursor'), join(homeRoot(), '.local', 'bin', 'cursor-agent'));
    if (!isolatedRun) candidates.push(
      '/usr/local/bin/cursor', '/usr/local/bin/cursor-agent',
      '/usr/bin/cursor', '/usr/bin/cursor-agent',
      '/usr/share/cursor/cursor', '/usr/lib/cursor/cursor',
      '/opt/Cursor/cursor', '/opt/cursor/cursor',
    );
  } else if (process.platform === 'win32') {
    const localAppData = env['LOCALAPPDATA'];
    const programFiles = env['ProgramFiles'];
    if (localAppData !== undefined) candidates.push(join(localAppData, 'Programs', 'cursor', 'Cursor.exe'));
    if (!isolatedRun && programFiles !== undefined) candidates.push(join(programFiles, 'Cursor', 'Cursor.exe'));
  }
  return candidates.filter((path, index, all) => all.indexOf(path) === index);
}

/** Recover a collection identity only from a valid plgnz ownership marker. */
function ownershipMarketplace(dir: string, name: string): string | undefined {
  const marker = join(dir, '.plgnz-install.json');
  if (!existsSync(marker)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(marker, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const ownership = parsed as Record<string, unknown>;
    if (typeof ownership['source'] !== 'string' || typeof ownership['fingerprint'] !== 'string' || typeof ownership['pluginId'] !== 'string') return undefined;
    const prefix = `${name}@`;
    const marketplace = ownership['pluginId'].startsWith(prefix) ? ownership['pluginId'].slice(prefix.length) : undefined;
    return marketplace !== undefined && validIdentity(marketplace) ? marketplace : undefined;
  } catch {
    return undefined;
  }
}

function validIdentity(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/iu.test(value);
}
