import { expect, test } from 'bun:test';
import { readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { bytesToText, snapshotTree, withLifecycleCliHarness } from './lifecycle-cli-harness';

test('Codex sync observes and preserves an unrelated bundled latest symlink through preview, install, update and retirement', async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({
      '.codex/config.toml': '[plugins."chrome@openai-bundled"]\nenabled = true\nuser_option = "keep"\n',
      '.codex/plugins/cache/openai-bundled/chrome/1.0.0/plugin.json': '{"name":"chrome","version":"1.0.0"}\n',
      '.codex/plugins/cache/openai-bundled/chrome/1.0.0/payload.txt': 'native bundled bytes\n',
    });
    const bundle = join(h.home, '.codex/plugins/cache/openai-bundled');
    symlinkSync('1.0.0', join(bundle, 'chrome/latest'));
    const before = snapshotTree(bundle);
    const source = h.source('independent', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n', 'payload.txt': 'first\n' });
    const native = h.fakeNative('codex', Array.from({ length: 64 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.162.0\n' })));
    const env = { OPEN_PLUGIN_CODEX_BIN: native.path };
    const preview = h.run(['sync', source, '--target', 'codex', '--dry-run', '--json'], { env });
    expect({ exitCode: preview.exitCode, reason: JSON.parse(preview.stdout).summary.reason }).toEqual({ exitCode: 0, reason: null });
    expect(preview.state.after).toEqual(preview.state.before);
    expect(preview.stores.codex.after).toEqual(preview.stores.codex.before);
    const installed = h.run(['sync', source, '--target', 'codex', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(installed.stdout)).outcomes[0]!.result).toBe('succeeded');
    expect(JSON.parse(bytesToText(installed.state.after!)).activations.map((row: { nativeId: string }) => row.nativeId)).toEqual(['demo@local']);
    expect(snapshotTree(bundle)).toEqual(before);
    writeFileSync(join(source, 'payload.txt'), 'updated\n');
    const updated = h.run(['sync', source, '--target', 'codex', '--json'], { env });
    expect(updated.exitCode).toBe(0);
    expect(readFileSync(join(h.home, '.codex/plugins/cache/local/demo/1.0.0/payload.txt'), 'utf8')).toBe('updated\n');
    const retired = h.run(['retire-source', source, '--target', 'codex', '--json'], { env });
    expect(retired.exitCode).toBe(0);
    expect(snapshotTree(bundle)).toEqual(before);
    expect(readFileSync(join(h.home, '.codex/config.toml'), 'utf8')).toContain('[plugins."chrome@openai-bundled"]\nenabled = true\nuser_option = "keep"');
  });
}, 20_000);

test('an observed Codex symlink cannot be adopted or mutated even with an ownership marker behind it', async () => {
  await withLifecycleCliHarness(h => {
    const source = h.source('candidate', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n', 'payload.txt': 'incoming\n' });
    h.writeHome({
      '.codex/config.toml': '[plugins."demo@local"]\nenabled = true\n',
      '.codex/plugins/cache/local/demo/.keep': '',
      'external/plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      'external/payload.txt': 'unrelated target\n',
      'external/.plgnz-install.json': JSON.stringify({ source, pluginId: 'demo@local', fingerprint: 'a'.repeat(64) }),
    });
    symlinkSync(join(h.home, 'external'), join(h.home, '.codex/plugins/cache/local/demo/1.0.0'));
    const targetBefore = snapshotTree(join(h.home, 'external'));
    const native = h.fakeNative('codex', Array.from({ length: 32 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.162.0\n' })));
    for (const dry of [true, false]) {
      const refused = h.run(['add', source, '--target', 'codex', '--adopt-existing', ...(dry ? ['--dry-run'] : []), '--json'], { env: { OPEN_PLUGIN_CODEX_BIN: native.path } });
      expect(refused.exitCode === 0).toBe(false);
      expect(refused.stdout).toContain('symlink');
      expect(parseLifecycleReport(JSON.parse(refused.stdout)).summary.mutationStarted).toBe(false);
      expect(refused.stores.codex.after).toEqual(refused.stores.codex.before);
      expect(refused.state.after).toEqual(refused.state.before);
      expect(snapshotTree(join(h.home, 'external'))).toEqual(targetBefore);
    }
  });
}, 20_000);

test('source-tree symlinks remain rejected before Codex writes', async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.codex/.keep': '', 'external.txt': 'do not import\n' });
    const source = h.source('linked-source', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    symlinkSync(join(h.home, 'external.txt'), join(source, 'payload.txt'));
    const refused = h.run(['sync', source, '--target', 'codex', '--json']);
    expect(refused.exitCode === 0).toBe(false); expect(refused.stdout.toLowerCase()).toContain('symlink');
    expect(refused.stores.codex.after).toEqual(refused.stores.codex.before);
    expect(refused.state.after).toEqual(refused.state.before);
  });
});
