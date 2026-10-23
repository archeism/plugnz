import { legacyV1MarkerMatchesScope, resolveLegacyV1MarkerScopeId } from '../src/legacy-claim-ownership';
import { describe, expect, test } from 'bun:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { claudeCodeWriter } from '../src/hosts/claude-code-writer';
import { cursorWriter } from '../src/hosts/cursor-writer';
import { codexWriter } from '../src/hosts/codex-writer';
import { fingerprintTree } from '../src/fingerprint';
import { resolveSource } from '../src/source';
import { createDeploymentScopeIdentity } from '../src/deployment-scope';

async function seedLegacyClaudeV1(
  harness: Parameters<Parameters<typeof withLifecycleCliHarness>[0]>[0],
  sourceDir: string,
  stateForm: 'v1' | 'v2-legacy-import' = 'v2-legacy-import',
) {
  const prevRoot = process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'];
  const prevHome = process.env['OPEN_PLUGIN_HOME'];
  process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'] = harness.storePath('claude-code');
  process.env['OPEN_PLUGIN_HOME'] = harness.home;
  try {
    const resolved = resolveSource(sourceDir);
    const plugin = resolved.plugins.find(p => p.name === 'addy')!;
    await claudeCodeWriter.add(plugin, resolved);
    const registry = JSON.parse(readFileSync(join(harness.storePath('claude-code'), 'plugins/installed_plugins.json'), 'utf8')) as {
      plugins: Record<string, Array<{ installPath: string }>>;
    };
    const installPath = registry.plugins['addy@personal']![0]!.installPath;
    const installedFp = fingerprintTree(installPath);
    const scope = createDeploymentScopeIdentity({ kind: 'local', locator: sourceDir }, { kind: 'claude-code', instance: 'default' });
    if (stateForm === 'v1') {
      harness.writeHome({
        'state.json': JSON.stringify({
          version: 1,
          installs: [{
            host: 'claude-code',
            id: 'addy@personal',
            source: sourceDir,
            sourceSha: resolved.sha,
            fingerprint: plugin.contentFingerprint,
            installedFingerprint: installedFp,
            sourceDir: plugin.dir,
            ownership: 'plgnz',
            installedAt: '2026-10-11T16:44:52.071Z',
          }],
        }, null, 2),
      });
    } else {
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
            packageId: 'addy@personal',
            nativeId: 'addy@personal',
            sourceRelativeDir: 'plugins/addy',
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
    }
    return { installPath, installedFp, scopeId: scope.id, sourceFingerprint: plugin.contentFingerprint! };
  } finally {
    if (prevRoot === undefined) delete process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'];
    else process.env['OPEN_PLUGIN_CLAUDE_CODE_ROOT'] = prevRoot;
    if (prevHome === undefined) delete process.env['OPEN_PLUGIN_HOME'];
    else process.env['OPEN_PLUGIN_HOME'] = prevHome;
  }
}

