import { describe, expect, test } from 'bun:test';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zcodeCliEvidenceProfiles, zcodeCliLifecycle, zcodeCliWriter } from '../src/hosts/zcode-cli-writer';
import { fingerprintTree } from '../src/fingerprint';
import { createFrozenPackageSnapshot, createLifecyclePlanCoverage, createRecordedOwnedActivation, createResolvedLifecyclePins, hydrateDurableLifecycleOperation } from '../src/lifecycle-runtime';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import type { PluginSource } from '../src/source';

const NATIVE = 'demo@plgnz-activation01';

function officialFake(path: string): void {
  writeFileSync(path, `#!/usr/bin/env bun
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const storage = process.env.ZCODE_STORAGE_DIR;
if (storage === undefined || storage.length === 0) throw new Error('ZCODE_STORAGE_DIR required');
const root = join(storage, 'cli');
const args = process.argv.slice(2);
mkdirSync(root, { recursive: true });
const logPath = join(root, 'cli-invocations.log');
const prior = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
writeFileSync(logPath, prior + args.join(' ') + String.fromCharCode(10));
const marketsPath = join(root, 'plugins', 'known_marketplaces.json');
const registryPath = join(root, 'plugins', 'installed_plugins.json');
const configPath = join(root, 'config.json');

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}
if (args[0] === '--version') {
  console.log('0.16.9');
  process.exit(0);
}
if (args[0] === 'doctor' && args[1] === '--json') {
  console.log(JSON.stringify({ cli: { name: 'zcode', processName: 'zcode-cli' } }));
  process.exit(0);
}
if (args[0] === 'plugins' && args[1] === 'marketplace' && args[2] === 'add') {
  const marketPath = args[3];
  const manifest = JSON.parse(readFileSync(join(marketPath, 'marketplace.json'), 'utf8'));
  const markets = readJson(marketsPath, {});
  markets[manifest.name] = marketPath;
  writeJson(marketsPath, markets);
  process.exit(0);
}
if (args[0] === 'plugins' && args[1] === 'marketplace' && args[2] === 'update') {
  const markets = readJson(marketsPath, {});
  if (typeof markets[args[3]] !== 'string') process.exit(92);
  process.exit(0);
}
  if (args[0] === 'plugins' && (args[1] === 'install' || args[1] === 'update')) {
  const id = args[2];
  const at = id.indexOf('@');
  const name = id.slice(0, at);
  const market = id.slice(at + 1);
  const markets = readJson(marketsPath, {});
  const marketPath = markets[market];
  if (typeof marketPath !== 'string') process.exit(93);
  if (args[1] === 'install' && process.env.ZCODE_TEST_FAIL_INSTALL === '1') {
    console.error('plugin install failed');
    process.exit(1);
  }
  if (args[1] === 'update' && process.env.ZCODE_TEST_FAIL_UPDATE === '1') {
    if (process.env.ZCODE_TEST_RETARGET_ON_UPDATE) { rmSync(root); symlinkSync(process.env.ZCODE_TEST_RETARGET_ON_UPDATE, root); }
    console.error('plugin update failed');
    process.exit(1);
  }
  const plugin = join(marketPath, 'plugins', name);
  const manifest = JSON.parse(readFileSync(join(plugin, '.zcode-plugin', 'plugin.json'), 'utf8'));
  const version = manifest.version;
  const cache = join(root, 'plugins', 'cache', market, name, version.replaceAll('+', '-'));
  rmSync(cache, { recursive: true, force: true });
  mkdirSync(dirname(cache), { recursive: true });
  cpSync(plugin, cache, { recursive: true });
  const registry = readJson(registryPath, { version: 1, plugins: [] });
  registry.plugins = registry.plugins.filter((row) => row.id !== id);
  registry.plugins.push({ id, name, marketplace: market, version, installPath: cache, scope: 'user' });
  writeJson(registryPath, registry);
  const config = readJson(configPath, { plugins: { enabledPlugins: {}, options: {} } });
  config.plugins.enabledPlugins[id] = true;
  writeJson(configPath, config);
  process.exit(0);
}
if (args[0] === 'plugins' && args[1] === 'uninstall') {
  const id = args[2];
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const row = registry.plugins.find((plugin) => plugin.id === id);
  registry.plugins = registry.plugins.filter((plugin) => plugin.id !== id);
  writeFileSync(registryPath, JSON.stringify(registry));
  if (typeof row?.installPath === 'string') rmSync(row.installPath, { recursive: true, force: true });
  if (!args.includes('--keep-data')) rmSync(join(root, 'plugins', 'data', id), { recursive: true, force: true });
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    delete config.plugins?.enabledPlugins?.[id];
    delete config.plugins?.options?.[id];
    writeFileSync(configPath, JSON.stringify(config));
  }
  process.exit(0);
}
process.exit(91);
`);
  chmodSync(path, 0o755);
}

