/** Private read-only prerequisite. This grants NO plan, stage, apply or recovery authority. */
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createDeploymentScopeIdentity } from '../deployment-scope';
import { fingerprintTree } from '../fingerprint';
import { adoptionDigest, canonicalAdoptionJson, type AdoptionDigest } from '../legacy-adoption-proof';
import { CryptoHasher } from '../runtime';
import type { FrozenSource } from '../source';
import { validateSourceBinding } from '../source-reference';
import { validateLifecycleState } from '../state';
import { zcodeCliConfigRoot, zcodeCliRoot } from '../paths';
import { assertZcodeNativeRegistryReadable, readZcodeEnabledPluginIds, readZcodeNativeRecords, zcodeCliTargetProfile } from './zcode-cli';
import { projectZcodePayload, readZcodeProjectionTree, type ZcodeProjectionTree } from './zcode-cli-projection';

export interface ZcodeHistoricalIdentityRequest {
  readonly state: unknown;
  readonly scopeId: string;
  readonly packageName: string;
  readonly source: FrozenSource;
}
interface RootObservation { role: 'cache' | 'marketplace' | 'resources'; nativeId: string; physicalPath: string; presence: 'present' | 'absent'; fingerprint: AdoptionDigest | null }
export interface ZcodeHistoricalIdentityPrecondition {
  readonly kind: 'historical-precondition';
  readonly format: 'zcode-cli/native-lifecycle-75d-v1';
  readonly origin: 'verified-activation';
  readonly oldNativeId: string;
  readonly newNativeId: string;
  readonly originDigest: AdoptionDigest;
  readonly oldMarkerRawDigest: AdoptionDigest;
  readonly roots: readonly RootObservation[];
  readonly retention: readonly { nativeId: string; dataPath: string; dataFingerprint: AdoptionDigest | null; optionsPath: string; optionsFingerprint: AdoptionDigest | null }[];
  readonly registryRawDigest: AdoptionDigest;
  readonly configRawDigest: AdoptionDigest;
  readonly marketplaceRegistryRawDigest: AdoptionDigest;
  readonly mutationAuthority: false;
}

