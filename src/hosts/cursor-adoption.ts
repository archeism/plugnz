/** Read-only precondition proof, NOT an adoption authorization or native fence. */
import { accessSync, constants, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fingerprintTree } from '../fingerprint';
import { discoverCommands } from '../conversion';
import { canonicalAdoptionJson, parseLegacyRecordProof, type AdoptionDigest, type LegacyRecordProof } from '../legacy-adoption-proof';
import type { FrozenPackageSnapshot, ResolvedLifecyclePin, TargetVersionObservation } from '../lifecycle-host';
import { CryptoHasher } from '../runtime';
import { createResolvedLifecyclePins } from '../lifecycle-runtime';
import type { SourceSnapshotReference } from '../source-reference';
import { cursorInstanceRoot, cursorTargetProfile, localDir } from './cursor';
import { parseCursorAdoptionNativeProof, type CursorAdoptionNativeProof } from './cursor-adoption-proof';

declare const TextEncoder: { new (): { encode(input: string): Uint8Array } };
declare const TextDecoder: { new (): { decode(input: Uint8Array): string } };
const MARKER = '.plgnz-install.json';
type Entry = { kind: 'directory' } | { kind: 'file'; bytes: Uint8Array; executable: boolean };
type Tree = Map<string, Entry>;

export interface CursorLegacyAdoptionProofRequest {
  readonly legacy: LegacyRecordProof;
  readonly snapshot: FrozenPackageSnapshot;
  readonly source: SourceSnapshotReference;
  readonly pins: readonly ResolvedLifecyclePin[];
  readonly version: TargetVersionObservation;
  readonly evidenceId: AdoptionDigest;
}