function writePackage(root: string): void {
  mkdirSync(join(root, 'commands'), { recursive: true });
  mkdirSync(join(root, 'skills', 'manual'), { recursive: true });
  writeFileSync(join(root, 'plugin.json'), '{"name":"demo","version":"1.0.0","description":"Demo"}\n');
  writeFileSync(join(root, 'commands', 'report.md'), '---\ndescription: Report\nargument-hint: topic\n---\nReport $ARGUMENTS\n');
  writeFileSync(join(root, 'skills', 'manual', 'SKILL.md'), '---\nname: manual\ndescription: Manual\ndisable-model-invocation: true\n---\nSee [notes](notes.txt)\n');
  writeFileSync(join(root, 'skills', 'manual', 'notes.txt'), 'kept-notes\n');
}

async function withHome(run: (home: string, cliRoot: string) => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'plgnz-zcode-activate-'));
  const cliRoot = join(home, '.zcode', 'cli');
  const binary = join(home, 'zcode');
  const keys = ['OPEN_PLUGIN_HOME', 'OPEN_PLUGIN_ZCODE_CLI_BIN', 'ZCODE_STORAGE_DIR', 'ZCODE_TEST_FAIL_INSTALL', 'ZCODE_TEST_FAIL_UPDATE', 'ZCODE_TEST_RETARGET_ON_UPDATE'] as const;
  const prior = keys.map((key) => process.env[key]);
  const originalCwd = process.cwd();
  process.env.OPEN_PLUGIN_HOME = home;
  process.env.OPEN_PLUGIN_ZCODE_CLI_BIN = binary;
  process.env.ZCODE_STORAGE_DIR = join(home, '.zcode');
  try {
    process.chdir(home);
    mkdirSync(cliRoot, { recursive: true });
    officialFake(binary);
    await run(home, cliRoot);
  } finally {
    process.chdir(originalCwd);
    keys.forEach((key, index) => {
      if (prior[index] === undefined) delete process.env[key];
      else process.env[key] = prior[index];
    });
    rmSync(home, { recursive: true, force: true });
  }
}

async function stageActivation(home: string, action: 'install' | 'update', operationId: string, attemptId: string) {
  const packageRoot = join(home, 'package');
  const target = { kind: 'zcode-cli', instance: 'default' } as const;
  const plugin: PluginSource = {
    name: 'demo',
    dir: packageRoot,
    version: '1.0.0',
    contentFingerprint: fingerprintTree(packageRoot),
  };
  const snapshot = createFrozenPackageSnapshot({
    operationId,
    attemptId,
    scopeId: 'scope-demo',
    target,
    action,
    packageName: 'demo',
    nativeId: NATIVE,
    sourceType: 'local',
    immutableRevision: 'local-demo-revision',
    snapshotRoot: packageRoot,
    packageRoot,
    relativePackagePath: '.',
    snapshotFingerprint: plugin.contentFingerprint ?? '',
    packageFingerprint: plugin.contentFingerprint ?? '',
    inventory: inventoryPackageSemantics(plugin),
  });
  const version = await zcodeCliLifecycle.probeVersion(target);
  const observed = await zcodeCliLifecycle.observeTarget(target);
  const nativeScope = await zcodeCliLifecycle.observeNativeMutationScope({
    targetObservation: observed,
    operation: action,
    packageName: 'demo',
    nativeId: NATIVE,
    sourceType: 'local',
  });
  const pins = createResolvedLifecyclePins([]);
  const nativeProjection = await zcodeCliLifecycle.observeNativeProjection({
    targetObservation: observed,
    operation: action,
    snapshot,
    pins,
  });
  const decision = zcodeCliLifecycle.decideRoute({
    target,
    operation: action,
    operationId,
    attemptId,
    scopeId: 'scope-demo',
    packageName: 'demo',
    nativeId: NATIVE,
    version,
    sourceType: 'local',
    targetObservation: observed,
    nativeScope,
    nativeProjection,
    planCoverage: createLifecyclePlanCoverage(observed, [{
      nativeId: NATIVE,
      operationId,
      operation: action,
      mutationGroupId: `group-${operationId}`,
      authorization: action === 'install' ? 'planned-create' : 'observed-owned',
    }]),
    snapshot,
    pins,
  });
  if (decision.kind !== 'selected') throw new Error(`expected a selected ${action} route, got ${decision.kind}`);
  const staged = await zcodeCliLifecycle.stageActivation({ selection: decision, snapshot, pins });
  return { decision, staged, packageRoot };
}

