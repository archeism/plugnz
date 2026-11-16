import { describe, expect, test } from 'bun:test';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { legacyV1MarkerMatchesScope, resolveLegacyV1MarkerScopeId } from '../src/legacy-claim-ownership';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { claudeCodeWriter } from '../src/hosts/claude-code-writer';
import { cursorWriter } from '../src/hosts/cursor-writer';
import { codexWriter } from '../src/hosts/codex-writer';
import { ompWriter } from '../src/hosts/omp-writer';
import { dcodeWriter } from '../src/hosts/dcode-writer';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';
import { fingerprintLegacyV1SourceTree, fingerprintLegacyV1Tree, fingerprintTree } from '../src/fingerprint';
import { resolveSource } from '../src/source';
import { createDeploymentScopeIdentity } from '../src/deployment-scope';

async function seedLegacyClaudeV1(
  harness: Parameters<Parameters<typeof withLifecycleCliHarness>[0]>[0],
  sourceDir: string,
  opts?: { forceWrapper?: boolean; pluginName?: string; legacyFingerprint?: boolean },
) {
  const prevRoot = process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'];
  const prevHome = process.env['OPEN_PLUGIN_HOME'];
  process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'] = harness.storePath('claude-code');
  process.env['OPEN_PLUGIN_HOME'] = harness.home;
  try {
    const resolved = resolveSource(sourceDir);
    if (opts?.forceWrapper) {
      resolved.snapshotDir = sourceDir;
    }
    const targetPluginName = opts?.pluginName ?? 'addy';
    const plugin = resolved.plugins.find(p => p.name === targetPluginName)!;
    if (opts?.legacyFingerprint) plugin.contentFingerprint = fingerprintLegacyV1SourceTree(plugin.dir);
    await claudeCodeWriter.add(plugin, resolved);
    const nativeId = `${plugin.name}@${plugin.marketplace ?? 'local'}`;
    const registry = JSON.parse(readFileSync(join(harness.storePath('claude-code'), 'plugins/installed_plugins.json'), 'utf8')) as {
      plugins: Record<string, Array<{ installPath: string }>>;
    };
    const installPath = registry.plugins[nativeId]![0]!.installPath;
    const installedFp = opts?.legacyFingerprint ? fingerprintLegacyV1Tree(installPath) : fingerprintTree(installPath);
    const scope = createDeploymentScopeIdentity({ kind: 'local', locator: sourceDir }, { kind: 'claude-code', instance: 'default' });
    harness.writeHome({
      'state.json': JSON.stringify({
        version: 2,
        stateGeneration: 1,
        scopes: [{
          id: scope.id,
          source: { kind: 'local', locator: sourceDir },
          target: { kind: 'claude-code', instance: 'default' },
          authority: 'legacy-import',
          lifecycle: 'active',
          selectorMode: 'legacy-unknown',
        }],
        activations: [{
          scopeId: scope.id,
          packageId: nativeId,
          nativeId,
          sourceRelativeDir: plugin.relativeDir && plugin.relativeDir.length > 0 ? plugin.relativeDir : '.',
          sourceRevision: resolved.sha,
          route: { kind: 'legacy-unverified' },
          ownership: { kind: 'legacy-claim', prior: 'plgnz' },
          fingerprints: {
            source: plugin.contentFingerprint,
            installed: installedFp,
          },
          activationState: 'unknown',
          readbackState: 'unverified',
          pins: [],
          activatedAt: '2026-10-11T16:44:52.071Z',
          createdAt: '2026-10-11T16:44:52.071Z',
          updatedAt: '2026-10-11T16:44:52.071Z',
        }],
        attempts: [],
        tombstones: [],
      }, null, 2),
    });
    return { installPath, installedFp, scopeId: scope.id, nativeId, sourceFingerprint: plugin.contentFingerprint! };
  } finally {
    if (prevRoot === undefined) delete process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'];
    else process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'] = prevRoot;
    if (prevHome === undefined) delete process.env['OPEN_PLUGIN_HOME'];
    else process.env['OPEN_PLUGIN_HOME'] = prevHome;
  }
}

