import { describe, expect, test } from 'bun:test';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fingerprintTree } from '../src/fingerprint';
import { codexEvidenceProfiles, codexLifecycle, codexMarketplaceCheckoutRollback } from '../src/hosts/codex-writer';
import type { FrozenPackageSnapshot, LifecycleRouteDecision, SelectedRouteDecision } from '../src/lifecycle-host';
import {
  createFrozenPackageSnapshot,
  createLifecyclePlanCoverage,
  createRecordedOwnedActivation,
  createResolvedLifecyclePins,
  hydrateDurableLifecycleOperation,
} from '../src/lifecycle-runtime';
import { emptyInventory } from './lifecycle-fixtures';
import { withHostEnvAsync, writeFiles } from './util';

const target = { kind: 'codex', instance: 'default' } as const;
const marketplace = 'demo-market';
const frozenSha = 'a'.repeat(40);
const sourceLocator = 'https://github.com/example/plugins.git';
const demoId = 'demo-plugin@demo-market';
const otherId = 'other-plugin@demo-market';
const foreignId = 'foreign-plugin@other-market';

describe('codex native marketplace upgrade route', () => {
  test('admits 0.161.0 only for the proven managed route', async () => {
    await withHostEnvAsync('codex', async (home) => {
      const binary = join(home, 'bin', 'codex');
      writeFiles(home, { 'bin/codex': '#!/bin/sh\nprintf "%s\\n" "codex-cli 0.161.0"\n' });
      chmodSync(binary, 0o755);
      process.env['OPEN_PLUGIN_CODEX_BIN'] = binary;
      try {
        const snapshot = frozenSnapshot(home);
        writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
        expect(selectedRoute(await selectedUpdate(snapshot, createResolvedLifecyclePins([]))).route).toBe('managed');
        const profile = codexEvidenceProfiles.find((candidate) => candidate.detectedVersion === '0.161.0' && candidate.route === 'managed' && candidate.packageFormat === undefined);
        expect(profile?.operations).toEqual(['install', 'retire', 'update']);
        expect(profile?.agentPolicy).toBe('prompt-resources');
        expect(Object.entries(profile?.semantics ?? {}).filter(([, status]) => status === 'supported').map(([semantic]) => semantic).sort()).toEqual([
          'activation-reload', 'agents', 'auto-update-control', 'commands', 'mcp', 'model-invocation-control', 'ordinary-skills', 'readback', 'resources', 'retention-safety', 'retirement', 'rollback',
        ]);
      } finally {
        delete process.env['OPEN_PLUGIN_CODEX_BIN'];
      }
    });
  });

  test('sparse checkout configuration selects Managed before native writes', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home);
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const config = join(home, '.codex/config.toml');
      const original = readFileSync(config, 'utf8');
      for (const sparse of ['["packages/demo-plugin"]']) {
        writeFileSync(config, original.replace('[marketplaces.demo-market]', `[marketplaces.demo-market]\nsparse_paths = ${sparse}`));
        const before = fingerprintTree(join(home, '.codex'));
        expect(selectedRoute(await selectedUpdate(snapshot, createResolvedLifecyclePins([]))).route).toBe('managed');
        expect(fingerprintTree(join(home, '.codex'))).toBe(before);
      }
      writeFileSync(config, original.replace('[marketplaces.demo-market]', '[marketplaces.demo-market]\nsparse_paths = []'));
      expect(selectedRoute(await selectedUpdate(snapshot, createResolvedLifecyclePins([]))).route).toBe('native');
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
    });
  });
  test('malformed sparse checkout configuration is a preflight defect', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home);
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const config = join(home, '.codex/config.toml');
      const original = readFileSync(config, 'utf8');
      for (const sparse of ['"packages/demo-plugin"', '[1]']) {
        writeFileSync(config, original.replace('[marketplaces.demo-market]', `[marketplaces.demo-market]\nsparse_paths = ${sparse}`));
        const before = fingerprintTree(join(home, '.codex'));
        let diagnostic = '';
        try { await selectedUpdate(snapshot, createResolvedLifecyclePins([])); } catch (error) { diagnostic = String(error); }
        expect(diagnostic).toContain('invalid Codex marketplace sparse_paths');
        expect(fingerprintTree(join(home, '.codex'))).toBe(before);
      }
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
    });
  });
  test('unproven inactive slot contents survive a Managed update with no native write', async () => {
    for (const extra of ['unowned-version', 'older-owned-version', 'metadata']) {
      await withCodexBinary(async home => {
        const snapshot = frozenSnapshot(home, '1.1.0');
        writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
        const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
        const kept = extra === 'metadata' ? join(slot, 'user-note.json') : join(slot, '0.9.0');
        if (extra === 'metadata') writeFileSync(kept, '{"valuable":"metadata"}');
        else {
          writeFiles(kept, { 'plugin.json': '{"name":"demo-plugin","version":"0.9.0"}', 'valuable.txt': 'older bytes' });
          if (extra === 'older-owned-version') writeFiles(kept, { '.plgnz-install.json': JSON.stringify({ source: sourceLocator, pluginId: demoId, fingerprint: 'older-source' }) });
        }
        const before = extra === 'metadata' ? readFileSync(kept, 'utf8') : fingerprintTree(kept);
        const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
        expect(prepared.handle.route).toBe('managed');
        await codexLifecycle.apply(prepared);
        codexLifecycle.verify(prepared.handle, await codexLifecycle.readback(prepared.handle));
        expect(extra === 'metadata' ? readFileSync(kept, 'utf8') : fingerprintTree(kept)).toBe(before);
        expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
      });
    }
  });
  test('Managed selection cannot overwrite an unproven inactive requested version', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home, '0.9.0');
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      writeFiles(home, { '.codex/plugins/cache/demo-market/demo-plugin/0.9.0/valuable.txt': 'foreign inactive version' });
      const before = fingerprintTree(join(home, '.codex'));
      let diagnostic = '';
      try { await selectedUpdate(snapshot, createResolvedLifecyclePins([])); } catch (error) { diagnostic = String(error); }
      expect(diagnostic).toContain('inactive requested version');
      expect(fingerprintTree(join(home, '.codex'))).toBe(before);
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
    });
  });
  test('native failure restores the complete proven slot and its modes', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home, '1.1.0');
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
      chmodSync(slot, 0o750);
      chmodSync(join(slot, '1.0.0'), 0o700);
      const before = fingerprintTree(slot);
      writeFiles(home, { '.codex/upgrade-mode': 'replace-slot-failure\n' });
      const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
      expect(prepared.handle.route).toBe('native');
      let diagnostic = '';
      try { await codexLifecycle.apply(prepared); } catch (error) { diagnostic = String(error); }
      expect(diagnostic).toContain('native failure after complete slot replacement');
      const hydrated = hydrateDurableLifecycleOperation(JSON.parse(JSON.stringify(prepared.handle)));
      await codexLifecycle.rollback(hydrated);
      codexLifecycle.verifyRollback(prepared.handle, await codexLifecycle.readback(prepared.handle));
      expect(readdirSync(slot).sort()).toEqual(['1.0.0']);
      expect(fingerprintTree(slot)).toBe(before);
      expect(statSync(slot).mode & 0o777).toBe(0o750);
      expect(statSync(join(slot, '1.0.0')).mode & 0o777).toBe(0o700);
    });
  });
  test('complete slot CAS refuses changed inactive bytes, modes, metadata and parent before any rollback write', async () => {
    for (const changed of ['inactive-bytes', 'inactive-mode', 'slot-mode', 'metadata', 'parent-mode', 'snapshot', 'captured-authority']) {
      await withCodexBinary(async home => {
        const snapshot = frozenSnapshot(home);
        writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
        const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
        const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
        expect(prepared.handle.route).toBe('native');
        if (changed === 'inactive-bytes') writeFiles(join(slot, '0.9.0'), { 'foreign.txt': 'concurrent value' });
        else if (changed === 'inactive-mode') chmodSync(join(slot, '1.0.0'), 0o700);
        else if (changed === 'slot-mode') chmodSync(slot, 0o700);
        else if (changed === 'metadata') writeFileSync(join(slot, 'foreign.json'), '{"keep":true}');
        else if (changed === 'parent-mode') chmodSync(join(home, '.codex/plugins/cache/demo-market'), 0o700);
        else if (changed === 'captured-authority') {
          const capture = join(home, '.codex/.plgnz-rollback', prepared.handle.attemptId, prepared.handle.operationId, 'native-cache.json');
          const rows = JSON.parse(readFileSync(capture, 'utf8'));
          rows[0].parentMode = 0o700;
          chmodSync(join(home, '.codex/plugins/cache/demo-market'), 0o700);
          writeFileSync(capture, JSON.stringify(rows));
        }
        else writeFiles(join(home, '.codex/.plgnz-rollback', prepared.handle.attemptId, prepared.handle.operationId, 'native-cache/0'), { 'foreign.txt': 'corrupt capture' });
        const before = fingerprintTree(join(home, '.codex'));
        const slotMode = statSync(slot).mode;
        const parentMode = statSync(join(home, '.codex/plugins/cache/demo-market')).mode;
        let diagnostic = '';
        try { await codexLifecycle.rollback(prepared.handle); } catch (error) { diagnostic = String(error); }
        expect(diagnostic).toContain('Codex');
        expect(fingerprintTree(join(home, '.codex'))).toBe(before);
        expect(statSync(slot).mode).toBe(slotMode);
        expect(statSync(join(home, '.codex/plugins/cache/demo-market')).mode).toBe(parentMode);
      });
    }
  });
  test('changed inactive slot bytes are rejected before the native call', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home);
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
      const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
      writeFiles(join(slot, '0.9.0'), { 'foreign.txt': 'concurrent value' });
      const before = fingerprintTree(join(home, '.codex'));
      let diagnostic = '';
      try { await codexLifecycle.apply(prepared); } catch (error) { diagnostic = String(error); }
      expect(diagnostic).toContain('complete cache slot changed');
      expect(fingerprintTree(join(home, '.codex'))).toBe(before);
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
    });
  });
  test('byte-identical directories with mismatched native version identities cannot prove multiversion ownership', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home);
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
      cpSync(join(slot, '1.0.0'), join(slot, '0.9.0'), { recursive: true });
      expect(selectedRoute(await selectedUpdate(snapshot, createResolvedLifecyclePins([]))).route).toBe('managed');
    });
  });
  test('a concurrent inactive version after native failure is preserved with no rollback writes', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home, '1.1.0');
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      writeFiles(home, { '.codex/upgrade-mode': 'replace-slot-failure\n' });
      const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
      try { await codexLifecycle.apply(prepared); } catch { /* the native fixture fails after replacing its slot */ }
      const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
      writeFiles(join(slot, '0.9.0'), { 'foreign.txt': 'concurrent inactive bytes' });
      const before = fingerprintTree(join(home, '.codex'));
      let diagnostic = '';
      try { await codexLifecycle.rollback(prepared.handle); } catch (error) { diagnostic = String(error); }
      expect(diagnostic).toContain('refusing rollback before any restore write');
      expect(fingerprintTree(join(home, '.codex'))).toBe(before);
    });
  });
  test('historical unbound rollback references remain readable but cannot authorize a complete-slot restore', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home);
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
      const historicalReference = `codex:${prepared.handle.attemptId}:${prepared.handle.operationId}`;
      const historical = hydrateDurableLifecycleOperation({ ...prepared.handle, rollbackReference: historicalReference });
      expect(historical.rollbackReference).toBe(historicalReference);
      const before = fingerprintTree(join(home, '.codex'));
      let diagnostic = '';
      try { await codexLifecycle.rollback(historical); } catch (error) { diagnostic = String(error); }
      expect(diagnostic).toContain('sealed rollback reference');
      expect(fingerprintTree(join(home, '.codex'))).toBe(before);
    });
  });
  test('Source-authored native metadata selects Managed before any native write', async () => {
    await withCodexBinary(async home => {
      const original = frozenSnapshot(home);
      writeFiles(original.snapshotRoot, { '.codex-marketplace-install.json': '{"authored":true}\n' });
      const snapshot = createFrozenPackageSnapshot({ ...original, snapshotFingerprint: fingerprintTree(original.snapshotRoot) });
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const before = fingerprintTree(join(home, '.codex'));
      const decision = selectedRoute(await selectedUpdate(snapshot, createResolvedLifecyclePins([])));
      expect(decision.route).toBe('managed');
      expect(fingerprintTree(join(home, '.codex'))).toBe(before);
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
    });
  });
  test('a failed native call with exact native metadata restores the prior full checkout', async () => {
    await withCodexBinary(async home => {
      const original = frozenSnapshot(home);
      const checkout = join(home, '.codex/.tmp/marketplaces/demo-market');
      cpSync(original.snapshotRoot, checkout, { recursive: true });
      const git = (args: string[]): string => {
        const result = spawnSync('git', ['-C', checkout, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8' });
        if (result.status !== 0) throw new Error(result.stderr);
        return result.stdout.trim();
      };
      git(['init']); git(['config', 'remote.origin.url', sourceLocator]);
      writeFileSync(join(checkout, 'packages/demo-plugin/plugin.json'), '{"name":"demo-plugin","version":"prior"}\n');
      git(['add', '.']); git(['commit', '-m', 'prior']);
      const priorRevision = git(['rev-parse', 'HEAD']);
      cpSync(original.snapshotRoot, checkout, { recursive: true });
      git(['add', '.']); git(['commit', '-m', 'candidate']);
      const revision = git(['rev-parse', 'HEAD']);
      git(['checkout', '--detach', priorRevision]);
      chmodSync(checkout, 0o755);
      const prior = fingerprintTree(checkout);
      const snapshot = createFrozenPackageSnapshot({ ...original, immutableRevision: revision, nativeGit: { locator: sourceLocator, resolvedRevision: revision } });
      if (!isUpdateSnapshot(snapshot)) throw new Error('fixture action drift');
      writeCatalog(home, revision, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      writeFiles(home, {
        '.codex/upgrade-mode': 'checkout-metadata-failure\n',
        '.codex/candidate-revision': revision,
        '.codex/candidate-metadata.json': JSON.stringify({ source_type: 'git', source: sourceLocator, ref_name: revision, sparse_paths: [], revision }),
      });
      const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
      expect(prepared.handle.route).toBe('native');
      let diagnostic = '';
      try { await codexLifecycle.apply(prepared); } catch (error) { diagnostic = String(error); }
      expect(diagnostic).toContain('native cache permission failure');
      expect(git(['rev-parse', 'HEAD'])).toBe(revision);
      await codexLifecycle.rollback(prepared.handle);
      expect(fingerprintTree(checkout)).toBe(prior);
      expect(git(['rev-parse', 'HEAD'])).toBe(priorRevision);
      expect(statSync(checkout).mode & 0o777).toBe(0o755);
    });
  });
  test('a checkout changed after preparation blocks before any native mutation', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home);
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const checkout = join(home, '.codex/.tmp/marketplaces/demo-market');
      writeFiles(checkout, { 'HEAD': 'prior checkout\n' });
      const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
      writeFiles(checkout, { 'HEAD': 'external checkout\n' });
      let diagnostic = '';
      try { await codexLifecycle.apply(prepared); } catch (error) { diagnostic = String(error); }
      expect(diagnostic).toContain('checkout changed after rollback capture');
      expect(readFileSync(join(checkout, 'HEAD'), 'utf8')).toBe('external checkout\n');
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
    });
  });
  test('an obsolete ref_name field cannot establish native immutable binding', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home);
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const path = join(home, '.codex/config.toml');
      writeFileSync(path, readFileSync(path, 'utf8').replace('ref =', 'ref_name ='));
      expect(selectedRoute(await selectedUpdate(snapshot, createResolvedLifecyclePins([]))).route).toBe('managed');
    });
  });
  test('native rollback accepts the exact unchanged captured checkout and prior code', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home);
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const checkout = join(home, '.codex/.tmp/marketplaces/demo-market');
      writeFiles(checkout, { 'HEAD': 'prior checkout\n', 'catalog.json': 'prior catalog\n' });
      const prior = fingerprintTree(checkout);
      const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
      await codexLifecycle.rollback(prepared.handle);
      expect(fingerprintTree(checkout)).toBe(prior);
      codexLifecycle.verifyRollback(prepared.handle, await codexLifecycle.readback(prepared.handle));
    });
  });
  test('foreign checkout appearing after apply blocks every rollback restore write', async () => {
    await withCodexBinary(async home => {
      const snapshot = frozenSnapshot(home);
      writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
      const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
      await codexLifecycle.apply(prepared);
      const checkout = join(home, '.codex/.tmp/marketplaces/demo-market');
      writeFiles(checkout, { 'foreign.txt': 'external owned content\n' });
      const before = fingerprintTree(join(home, '.codex'));
      let diagnostic = '';
      try { await codexLifecycle.rollback(prepared.handle); } catch (error) { diagnostic = String(error); }
      expect(diagnostic).toContain('refusing rollback before any restore write');
      expect(fingerprintTree(join(home, '.codex'))).toBe(before);
      expect(existsSync(join(home, '.codex/.plgnz-rollback', prepared.handle.attemptId, prepared.handle.operationId, 'manifest.json'))).toBe(true);
    });
  });
  test('foreign cache and config changes block rollback before any restore write', async () => {
    for (const surface of ['cache', 'config']) {
      await withCodexBinary(async home => {
        const snapshot = frozenSnapshot(home);
        writeCatalog(home, frozenSha, [demoId]); installPlugin(home, 'demo-plugin', demoId, true);
        const prepared = await prepareUpdate(snapshot, createResolvedLifecyclePins([]));
        if (surface === 'cache') writeFiles(home, { '.codex/plugins/cache/demo-market/demo-plugin/1.0.0/foreign.txt': 'valuable external content\n' });
        else writeFileSync(join(home, '.codex/config.toml'), readFileSync(join(home, '.codex/config.toml'), 'utf8').replace('enabled = true', 'enabled = false'));
        const before = fingerprintTree(join(home, '.codex'));
        let diagnostic = '';
        try { await codexLifecycle.rollback(prepared.handle); } catch (error) { diagnostic = String(error); }
        expect(diagnostic).toContain('refusing rollback before any restore write');
        expect(fingerprintTree(join(home, '.codex'))).toBe(before);
      });
    }
  });
  test('refuses native marketplace upgrade unless the catalog is bound to the frozen SHA and every affected plugin is owned', async () => {
    await withHostEnvAsync('codex', async (home) => {
      const binary = join(home, 'bin', 'codex');
      writeFiles(home, { 'bin/codex': '#!/bin/sh\nprintf "%s\\n" "codex-cli 0.162.0"\n' });
      chmodSync(binary, 0o755);
      process.env['OPEN_PLUGIN_CODEX_BIN'] = binary;
      try {
        const snapshot = frozenSnapshot(home);
        const pins = createResolvedLifecyclePins([]);
        writeCatalog(home, 'main', [demoId]);
        installPlugin(home, 'demo-plugin', demoId, true);
        const unbound = selectedRoute(await selectedUpdate(snapshot, pins));
        expect(unbound.route).toBe('managed');

        writeCatalog(home, frozenSha, [demoId, otherId]);
        installPlugin(home, 'other-plugin', otherId, false);
        const unowned = selectedRoute(await selectedUpdate(snapshot, pins));
        expect(unowned.route).toBe('managed');

        installPlugin(home, 'other-plugin', otherId, true);
        writeCatalog(home, frozenSha, [demoId, otherId, foreignId]);
        installPlugin(home, 'foreign-plugin', foreignId, false);
        const eligible = selectedRoute(await selectedUpdate(snapshot, pins));
        expect(eligible.route).toBe('native');
        expect([...eligible.affectedNativeIds]).toEqual([demoId, otherId]);
      } finally {
        delete process.env['OPEN_PLUGIN_CODEX_BIN'];
      }
    });
  });

  test('selects Managed before any marketplace upgrade write when the catalog ref is not the frozen SHA', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home);
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, 'main', [demoId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('managed');
      const receipt = await codexLifecycle.apply(prepared);
      const cache = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.0.0');
      expect(receipt.changed).toBe(true);
      expect(readFileSync(join(cache, '.codex-plugin/plugin.json'), 'utf8')).toContain('"name":"demo-plugin"');
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
      const observed = await codexLifecycle.readback(prepared.handle);
      expect(observed.installedFingerprint).toBe(prepared.handle.projectedFingerprint);
      expect(observed.presence).toBe('present');
    });
  });

  test('reports stderr-only upgrade failure and partial plugin mutation without falling through to Managed', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home);
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, frozenSha, [demoId, otherId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      installPlugin(home, 'other-plugin', otherId, true);
      const cache = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.0.0/.codex-plugin/plugin.json');

      writeFiles(home, { '.codex/upgrade-mode': 'stderr\n' });
      const stderrPrepared = await prepareUpdate(snapshot, pins);
      expect(stderrPrepared.handle.route).toBe('native');
      let stderrFailure: Error | undefined;
      try { await codexLifecycle.apply(stderrPrepared); } catch (caught) { stderrFailure = caught as Error; }
      expect(stderrFailure?.message).toContain('stderr-only');
      expect(stderrFailure?.message).toContain('simulated stderr failure');
      expect(existsSync(cache)).toBe(false);

      writeFiles(home, { '.codex/upgrade-mode': 'partial\n' });
      const partialPrepared = await prepareUpdate(snapshot, pins);
      let partialFailure: Error | undefined;
      try { await codexLifecycle.apply(partialPrepared); } catch (caught) { partialFailure = caught as Error; }
      expect(partialFailure?.message).toContain('partial');
      expect(partialFailure?.message).toContain(otherId);
      expect(existsSync(join(home, '.codex/plugins/cache/demo-market/other-plugin/1.0.0/partial.txt'))).toBe(true);
      expect(existsSync(cache)).toBe(false);
    });
  });

  test('reads every affected install after a marketplace upgrade before accepting the JSON result', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home);
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, frozenSha, [demoId, otherId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      installPlugin(home, 'other-plugin', otherId, true);
      writeFiles(home, { '.codex/upgrade-mode': 'drop-sibling\n' });
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('native');
      let failure: Error | undefined;
      try { await codexLifecycle.apply(prepared); } catch (caught) { failure = caught as Error; }
      expect(failure?.message).toContain('readback missed');
      expect(failure?.message).toContain(otherId);
      expect(existsSync(join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.0.0/.codex-plugin/plugin.json'))).toBe(false);
    });
  });

  test('retirement keeps plugin data and inactive config fields', async () => {
    await withCodexBinary(async (home) => {
      writeFiles(home, {
        '.codex/config.toml': [
          '[marketplaces.demo-market]',
          'source_type = "git"',
          `source = "${sourceLocator}"`,
          `ref = "${frozenSha}"`,
          '',
          '[plugins."demo-plugin@demo-market"]',
          'enabled = true',
          'user_option = "keep"',
          '',
        ].join('\n'),
      });
      installPlugin(home, 'demo-plugin', demoId, true);
      const dataFile = join(home, '.codex/plugins/data/agent-plugins/kept/state.txt');
      const legacyData = join(home, '.codex/plugins/data/demo-plugin-demo-market/state.txt');
      writeFiles(home, {
        '.codex/plugins/data/agent-plugins/kept/state.txt': 'plugin-data\n',
        '.codex/plugins/data/demo-plugin-demo-market/state.txt': 'legacy-data\n',
      });
      const observed = await codexLifecycle.observeTarget(target);
      const installed = observed.installations.find((installation) => installation.nativeId === demoId);
      if (installed === undefined || installed.installedFingerprint === null) throw new Error('owned codex install was not observed');
      const activation = createRecordedOwnedActivation({
        scopeId: 'scope-demo-plugin',
        target,
        packageName: 'demo-plugin',
        nativeId: demoId,
        sourceType: 'git',
        sourceRevision: frozenSha,
        sourceLocator,
        installedVersion: '1.0.0',
        route: 'managed',
        evidenceId: 'sha256:codex-retirement-test',
        ownership: { kind: 'created', proofId: 'marker:demo-plugin@demo-market' },
        activation: 'active',
        enablement: 'enabled',
        installedFingerprint: installed.installedFingerprint,
        contentRoots: installed.contentRoots,
      });
      const version = await codexLifecycle.probeVersion(target);
      const nativeScope = await codexLifecycle.observeNativeMutationScope({
        targetObservation: observed,
        operation: 'retire',
        packageName: 'demo-plugin',
        nativeId: demoId,
        sourceType: 'git',
      });
      const nativeProjection = await codexLifecycle.observeNativeProjection({
        targetObservation: observed,
        operation: 'retire',
        operationId: 'retire-demo-plugin',
        attemptId: 'attempt-retire-demo',
        activation,
      });
      const decision = codexLifecycle.decideRoute({
        target,
        operation: 'retire',
        operationId: 'retire-demo-plugin',
        attemptId: 'attempt-retire-demo',
        scopeId: activation.scopeId,
        packageName: 'demo-plugin',
        nativeId: demoId,
        version,
        sourceType: 'git',
        targetObservation: observed,
        nativeScope,
        nativeProjection,
        planCoverage: createLifecyclePlanCoverage(observed, [{
          nativeId: demoId,
          operationId: 'retire-demo-plugin',
          operation: 'retire',
          mutationGroupId: 'retire-demo-plugin',
          authorization: 'observed-owned',
        }]),
        activation,
      });
      if (decision.kind !== 'selected') throw new Error(`codex retire route was not selected: ${decision.status}`);
      expect(decision.route).toBe('managed');
      const prepared = await codexLifecycle.prepareRetirement({
        operationId: 'retire-demo-plugin',
        attemptId: 'attempt-retire-demo',
        action: 'remove',
        selection: decision,
        activation,
      });
      await codexLifecycle.retire(prepared);
      const config = readFileSync(join(home, '.codex/config.toml'), 'utf8');
      expect(config).toContain('user_option = "keep"');
      expect(config).toContain('enabled = false');
      expect(existsSync(join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.0.0'))).toBe(false);
      expect(readFileSync(dataFile, 'utf8')).toBe('plugin-data\n');
      expect(readFileSync(legacyData, 'utf8')).toBe('legacy-data\n');
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('plugin remove')).toBe(false);
      const readback = await codexLifecycle.readback(prepared.handle);
      expect(readback.presence).toBe('absent');
      expect(readback.retention).toEqual(prepared.handle.prior.retention);
    });
  });

  test('keeps a native upgrade owned when the cache is rewritten in place and into a new version directory', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home);
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, frozenSha, [demoId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      writeFiles(home, { '.codex/upgrade-mode': 'rewrite-inplace\n' });
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('native');
      await codexLifecycle.apply(prepared);
      const observed = await codexLifecycle.readback(prepared.handle);
      codexLifecycle.verify(prepared.handle, observed);
      const inplace = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.0.0');
      expect(readFileSync(join(inplace, '.plgnz-install.json'), 'utf8')).toContain(demoId);
      const owned = await codexLifecycle.observeTarget(target);
      expect(owned.installations.find((installation) => installation.nativeId === demoId)?.ownership.kind).toBe('owned');
    });

    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home, '1.1.0');
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, frozenSha, [demoId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      writeFiles(home, { '.codex/upgrade-mode': 'rewrite-new\n' });
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('native');
      await codexLifecycle.apply(prepared);
      const observed = await codexLifecycle.readback(prepared.handle);
      codexLifecycle.verify(prepared.handle, observed);
      const created = join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.1.0');
      expect(readFileSync(join(created, '.plgnz-install.json'), 'utf8')).toContain(demoId);
      const owned = await codexLifecycle.observeTarget(target);
      expect(owned.installations.find((installation) => installation.nativeId === demoId)?.ownership.kind).toBe('owned');
      expect(owned.installations.find((installation) => installation.nativeId === demoId)?.installedVersion).toBe('1.1.0');
    });
  });

  test('managed update rollback leaves the previous version active', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home, '1.1.0');
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, 'main', [demoId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('managed');
      await codexLifecycle.apply(prepared);
      await codexLifecycle.rollback(prepared.handle);
      const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
      expect(existsSync(join(slot, '1.1.0'))).toBe(false);
      const observed = await codexLifecycle.observeTarget(target);
      expect(observed.installations.find((installation) => installation.nativeId === demoId)?.installedVersion).toBe('1.0.0');
    });

    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home, '1.1.0');
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, frozenSha, [demoId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      writeFiles(home, { '.codex/upgrade-mode': 'rewrite-new\n' });
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('native');
      await codexLifecycle.apply(prepared);
      await codexLifecycle.rollback(prepared.handle);
      const slot = join(home, '.codex/plugins/cache/demo-market/demo-plugin');
      expect(existsSync(join(slot, '1.1.0'))).toBe(false);
      const observed = await codexLifecycle.observeTarget(target);
      expect(observed.installations.find((installation) => installation.nativeId === demoId)?.installedVersion).toBe('1.0.0');
    });
  });

  const timed = test as (name: string, fn: () => Promise<void>, timeoutMs: number) => void;
  timed('marketplace upgrade waits longer than ten seconds', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home);
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, frozenSha, [demoId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      writeFiles(home, { '.codex/upgrade-mode': 'slow\n' });
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('native');
      await codexLifecycle.apply(prepared);
    });
  }, 20_000);

  test('rollback restores only the affected plugin table', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home, '1.1.0');
      const pins = createResolvedLifecyclePins([]);
      const configPath = join(home, '.codex/config.toml');
      writeFiles(home, {
        '.codex/config.toml': [
          'user_option = "original"',
          '',
          '[marketplaces.demo-market]',
          'source_type = "git"',
          `source = "${sourceLocator}"`,
          'ref = "main"',
          '',
          '[plugins."demo-plugin@demo-market"]',
          'enabled = true',
          'note = "kept-field"',
          '',
          '[mcp_servers.user]',
          'command = "user"',
          '',
        ].join('\n'),
      });
      installPlugin(home, 'demo-plugin', demoId, true);
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('managed');
      writeFileSync(configPath, readFileSync(configPath, 'utf8')
        .replace('user_option = "original"', 'user_option = "mutated"')
        .replace('note = "kept-field"', 'note = "wiped"')
        .replace('command = "user"', 'command = "changed"'));
      await codexLifecycle.apply(prepared);
      await codexLifecycle.rollback(prepared.handle);
      const restored = readFileSync(configPath, 'utf8');
      expect(restored).toContain('user_option = "mutated"');
      expect(restored).toContain('command = "changed"');
      expect(restored).toContain('note = "kept-field"');
      expect(restored.includes('note = "wiped"')).toBe(false);
    });
  });

  test('a command projection does not take the native marketplace upgrade', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home, '1.0.0', {
        'commands/greet.md': '---\ndescription: Say hello\n---\nHello\n',
      });
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, frozenSha, [demoId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('managed');
      await codexLifecycle.apply(prepared);
      expect(existsSync(join(home, '.codex/plugins/cache/demo-market/demo-plugin/1.0.0/skills/greet/SKILL.md'))).toBe(true);
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
    });
  });

  test('a pinned update does not take the native marketplace upgrade', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home);
      const pins = createResolvedLifecyclePins([{ server: 'demo', executable: join(home, 'bin', 'codex') }]);
      writeCatalog(home, frozenSha, [demoId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('managed');
      await codexLifecycle.apply(prepared);
      expect(readFileSync(join(home, 'codex-invocations.log'), 'utf8').includes('marketplace upgrade')).toBe(false);
    });
  });

  test('an unmanaged sibling stays unmanaged after a native upgrade', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home);
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, frozenSha, [demoId, otherId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      installPlugin(home, 'other-plugin', otherId, true);
      writeFiles(home, { '.codex/upgrade-mode': 'drop-prior-sibling\n' });
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('native');
      await codexLifecycle.apply(prepared);
      const sibling = join(home, '.codex/plugins/cache/demo-market/other-plugin/1.0.0/.plgnz-install.json');
      expect(existsSync(sibling)).toBe(false);
      const observed = await codexLifecycle.observeTarget(target);
      expect(observed.installations.find((installation) => installation.nativeId === otherId)?.ownership.kind).toBe('unmanaged');
    });
  });

  test('a native upgrade keeps a sibling ownership fingerprint from before the rewrite', async () => {
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home);
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, frozenSha, [demoId, otherId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      installPlugin(home, 'other-plugin', otherId, true);
      writeFiles(home, {
        '.codex/plugins/cache/demo-market/other-plugin/1.0.0/.plgnz-install.json': JSON.stringify({
          source: sourceLocator,
          pluginId: otherId,
          fingerprint: 'sibling-prior',
        }),
        '.codex/upgrade-mode': 'strip-sibling\n',
      });
      const prepared = await prepareUpdate(snapshot, pins);
      expect(prepared.handle.route).toBe('native');
      await codexLifecycle.apply(prepared);
      const marker = JSON.parse(readFileSync(join(home, '.codex/plugins/cache/demo-market/other-plugin/1.0.0/.plgnz-install.json'), 'utf8')) as { fingerprint?: string };
      expect(marker.fingerprint).toBe('sibling-prior');
    });
  });

  test('marketplace checkout rollback stays unverified', async () => {
    expect(codexMarketplaceCheckoutRollback).toBe('unverified');
    await withCodexBinary(async (home) => {
      const snapshot = frozenSnapshot(home, '1.1.0');
      const pins = createResolvedLifecyclePins([]);
      writeCatalog(home, 'main', [demoId]);
      installPlugin(home, 'demo-plugin', demoId, true);
      const checkout = join(home, '.codex/plugins/marketplaces/demo-market/HEAD');
      writeFiles(home, { '.codex/plugins/marketplaces/demo-market/HEAD': 'recorded\n' });
      const prepared = await prepareUpdate(snapshot, pins);
      writeFileSync(checkout, 'advanced\n');
      await codexLifecycle.apply(prepared);
      await codexLifecycle.rollback(prepared.handle);
      expect(readFileSync(checkout, 'utf8')).toBe('advanced\n');
    });
  });
});