export function proveZcodeHistoricalIdentity(request: ZcodeHistoricalIdentityRequest): ZcodeHistoricalIdentityPrecondition {
  const state = validateLifecycleState(request.state), source = request.source;
  validateSourceBinding(source.snapshot.binding);
  const scope = state.scopes.find(row => row.id === request.scopeId);
  if (scope === undefined || scope.authority !== 'authoritative' || scope.lifecycle !== 'active') fail('no authoritative active modern Scope');
  zcodeCliTargetProfile.parseSyncTarget(scope.target, 'historical ZCode target');
  if (scope.id !== createDeploymentScopeIdentity(source.snapshot.binding, scope.target).id
    || canonicalAdoptionJson(scope.source) !== canonicalAdoptionJson(source.snapshot.binding)) fail('exact Source or target differs');
  if (source.snapshot.binding.kind !== 'local') fail('historical Git locator correlation remains unverified');
  if (source.isGit || source.sourceUri !== source.snapshot.binding.locator
    || fingerprintTree(source.snapshotDir) !== source.snapshot.fingerprint) fail('frozen Source changed');
  const plugins = source.plugins.filter(plugin => plugin.name === request.packageName);
  if (plugins.length !== 1) fail('ambiguous selected frozen package');
  const plugin = plugins[0]!;
  if (plugin.marketplace === undefined || !safeName(plugin.name) || !safeName(plugin.marketplace)
    || plugin.relativeDir === undefined || plugin.version === undefined || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(plugin.version)) fail('unsupported historical collection or version');
  if (resolve(source.snapshotDir, plugin.relativeDir) !== plugin.dir || relative(source.snapshotDir, plugin.dir).startsWith('..')) fail('package path escapes frozen Source');
  const authored = ['.claude-plugin/marketplace.json', '.omp-plugin/marketplace.json', 'marketplace.json'].map(path => join(source.snapshotDir, path)).filter(present);
  if (authored.length !== 1) fail('ambiguous authored marketplace declaration');
  const declaration = json(authored[0]!);
  if (declaration.name !== plugin.marketplace || !Array.isArray(declaration.plugins)
    || declaration.plugins.filter(value => object(value) && value.name === plugin.name && typeof value.source === 'string'
      && resolve(source.snapshotDir, value.source) === plugin.dir).length !== 1) fail('authored marketplace does not bind exact package');
  const packageFingerprint = fingerprintTree(plugin.dir);
  if (plugin.contentFingerprint !== packageFingerprint) fail('selected package bytes changed');
  const oldNativeId = `${plugin.name}@${plugin.marketplace}`;
  const newMarket = `plgnz-${hash(oldNativeId).slice(0, 16)}`, newNativeId = `${plugin.name}@${newMarket}`;
  const activations = state.activations.filter(row => row.scopeId === scope.id && row.packageId === plugin.name);
  if (activations.length !== 1) fail('modern activation is ambiguous');
  const activation = activations[0]!;
  if (activation.nativeId !== oldNativeId || activation.ownership.kind === 'legacy-claim'
    || activation.route.kind !== 'native' || activation.activationState !== 'active' || activation.readbackState !== 'verified'
    || activation.pending !== undefined || activation.pins.length !== 0 || activation.sourceRevision !== source.snapshot.revision
    || activation.sourceRelativeDir !== plugin.relativeDir || activation.fingerprints.source !== packageFingerprint
    || activation.fingerprints.installed === undefined || activation.fingerprints.projected !== activation.fingerprints.installed) fail('exact historical modern activation differs');
  const journals = state.attempts.flatMap(attempt => attempt.journal.filter(row => row.scopeId === scope.id
    && (row.nativeId === oldNativeId || row.nativeId === newNativeId)).map(journal => ({ attempt, journal })));
  if (journals.some(({ journal }) => !['completed', 'failed', 'not-attempted'].includes(journal.state))) fail('unresolved old or canonical journal');
  const originals = journals.filter(({ attempt, journal }) => attempt.command !== 'legacy-recovery' && journal.nativeId === oldNativeId
    && journal.action === 'install' && journal.state === 'completed' && journal.sealedOperation?.expected.installedFingerprint === activation.fingerprints.installed);
  if (originals.length !== 1) fail('missing exact single completed historical install');
  const handle = originals[0]!.journal.sealedOperation!;
  if (handle.adapterId !== 'zcode-cli' || handle.scopeId !== scope.id || handle.packageName !== plugin.name
    || handle.sourceType !== 'local' || handle.sourceRevision !== source.snapshot.revision || handle.sourceLocator !== null
    || handle.packageVersion !== plugin.version || handle.route !== 'native' || handle.detectedVersion !== '0.16.9'
    || handle.expected.presence !== 'present' || handle.expected.activation !== 'active' || handle.expected.enablement !== 'enabled'
    || canonicalAdoptionJson(handle.target) !== canonicalAdoptionJson(scope.target)) fail('historical sealed readback differs');
  const root = physical(zcodeCliRoot()), version = `${plugin.version}+plgnz.${packageFingerprint.slice(0, 16)}`;
  const oldCache = join(root, 'plugins/cache', plugin.marketplace, plugin.name, version.replace(/\+/gu, '-'));
  const oldMarket = join(root, 'plgnz-marketplaces', plugin.marketplace), oldResources = join(root, 'plgnz-resources', plugin.marketplace, packageFingerprint);
  const newRoots = [join(root, 'plugins/cache', newMarket), join(root, 'plgnz-marketplaces', newMarket), join(root, 'plgnz-resources', newMarket)];
  for (const path of [oldCache, oldMarket, oldResources, ...newRoots]) if (physical(path) !== path) fail('native root was redirected');
  assertZcodeNativeRegistryReadable();
  const rows = readZcodeNativeRecords(), oldRows = rows.filter(row => row.id === oldNativeId);
  if (oldRows.length !== 1 || rows.some(row => row.id === newNativeId)) fail('old/canonical registry identity is ambiguous or occupied');
  const row = oldRows[0]!;
  if (rows.some(candidate => candidate.id !== oldNativeId && candidate.marketplace === plugin.marketplace)) fail('shared historical marketplace retirement is not yet bounded');
  if (row.scope !== 'user' || row.name !== plugin.name || row.marketplace !== plugin.marketplace || row.version !== version || row.installPath !== oldCache
    || readZcodeEnabledPluginIds().get(oldNativeId) !== true) fail('old native registration differs');
  if (canonicalAdoptionJson(readdirSync(dirname(oldCache)).sort()) !== canonicalAdoptionJson([version.replace(/\+/gu, '-')])) fail('unknown inactive old cache');
  const configPath = join(zcodeCliConfigRoot(), 'config.json'); if (physical(configPath) !== configPath) fail('config root redirected');
  const config = json(configPath), pluginsConfig = object(config.plugins) ? config.plugins : null;
  if (pluginsConfig === null || !object(pluginsConfig.enabledPlugins) || pluginsConfig.enabledPlugins[oldNativeId] !== true
    || Object.hasOwn(pluginsConfig.enabledPlugins, newNativeId)) fail('old/canonical enablement differs');
  const options = pluginsConfig.options;
  if (options !== undefined && !object(options)) fail('options mapping malformed');
  if (object(options) && Object.hasOwn(options, newNativeId)) fail('canonical options already exist');
  const marketplaceRegistry = join(root, 'plugins/known_marketplaces.json'), markets = json(marketplaceRegistry);
  if (markets[plugin.marketplace] !== oldMarket || Object.hasOwn(markets, newMarket)
    || Object.values(markets).filter(value => value === oldMarket).length !== 1) fail('marketplace registration differs or canonical entry exists');
  for (const path of newRoots) if (present(path)) fail('canonical physical root already exists');
  const markerPath = join(oldCache, '.plgnz-install.json'), marker = json(markerPath);
  const expectedMarker = { owner: 'plgnz', schema: 1, logicalId: oldNativeId, nativeId: oldNativeId,
    fingerprint: packageFingerprint, source: source.snapshot.revision, resourcePath: oldResources };
  if (canonicalAdoptionJson(marker) !== canonicalAdoptionJson(expectedMarker)) fail('unrecognized or mismatching historical marker');
  const payload = readZcodeProjectionTree(oldCache); payload.delete('.plgnz-install.json');
  const expected = projectZcodePayload(plugin.dir, oldResources, version);
  if (!sameTree(payload, expected.payload) || !sameTree(readZcodeProjectionTree(oldResources), expected.resources)) fail('historical payload/resources differ from frozen projection');
  const cacheFingerprint = fingerprintTree(oldCache), resourceFingerprint = fingerprintTree(oldResources);
  if (cacheFingerprint !== activation.fingerprints.installed || canonicalAdoptionJson(handle.expected.contentRoots) !== canonicalAdoptionJson([
    { label: 'native', path: oldCache, fingerprint: cacheFingerprint }, { label: 'resources', path: oldResources, fingerprint: resourceFingerprint },
  ])) fail('retained historical readback roots differ');
  const marketplace = readZcodeProjectionTree(oldMarket), expectedMarketplace: ZcodeProjectionTree = new Map();
  expectedMarketplace.set('plugins', { kind: 'directory', mode: 0o755 }); expectedMarketplace.set(`plugins/${plugin.name}`, { kind: 'directory', mode: 0o755 });
  for (const [path, entry] of readZcodeProjectionTree(oldCache)) expectedMarketplace.set(`plugins/${plugin.name}/${path}`, entry);
  const marketManifest = marketplace.get('marketplace.json');
  if (marketManifest?.kind !== 'file' || canonicalAdoptionJson(JSON.parse(new TextDecoder().decode(marketManifest.bytes))) !== canonicalAdoptionJson({ name: plugin.marketplace, plugins: [{ name: plugin.name, source: `./plugins/${plugin.name}` }] })) fail('shared or unknown historical marketplace is not yet bounded');
  expectedMarketplace.set('marketplace.json', marketManifest);
  if (!sameTree(marketplace, expectedMarketplace)) fail('foreign or shared historical marketplace payload');
  const retention = [oldNativeId, newNativeId].sort().map(nativeId => {
    const dataPath = join(root, 'plugins/data', nativeId); if (physical(dataPath) !== dataPath) fail('retained data root redirected');
    if (nativeId === newNativeId && present(dataPath)) fail('canonical data already exists');
    return { nativeId, dataPath, dataFingerprint: present(dataPath) ? digestTree(dataPath) : null, optionsPath: configPath,
      optionsFingerprint: object(options) && Object.hasOwn(options, nativeId) ? adoptionDigest('plugnz/zcode-options/v1', options[nativeId]) : null };
  });
  if (fingerprintTree(source.snapshotDir) !== source.snapshot.fingerprint || fingerprintTree(plugin.dir) !== packageFingerprint) fail('Source changed during proof');
  const oldRoots: RootObservation[] = [
    { role: 'cache', nativeId: oldNativeId, physicalPath: oldCache, presence: 'present', fingerprint: `sha256:${cacheFingerprint}` },
    { role: 'marketplace', nativeId: oldNativeId, physicalPath: oldMarket, presence: 'present', fingerprint: digestTree(oldMarket) },
    { role: 'resources', nativeId: oldNativeId, physicalPath: oldResources, presence: 'present', fingerprint: `sha256:${resourceFingerprint}` },
  ];
  const roles = ['cache', 'marketplace', 'resources'] as const;
  return { kind: 'historical-precondition', format: 'zcode-cli/native-lifecycle-75d-v1', origin: 'verified-activation', oldNativeId, newNativeId,
    originDigest: adoptionDigest('plugnz/zcode-private-historical-origin/v1', { scope, activation, attemptId: originals[0]!.attempt.id, journal: originals[0]!.journal }),
    oldMarkerRawDigest: rawDigest(markerPath), roots: [...oldRoots, ...newRoots.map((path, index): RootObservation => ({ role: roles[index]!, nativeId: newNativeId, physicalPath: path, presence: 'absent', fingerprint: null }))],
    retention, registryRawDigest: rawDigest(join(root, 'plugins/installed_plugins.json')), configRawDigest: rawDigest(configPath),
    marketplaceRegistryRawDigest: rawDigest(marketplaceRegistry), mutationAuthority: false };
}

