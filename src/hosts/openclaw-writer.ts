/** Managed publication into OpenClaw's documented native Agent Plugin bundle loader. */
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { HostWriter } from '../host';
import { createCapabilityEvidenceProfile } from '../capability-evidence';
import { PACKAGE_SEMANTICS } from '../semantic-inventory';
import { fingerprintTree } from '../fingerprint';
import { createLifecycleHostAdapter, createTargetInventoryObservation } from '../lifecycle-runtime';
import type { DurableLifecycleOperation, LifecycleHostDefinition, LifecycleReadbackData, LifecycleTargetIdentity, TargetInstallationData } from '../lifecycle-host';
import { CryptoHasher } from '../runtime';
import { OPENCLAW_MARKER, openclaw, openclawInstanceIdentity, nativeOpenClawPlugins, probeOpenClawVersion, readOpenClawOwnership, runOpenClaw, type OpenClawOwnership } from './openclaw';

const AGENT_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const TRANSITION = { requirement: 'reload', status: 'effective' } as const;
type Doc = Record<string, unknown>;
type Binding = { action?: string; target: LifecycleTargetIdentity; scopeId: string; nativeId: string; packageName: string; route?: 'managed' | 'native' };
type ConfigSlice = { entry?: unknown; pathIndex: number; allowIndex: number; hadAllow: boolean };
function object(value: unknown, label: string): Doc { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid OpenClaw ${label}`); return value as Doc; }
function hash(value: unknown): string { return new CryptoHasher('sha256').update(JSON.stringify(value)).digest('hex'); }
function id(value: string): string { if (!/^[a-z][a-z0-9-]*$/u.test(value)) throw new Error(`Unsafe OpenClaw native bundle identity: ${value}`); return value; }
function pathOf(target: LifecycleTargetIdentity, nativeId: string): string { return join(openclawInstanceIdentity(target).root, '.plgnz', 'bundles', id(nativeId)); }
function operationRoot(target: LifecycleTargetIdentity, attempt: string, operation: string): string { return join(openclawInstanceIdentity(target).root, '.plgnz', 'operations', hash([attempt, operation])); }
function safePath(root: string, path: string): void {
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('../') || resolve(root, rel) !== resolve(path)) throw new Error('OpenClaw path escapes its controlled root');
  let current = root;
  for (const component of ['', ...rel.split('/').filter(Boolean)]) {
    if (component) current = join(current, component);
    if (!existsSync(current)) continue;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && current !== path)) throw new Error(`Unsafe OpenClaw parent: ${current}`);
  }
}
function fullTreeHash(root: string, excludeMarker = false): string {
  const digest = new CryptoHasher('sha256');
  const walk = (path: string, name: string): void => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Unsafe OpenClaw custody resource: ${path}`);
    digest.update(JSON.stringify([name, stat.isDirectory() ? 'directory' : 'file', stat.mode & 0o7777]));
    if (stat.isDirectory()) for (const child of readdirSync(path).sort()) {
      if (excludeMarker && name === '' && child === OPENCLAW_MARKER) continue;
      walk(join(path, child), name ? `${name}/${child}` : child);
    }
    else digest.update(new CryptoHasher('sha256').update((readFileSync as unknown as (file: string) => Uint8Array)(path)).digest('hex'));
  };
  walk(root, ''); return digest.digest('hex');
}
/** Node cpSync may add owner-write permission to directories; restore every copied mode. */
function copyTree(source: string, destination: string): void {
  tree(source); mkdirSync(destination); cpSync(source, destination, { recursive: true });
  const restoreModes = (from: string, to: string): void => {
    const stat = lstatSync(from);
    if (stat.isDirectory()) for (const name of readdirSync(from)) restoreModes(join(from, name), join(to, name));
    chmodSync(to, stat.mode & 0o7777);
  };
  restoreModes(source, destination);
  if (fullTreeHash(source) !== fullTreeHash(destination)) throw new Error('OpenClaw copied tree failed exact byte/mode custody');
}
function writeProjected(path: string, text: string): void {
  const before = lstatSync(path).mode & 0o7777;
  try { chmodSync(path, before | 0o200); writeFileSync(path, text); } finally { chmodSync(path, before); }
}
function tree(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`OpenClaw bundle contains a symlink: ${path}`);
  if (stat.isDirectory()) for (const name of readdirSync(path)) tree(join(path, name));
  else if (!stat.isFile()) throw new Error(`OpenClaw bundle contains an unsupported resource: ${path}`);
}
function config(target: LifecycleTargetIdentity): Doc {
  const { configPath } = openclawInstanceIdentity(target);
  safePath(dirname(configPath), configPath);
  if (!existsSync(configPath)) return {};
  return object(JSON.parse(readFileSync(configPath, 'utf8')), 'config');
}
function plugins(doc: Doc): Doc { return doc.plugins === undefined ? {} : object(doc.plugins, 'plugins config'); }
function entries(doc: Doc): Doc { const p = plugins(doc); return p.entries === undefined ? {} : object(p.entries, 'plugin entries'); }
function paths(doc: Doc): string[] {
  const p = plugins(doc), load = p.load === undefined ? {} : object(p.load, 'plugin load config');
  if (load.paths === undefined) return [];
  if (!Array.isArray(load.paths) || !load.paths.every(p => typeof p === 'string')) throw new Error('Invalid OpenClaw load paths');
  return load.paths as string[];
}
function allow(doc: Doc): string[] {
  const p = plugins(doc); if (p.allow === undefined) return [];
  if (!Array.isArray(p.allow) || !p.allow.every(p => typeof p === 'string')) throw new Error('Invalid OpenClaw allow list');
  return p.allow as string[];
}
function slice(doc: Doc, target: LifecycleTargetIdentity, nativeId: string): ConfigSlice {
  return { ...(entries(doc)[nativeId] === undefined ? {} : { entry: entries(doc)[nativeId] }), pathIndex: paths(doc).indexOf(pathOf(target, nativeId)), allowIndex: allow(doc).indexOf(nativeId), hadAllow: plugins(doc).allow !== undefined };
}
function writeConfig(target: LifecycleTargetIdentity, doc: Doc): void {
  const { configPath } = openclawInstanceIdentity(target); safePath(dirname(configPath), configPath);
  mkdirSync(dirname(configPath), { recursive: true });
  const temporary = `${configPath}.plgnz-${hash([Date.now(), Math.random()]).slice(0, 16)}`;
  if (existsSync(temporary)) throw new Error('OpenClaw config temporary path already exists');
  try { (writeFileSync as unknown as (path: string, data: string, options: { mode: number }) => void)(temporary, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 }); renameSync(temporary, configPath); }
  finally { if (existsSync(temporary)) rmSync(temporary); }
}
function registration(target: LifecycleTargetIdentity, nativeId: string, enable: boolean, preserveAllow = false): void {
  const doc = config(target), p = plugins(doc), before = entries(doc), path = pathOf(target, nativeId);
  if (p.enabled === false && enable) throw new Error('OpenClaw plugins are globally disabled; refusing to change global policy');
  const entry = before[nativeId] === undefined ? {} : object(before[nativeId], 'owned plugin entry');
  if (enable) before[nativeId] = { ...entry, enabled: true };
  else {
    const { enabled: _enabled, ...retained } = entry;
    if (Object.keys(retained).length > 0) before[nativeId] = { ...retained, enabled: false };
    else delete before[nativeId];
  }
  const load = p.load === undefined ? {} : object(p.load, 'plugin load config');
  load.paths = [...paths(doc).filter(value => value !== path), ...(enable ? [path] : [])];
  if (p.allow !== undefined && !(preserveAllow && !enable)) p.allow = [...allow(doc).filter(value => value !== nativeId), ...(enable ? [nativeId] : [])];
  p.load = load; p.entries = before; doc.plugins = p;
  writeConfig(target, doc);
}
function restoreRegistration(target: LifecycleTargetIdentity, nativeId: string, saved: ConfigSlice): void {
  const doc = config(target), p = plugins(doc), current = entries(doc), path = pathOf(target, nativeId);
  if (saved.entry === undefined) delete current[nativeId]; else current[nativeId] = saved.entry;
  const restoredPaths = paths(doc).filter(value => value !== path);
  if (saved.pathIndex >= 0) restoredPaths.splice(Math.min(saved.pathIndex, restoredPaths.length), 0, path);
  const load = p.load === undefined ? {} : object(p.load, 'plugin load config'); load.paths = restoredPaths;
  if (saved.hadAllow || p.allow !== undefined) {
    const restoredAllow = allow(doc).filter(value => value !== nativeId);
    if (saved.allowIndex >= 0) restoredAllow.splice(Math.min(saved.allowIndex, restoredAllow.length), 0, nativeId);
    p.allow = restoredAllow;
  }
  p.entries = current; p.load = load; doc.plugins = p; writeConfig(target, doc);
}
function owned(target: LifecycleTargetIdentity, nativeId: string, scopeId: string): OpenClawOwnership | null {
  const path = pathOf(target, nativeId); safePath(openclawInstanceIdentity(target).root, path);
  if (!existsSync(path)) return null;
  tree(path); const marker = readOpenClawOwnership(path);
  if (!marker || marker.pluginId !== nativeId || marker.scopeId !== scopeId) throw new Error(`OpenClaw bundle ${nativeId} belongs to another owner; refusing mutation`);
  if (fullTreeHash(path, true) !== marker.nativeFingerprint) throw new Error(`OpenClaw owned bundle ${nativeId} contains edited or foreign resources`);
  return marker;
}
function compile(source: string, stage: string, nativeId: string): void {
  for (const manifest of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', 'openclaw.plugin.json']) if (existsSync(join(source, manifest))) throw new Error('OpenClaw Agent projection refuses authored competing native bundle formats');
  copyTree(source, stage);
  const file = join(stage, 'plugin.json'), manifest = object(JSON.parse(readFileSync(file, 'utf8')), 'Agent Plugin manifest');
  if (manifest.name !== nativeId || (manifest.$schema !== undefined && manifest.$schema !== AGENT_SCHEMA)) throw new Error('OpenClaw Agent Plugin manifest identity/schema mismatch');
  for (const name of ['mcpServers', 'mcp', 'commands', 'agents', 'hooks', 'permissions']) if (manifest[name] !== undefined) throw new Error(`OpenClaw native Agent bundle does not map manifest ${name}`);
  manifest.$schema = AGENT_SCHEMA; writeProjected(file, `${JSON.stringify(manifest, null, 2)}\n`);
  if (existsSync(join(stage, '.mcp.json'))) throw new Error('OpenClaw Agent bundles require root mcp.json; dot-prefixed MCP is not mapped');
  const mcp = join(stage, 'mcp.json');
  if (existsSync(mcp)) {
    const value = object(JSON.parse(readFileSync(mcp, 'utf8')), 'MCP config');
    if (Object.keys(value).some(key => key !== '$schema' && key !== 'mcpServers') || (value.$schema !== undefined && value.$schema !== MCP_SCHEMA)) throw new Error('OpenClaw requires the closed Agent Plugin MCP schema');
    const servers = object(value.mcpServers, 'MCP servers');
    for (const [name, raw] of Object.entries(servers)) {
      const server = object(raw, `MCP server ${name}`);
      if (server.type === undefined && typeof server.command === 'string') server.type = 'stdio';
      if (!['stdio', 'streamable-http', 'sse'].includes(String(server.type))) throw new Error(`OpenClaw unsupported MCP transport: ${name}`);
      if (server.type === 'stdio' && (typeof server.command !== 'string' || server.command.startsWith('/') || server.command.includes('..') || (server.command.includes('/') && !server.command.startsWith('./')))) throw new Error(`OpenClaw MCP command must be bare or plugin-relative: ${name}`);
      servers[name] = server;
    }
    value.$schema = MCP_SCHEMA; writeProjected(mcp, `${JSON.stringify(value, null, 2)}\n`);
  }
}
function nativeHealthy(target: LifecycleTargetIdentity, nativeId: string, root: string): boolean {
  const inspected = object(JSON.parse(runOpenClaw(target, ['plugins', 'inspect', nativeId, '--json'])), 'native inspection');
  const row = object(inspected.plugin, 'native inspected plugin');
  if (row.id !== nativeId || row.rootDir !== root || row.format !== 'bundle' || row.bundleFormat !== 'agent' || row.enabled !== true || row.status !== 'loaded') return false;
  if (!Array.isArray(inspected.diagnostics)) throw new Error('OpenClaw inspection omitted diagnostics');
  for (const raw of inspected.diagnostics) {
    const diagnostic = object(raw, 'native diagnostic');
    if (diagnostic.pluginId === nativeId && (diagnostic.level === 'error' || /invalid.*mcp|unsupported.*mcp|duplicate plugin id/iu.test(String(diagnostic.message)))) return false;
  }
  const mcp = join(root, 'mcp.json');
  const expected = existsSync(mcp) ? Object.keys(object(object(JSON.parse(readFileSync(mcp, 'utf8')), 'MCP config').mcpServers, 'MCP servers')).sort() : [];
  if (!Array.isArray(inspected.mcpServers)) throw new Error('OpenClaw inspection omitted MCP server coverage');
  const actual = inspected.mcpServers.map(raw => object(raw, 'native MCP server').name).sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}
function observe(target: LifecycleTargetIdentity): { target: LifecycleTargetIdentity; installations: TargetInstallationData[] } {
  const doc = config(target), rows = nativeOpenClawPlugins(target), installations: TargetInstallationData[] = [];
  for (const row of rows) {
    const marker = readOpenClawOwnership(row.rootDir);
    if (!marker) { const entry = [row.source, join(row.rootDir, 'openclaw.plugin.json'), join(row.rootDir, 'plugin.json'), join(row.rootDir, 'package.json')].find(file => typeof file === 'string' && existsSync(file) && lstatSync(file).isFile()); if (!entry) throw new Error(`OpenClaw foreign plugin ${row.id} has no readable native entry/manifest`); const digest = new CryptoHasher('sha256').update((readFileSync as unknown as (file: string) => Uint8Array)(entry)).digest('hex'); installations.push({ nativeId: row.id, packageName: row.id, ownership: { kind: 'unmanaged' }, presence: 'present', enablement: row.enabled ? 'enabled' : 'disabled', activation: row.status === 'loaded' ? 'active' : 'inactive', installedFingerprint: digest, installedVersion: row.version ?? null, source: null, contentRoots: [{ label: 'native-entry', path: entry, fingerprint: digest }] }); continue; }
    if (row.rootDir !== pathOf(target, row.id) || marker.pluginId !== row.id) throw new Error('OpenClaw ownership is redirected outside its managed slot');
    owned(target, row.id, marker.scopeId); const digest = fingerprintTree(row.rootDir), state = slice(doc, target, row.id);
    installations.push({ nativeId: row.id, packageName: row.id, ownership: { kind: 'owned', proof: 'created', scopeId: marker.scopeId, proofId: marker.fingerprint }, presence: 'present', enablement: row.enabled ? 'enabled' : 'disabled', activation: nativeHealthy(target, row.id, row.rootDir) ? 'active' : 'nonconforming', observedRoute: 'managed', installedFingerprint: digest, installedVersion: row.version ?? null, source: { type: marker.sourceType, immutableRevision: marker.sourceRevision, locator: marker.sourceLocator }, contentRoots: [{ label: 'bundle', path: row.rootDir, fingerprint: digest }, { label: 'registration', path: openclawInstanceIdentity(target).configPath, fingerprint: hash(state) }] });
  }
  return { target, installations };
}
function retained(target: LifecycleTargetIdentity, nativeId: string): LifecycleReadbackData['retention'] {
  const value = entries(config(target))[nativeId], entry = value === undefined ? {} : object(value, 'retained plugin config');
  const { enabled: _enabled, ...data } = entry;
  const dataDir = join(openclawInstanceIdentity(target).root, 'plugin-data', id(nativeId));
  safePath(openclawInstanceIdentity(target).root, dataDir);
  const pluginData = existsSync(dataDir) ? { state: 'present' as const, fingerprint: fingerprintTree(dataDir) } : { state: 'absent' as const, fingerprint: null };
  return { pluginData, inactiveMetadata: Object.keys(data).length ? { state: 'present', fingerprint: hash(data) } : { state: 'absent', fingerprint: null } };
}
function readback(binding: Binding): LifecycleReadbackData {
  const row = observe(binding.target).installations.find(item => item.nativeId === binding.nativeId);
  if (row && (row.ownership.kind !== 'owned' || row.ownership.scopeId !== binding.scopeId)) throw new Error(`OpenClaw ${binding.nativeId} native ownership is not proven`);
  const retiring = binding.action === 'remove' || binding.action === 'retire-orphan';
  return { adapterId: 'openclaw', target: binding.target, scopeId: binding.scopeId, packageName: binding.packageName, nativeId: binding.nativeId, route: row ? 'managed' : retiring ? (binding.route ?? 'managed') : 'none', presence: row ? 'present' : 'absent', enablement: row?.enablement ?? (retiring ? 'disabled' : 'not-applicable'), activation: row?.activation === 'active' ? 'active' : row ? 'unknown' : 'inactive', transition: TRANSITION, installedFingerprint: row?.installedFingerprint ?? null, contentRoots: row?.contentRoots ?? [], retention: retained(binding.target, binding.nativeId) };
}
function backup(binding: Binding, attempt: string, operation: string, staged = false): string {
  const root = operationRoot(binding.target, attempt, operation), out = join(root, 'rollback'); safePath(openclawInstanceIdentity(binding.target).root, out);
  if (staged) { if (!existsSync(root) || JSON.stringify(readdirSync(root).sort()) !== '["stage"]') throw new Error('OpenClaw refuses preexisting recovery custody'); }
  else { mkdirSync(dirname(root), { recursive: true }); mkdirSync(root); chmodSync(root, 0o700); }
  mkdirSync(out); chmodSync(out, 0o700);
  const current = pathOf(binding.target, binding.nativeId);
  if (existsSync(current)) { owned(binding.target, binding.nativeId, binding.scopeId); copyTree(current, join(out, 'bundle')); }
  writeFileSync(join(out, 'registration.json'), JSON.stringify(slice(config(binding.target), binding.target, binding.nativeId)));
  const sealed = `${out}-${fullTreeHash(out)}`; renameSync(out, sealed); return sealed;
}
function assertRollbackRegistration(handle: DurableLifecycleOperation, saved: ConfigSlice, previousMarker: OpenClawOwnership | null): void {
  const current = slice(config(handle.target), handle.target, handle.nativeId);
  const normalize = (value: ConfigSlice): string => JSON.stringify({ entry: value.entry ?? null, linked: value.pathIndex >= 0, allowed: value.allowIndex >= 0 });
  const retiring = handle.action === 'remove' || handle.action === 'retire-orphan';
  const priorEntry = saved.entry === undefined ? {} : object(saved.entry, 'saved owned entry');
  const { enabled: _enabled, ...data } = priorEntry;
  const expected: ConfigSlice = { ...saved, entry: retiring ? (Object.keys(data).length ? { ...data, enabled: false } : undefined) : { ...priorEntry, enabled: true }, pathIndex: retiring ? -1 : 0, allowIndex: retiring ? (previousMarker?.allowWasPresent ? saved.allowIndex : -1) : saved.hadAllow ? 0 : -1 };
  if (![normalize(saved), normalize(expected)].includes(normalize(current))) throw new Error('OpenClaw rollback refuses changed owned configuration');
}
function verifyBackup(path: string): void { const expected = /-([a-f0-9]{64})$/u.exec(path)?.[1]; if (!expected || fullTreeHash(path) !== expected) throw new Error('OpenClaw recovery custody is changed or foreign'); }
function replace(stage: string, destination: string): void {
  const temporary = `${destination}.plgnz-next-${hash([Date.now(), Math.random()]).slice(0, 16)}`;
  if (existsSync(temporary)) throw new Error('OpenClaw publication temporary slot already exists');
  mkdirSync(dirname(destination), { recursive: true }); copyTree(stage, temporary);
  const old = `${destination}.plgnz-prior-${hash([Date.now(), Math.random()]).slice(0, 16)}`;
  if (existsSync(old)) throw new Error('OpenClaw previous publication slot already exists');
  const present = existsSync(destination); if (present) renameSync(destination, old);
  try { renameSync(temporary, destination); } catch (error) { if (present) renameSync(old, destination); throw error; }
  finally { if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true }); }
  if (present) rmSync(old, { recursive: true, force: true });
}
const supported = new Set(['ordinary-skills', 'mcp', 'resources', 'auto-update-control', 'retirement', 'retention-safety', 'readback', 'rollback', 'activation-reload']);
export const openclawEvidenceProfiles = [createCapabilityEvidenceProfile({ host: 'openclaw', detectedVersion: '2026.9.1', sourceTypes: ['local', 'git'], operations: ['install', 'update', 'retire'], route: 'managed', operationStatus: 'supported', semantics: Object.fromEntries(PACKAGE_SEMANTICS.map(semantic => [semantic, supported.has(semantic) ? 'supported' : 'unsupported'])) as Record<(typeof PACKAGE_SEMANTICS)[number], 'supported' | 'unsupported'>, evidence: ['docs/evidence/openclaw-agent-bundle-20261116.json', 'docs/hosts/openclaw.md'] })];
const definition: LifecycleHostDefinition = {
  id: 'openclaw', evidenceProfiles: openclawEvidenceProfiles,
  async probeVersion(target) { return probeOpenClawVersion(target); },
  async observeTarget(target) { return observe(target); },
  async observeNativeMutationScope() { return { kind: 'unavailable' }; },
  async observeNativeProjection() { return { kind: 'unverified', reasonId: 'openclaw-configured-agent-bundle' }; },
  async revalidateTargetPrecondition(handle) { return { version: probeOpenClawVersion(handle.target), targetObservationId: createTargetInventoryObservation('openclaw', observe(handle.target)).observationId }; },
  async stageActivation(request) {
    const { snapshot } = request, root = operationRoot(snapshot.target, snapshot.attemptId, snapshot.operationId), stage = join(root, 'stage');
    safePath(openclawInstanceIdentity(snapshot.target).root, stage);
    if (request.pins.length) throw new Error('OpenClaw Agent bundle MCP commands cannot be rewritten to absolute executable pins');
    mkdirSync(dirname(root), { recursive: true }); mkdirSync(root); chmodSync(root, 0o700); if (existsSync(stage)) throw new Error('OpenClaw operation already has a stage');
    compile(snapshot.packageRoot, stage, snapshot.nativeId);
    const marker: OpenClawOwnership = { pluginId: snapshot.nativeId, scopeId: snapshot.scopeId, sourceType: snapshot.sourceType, sourceRevision: snapshot.immutableRevision, sourceLocator: snapshot.nativeGit?.locator ?? null, fingerprint: snapshot.packageFingerprint, nativeFingerprint: fullTreeHash(stage, true), allowWasPresent: readOpenClawOwnership(pathOf(snapshot.target, snapshot.nativeId))?.allowWasPresent ?? allow(config(snapshot.target)).includes(snapshot.nativeId) };
    const mode = lstatSync(stage).mode & 0o7777; try { chmodSync(stage, mode | 0o200); writeFileSync(join(stage, OPENCLAW_MARKER), JSON.stringify(marker)); } finally { chmodSync(stage, mode); } return { stagingId: `sha256:${fingerprintTree(stage)}`, stagingRoot: stage };
  },
  async applyLifecycleDirectives() { return ['openclaw-local-bundle-no-updater']; },
  async applyPins(projection) { if (projection.pins.length) throw new Error('OpenClaw absolute MCP pinning is unsupported'); return []; },
  async captureActivationPreparation(projection, projectedFingerprint) {
    const stagedMarker = readOpenClawOwnership(projection.stagingRoot);
    if (projection.stagingId !== `sha256:${projectedFingerprint}` || !stagedMarker || stagedMarker.scopeId !== projection.scopeId || stagedMarker.pluginId !== projection.nativeId || stagedMarker.nativeFingerprint !== fullTreeHash(projection.stagingRoot, true)) throw new Error('OpenClaw staged custody changed before capture');
    const prior = readback(projection), destination = pathOf(projection.target, projection.nativeId), existing = owned(projection.target, projection.nativeId, projection.scopeId), doc = config(projection.target);
    if (!existing && (entries(doc)[projection.nativeId] !== undefined || paths(doc).includes(destination))) throw new Error('OpenClaw unowned registration already uses the requested native identity');
    if (plugins(doc).enabled === false) throw new Error('OpenClaw plugins are globally disabled');
    const desired = JSON.parse(JSON.stringify(doc)) as Doc, p = plugins(desired), e = entries(desired), load = p.load === undefined ? {} : object(p.load, 'load config'); e[projection.nativeId] = { ...(e[projection.nativeId] === undefined ? {} : object(e[projection.nativeId], 'entry')), enabled: true }; load.paths = [...paths(desired).filter(value => value !== destination), destination]; if (p.allow !== undefined) p.allow = [...allow(desired).filter(value => value !== projection.nativeId), projection.nativeId]; p.entries = e; p.load = load; desired.plugins = p;
    return { prior, expected: { ...prior, route: 'managed', presence: 'present', enablement: 'enabled', activation: 'active', installedFingerprint: projectedFingerprint, contentRoots: [{ label: 'bundle', path: destination, fingerprint: projectedFingerprint }, { label: 'registration', path: openclawInstanceIdentity(projection.target).configPath, fingerprint: hash(slice(desired, projection.target, projection.nativeId)) }] }, rollbackReference: backup(projection, projection.attemptId, projection.operationId, true), rollbackCoverageOperationIds: projection.affectedOperationIds };
  },
  async captureDisablePreparation() { throw new Error('OpenClaw reversible disable is not qualified'); },
  async captureRetirementPreparation(request) { const binding = request.activation; const prior = readback(binding); owned(binding.target, binding.nativeId, binding.scopeId); return { prior, rollbackReference: backup(binding, request.attemptId, request.operationId), rollbackCoverageOperationIds: request.selection.affectedOperationIds, transition: TRANSITION }; },
  async apply(prepared) { const h = prepared.handle, destination = pathOf(h.target, h.nativeId); owned(h.target, h.nativeId, h.scopeId); replace(prepared.stagingRoot, destination); registration(h.target, h.nativeId, true); return { receiptId: `openclaw-apply:${h.operationId}`, changed: true }; },
  async disable() { throw new Error('OpenClaw reversible disable is not qualified'); },
  async retire(prepared) { const h = prepared.handle, destination = pathOf(h.target, h.nativeId); const marker = owned(h.target, h.nativeId, h.scopeId); if (!marker) return { receiptId: `openclaw-retire:${h.operationId}`, changed: false }; registration(h.target, h.nativeId, false, marker.allowWasPresent === true); rmSync(destination, { recursive: true, force: true }); return { receiptId: `openclaw-retire:${h.operationId}`, changed: true }; },
  async readback(handle) { return readback(handle); },
  async rollback(handle) { const out = handle.rollbackReference; safePath(operationRoot(handle.target, handle.attemptId, handle.operationId), out); verifyBackup(out); const previous = join(out, 'bundle'), current = pathOf(handle.target, handle.nativeId); owned(handle.target, handle.nativeId, handle.scopeId); if (existsSync(previous)) { const marker = readOpenClawOwnership(previous); if (!marker || marker.pluginId !== handle.nativeId || marker.scopeId !== handle.scopeId || fullTreeHash(previous, true) !== marker.nativeFingerprint || fingerprintTree(previous) !== handle.prior.installedFingerprint) throw new Error('OpenClaw rollback backup is changed or foreign'); } if (existsSync(current) && ![handle.prior.installedFingerprint, handle.expected.installedFingerprint].includes(fingerprintTree(current))) throw new Error('OpenClaw rollback refuses a changed live bundle'); const saved = JSON.parse(readFileSync(join(out, 'registration.json'), 'utf8')) as ConfigSlice; assertRollbackRegistration(handle, saved, existsSync(previous) ? readOpenClawOwnership(previous) : null); if (existsSync(previous)) replace(previous, current); else if (existsSync(current)) rmSync(current, { recursive: true, force: true }); restoreRegistration(handle.target, handle.nativeId, saved); return { receiptId: `openclaw-rollback:${handle.operationId}`, changed: true }; },
  async cleanup(reference) {
    const root = operationRoot(reference.target, reference.attemptId, reference.operationId); safePath(openclawInstanceIdentity(reference.target).root, root);
    if (existsSync(root)) {
      const expected = ['stage', ...(reference.rollbackReference ? [relative(root, reference.rollbackReference)] : [])];
      if (readdirSync(root).some(name => !expected.includes(name))) throw new Error('OpenClaw cleanup refuses unknown operation artifacts');
      const stage = join(root, 'stage');
      if (existsSync(stage)) { const marker = readOpenClawOwnership(stage); if (!marker || marker.nativeFingerprint !== fullTreeHash(stage, true) || reference.artifactId !== `sha256:${fingerprintTree(stage)}`) throw new Error('OpenClaw cleanup refuses changed stage resources'); }
      if (reference.rollbackReference) { safePath(root, reference.rollbackReference); verifyBackup(reference.rollbackReference); }
      rmSync(root, { recursive: true, force: true });
    }
    return { cleanupId: `openclaw-cleanup:${reference.operationId}`, completed: true };
  },
};
export const openclawLifecycle = createLifecycleHostAdapter(definition);
export const openclawWriter: HostWriter = {
  ...openclaw, supportsAdoption: false, plannedNativeId: plugin => plugin.name, lifecyclePinAdapter: openclawLifecycle,
  async add() { throw new Error('OpenClaw installation requires the authoritative lifecycle transaction'); },
  async pin() { throw new Error('OpenClaw Agent bundles reject absolute executable MCP pins'); },
  async remove() { throw new Error('OpenClaw removal requires the authoritative lifecycle transaction'); },
};