function selectedRoute(decision: LifecycleRouteDecision<'update'>): SelectedRouteDecision<'native' | 'managed', 'update'> {
  if (decision.kind !== 'selected') throw new Error(`codex update route was not selected: ${decision.status}`);
  return decision;
}

const upgradeScript = `#!/bin/sh
log="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)/codex-invocations.log"
printf '%s\\n' "$*" >> "$log"
if [ "$1" = "--version" ]; then
  printf '%s\\n' 'codex-cli 0.162.0'
  exit 0
fi
mode=""
if [ -n "$CODEX_HOME" ] && [ -f "$CODEX_HOME/upgrade-mode" ]; then
  mode=$(tr -d '\\n' < "$CODEX_HOME/upgrade-mode")
fi
if [ "$mode" = "stderr" ]; then
  echo 'Failed to upgrade marketplace \`demo-market\`: simulated stderr failure' >&2
  exit 1
fi
if [ "$mode" = "checkout-metadata-failure" ]; then
  checkout="$CODEX_HOME/.tmp/marketplaces/demo-market"
  git -C "$checkout" checkout --detach "$(cat "$CODEX_HOME/candidate-revision")" || exit 2
  cp "$CODEX_HOME/candidate-metadata.json" "$checkout/.codex-marketplace-install.json"
  echo 'native cache permission failure' >&2
  exit 1
fi
if [ "$mode" = "partial" ]; then
  printf '%s\\n' 'changed' >> "$CODEX_HOME/plugins/cache/demo-market/other-plugin/1.0.0/partial.txt"
  echo 'Failed to upgrade marketplace \`demo-market\`: plugin refresh failed' >&2
  exit 1
fi
if [ "$mode" = "drop-sibling" ]; then
  rm -rf "$CODEX_HOME/plugins/cache/demo-market/other-plugin"
  printf '%s\\n' '{"selectedMarketplaces":["demo-market"],"upgradedRoots":["demo-market"],"errors":[]}'
  exit 0
fi
package="$CODEX_HOME/../source-snapshot/packages/demo-plugin"
copy_package() {
  dest="$1"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -a "$package"/. "$dest"/
  rm -f "$dest/.plgnz-install.json"
}
if [ "$mode" = "replace-slot-failure" ]; then
  rm -rf "$CODEX_HOME/plugins/cache/demo-market/demo-plugin"
  copy_package "$CODEX_HOME/plugins/cache/demo-market/demo-plugin/1.1.0"
  echo 'native failure after complete slot replacement' >&2
  exit 1
fi
if [ "$mode" = "rewrite-inplace" ]; then
  copy_package "$CODEX_HOME/plugins/cache/demo-market/demo-plugin/1.0.0"
  printf '%s\\n' '{"selectedMarketplaces":["demo-market"],"upgradedRoots":["demo-market"],"errors":[]}'
  exit 0
fi
if [ "$mode" = "rewrite-new" ]; then
  copy_package "$CODEX_HOME/plugins/cache/demo-market/demo-plugin/1.1.0"
  printf '%s\\n' '{"selectedMarketplaces":["demo-market"],"upgradedRoots":["demo-market"],"errors":[]}'
  exit 0
fi
if [ "$mode" = "strip-sibling" ]; then
  rm -f "$CODEX_HOME/plugins/cache/demo-market/other-plugin/1.0.0/.plgnz-install.json"
  printf '%s\\n' '{"selectedMarketplaces":["demo-market"],"upgradedRoots":["demo-market"],"errors":[]}'
  exit 0
fi
if [ "$mode" = "drop-prior-sibling" ]; then
  rm -f "$CODEX_HOME/plugins/cache/demo-market/other-plugin/1.0.0/.plgnz-install.json"
  find "$CODEX_HOME/.plgnz-rollback" -name '.plgnz-install.json' | while read -r marker; do
    if grep -q 'other-plugin@demo-market' "$marker"; then
      rm -f "$marker"
    fi
  done
  printf '%s\\n' '{"selectedMarketplaces":["demo-market"],"upgradedRoots":["demo-market"],"errors":[]}'
  exit 0
fi
if [ "$mode" = "slow" ]; then
  sleep 11
  printf '%s\\n' '{"selectedMarketplaces":["demo-market"],"upgradedRoots":["demo-market"],"errors":[]}'
  exit 0
fi
printf '%s\\n' '{"selectedMarketplaces":["demo-market"],"upgradedRoots":["demo-market"],"errors":[]}'
exit 0
`;