function sameTree(left: ZcodeProjectionTree, right: ZcodeProjectionTree): boolean {
  if (left.size !== right.size) return false;
  for (const [path, expected] of right) {
    const actual = left.get(path); if (actual?.kind !== expected.kind) return false;
    if (actual.kind === 'file' && expected.kind === 'file' && ((actual.mode & 0o111) !== (expected.mode & 0o111)
      || canonicalAdoptionJson(Array.from(actual.bytes)) !== canonicalAdoptionJson(Array.from(expected.bytes)))) return false;
  }
  return true;
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function json(path: string): Record<string, unknown> { if (lstatSync(path).isSymbolicLink()) fail('JSON path redirected'); const value: unknown = JSON.parse(readFileSync(path, 'utf8')); if (!object(value)) fail('JSON is not an object'); return value; }
function present(path: string): boolean { try { lstatSync(path); return true; } catch (error) { if ((error as { code?: string }).code === 'ENOENT') return false; throw error; } }
function physical(path: string): string { if (present(path)) return realpathSync(path); const parent = dirname(path); if (parent === path) fail('no physical ancestor'); return join(physical(parent), path.slice(parent.length + 1)); }
function hash(value: string | Uint8Array): string { return new CryptoHasher('sha256').update(value).digest('hex'); }
function rawDigest(path: string): AdoptionDigest { return `sha256:${hash((readFileSync as unknown as (path: string) => Uint8Array)(path))}`; }
function digestTree(path: string): AdoptionDigest { return `sha256:${fingerprintTree(path)}`; }
function safeName(value: string): boolean { return /^[a-z0-9][a-z0-9._-]*$/iu.test(value); }
function fail(message: string): never { throw new Error(`ZCode historical identity precondition refused: ${message}`); }