async function activate(home: string, action: 'install' | 'update', operationId: string, attemptId: string) {
  const { decision, staged, packageRoot } = await stageActivation(home, action, operationId, attemptId);
  const directed = await zcodeCliLifecycle.applyLifecycleDirectives(staged);
  const pinned = await zcodeCliLifecycle.applyPins(directed);
  const prepared = await zcodeCliLifecycle.sealActivation(pinned);
  return { decision, staged, prepared, packageRoot };
}

async function prepareRetire(handle: Awaited<ReturnType<typeof activate>>['prepared']['handle']) {
  const target = handle.target, operationId = 'linked-retire', attemptId = 'linked-retirement';
  const observed = await zcodeCliLifecycle.observeTarget(target);
  const installation = observed.installations.find(row => row.nativeId === NATIVE)!;
  if (installation.ownership.kind !== 'owned') throw new Error('missing owned install');
  const activation = createRecordedOwnedActivation({ scopeId: handle.scopeId, target, packageName: 'demo', nativeId: NATIVE, sourceType: 'local', sourceRevision: handle.sourceRevision, sourceLocator: null, installedVersion: installation.installedVersion, route: 'native', evidenceId: handle.evidenceId, ownership: { kind: 'created', proofId: installation.ownership.proofId }, activation: 'active', enablement: 'enabled', installedFingerprint: installation.installedFingerprint!, contentRoots: installation.contentRoots });
  const nativeScope = await zcodeCliLifecycle.observeNativeMutationScope({ targetObservation: observed, operation: 'retire', packageName: 'demo', nativeId: NATIVE, sourceType: 'local' });
  const nativeProjection = await zcodeCliLifecycle.observeNativeProjection({ targetObservation: observed, operation: 'retire', operationId, attemptId, activation });
  const selection = zcodeCliLifecycle.decideRoute({ target, operation: 'retire', operationId, attemptId, scopeId: handle.scopeId, packageName: 'demo', nativeId: NATIVE, sourceType: 'local', version: await zcodeCliLifecycle.probeVersion(target), targetObservation: observed, nativeScope, nativeProjection, planCoverage: createLifecyclePlanCoverage(observed, [{ nativeId: NATIVE, operationId, operation: 'retire', mutationGroupId: 'linked-retire-group', authorization: 'observed-owned' }]), activation });
  if (selection.kind !== 'selected') throw new Error('retirement unavailable');
  return zcodeCliLifecycle.prepareRetirement({ operationId, attemptId, action: 'remove', selection, activation });
}