async function withCodexBinary(run: (home: string) => Promise<void>): Promise<void> {
  await withHostEnvAsync('codex', async (home) => {
    const binary = join(home, 'bin', 'codex');
    writeFiles(home, { 'bin/codex': upgradeScript });
    chmodSync(binary, 0o755);
    process.env['OPEN_PLUGIN_CODEX_BIN'] = binary;
    try {
      await run(home);
    } finally {
      delete process.env['OPEN_PLUGIN_CODEX_BIN'];
    }
  });
}

async function prepareUpdate(
  snapshot: FrozenPackageSnapshot & { readonly action: 'update' },
  pins: ReturnType<typeof createResolvedLifecyclePins>,
) {
  const selection = selectedRoute(await selectedUpdate(snapshot, pins));
  const staged = await codexLifecycle.stageActivation({ selection, snapshot, pins });
  const directed = await codexLifecycle.applyLifecycleDirectives(staged);
  const pinned = await codexLifecycle.applyPins(directed);
  return codexLifecycle.sealActivation(pinned);
}

async function selectedUpdate(
  snapshot: FrozenPackageSnapshot,
  pins: ReturnType<typeof createResolvedLifecyclePins>,
): Promise<LifecycleRouteDecision<'update'>> {
  const version = await codexLifecycle.probeVersion(target);
  const observed = await codexLifecycle.observeTarget(target);
  const nativeScope = await codexLifecycle.observeNativeMutationScope({
    targetObservation: observed,
    operation: 'update',
    packageName: snapshot.packageName,
    nativeId: snapshot.nativeId,
    sourceType: snapshot.sourceType,
  });
  const nativeProjection = await codexLifecycle.observeNativeProjection({
    targetObservation: observed,
    operation: 'update',
    snapshot,
    pins,
  });
  const owned = observed.installations.filter((installation) => (
    installation.nativeId.endsWith(`@${marketplace}`) && installation.ownership.kind === 'owned'
  ));
  return codexLifecycle.decideRoute({
    target,
    operation: 'update',
    operationId: snapshot.operationId,
    attemptId: snapshot.attemptId,
    scopeId: snapshot.scopeId,
    packageName: snapshot.packageName,
    nativeId: snapshot.nativeId,
    version,
    sourceType: snapshot.sourceType,
    targetObservation: observed,
    nativeScope,
    nativeProjection,
    planCoverage: createLifecyclePlanCoverage(observed, owned.map((installation) => ({
      nativeId: installation.nativeId,
      operationId: installation.nativeId === demoId ? snapshot.operationId : `update:${installation.nativeId}`,
      operation: 'update',
      mutationGroupId: `marketplace:${marketplace}`,
      authorization: 'observed-owned',
    }))),
    snapshot,
    pins,
  });
}