/** Caller must revalidate this exact precondition under the later native fence. */
export function proveCursorLegacyAdoption(request: CursorLegacyAdoptionProofRequest): CursorAdoptionNativeProof {
  const legacy = parseLegacyRecordProof(request.legacy);
  const { snapshot, source } = request;
  cursorTargetProfile.parseSyncTarget(snapshot.target, 'Cursor adoption target');
  const scope = legacy.snapshot.scope;
  if (snapshot.target.kind !== 'cursor' || canonicalAdoptionJson(scope.target) !== canonicalAdoptionJson(snapshot.target)
    || snapshot.scopeId !== scope.id || canonicalAdoptionJson(scope.source) !== canonicalAdoptionJson(source.binding)
    || snapshot.sourceType !== source.binding.kind || snapshot.immutableRevision !== source.revision
    || snapshot.snapshotFingerprint !== source.fingerprint) fail('Source or target differs from the retained original');
  if (snapshot.nativeId !== snapshot.packageName || !safeName(snapshot.packageName)
    || snapshot.collectionName !== undefined && !safeName(snapshot.collectionName)) fail('unsupported physical alias');
  const qualified = snapshot.collectionName === undefined ? snapshot.packageName : `${snapshot.packageName}@${snapshot.collectionName}`;
  const logicalAliases = [snapshot.packageName, qualified];
  if (![snapshot.packageName, qualified].includes(legacy.snapshot.activation.nativeId)
    || legacy.snapshot.activation.sourceRelativeDir !== undefined && legacy.snapshot.activation.sourceRelativeDir !== snapshot.relativePackagePath) fail('legacy alias or package path differs from the selected Source');
  if (legacy.original.package === null || !logicalAliases.includes(legacy.original.package)
    || !logicalAliases.includes(legacy.snapshot.activation.packageId)) fail('logical package identity differs from the selected Source');
  if (fingerprintTree(snapshot.snapshotRoot) !== snapshot.snapshotFingerprint
    || fingerprintTree(snapshot.packageRoot) !== snapshot.packageFingerprint) fail('frozen Source bytes changed');
  if (snapshot.collectionName !== undefined) {
    const path = ['.claude-plugin/marketplace.json', '.omp-plugin/marketplace.json', 'marketplace.json']
      .map(path => join(snapshot.snapshotRoot, path)).find(present);
    if (path === undefined) fail('collection identity has no marketplace manifest');
    const marketplace = json((readFileSync as unknown as (path: string) => Uint8Array)(path), 'collection');
    const candidates = Array.isArray(marketplace.plugins) ? marketplace.plugins.filter(value => plainObject(value)
      && typeof value.source === 'string' && resolve(snapshot.snapshotRoot, value.source) === snapshot.packageRoot) : [];
    if ((typeof marketplace.name === 'string' ? marketplace.name : 'local') !== snapshot.collectionName || candidates.length !== 1) fail('collection identity or package binding differs');
  }
  const resolvedPins = createResolvedLifecyclePins(request.pins);
  for (const pin of resolvedPins) accessSync(pin.executable, constants.X_OK);
  const pins = resolvedPins.map(pin => pin.server);
  if (canonicalAdoptionJson(pins) !== canonicalAdoptionJson(legacy.snapshot.activation.pins)
    || new Set(pins).size !== pins.length) fail('resolved pins differ from retained original');
  const root = resolve(join(localDir(snapshot.target.instance), snapshot.nativeId));
  if (legacy.snapshot.activation.nativeId !== snapshot.nativeId
    && present(join(localDir(snapshot.target.instance), legacy.snapshot.activation.nativeId))) fail('ambiguous second physical alias');
  const native = readTree(root);
  const fullFingerprint = treeFingerprint(native);
  const markerEntry = native.get(MARKER);
  if (markerEntry?.kind !== 'file') fail('missing regular legacy marker');
  const marker = json(markerEntry.bytes, 'legacy marker');
  if (Object.keys(marker).length !== 3 || !['source', 'pluginId', 'fingerprint'].every(key => typeof marker[key] === 'string')
    || marker.source !== source.binding.locator || ![snapshot.packageName, qualified].includes(marker.pluginId as string)
    || marker.fingerprint !== snapshot.packageFingerprint
    || legacy.snapshot.activation.fingerprints.source !== undefined && marker.fingerprint !== legacy.snapshot.activation.fingerprints.source) fail('legacy marker differs from exact Source/alias/fingerprint');
  const projected = readTree(snapshot.packageRoot);
  if (treeFingerprint(projected) !== snapshot.packageFingerprint) fail('captured Source bytes differ from frozen package');
  if (projected.has(MARKER)) fail('Source contains a reserved ownership marker');
  projectCommands(projected, snapshot.packageRoot);
  const canonical = ['.claude-plugin/plugin.json', 'plugin.json', '.plugin/plugin.json'].find(path => projected.has(path));
  if (!projected.has('.cursor-plugin/plugin.json')) {
    if (canonical === undefined) fail('Source has no canonical manifest');
    const manifest = projected.get(canonical)!;
    if (manifest.kind !== 'file') fail('manifest is not a file');
    put(projected, '.cursor-plugin/plugin.json', { ...manifest, bytes: manifest.bytes.slice() });
  }
  const manifest = parseManifest(projected.get('.cursor-plugin/plugin.json'));
  if (manifest.name !== snapshot.packageName || typeof manifest.version !== 'string') fail('native manifest identity/version differs');
  if (canonical !== undefined) {
    const authored = parseManifest(projected.get(canonical));
    if (authored.name !== manifest.name || authored.version !== undefined && authored.version !== manifest.version) fail('canonical and native manifests differ');
  }
  if (projected.get('skills')?.kind === 'file') fail('skills path is not a directory');
  for (const pin of resolvedPins) {
    let found = false;
    for (const path of ['.mcp.json', 'mcp.json']) {
      const file = projected.get(path);
      if (file?.kind !== 'file') continue;
      const parsed = json(file.bytes, 'MCP declaration');
      const servers = parsed.mcpServers;
      if (!plainObject(servers)) continue;
      const server = servers[pin.server];
      if (!plainObject(server) || typeof server.command !== 'string') continue;
      server.command = pin.executable;
      put(projected, path, { ...file, bytes: new TextEncoder().encode(JSON.stringify(parsed, null, 2)) });
      found = true;
    }
    if (!found) fail(`recorded pin has no projected server: ${pin.server}`);
  }
  const payloadFingerprint = treeFingerprint(projected);
  native.delete(MARKER);
  if (treeFingerprint(native) !== payloadFingerprint) fail('native payload differs from frozen projection');
  const retained = (kind: 'data' | 'metadata'): CursorAdoptionNativeProof['retention']['pluginData'] => {
    const path = join(cursorInstanceRoot(snapshot.target.instance), 'plugins/retained', snapshot.nativeId, kind);
    safeAncestors(dirname(path), true);
    if (!present(path)) return { state: 'absent', fingerprint: null };
    return { state: 'present', fingerprint: treeFingerprint(readTree(path)) };
  };
  if (fingerprintTree(snapshot.snapshotRoot) !== snapshot.snapshotFingerprint
    || fingerprintTree(snapshot.packageRoot) !== snapshot.packageFingerprint) fail('frozen Source bytes changed during projection');
  return parseCursorAdoptionNativeProof({ adapterId: 'cursor', format: 'cursor/legacy-marker-v1',
    evidenceId: request.evidenceId, version: request.version, aliasMode: 'same-root',
    oldLedgerNativeId: legacy.snapshot.activation.nativeId, oldPhysicalNativeId: snapshot.nativeId, newNativeId: snapshot.nativeId,
    packageName: snapshot.packageName, packageVersion: manifest.version,
    marker: { ...marker, rawDigest: digest(markerEntry.bytes) },
    roots: [{ label: 'local', path: root, fullFingerprint: `sha256:${fullFingerprint}`, payloadFingerprint: `sha256:${payloadFingerprint}` }],
    projectedPayloadFingerprint: `sha256:${payloadFingerprint}`, pins,
    retention: { pluginData: retained('data'), inactiveMetadata: retained('metadata') } });
}