describe('ZCode CLI native activation', () => {
  test('genuine pre-seal cleanup disposes only its stage and preserves unrelated snapshots', async () => {
    await withHome(async (home, cliRoot) => {
      writePackage(join(home, 'package'));
      const { staged } = await stageActivation(home, 'install', 'only-stage-operation', 'only-stage-attempt');
      const sibling = join(cliRoot, 'plgnz-lifecycle/other-attempt/other-operation');
      mkdirSync(sibling, { recursive: true }); writeFileSync(join(sibling, 'sentinel'), 'unrelated snapshot bytes');
      const before = fingerprintTree(sibling);
      await zcodeCliLifecycle.cleanup(staged, 'aborted-preparation');
      await zcodeCliLifecycle.cleanup(staged, 'aborted-preparation');
      expect(existsSync(staged.stagingRoot)).toBe(false);
      expect(fingerprintTree(sibling)).toBe(before);
      expect(readFileSync(join(sibling, 'sentinel'), 'utf8')).toBe('unrelated snapshot bytes');
    });
  });
  test('an earlier stage reference cannot retire a later captured owned snapshot', async () => {
    await withHome(async (home) => {
      writePackage(join(home, 'package'));
      const created = await activate(home, 'install', 'sealed-operation', 'sealed-attempt');
      const before = fingerprintTree(created.prepared.handle.rollbackReference);
      const stageBefore = fingerprintTree(join(created.staged.stagingRoot, '..', '..', '..'));
      let rejected = false;
      try { await zcodeCliLifecycle.cleanup(created.staged, 'aborted-preparation'); } catch { rejected = true; }
      expect(rejected).toBe(true);
      expect(fingerprintTree(created.prepared.handle.rollbackReference)).toBe(before);
      expect(fingerprintTree(join(created.staged.stagingRoot, '..', '..', '..'))).toBe(stageBefore);
      await zcodeCliLifecycle.cleanup(created.prepared.handle, 'aborted-preparation');
      expect(existsSync(created.prepared.handle.rollbackReference)).toBe(false);
      expect(existsSync(created.staged.stagingRoot)).toBe(false);
    });
  });
  for (const stagePresent of [true, false]) {
    test(`pre-seal cleanup cannot delete a foreign snapshot tree with stage present=${stagePresent}`, async () => {
      await withHome(async (home, cliRoot) => {
        writePackage(join(home, 'package'));
        const { staged } = await stageActivation(home, 'install', 'preseal-operation', 'preseal-attempt');
        const stage = join(staged.stagingRoot, '..', '..', '..');
        const snapshotParent = join(cliRoot, 'plgnz-lifecycle');
        mkdirSync(snapshotParent); writeFileSync(join(snapshotParent, 'owned-sibling'), 'retained original tree');
        const retained = join(home, 'retained-snapshot-parent'); renameSync(snapshotParent, retained);
        const foreign = join(home, 'foreign-snapshot-parent');
        const destination = join(foreign, staged.attemptId, staged.operationId);
        mkdirSync(destination, { recursive: true }); writeFileSync(join(destination, 'sentinel'), 'foreign snapshot bytes');
        symlinkSync(foreign, snapshotParent);
        if (!stagePresent) rmSync(stage, { recursive: true });
        const foreignBefore = fingerprintTree(foreign), ownedBefore = fingerprintTree(retained), stageBefore = stagePresent ? fingerprintTree(stage) : null;
        let rejected = false;
        try { await zcodeCliLifecycle.cleanup(staged, 'aborted-preparation'); } catch { rejected = true; }
        expect(readFileSync(join(destination, 'sentinel'), 'utf8')).toBe('foreign snapshot bytes');
        expect(rejected).toBe(true);
        expect(fingerprintTree(foreign)).toBe(foreignBefore); expect(fingerprintTree(retained)).toBe(ownedBefore);
        if (stagePresent) expect(fingerprintTree(stage)).toBe(stageBefore);
      });
    });
  }
  test('a native update failure cannot compensate through a retargeted declared root', async () => {
    await withHome(async (home, cliRoot) => {
      const physical = join(home, 'captured-cli'); renameSync(cliRoot, physical); symlinkSync(physical, cliRoot);
      writePackage(join(home, 'package'));
      const installed = await activate(home, 'install', 'native-first', 'native-attempt-first');
      await zcodeCliLifecycle.apply(installed.prepared);
      zcodeCliLifecycle.verify(installed.prepared.handle, await zcodeCliLifecycle.readback(installed.prepared.handle));
      await zcodeCliLifecycle.cleanup(installed.prepared.handle, 'verified-commit');
      writeFileSync(join(home, 'package/skills/manual/notes.txt'), 'updated notes');
      const updated = await activate(home, 'update', 'native-update', 'native-attempt-update');
      const foreign = join(home, 'foreign-cli'); cpSync(physical, foreign, { recursive: true });
      const foreignMarket = join(foreign, 'plgnz-marketplaces', NATIVE.split('@')[1]!);
      writeFileSync(join(foreignMarket, 'sentinel'), 'foreign marketplace bytes');
      const before = fingerprintTree(foreign);
      process.env.ZCODE_TEST_FAIL_UPDATE = '1'; process.env.ZCODE_TEST_RETARGET_ON_UPDATE = foreign;
      let error = '';
      try { await zcodeCliLifecycle.apply(updated.prepared); } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
      expect(error).toContain('plugin update failed');
      expect(error).toContain('captured native root was redirected');
      expect(fingerprintTree(foreign)).toBe(before);
      expect(existsSync(updated.prepared.handle.rollbackReference)).toBe(true);
      expect(readFileSync(join(foreignMarket, 'sentinel'), 'utf8')).toBe('foreign marketplace bytes');
    });
  }, 20_000);
  for (const linked of ['cli', 'storage'] as const) test(`keeps a stable declared native ${linked} root symlink through verified cleanup and retirement`, async () => {
    await withHome(async (home, cliRoot) => {
      const declared = linked === 'cli' ? cliRoot : join(home, '.zcode');
      const physical = join(home, `physical-${linked}`);
      renameSync(declared, physical); symlinkSync(physical, declared);
      writePackage(join(home, 'package'));
      const installed = await activate(home, 'install', 'linked-install', 'linked-attempt');
      await zcodeCliLifecycle.apply(installed.prepared);
      const verified = zcodeCliLifecycle.verify(installed.prepared.handle, await zcodeCliLifecycle.readback(installed.prepared.handle));
      await zcodeCliLifecycle.cleanup(verified.handle, 'verified-commit');
      expect(lstatSync(declared).isSymbolicLink()).toBe(true);
      expect(existsSync(installed.prepared.stagingRoot)).toBe(false);
      expect((await zcodeCliLifecycle.readback(installed.prepared.handle)).activation).toBe('active');
      await zcodeCliLifecycle.cleanup(installed.prepared.handle, 'verified-commit');
      const retirement = await prepareRetire(installed.prepared.handle);
      await zcodeCliLifecycle.retire(retirement);
      zcodeCliLifecycle.verify(retirement.handle, await zcodeCliLifecycle.readback(retirement.handle));
      await zcodeCliLifecycle.cleanup(retirement.handle, 'verified-commit');
      await zcodeCliLifecycle.cleanup(retirement.handle, 'verified-commit');
      expect(lstatSync(declared).isSymbolicLink()).toBe(true);
    });
  }, 20_000);
  for (const phase of ['pre-seal', 'pre-seal-empty', 'before-apply', 'after-apply', 'disposed', 'retired', 'snapshot-parent', 'snapshot-parent-dangling', 'stage-parent'] as const) {
    test(`retargeting the declared native root preserves foreign data at ${phase}`, async () => {
      await withHome(async (home, cliRoot) => {
        const physical = join(home, 'captured-cli'); renameSync(cliRoot, physical); symlinkSync(physical, cliRoot);
        writePackage(join(home, 'package'));
        const installed = await activate(home, 'install', 'retarget-install', 'retarget-attempt');
        let handle = installed.prepared.handle;
        if (phase === 'after-apply' || phase === 'disposed' || phase === 'retired' || phase === 'snapshot-parent' || phase === 'snapshot-parent-dangling') {
          await zcodeCliLifecycle.apply(installed.prepared);
          zcodeCliLifecycle.verify(handle, await zcodeCliLifecycle.readback(handle));
        }
        if (phase === 'disposed') await zcodeCliLifecycle.cleanup(handle, 'verified-commit');
        const retirement = phase === 'retired' ? await prepareRetire(handle) : null;
        if (retirement !== null) {
          await zcodeCliLifecycle.retire(retirement);
          zcodeCliLifecycle.verify(retirement.handle, await zcodeCliLifecycle.readback(retirement.handle));
        }
        const authority = retirement?.handle ?? hydrateDurableLifecycleOperation(JSON.parse(JSON.stringify(handle)));
        if (phase === 'snapshot-parent' || phase === 'snapshot-parent-dangling' || phase === 'stage-parent') {
          const parent = join(physical, phase === 'stage-parent' ? '.plgnz-zcode-stage' : 'plgnz-lifecycle');
          const retained = join(home, 'retained-owned-parent'); renameSync(parent, retained);
          const foreign = join(home, 'foreign-parent'); cpSync(retained, foreign, { recursive: true });
          writeFileSync(join(foreign, 'sentinel'), 'foreign parent bytes'); symlinkSync(phase === 'snapshot-parent-dangling' ? join(foreign, 'missing-parent') : foreign, parent);
          const before = fingerprintTree(foreign), ownedBefore = fingerprintTree(retained);
          let rejected = false;
          try { await zcodeCliLifecycle.cleanup(authority, 'aborted-preparation'); } catch { rejected = true; }
          expect(rejected).toBe(true);
          rejected = false;
          try { if (phase === 'stage-parent') await zcodeCliLifecycle.apply(installed.prepared); else await zcodeCliLifecycle.rollback(authority); } catch { rejected = true; }
          expect(rejected).toBe(true);
          expect(fingerprintTree(foreign)).toBe(before); expect(fingerprintTree(retained)).toBe(ownedBefore);
          return;
        }
        const foreign = join(home, 'foreign-cli'); cpSync(physical, foreign, { recursive: true });
        const foreignSnapshot = join(foreign, 'plgnz-lifecycle', authority.attemptId, authority.operationId);
        mkdirSync(foreignSnapshot, { recursive: true }); writeFileSync(join(foreignSnapshot, 'sentinel'), 'foreign snapshot bytes');
        if (phase === 'pre-seal-empty') { rmSync(join(foreign, '.plgnz-zcode-stage'), { recursive: true }); rmSync(join(foreign, 'plgnz-lifecycle'), { recursive: true }); }
        writeFileSync(join(foreign, 'foreign-user-data'), 'untouched');
        rmSync(cliRoot); symlinkSync(foreign, cliRoot);
        const before = fingerprintTree(foreign), ownedBefore = fingerprintTree(physical);
        const fails = async (run: Promise<unknown>) => { let rejected = false; try { await run; } catch { rejected = true; } expect(rejected).toBe(true); };
        if (phase === 'before-apply') await fails(zcodeCliLifecycle.apply(installed.prepared));
        await fails(zcodeCliLifecycle.cleanup(phase === 'pre-seal' || phase === 'pre-seal-empty' ? installed.staged : authority, 'aborted-preparation'));
        if (phase !== 'pre-seal' && phase !== 'pre-seal-empty') await fails(zcodeCliLifecycle.rollback(authority));
        expect(fingerprintTree(foreign)).toBe(before);
        expect(fingerprintTree(physical)).toBe(ownedBefore);
        if (phase !== 'pre-seal-empty') expect(readFileSync(join(foreignSnapshot, 'sentinel'), 'utf8')).toBe('foreign snapshot bytes');
      });
    }, 20_000);
  }
  for (const phase of ['pre-seal', 'durable'] as const) {
    test(`cleanup preserves a foreign replacement stage using ${phase} authority`, async () => {
      await withHome(async (home) => {
        writePackage(join(home, 'package'));
        const created = await stageActivation(home, 'install', `cleanup-${phase}`, `attempt-${phase}`);
        const sealed = phase === 'durable' ? await zcodeCliLifecycle.sealActivation(await zcodeCliLifecycle.applyPins(await zcodeCliLifecycle.applyLifecycleDirectives(created.staged))) : null;
        const stage = join(created.staged.stagingRoot, '..', '..', '..');
        const retained = join(home, 'retained-owned-stage');
        renameSync(stage, retained); mkdirSync(stage);
        const reference = sealed === null ? created.staged : hydrateDurableLifecycleOperation(JSON.parse(JSON.stringify(sealed.handle)));
        writeFileSync(join(stage, 'stage-receipt.json'), JSON.stringify({ attemptId: created.staged.attemptId, operationId: created.staged.operationId, sourceRevision: 'forged', packageFingerprint: 'forged', projectedFingerprint: sealed?.handle.projectedFingerprint ?? 'forged' }));
        writeFileSync(join(stage, 'sentinel'), 'foreign user bytes');
        let refused = false;
        try { await zcodeCliLifecycle.cleanup(reference, 'aborted-preparation'); } catch { refused = true; }
        expect(refused).toBe(true);
        expect(readFileSync(join(stage, 'sentinel'), 'utf8')).toBe('foreign user bytes');
        for (const changed of ['resource', 'marketplace', 'receipt-extra', 'plugin', 'outer-extra'] as const) {
          rmSync(stage, { recursive: true }); cpSync(retained, stage, { recursive: true });
          if (changed === 'resource') writeFileSync(join(stage, 'resources/skills/manual/notes.txt'), 'foreign resource');
          if (changed === 'marketplace') writeFileSync(join(stage, 'marketplace/marketplace.json'), JSON.stringify({ name: 'foreign' }));
          if (changed === 'receipt-extra') { const path = join(stage, 'stage-receipt.json'); const receipt = JSON.parse(readFileSync(path, 'utf8')); receipt.foreign = 'user bytes'; writeFileSync(path, JSON.stringify(receipt)); }
          if (changed === 'plugin') writeFileSync(join(stage, 'marketplace/plugins/demo/plugin.json'), '{"name":"foreign"}');
          if (changed === 'outer-extra') writeFileSync(join(stage, 'sentinel'), 'foreign extra');
          const before = fingerprintTree(stage);
          refused = false;
          try { await zcodeCliLifecycle.cleanup(reference, 'aborted-preparation'); } catch { refused = true; }
          expect({ changed, refused }).toEqual({ changed, refused: true });
          expect(fingerprintTree(stage)).toBe(before);
        }
        rmSync(stage, { recursive: true }); symlinkSync(join(home, 'missing-foreign-root'), stage);
        refused = false;
        try { await zcodeCliLifecycle.cleanup(reference, 'aborted-preparation'); } catch { refused = true; }
        expect(refused).toBe(true);
        expect(lstatSync(stage).isSymbolicLink()).toBe(true);
        rmSync(stage); renameSync(retained, stage);
        await zcodeCliLifecycle.cleanup(reference, 'aborted-preparation');
        expect(existsSync(stage)).toBe(false);
        await zcodeCliLifecycle.cleanup(reference, 'aborted-preparation');
      });
    });
  }
  test('installs a projected command and user-only skill, then reads the same bytes back', async () => {
    await withHome(async (home, cliRoot) => {
      const packageRoot = join(home, 'package');
      writePackage(packageRoot);
      const first = await activate(home, 'install', 'op-install-demo', 'attempt-install-demo');
      const profile = zcodeCliEvidenceProfiles.find((item) => item.route === 'native' && item.operations.includes('install'));
      expect(first.decision.route).toBe('native');
      expect(first.decision.evidenceId).toBe(profile?.evidenceId);
      expect(first.prepared.handle.expected.transition).toEqual({ requirement: 'restart', status: 'effective' });
      const applied = await zcodeCliLifecycle.apply(first.prepared);
      expect(applied.changed).toBe(true);
      const observation = await zcodeCliLifecycle.readback(first.prepared.handle);
      zcodeCliLifecycle.verify(first.prepared.handle, observation);

      const registry = JSON.parse(readFileSync(join(cliRoot, 'plugins', 'installed_plugins.json'), 'utf8'));
      const row = registry.plugins.find((item: { id: string }) => item.id === NATIVE);
      expect(row.version).toContain('+plgnz.');
      expect(row.installPath.includes(row.version.replaceAll('+', '-'))).toBe(true);
      expect(row.installPath.includes('+')).toBe(false);
      expect(existsSync(join(row.installPath, 'commands', 'demo', 'report.md'))).toBe(true);
      expect(readFileSync(join(row.installPath, 'commands', 'demo', 'report.md'), 'utf8')).toContain('$ARGUMENTS');
      expect(existsSync(join(row.installPath, 'skills', 'manual', 'SKILL.md'))).toBe(false);
      const manual = readFileSync(join(row.installPath, 'commands', 'demo', 'manual.md'), 'utf8');
      expect(manual).toContain('notes.txt');
      expect(manual).toContain('plgnz-resources');
      expect(existsSync(join(cliRoot, 'plgnz-resources', 'plgnz-activation01'))).toBe(true);

      const again = await activate(home, 'update', 'op-install-again', 'attempt-install-again');
      const repeat = await zcodeCliLifecycle.apply(again.prepared);
      expect(repeat.changed).toBe(false);
      zcodeCliLifecycle.verify(again.prepared.handle, await zcodeCliLifecycle.readback(again.prepared.handle));
    });
  }, 20_000); // Multiple CLI legs exceed the default five-second budget under suite load.

  test('updates and rolls back without dropping retained plugin data', async () => {
    await withHome(async (home, cliRoot) => {
      const packageRoot = join(home, 'package');
      writePackage(packageRoot);
      const installed = await activate(home, 'install', 'op-install-demo', 'attempt-install-demo');
      await zcodeCliLifecycle.apply(installed.prepared);
      const data = join(cliRoot, 'plugins', 'data', NATIVE, 'session.txt');
      mkdirSync(join(cliRoot, 'plugins', 'data', NATIVE), { recursive: true });
      writeFileSync(data, 'kept-session\n');
      const configPath = join(cliRoot, 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      config.plugins.options[NATIVE] = { theme: 'kept' };
      writeFileSync(configPath, JSON.stringify(config));
      const before = JSON.parse(readFileSync(join(cliRoot, 'plugins', 'installed_plugins.json'), 'utf8'));
      const priorPath = before.plugins.find((item: { id: string }) => item.id === NATIVE).installPath as string;
      const priorCommand = readFileSync(join(priorPath, 'commands', 'demo', 'report.md'), 'utf8');

      writeFileSync(join(packageRoot, 'commands', 'report.md'), '---\ndescription: Report\nargument-hint: topic\n---\nReport $ARGUMENTS updated\n');
      const updated = await activate(home, 'update', 'op-update-demo', 'attempt-update-demo');
      const applied = await zcodeCliLifecycle.apply(updated.prepared);
      expect(applied.changed).toBe(true);
      zcodeCliLifecycle.verify(updated.prepared.handle, await zcodeCliLifecycle.readback(updated.prepared.handle));
      const after = JSON.parse(readFileSync(join(cliRoot, 'plugins', 'installed_plugins.json'), 'utf8'));
      const nextPath = after.plugins.find((item: { id: string }) => item.id === NATIVE).installPath as string;
      expect(nextPath === priorPath).toBe(false);
      expect(readFileSync(join(nextPath, 'commands', 'demo', 'report.md'), 'utf8')).toContain('updated');
      expect(readFileSync(data, 'utf8')).toBe('kept-session\n');
      expect(JSON.parse(readFileSync(configPath, 'utf8')).plugins.options[NATIVE]).toEqual({ theme: 'kept' });

      const rolled = await zcodeCliLifecycle.rollback(updated.prepared.handle);
      expect(rolled.changed).toBe(true);
      zcodeCliLifecycle.verifyRollback(updated.prepared.handle, await zcodeCliLifecycle.readback(updated.prepared.handle));
      expect(readFileSync(join(priorPath, 'commands', 'demo', 'report.md'), 'utf8')).toBe(priorCommand);
      expect(readFileSync(data, 'utf8')).toBe('kept-session\n');
      expect(JSON.parse(readFileSync(configPath, 'utf8')).plugins.options[NATIVE]).toEqual({ theme: 'kept' });

      await zcodeCliWriter.remove(NATIVE);
      expect(JSON.parse(readFileSync(join(cliRoot, 'plugins', 'installed_plugins.json'), 'utf8')).plugins.some((item: { id: string }) => item.id === NATIVE)).toBe(false);
      expect(readFileSync(data, 'utf8')).toBe('kept-session\n');
      expect(JSON.parse(readFileSync(configPath, 'utf8')).plugins.options[NATIVE]).toEqual({ theme: 'kept' });
      const uninstalls = readFileSync(join(cliRoot, 'cli-invocations.log'), 'utf8').split('\n').filter((line) => line.startsWith('plugins uninstall'));
      expect(uninstalls).toEqual([]);
    });
  }, 20_000);

  test('rolling back a fresh install drops that marketplace registration', async () => {
    await withHome(async (home, cliRoot) => {
      writePackage(join(home, 'package'));
      const installed = await activate(home, 'install', 'op-install-demo', 'attempt-install-demo');
      await zcodeCliLifecycle.apply(installed.prepared);
      const marketsPath = join(cliRoot, 'plugins', 'known_marketplaces.json');
      const markets = JSON.parse(readFileSync(marketsPath, 'utf8')) as Record<string, string>;
      expect(markets['plgnz-activation01']).toContain('plgnz-marketplaces');
      markets['other-market'] = '/kept/other-market';
      writeFileSync(marketsPath, JSON.stringify(markets));
      await zcodeCliLifecycle.rollback(installed.prepared.handle);
      zcodeCliLifecycle.verifyRollback(installed.prepared.handle, await zcodeCliLifecycle.readback(installed.prepared.handle));
      const after = JSON.parse(readFileSync(marketsPath, 'utf8')) as Record<string, string>;
      expect(Object.hasOwn(after, 'plgnz-activation01')).toBe(false);
      expect(after['other-market']).toBe('/kept/other-market');
      const registry = JSON.parse(readFileSync(join(cliRoot, 'plugins', 'installed_plugins.json'), 'utf8')) as { plugins: Array<{ id: string }> };
      expect(registry.plugins.some((row) => row.id === NATIVE)).toBe(false);
    });
  });

  test('a failed fresh install drops the marketplace registration', async () => {
    await withHome(async (home, cliRoot) => {
      writePackage(join(home, 'package'));
      const installed = await activate(home, 'install', 'op-install-fail', 'attempt-install-fail');
      process.env.ZCODE_TEST_FAIL_INSTALL = '1';
      let failure: Error | undefined;
      try {
        await zcodeCliLifecycle.apply(installed.prepared);
      } catch (error) {
        failure = error as Error;
      }
      expect(failure?.message ?? '').toContain('plugins install');
      const log = readFileSync(join(cliRoot, 'cli-invocations.log'), 'utf8');
      expect(log.includes('plugins marketplace add')).toBe(true);
      const marketsPath = join(cliRoot, 'plugins', 'known_marketplaces.json');
      const after = existsSync(marketsPath) ? JSON.parse(readFileSync(marketsPath, 'utf8')) as Record<string, unknown> : {};
      expect(Object.hasOwn(after, 'plgnz-activation01')).toBe(false);
    });
  });

  test('a failed update rolls back to the previous activation', async () => {
    await withHome(async (home) => {
      const packageRoot = join(home, 'package');
      writePackage(packageRoot);
      const installed = await activate(home, 'install', 'op-install-demo', 'attempt-install-demo');
      await zcodeCliLifecycle.apply(installed.prepared);
      writeFileSync(join(packageRoot, 'commands', 'report.md'), '---\ndescription: Report\nargument-hint: topic\n---\nReport $ARGUMENTS failed\n');
      const updated = await activate(home, 'update', 'op-update-fail', 'attempt-update-fail');
      process.env.ZCODE_TEST_FAIL_UPDATE = '1';
      let failure: Error | undefined;
      try {
        await zcodeCliLifecycle.apply(updated.prepared);
      } catch (error) {
        failure = error as Error;
      }
      expect(failure?.message ?? '').toContain('plugins update');
      await zcodeCliLifecycle.rollback(updated.prepared.handle);
      zcodeCliLifecycle.verifyRollback(updated.prepared.handle, await zcodeCliLifecycle.readback(updated.prepared.handle));
    });
  });
});