function frozenSnapshot(home: string, version = '1.0.0', extras: Record<string, string> = {}): FrozenPackageSnapshot & { readonly action: 'update' } {
  const snapshotRoot = join(home, 'source-snapshot');
  const packageRoot = join(snapshotRoot, 'packages', 'demo-plugin');
  mkdirSync(packageRoot, { recursive: true });
  writeFiles(packageRoot, {
    'plugin.json': `{"name":"demo-plugin","version":"${version}"}\n`,
    '.codex-plugin/plugin.json': JSON.stringify({
      name: 'demo-plugin',
      version,
      description: 'Plugin demo-plugin',
      skills: './skills/',
    }),
    ...extras,
  });
  const packageFingerprint = fingerprintTree(packageRoot);
  const snapshot = createFrozenPackageSnapshot({
    operationId: 'update-demo-plugin',
    attemptId: 'attempt-demo-plugin',
    scopeId: 'scope-demo-plugin',
    target,
    action: 'update',
    packageName: 'demo-plugin',
    nativeId: demoId,
    sourceType: 'git',
    immutableRevision: frozenSha,
    snapshotRoot,
    packageRoot,
    relativePackagePath: 'packages/demo-plugin',
    snapshotFingerprint: fingerprintTree(snapshotRoot),
    packageFingerprint,
    nativeGit: { locator: sourceLocator, resolvedRevision: frozenSha },
    inventory: {
      ...emptyInventory,
      package: { name: 'demo-plugin', version, fingerprint: packageFingerprint },
    },
  });
  if (!isUpdateSnapshot(snapshot)) throw new Error('frozen codex snapshot drifted from update');
  return snapshot;
}

function isUpdateSnapshot(snapshot: FrozenPackageSnapshot): snapshot is FrozenPackageSnapshot & { readonly action: 'update' } {
  return snapshot.action === 'update';
}

function writeCatalog(home: string, refName: string, pluginIds: readonly string[]): void {
  const tables = pluginIds.map((id) => `[plugins."${id}"]\nenabled = true\n`).join('\n');
  writeFiles(home, {
    '.codex/config.toml': [
      '[marketplaces.demo-market]',
      'source_type = "git"',
      `source = "${sourceLocator}"`,
      `ref = "${refName}"`,
      '',
      tables,
    ].join('\n'),
  });
}

function installPlugin(home: string, name: string, id: string, owned: boolean): void {
  const market = id.slice(id.indexOf('@') + 1);
  const root = join(home, '.codex/plugins/cache', market, name, '1.0.0');
  rmSync(root, { recursive: true, force: true });
  writeFiles(root, { 'plugin.json': `{"name":"${name}","version":"1.0.0"}\n` });
  if (!owned) return;
  writeFiles(root, {
    '.plgnz-install.json': JSON.stringify({ source: sourceLocator, pluginId: id, fingerprint: 'owned' }),
  });
}
