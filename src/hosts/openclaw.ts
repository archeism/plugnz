/** OpenClaw Agent Plugin bundle reader. Native config discovery; no writer imports. */
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import type { LifecycleTargetIdentity, TargetVersionObservation } from '../lifecycle-host';
import { homeRoot } from '../paths';
import { isExecutableFile } from '../exec';
import { collectPluginServers, type PluginMcpCandidate } from '../mcp';
import { spawnSync, which } from '../runtime';
import { parsePersistedTargetIdentity, type PersistedTargetIdentity } from '../target-identity';
import { canonicalProfileContext, invalidTargetArgument, invalidTargetSelection, type TargetProfile } from '../target-profile';

export const OPENCLAW_MARKER = '.plgnz-install.json';
export type OpenClawOwnership = { pluginId: string; scopeId: string; sourceType: 'local' | 'git'; sourceRevision: string; sourceLocator: string | null; fingerprint: string; nativeFingerprint: string; allowWasPresent?: boolean };
export type OpenClawNativePlugin = { id: string; name?: string; version?: string; rootDir: string; source?: string; enabled: boolean; status: string; format?: string; bundleFormat?: string };
export function openclawRoot(): string { return process.env['OPEN_PLUGIN_OPENCLAW_ROOT'] ?? join(homeRoot(), '.openclaw'); }
export function openclawConfigFile(): string { return process.env['OPEN_PLUGIN_OPENCLAW_CONFIG_PATH'] ?? join(openclawRoot(), 'openclaw.json'); }
export function openclawBinary(): string | undefined { return process.env['OPEN_PLUGIN_OPENCLAW_BIN'] ?? which('openclaw') ?? undefined; }
function absolute(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || resolve(value) !== value) invalidTargetArgument(`${label} must be a canonical absolute path`);
  return value;
}
export function openclawInstanceIdentity(target: LifecycleTargetIdentity): { root: string; configPath: string } {
  if (target.kind !== 'openclaw') invalidTargetSelection('OpenClaw target kind must be openclaw');
  const context = target.context ?? (target.instance === 'default' ? { root: openclawRoot(), configPath: openclawConfigFile() } : undefined);
  if (!context) invalidTargetArgument('OpenClaw named target requires root/configPath context');
  const unknown = Object.keys(context).find(key => key !== 'root' && key !== 'configPath');
  if (unknown !== undefined) invalidTargetArgument(`OpenClaw context has unsupported field '${unknown}'`);
  return { root: absolute(context['root'], 'OpenClaw root'), configPath: absolute(context['configPath'], 'OpenClaw configPath') };
}
export const openclawTargetProfile: TargetProfile<'openclaw'> = {
  kind: 'openclaw',
  parseSyncTarget(value, label) {
    const target = parsePersistedTargetIdentity(value, label);
    const context = openclawInstanceIdentity(target);
    return { kind: 'openclaw', instance: target.instance, context: { configPath: context.configPath, root: context.root } };
  },
  parseRetirementTarget(value, label) {
    const target = parsePersistedTargetIdentity(value, label);
    if (target.kind !== 'openclaw') invalidTargetSelection(`${label} kind must be openclaw`);
    if (target.context !== undefined) invalidTargetArgument(`${label} OpenClaw retirement target must omit context`);
    return { kind: 'openclaw', instance: target.instance };
  },
  canonicalContext: canonicalProfileContext,
  physicalKey(target) { const context = openclawInstanceIdentity(target); return JSON.stringify([context.root, context.configPath]); },
  overlaps(left, right) { const a = openclawInstanceIdentity(left), b = openclawInstanceIdentity(right); return a.root === b.root || a.configPath === b.configPath; },
};
export function openclawEnvironment(target: LifecycleTargetIdentity): Record<string, string | undefined> {
  const context = openclawInstanceIdentity(target);
  return { ...process.env, HOME: homeRoot(), OPENCLAW_STATE_DIR: context.root, OPENCLAW_CONFIG_PATH: context.configPath };
}
export function runOpenClaw(target: LifecycleTargetIdentity, args: readonly string[]): string {
  const binary = openclawBinary();
  if (!binary || !existsSync(binary)) throw new Error('OpenClaw native CLI is unavailable');
  const result = spawnSync([binary, ...args], { env: openclawEnvironment(target), timeout: 60_000 });
  if (result.exitCode !== 0) throw new Error(`OpenClaw ${args[0]} failed (${result.exitCode}): ${new TextDecoder().decode(result.stderr).trim()}`);
  return new TextDecoder().decode(result.stdout);
}
export function probeOpenClawVersion(target: LifecycleTargetIdentity): TargetVersionObservation {
  try {
    const output = runOpenClaw(target, ['--version']).trim();
    const match = /^OpenClaw (\d+\.\d+\.\d+) \(([a-f0-9]+)\)$/u.exec(output);
    return match ? { kind: 'detected', version: match[1]!, probeId: `openclaw:${match[1]}:${match[2]}` } : { kind: 'unparseable' };
  } catch { return { kind: 'unknown' }; }
}
export function nativeOpenClawPlugins(target: LifecycleTargetIdentity): OpenClawNativePlugin[] {
  const value: unknown = JSON.parse(runOpenClaw(target, ['plugins', 'list', '--json']));
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>).plugins)) throw new Error('Invalid OpenClaw native plugin inventory');
  return ((value as { plugins: unknown[] }).plugins).map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid OpenClaw native plugin row');
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.rootDir !== 'string' || !isAbsolute(row.rootDir) || typeof row.enabled !== 'boolean' || typeof row.status !== 'string') throw new Error('Incomplete OpenClaw native plugin row');
    return row as OpenClawNativePlugin;
  });
}
export function readOpenClawOwnership(root: string): OpenClawOwnership | null {
  const file = join(root, OPENCLAW_MARKER);
  if (!existsSync(file)) return null;
  if (!lstatSync(file).isFile()) throw new Error('OpenClaw ownership marker must be a regular file');
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid OpenClaw ownership marker');
  const row = value as Record<string, unknown>;
  if (typeof row.pluginId !== 'string' || typeof row.scopeId !== 'string' || typeof row.sourceRevision !== 'string' || typeof row.fingerprint !== 'string' || typeof row.nativeFingerprint !== 'string' || (row.sourceType !== 'local' && row.sourceType !== 'git') || (row.sourceLocator !== null && typeof row.sourceLocator !== 'string')) throw new Error('Invalid OpenClaw ownership identity');
  return row as OpenClawOwnership;
}
export function openclawMcpCandidates(): PluginMcpCandidate[] { return [{ kind: 'spec', file: 'mcp.json' }]; }
export function listOpenClawInstance(target: LifecycleTargetIdentity): InstalledPlugin[] {
  return nativeOpenClawPlugins(target).map(row => ({ id: row.id, name: row.id, path: row.rootDir, enabled: row.enabled && row.status === 'loaded', ...(row.version ? { version: row.version } : {}) }));
}
export const openclaw: HostReader = {
  id: 'openclaw', gui: false,
  detect: () => isExecutableFile(openclawBinary() ?? '') || existsSync(openclawRoot()),
  detectInstalled: () => isExecutableFile(openclawBinary() ?? ''),
  stores: () => [join(openclawRoot(), 'extensions'), join(openclawRoot(), '.plgnz', 'bundles')],
  listInstalled: () => listOpenClawInstance({ kind: 'openclaw', instance: 'default' }),
  mcpEntries(): McpServerEntry[] { return this.listInstalled().flatMap(plugin => plugin.path === undefined || plugin.enabled === false ? [] : collectPluginServers(plugin.id, plugin.path, openclawMcpCandidates())); },
};