function projectCommands(tree: Tree, source: string): void {
  if (!tree.has('commands') && !tree.has('.claude/commands')) return;
  const commands = discoverCommands(source), seen = new Set<string>();
  for (const command of commands) {
    if (command.userInvocable === false) fail(`command is not user-invocable: ${command.name}`);
    if (seen.has(command.name)) fail(`command projection collision: ${command.name}`);
    seen.add(command.name);
    const path = `skills/${command.name}/SKILL.md`;
    if (tree.has(path)) fail(`command collides with skill: ${command.name}`);
    const body = command.body.endsWith('\n') ? command.body : `${command.body}\n`;
    put(tree, path, { kind: 'file', executable: false,
      bytes: new TextEncoder().encode(`---\nname: ${JSON.stringify(command.name)}\ndescription: ${JSON.stringify(command.description)}\n---\n${body}`) });
  }
  if (commands.length > 0) for (const path of tree.keys()) {
    if (path === 'commands' || path.startsWith('commands/') || path === '.claude/commands' || path.startsWith('.claude/commands/')) tree.delete(path);
  }
}

function readTree(root: string): Tree {
  safeAncestors(root, false);
  const tree: Tree = new Map();
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name), relative = prefix === '' ? name : `${prefix}/${name}`, stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail(`symlink resource: ${relative}`);
      if (stat.isDirectory()) { tree.set(relative, { kind: 'directory' }); walk(path, relative); }
      else if (stat.isFile()) tree.set(relative, { kind: 'file', bytes: (readFileSync as unknown as (path: string) => Uint8Array)(path), executable: Boolean(stat.mode & 0o111) });
      else fail(`non-file resource: ${relative}`);
    }
  };
  walk(root, ''); return tree;
}
function safeAncestors(root: string, allowMissing: boolean): void {
  for (let path = resolve(root); ; path = dirname(path)) {
    if (!allowMissing || present(path)) {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`unsafe directory: ${path}`);
    }
    if (dirname(path) === path) break;
  }
}
function put(tree: Tree, path: string, file: Entry): void {
  for (let parent = dirname(path); parent !== '.'; parent = dirname(parent)) {
    const prior = tree.get(parent);
    if (prior?.kind === 'file') fail(`projection parent is a file: ${parent}`);
    tree.set(parent, { kind: 'directory' });
  }
  tree.set(path, file);
}
function treeFingerprint(tree: Tree): string {
  const hash = new CryptoHasher('sha256');
  const walk = (prefix: string): void => {
    const children = [...tree.keys()].filter(path => dirname(path) === (prefix || '.')).sort();
    for (const path of children) {
      const entry = tree.get(path)!;
      if (entry.kind === 'directory') { hash.update(`d\0${path}\0`); walk(path); }
      else { hash.update(`f\0${path}\0${entry.executable ? 'x' : '-'}\0`); hash.update(new CryptoHasher('sha256').update(entry.bytes).digest('hex')); hash.update('\0'); }
    }
  };
  walk(''); return hash.digest('hex');
}
function json(bytes: Uint8Array, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!plainObject(value)) fail(`invalid ${label}`);
  return value as Record<string, unknown>;
}
function plainObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function parseManifest(entry: Entry | undefined): Record<string, unknown> { if (entry?.kind !== 'file') fail('manifest is not a regular file'); return json(entry.bytes, 'manifest'); }
function present(path: string): boolean { try { lstatSync(path); return true; } catch (error) { if ((error as { code?: string }).code === 'ENOENT') return false; throw error; } }
function digest(bytes: Uint8Array): AdoptionDigest { return `sha256:${new CryptoHasher('sha256').update(bytes).digest('hex')}`; }
function safeName(name: string): boolean { return /^[a-z0-9][a-z0-9._-]*$/iu.test(name); }
function fail(message: string): never { throw new Error(`Cursor legacy adoption precondition refused: ${message}`); }