describe('legacy v1 ownership migration (Personal issue #63)', () => {
  for (const legacyFingerprint of [false, true]) test(`migrates legacy v1 claude-code install with pre-mode fingerprint=${legacyFingerprint} and converges idempotently`, async () => {
    await withLifecycleCliHarness(async harness => {
      harness.fakeNative('claude', [
        { args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 },
        { args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 },
        { args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 },
        { args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 },
        { args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 },
        { args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 },
      ]);
      const sourceDir = harness.source('personal-marketplace', {
        '.claude-plugin/marketplace.json': JSON.stringify({
          name: 'personal',
          owner: { name: 'Charles' },
          plugins: [{ name: 'addy', source: './plugins/addy' }],
        }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/code-review/SKILL.md': '# Code Review\n',
      });

      const { installPath, scopeId } = await seedLegacyClaudeV1(harness, sourceDir, { legacyFingerprint });
      const markerBefore = JSON.parse(readFileSync(join(installPath, '.plgnz-install.json'), 'utf8')) as Record<string, unknown>;
      expect(markerBefore['scopeId']).toBeUndefined();

      const first = harness.run(['add', sourceDir, '--target', 'claude-code', '--json']);
      const firstReport = JSON.parse(first.stdout);
      expect(firstReport.summary.reason?.diagnostic ?? '').toBe('');
      expect(first.exitCode).toBe(0);
      expect(firstReport.summary.result).toBe('converged');
      expect(firstReport.outcomes[0]?.action).toBe('update');

      const registryAfter = JSON.parse(readFileSync(join(harness.storePath('claude-code'), 'plugins/installed_plugins.json'), 'utf8')) as {
        plugins: Record<string, Array<{ installPath: string }>>;
      };
      const activeInstallPath = registryAfter.plugins['addy@personal']![0]!.installPath;
      const markerAfter = JSON.parse(readFileSync(join(activeInstallPath, '.plgnz-install.json'), 'utf8')) as Record<string, unknown>;
      expect(markerAfter['scopeId']).toBe(scopeId);

      const second = harness.run(['add', sourceDir, '--target', 'claude-code', '--json']);
      const secondReport = JSON.parse(second.stdout);
      expect(second.exitCode).toBe(0);
      expect(secondReport.summary.result).toBe('converged');
      expect(secondReport.outcomes[0]?.action).toBe('unchanged');
      expect(secondReport.summary.changed).toBe(false);
    });
  });

  for (const legacyFingerprint of [false, true]) test(`migrates unmodified wrapper and rejects edits with pre-mode fingerprint=${legacyFingerprint}`, async () => {
    await withLifecycleCliHarness(async harness => {
      harness.fakeNative('claude', Array.from({ length: 16 }, () => ({ args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 })));
      const sourceDir = harness.source('personal-wrapper-catalog', {
        '.claude-plugin/marketplace.json': JSON.stringify({
          name: 'personal',
          owner: { name: 'Charles' },
          plugins: [{ name: 'addy', source: './plugins/addy' }],
        }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/code-review/SKILL.md': '# Wrapper Copy Original\n',
      });

      await seedLegacyClaudeV1(harness, sourceDir, { forceWrapper: true, legacyFingerprint });
      const catalogCopy = join(harness.storePath('claude-code'), 'plugins/marketplaces/.plgnz-personal/plugins/addy');
      const copyMarkerBefore = JSON.parse(readFileSync(join(catalogCopy, '.plgnz-install.json'), 'utf8')) as Record<string, unknown>;
      expect(copyMarkerBefore['scopeId']).toBeUndefined();

      // Tamper with a file inside the legacy catalog copy; migration must refuse and preserve the modified copy
      writeFileSync(join(catalogCopy, 'skills/code-review/SKILL.md'), '# Tampered Catalog Copy\n');
      const refused = harness.run(['add', sourceDir, '--target', 'claude-code', '--json']);
      const refusedReport = JSON.parse(refused.stdout);
      expect(refused.exitCode).toBe(1);
      expect(refusedReport.outcomes[0]?.reason?.diagnostic ?? refusedReport.summary.reason?.diagnostic ?? '').toContain('different owned scope');
      expect(readFileSync(join(catalogCopy, 'skills/code-review/SKILL.md'), 'utf8')).toBe('# Tampered Catalog Copy\n');

      // Restore unmodified catalog copy bytes; migration now succeeds and scopes the catalog copy marker
      writeFileSync(join(catalogCopy, 'skills/code-review/SKILL.md'), '# Wrapper Copy Original\n');
      const migrated = harness.run(['add', sourceDir, '--target', 'claude-code', '--json']);
      const migratedReport = JSON.parse(migrated.stdout);
      expect(migrated.exitCode).toBe(0);
      expect(migratedReport.summary.result).toBe('converged');
      const copyMarkerAfter = JSON.parse(readFileSync(join(catalogCopy, '.plgnz-install.json'), 'utf8')) as Record<string, unknown>;
      expect(typeof copyMarkerAfter['scopeId']).toBe('string');

      // Delete the cache directory while keeping the registry row and already-scoped catalog copy; repair must not throw ENOENT on recordedInstallPath
      const regAfter = JSON.parse(readFileSync(join(harness.storePath('claude-code'), 'plugins/installed_plugins.json'), 'utf8')) as { plugins: Record<string, Array<{ installPath: string }>> };
      const cacheSlotPath = regAfter.plugins['addy@personal']![0]!.installPath;
      rmSync(cacheSlotPath, { recursive: true, force: true });
      const repaired = harness.run(['add', sourceDir, '--target', 'claude-code', '--json']);
      const repairedReport = JSON.parse(repaired.stdout);
      expect(repairedReport.outcomes[0]?.reason?.diagnostic ?? repairedReport.summary.reason?.diagnostic ?? '').toBe('');
      expect(repaired.exitCode).toBe(0);
      expect(repairedReport.summary.result).toBe('converged');
      expect(readFileSync(join(cacheSlotPath, 'skills/code-review/SKILL.md'), 'utf8')).toBe('# Wrapper Copy Original\n');
    });
  });

  for (const legacyFingerprint of [false, true]) test(`migrates legacy v1 cursor/codex/omp with pre-mode fingerprint=${legacyFingerprint} idempotently`, async () => {
    await withLifecycleCliHarness(async harness => {
      const codex = harness.fakeNative('codex', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.162.0\n' })));
      const omp = harness.fakeNative('omp', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: '18.10.3\n' })));
      const env = { OPEN_PLUGIN_CODEX_BIN: codex.path, OPEN_PLUGIN_OMP_BIN: omp.path };
      const sourceDir = harness.source('personal-multi', {
        '.claude-plugin/marketplace.json': JSON.stringify({
          name: 'personal',
          owner: { name: 'Charles' },
          plugins: [{ name: 'addy', source: './plugins/addy' }],
        }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/code-review/SKILL.md': '---\nname: code-review\ndescription: Code review\n---\n# Code Review\n',
      });

      const prevCursor = process.env['OPEN_PLUGIN_CURSOR_ROOT'];
      const prevCodex = process.env['OPEN_PLUGIN_CODEX_HOME'];
      const prevOmp = process.env['OPEN_PLUGIN_OMP_ROOT'];
      const prevHome = process.env['OPEN_PLUGIN_HOME'];
      process.env['OPEN_PLUGIN_CURSOR_ROOT'] = harness.storePath('cursor');
      process.env['OPEN_PLUGIN_CODEX_HOME'] = harness.storePath('codex');
      process.env['OPEN_PLUGIN_OMP_ROOT'] = harness.storePath('omp');
      process.env['OPEN_PLUGIN_HOME'] = harness.home;
      let cursorScopeId = '';
      let codexScopeId = '';
      let ompScopeId = '';
      let ompPath = '';
      try {
        const resolved = resolveSource(sourceDir);
        const plugin = resolved.plugins.find(p => p.name === 'addy')!;
        if (legacyFingerprint) plugin.contentFingerprint = fingerprintLegacyV1SourceTree(plugin.dir);
        await cursorWriter.add(plugin, resolved);
        await codexWriter.add(plugin, resolved);
        await ompWriter.add(plugin, resolved);
        ompPath = ompWriter.listInstalled().find(p => p.id === 'addy@personal')!.path!;
        const cursorPath = join(harness.storePath('cursor'), 'plugins/local/addy');
        const codexPath = join(harness.storePath('codex'), 'plugins/cache/personal/addy/0.1.0');
        const fingerprint = legacyFingerprint ? fingerprintLegacyV1Tree : fingerprintTree;
        const cursorFp = fingerprint(cursorPath);
        const codexFp = fingerprint(codexPath);
        const ompFp = fingerprint(ompPath);
        cursorScopeId = createDeploymentScopeIdentity({ kind: 'local', locator: sourceDir }, { kind: 'cursor', instance: 'default' }).id;
        codexScopeId = createDeploymentScopeIdentity({ kind: 'local', locator: sourceDir }, { kind: 'codex', instance: 'default' }).id;
        ompScopeId = createDeploymentScopeIdentity({ kind: 'local', locator: sourceDir }, { kind: 'omp', instance: 'default' }).id;
        harness.writeHome({
          'state.json': JSON.stringify({
            version: 2,
            stateGeneration: 1,
            scopes: [
              { id: cursorScopeId, source: { kind: 'local', locator: sourceDir }, target: { kind: 'cursor', instance: 'default' }, authority: 'legacy-import', lifecycle: 'active', selectorMode: 'legacy-unknown' },
              { id: codexScopeId, source: { kind: 'local', locator: sourceDir }, target: { kind: 'codex', instance: 'default' }, authority: 'legacy-import', lifecycle: 'active', selectorMode: 'legacy-unknown' },
              { id: ompScopeId, source: { kind: 'local', locator: sourceDir }, target: { kind: 'omp', instance: 'default' }, authority: 'legacy-import', lifecycle: 'active', selectorMode: 'legacy-unknown' },
            ],
            activations: [
              { scopeId: cursorScopeId, packageId: 'addy', nativeId: 'addy', sourceRelativeDir: 'plugins/addy', sourceRevision: resolved.sha, route: { kind: 'legacy-unverified' }, ownership: { kind: 'legacy-claim', prior: 'plgnz' }, fingerprints: { source: plugin.contentFingerprint, installed: cursorFp }, activationState: 'unknown', readbackState: 'unverified', pins: [] },
              { scopeId: codexScopeId, packageId: 'addy@personal', nativeId: 'addy@personal', sourceRelativeDir: 'plugins/addy', sourceRevision: resolved.sha, route: { kind: 'legacy-unverified' }, ownership: { kind: 'legacy-claim', prior: 'plgnz' }, fingerprints: { source: plugin.contentFingerprint, installed: codexFp }, activationState: 'unknown', readbackState: 'unverified', pins: [] },
              { scopeId: ompScopeId, packageId: 'addy@personal', nativeId: 'addy@personal', sourceRelativeDir: 'plugins/addy', sourceRevision: resolved.sha, route: { kind: 'legacy-unverified' }, ownership: { kind: 'legacy-claim', prior: 'plgnz' }, fingerprints: { source: plugin.contentFingerprint, installed: ompFp }, activationState: 'unknown', readbackState: 'unverified', pins: [] },
            ],
            attempts: [],
            tombstones: [],
          }, null, 2),
        });
      } finally {
        if (prevCursor === undefined) delete process.env['OPEN_PLUGIN_CURSOR_ROOT']; else process.env['OPEN_PLUGIN_CURSOR_ROOT'] = prevCursor;
        if (prevCodex === undefined) delete process.env['OPEN_PLUGIN_CODEX_HOME']; else process.env['OPEN_PLUGIN_CODEX_HOME'] = prevCodex;
        if (prevOmp === undefined) delete process.env['OPEN_PLUGIN_OMP_ROOT']; else process.env['OPEN_PLUGIN_OMP_ROOT'] = prevOmp;
        if (prevHome === undefined) delete process.env['OPEN_PLUGIN_HOME']; else process.env['OPEN_PLUGIN_HOME'] = prevHome;
      }

      const ompMarkerBefore = JSON.parse(readFileSync(join(ompPath, '.plgnz-install.json'), 'utf8')) as Record<string, unknown>;
      expect(ompMarkerBefore['scopeId']).toBeUndefined();


      const first = harness.run(['add', sourceDir, '--target', 'cursor', '--target', 'codex', '--target', 'omp', '--json'], { env });
      const firstReport = JSON.parse(first.stdout);
      expect(firstReport.outcomes.map((o: { reason?: { diagnostic?: string } | null }) => o.reason?.diagnostic ?? '')).toEqual(['', '', '']);
      expect(first.exitCode).toBe(0);
      expect(firstReport.summary.result).toBe('converged');

      const ompMarkerAfter = JSON.parse(readFileSync(join(ompPath, '.plgnz-install.json'), 'utf8')) as Record<string, unknown>;
      expect(ompMarkerAfter['scopeId']).toBe(ompScopeId);

      const second = harness.run(['add', sourceDir, '--target', 'cursor', '--target', 'codex', '--target', 'omp', '--json'], { env });
      const secondReport = JSON.parse(second.stdout);
      expect(second.exitCode).toBe(0);
      expect(secondReport.summary.result).toBe('converged');
      expect(secondReport.outcomes.every((o: { action: string }) => o.action === 'unchanged')).toBe(true);
      expect(secondReport.summary.changed).toBe(false);
    });
  });

  test('refuses replacement when legacy v1 marker belongs to an unrelated source owner', async () => {
    await withLifecycleCliHarness(async harness => {
      harness.fakeNative('claude', [
        { args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 },
      ]);
      const ownerA = harness.source('owner-a', {
        '.claude-plugin/marketplace.json': JSON.stringify({
          name: 'personal',
          owner: { name: 'OwnerA' },
          plugins: [{ name: 'addy', source: './plugins/addy' }],
        }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/code-review/SKILL.md': '# Owner A\n',
      });
      const ownerB = harness.source('owner-b', {
        '.claude-plugin/marketplace.json': JSON.stringify({
          name: 'personal',
          owner: { name: 'OwnerB' },
          plugins: [{ name: 'addy', source: './plugins/addy' }],
        }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/code-review/SKILL.md': '# Owner B\n',
      });

      const { installPath, scopeId: ownerAScopeId } = await seedLegacyClaudeV1(harness, ownerA);
      const res = harness.run(['add', ownerB, '--target', 'claude-code', '--json']);
      const report = JSON.parse(res.stdout);
      expect(res.exitCode).toBe(1);
      expect(report.summary.reason?.diagnostic).toContain(ownerAScopeId);
      expect(readFileSync(join(installPath, 'skills/code-review/SKILL.md'), 'utf8')).toBe('# Owner A\n');
    });
  });

  for (const legacyFingerprint of [false, true]) test(`preserves modified/unmanaged legacy install with pre-mode fingerprint=${legacyFingerprint}`, async () => {
    await withLifecycleCliHarness(async harness => {
      harness.fakeNative('claude', [
        { args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 },
        { args: ['--version'], stdout: '2.1.296 (Claude Code)\n', exitCode: 0 },
      ]);
      const sourceDir = harness.source('personal-marketplace', {
        '.claude-plugin/marketplace.json': JSON.stringify({
          name: 'personal',
          owner: { name: 'Charles' },
          plugins: [{ name: 'addy', source: './plugins/addy' }],
        }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/code-review/SKILL.md': '# Code Review\n',
      });

      const { installPath } = await seedLegacyClaudeV1(harness, sourceDir, { legacyFingerprint });
      writeFileSync(join(installPath, 'skills/code-review/SKILL.md'), '# Locally Modified By User\n');

      const modifiedRun = harness.run(['add', sourceDir, '--target', 'claude-code', '--json']);
      expect(modifiedRun.exitCode).toBe(1);
      expect(readFileSync(join(installPath, 'skills/code-review/SKILL.md'), 'utf8')).toBe('# Locally Modified By User\n');

      rmSync(join(installPath, '.plgnz-install.json'), { force: true });
      const unmanagedRun = harness.run(['add', sourceDir, '--target', 'claude-code', '--json']);
      expect(unmanagedRun.exitCode).toBe(1);
      expect(readFileSync(join(installPath, 'skills/code-review/SKILL.md'), 'utf8')).toBe('# Locally Modified By User\n');
    });
  });

  for (const legacyFingerprint of [false, true]) test(`migrates dcode imported unscoped ownership with pre-mode fingerprint=${legacyFingerprint}`, async () => {
    await withLifecycleCliHarness(async harness => {
      const sourceDir = harness.source('dcode-legacy', {
        '.claude-plugin/marketplace.json': JSON.stringify({ name: 'personal', owner: { name: 'Charles' }, plugins: [{ name: 'addy', source: './plugins/addy' }] }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/review/SKILL.md': '---\nname: review\ndescription: review\n---\nOriginal\n',
      });
      const binary = harness.fakeNative('dcode', Array.from({ length: 40 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
      const env = { OPEN_PLUGIN_DCODE_ROOT: harness.storePath('dcode'), OPEN_PLUGIN_DCODE_BIN: binary.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
      const previous = Object.fromEntries(['OPEN_PLUGIN_HOME', ...Object.keys(env)].map(key => [key, process.env[key]]));
      let path = '';
      let scopeId = '';
      try {
        Object.assign(process.env, env, { OPEN_PLUGIN_HOME: harness.home });
        const resolved = resolveSource(sourceDir);
        const plugin = resolved.plugins[0]!;
        if (legacyFingerprint) plugin.contentFingerprint = fingerprintLegacyV1SourceTree(plugin.dir);
        await dcodeWriter.add(plugin, resolved);
        path = dcodeWriter.listInstalled()[0]!.path!;
        scopeId = createDeploymentScopeIdentity({ kind: 'local', locator: sourceDir }, { kind: 'dcode', instance: 'default' }).id;
        harness.writeHome({ 'state.json': JSON.stringify({ version: 2, stateGeneration: 1,
          scopes: [{ id: scopeId, source: { kind: 'local', locator: sourceDir }, target: { kind: 'dcode', instance: 'default' }, authority: 'legacy-import', lifecycle: 'active', selectorMode: 'legacy-unknown' }],
          activations: [{ scopeId, packageId: 'addy@personal', nativeId: 'addy@personal', sourceRelativeDir: 'plugins/addy', sourceRevision: resolved.sha, route: { kind: 'legacy-unverified' }, ownership: { kind: 'legacy-claim', prior: 'plgnz' }, fingerprints: { source: plugin.contentFingerprint, installed: (legacyFingerprint ? fingerprintLegacyV1Tree : fingerprintTree)(path) }, activationState: 'unknown', readbackState: 'unverified', pins: [] }],
          attempts: [], tombstones: [] }) });
      } finally {
        for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      }
      const runtimeEnv = { OPEN_PLUGIN_DCODE_BIN: env.OPEN_PLUGIN_DCODE_BIN, OPEN_PLUGIN_DCODE_PYTHON_BIN: env.OPEN_PLUGIN_DCODE_PYTHON_BIN };
      const first = harness.run(['add', sourceDir, '--target', 'dcode', '--json'], { env: runtimeEnv });
      expect(first.exitCode).toBe(0);
      expect(JSON.parse(first.stdout).summary.result).toBe('converged');
      const second = harness.run(['add', sourceDir, '--target', 'dcode', '--json'], { env: runtimeEnv });
      expect(second.exitCode).toBe(0);
      expect(JSON.parse(second.stdout).summary.changed).toBe(false);
      const registry = JSON.parse(readFileSync(join(harness.storePath('dcode'), '.state/installed_plugins.json'), 'utf8'));
      const active = registry.plugins['addy@personal'][0].installPath;
      expect(JSON.parse(readFileSync(join(active, '.plgnz-install.json'), 'utf8')).scopeId).toBe(scopeId);
    });
  });

  test('does not use raw compatibility to accept a mode change against a current receipt', async () => {
    await withLifecycleCliHarness(async harness => {
      harness.fakeNative('claude', Array.from({ length: 8 }, () => ({ args: ['--version'], stdout: '2.1.296 (Claude Code)\n' })));
      const sourceDir = harness.source('mode-proof', {
        '.claude-plugin/marketplace.json': JSON.stringify({ name: 'personal', owner: { name: 'Charles' }, plugins: [{ name: 'addy', source: './plugins/addy' }] }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/code-review/SKILL.md': '# Original\n',
      });
      const { installPath } = await seedLegacyClaudeV1(harness, sourceDir);
      const changed = join(installPath, 'skills/code-review/SKILL.md');
      chmodSync(changed, 0o755);
      const result = harness.run(['add', sourceDir, '--target', 'claude-code', '--json']);
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout).summary.mutationStarted).toBe(false);
      expect(readFileSync(changed, 'utf8')).toBe('# Original\n');
    });
  });

  test('rejects modern scoped markers (scopeId already present) when source differs and no legacy claim is involved', async () => {
    await withLifecycleCliHarness(async harness => {
      const codex = harness.fakeNative('codex', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.162.0\n' })));
      const env = { OPEN_PLUGIN_CODEX_BIN: codex.path };
      const sourceDir = harness.source('codex-modern-guard', {
        '.claude-plugin/marketplace.json': JSON.stringify({
          name: 'personal',
          owner: { name: 'Charles' },
          plugins: [{ name: 'addy', source: './plugins/addy' }],
        }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/code-review/SKILL.md': '# Original\n',
      });

      const first = harness.run(['add', sourceDir, '--target', 'codex', '--json'], { env });
      expect(first.exitCode).toBe(0);
      const firstReport = JSON.parse(first.stdout);
      const scopeId = firstReport.outcomes[0]!.scope.id as string;
      const slotDir = join(harness.storePath('codex'), 'plugins/cache/personal/addy/0.1.0');
      const markerPath = join(slotDir, '.plgnz-install.json');
      const modernMarker = JSON.parse(readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
      expect(modernMarker['scopeId']).toBe(scopeId);

      writeFileSync(markerPath, JSON.stringify({ ...modernMarker, source: 'https://example.invalid/foreign.git' }));
      const stateDoc = JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8'));
      stateDoc.activations[0].fingerprints.installed = fingerprintTree(slotDir);
      writeFileSync(join(harness.home, 'state.json'), JSON.stringify(stateDoc, null, 2));
      writeFileSync(join(sourceDir, 'plugins/addy/skills/code-review/SKILL.md'), '# Updated\n');

      const second = harness.run(['add', sourceDir, '--target', 'codex', '--json'], { env });
      const secondReport = JSON.parse(second.stdout);
      expect(second.exitCode).toBe(1);
      expect(secondReport.outcomes[0]?.reason?.diagnostic ?? '').toContain('different owned source identity');
      expect(readFileSync(join(slotDir, 'skills/code-review/SKILL.md'), 'utf8')).toBe('# Original\n');

      const forgedModern = {
        source: 'https://example.invalid/foreign.git',
        pluginId: 'addy@personal',
        fingerprint: String(modernMarker['fingerprint']),
        scopeId,
      };
      expect(resolveLegacyV1MarkerScopeId({
        target: { kind: 'codex', instance: 'default' },
        nativeId: 'addy@personal',
        marker: forgedModern,
        installedFingerprint: fingerprintTree(slotDir),
      })).toBeUndefined();
      expect(legacyV1MarkerMatchesScope({
        target: { kind: 'codex', instance: 'default' },
        scopeId,
        nativeId: 'addy@personal',
        marker: forgedModern,
        installedFingerprint: fingerprintTree(slotDir),
      })).toBe(false);
    });
  });
});