describe('legacy v1 ownership migration (Personal issue #63)', () => {
  test('migrates legacy v1 claude-code install (addy@personal without scopeId) for canonical OpenPlugin marketplace and converges idempotently', async () => {
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

      const { installPath, scopeId } = await seedLegacyClaudeV1(harness, sourceDir, 'v2-legacy-import');
      const markerBefore = JSON.parse(readFileSync(join(installPath, '.plgnz-install.json'), 'utf8')) as Record<string, unknown>;
      expect(markerBefore['scopeId']).toBeUndefined();

      const first = harness.run(['add', sourceDir, '--target', 'claude-code', '--json']);
      const firstReport = JSON.parse(first.stdout);
      expect(firstReport.summary.reason?.diagnostic ?? '').toBe('');
      expect(first.exitCode).toBe(0);
      expect(firstReport.summary.result).toBe('converged');
      expect(firstReport.outcomes[0]?.action).toBe('update');

      const registryAfter = JSON.parse(readFileSync(join(harness.storePath('claude-code'), 'plugins/installed_plugins.json'), 'utf8')) as { plugins: Record<string, Array<{ installPath: string }>> };
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

  test('migrates legacy v1 cursor and codex installs when imported v2 legacy scopes exist and converges idempotently', async () => {
    await withLifecycleCliHarness(async harness => {
      const codex = harness.fakeNative('codex', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.162.0\n' })));
      const env = { OPEN_PLUGIN_CODEX_BIN: codex.path };
      const sourceDir = harness.source('personal-multi', {
        '.claude-plugin/marketplace.json': JSON.stringify({
          name: 'personal',
          owner: { name: 'Charles' },
          plugins: [{ name: 'addy', source: './plugins/addy' }],
        }),
        'plugins/addy/plugin.json': JSON.stringify({ name: 'addy', version: '0.1.0' }),
        'plugins/addy/skills/code-review/SKILL.md': '# Code Review\n',
      });

      const prevCursor = process.env['OPEN_PLUGIN_CURSOR_ROOT'];
      const prevCodex = process.env['OPEN_PLUGIN_CODEX_HOME'];
      const prevHome = process.env['OPEN_PLUGIN_HOME'];
      process.env['OPEN_PLUGIN_CURSOR_ROOT'] = harness.storePath('cursor');
      process.env['OPEN_PLUGIN_CODEX_HOME'] = harness.storePath('codex');
      process.env['OPEN_PLUGIN_HOME'] = harness.home;
      let cursorScopeId = '';
      let codexScopeId = '';
      try {
        const resolved = resolveSource(sourceDir);
        const plugin = resolved.plugins.find(p => p.name === 'addy')!;
        await cursorWriter.add(plugin, resolved);
        await codexWriter.add(plugin, resolved);
        const cursorPath = join(harness.storePath('cursor'), 'plugins/local/addy');
        const codexPath = join(harness.storePath('codex'), 'plugins/cache/personal/addy/0.1.0');
        const cursorFp = fingerprintTree(cursorPath);
        const codexFp = fingerprintTree(codexPath);
        cursorScopeId = createDeploymentScopeIdentity({ kind: 'local', locator: sourceDir }, { kind: 'cursor', instance: 'default' }).id;
        codexScopeId = createDeploymentScopeIdentity({ kind: 'local', locator: sourceDir }, { kind: 'codex', instance: 'default' }).id;
        harness.writeHome({
          'state.json': JSON.stringify({
            version: 2,
            stateGeneration: 1,
            scopes: [
              { id: cursorScopeId, source: { kind: 'local', locator: sourceDir }, target: { kind: 'cursor', instance: 'default' }, authority: 'legacy-import', lifecycle: 'active', selectorMode: 'legacy-unknown' },
              { id: codexScopeId, source: { kind: 'local', locator: sourceDir }, target: { kind: 'codex', instance: 'default' }, authority: 'legacy-import', lifecycle: 'active', selectorMode: 'legacy-unknown' },
            ],
            activations: [
              { scopeId: cursorScopeId, packageId: 'addy', nativeId: 'addy', sourceRelativeDir: 'plugins/addy', sourceRevision: resolved.sha, route: { kind: 'legacy-unverified' }, ownership: { kind: 'legacy-claim', prior: 'plgnz' }, fingerprints: { source: plugin.contentFingerprint, installed: cursorFp }, activationState: 'unknown', readbackState: 'unverified', pins: [] },
              { scopeId: codexScopeId, packageId: 'addy@personal', nativeId: 'addy@personal', sourceRelativeDir: 'plugins/addy', sourceRevision: resolved.sha, route: { kind: 'legacy-unverified' }, ownership: { kind: 'legacy-claim', prior: 'plgnz' }, fingerprints: { source: plugin.contentFingerprint, installed: codexFp }, activationState: 'unknown', readbackState: 'unverified', pins: [] },
            ],
            attempts: [],
            tombstones: [],
          }, null, 2),
        });
      } finally {
        if (prevCursor === undefined) delete process.env['OPEN_PLUGIN_CURSOR_ROOT']; else process.env['OPEN_PLUGIN_CURSOR_ROOT'] = prevCursor;
        if (prevCodex === undefined) delete process.env['OPEN_PLUGIN_CODEX_HOME']; else process.env['OPEN_PLUGIN_CODEX_HOME'] = prevCodex;
        if (prevHome === undefined) delete process.env['OPEN_PLUGIN_HOME']; else process.env['OPEN_PLUGIN_HOME'] = prevHome;
      }

      const first = harness.run(['add', sourceDir, '--target', 'cursor', '--target', 'codex', '--json'], { env });
      const firstReport = JSON.parse(first.stdout);
      expect(firstReport.outcomes.map((o: { reason?: { diagnostic?: string } | null }) => o.reason?.diagnostic ?? '')).toEqual(['', '']);
      expect(first.exitCode).toBe(0);
      expect(firstReport.summary.result).toBe('converged');

      const second = harness.run(['add', sourceDir, '--target', 'cursor', '--target', 'codex', '--json'], { env });
      const secondReport = JSON.parse(second.stdout);
      expect(second.exitCode).toBe(0);
      expect(secondReport.summary.result).toBe('converged');
      expect(secondReport.outcomes.every((o: { action: string }) => o.action === 'unchanged')).toBe(true);
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

      const { installPath, scopeId: ownerAScopeId } = await seedLegacyClaudeV1(harness, ownerA, 'v2-legacy-import');
      const res = harness.run(['add', ownerB, '--target', 'claude-code', '--json']);
      const report = JSON.parse(res.stdout);
      expect(res.exitCode).toBe(1);
      expect(report.summary.reason?.diagnostic).toContain(ownerAScopeId);
      expect(readFileSync(join(installPath, 'skills/code-review/SKILL.md'), 'utf8')).toBe('# Owner A\n');
    });
  });

  test('preserves modified legacy install and unmanaged install without overwriting bytes', async () => {
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

      const { installPath } = await seedLegacyClaudeV1(harness, sourceDir, 'v2-legacy-import');
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

      // End-to-end Codex apply refusal when a modern scoped marker has a mismatched source
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

      // Direct unit check: a modern marker with scopeId already present is NOT a legacy v1 marker
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
