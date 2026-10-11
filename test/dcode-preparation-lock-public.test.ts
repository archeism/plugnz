import { expect, test } from 'bun:test';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';

for (const operation of ['disable', 'retire'] as const) {
  test(`dcode ${operation} preparation refusal releases its lock and preserves concurrent bytes`, async () => {
    await withLifecycleCliHarness(harness => {
      harness.writeHome({ '.deepagents/.keep': '' });
      const source = harness.source(`capture-${operation}`, { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
      const binary = harness.fakeNative('dcode', Array.from({ length: 20 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
      const env = { OPEN_PLUGIN_DCODE_BIN: binary.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
      const installed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
      expect(installed.exitCode).toBe(0);
      const state = JSON.parse(bytesToText(installed.state.after!));
      if (operation === 'disable') {
        state.activations[0].activationState = 'nonconforming';
        writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
        mkdirSync(join(source, 'commands'));
        writeFileSync(join(source, 'commands/unsupported.md'), '---\ndescription: unsupported\n---\ncommand\n');
      }
      const flags = '{"version":1,"enabledPlugins":{"demo@local":false,"foreign@local":true}}';
      const interpreter = join(harness.root, 'concurrent-lock');
      writeFileSync(interpreter, `#!/bin/sh\nif [ "$#" -eq 3 ]; then\n printf '%s' '${flags}' > "$OPEN_PLUGIN_DCODE_ROOT/.state/plugin_state.json"\nfi\nprintf 'DCODE_LOCK_0.1.83\\n'\ncat >/dev/null\n`);
      chmodSync(interpreter, 0o755);
      const args = operation === 'disable' ? ['sync', source] : ['retire-source', source];
      const result = harness.run([...args, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_PYTHON_BIN: interpreter }, timeoutMs: 3_000 });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('');
      const report = JSON.parse(result.stdout);
      expect(report.summary.mutationStarted).toBe(false);
      expect(result.stdout).toContain('dcode native inventory changed before locked preparation');
      expect(bytesToText(result.stores.dcode.after.files['.state/plugin_state.json']!)).toBe(flags);
      expect(result.stores.dcode.after.files['.state/installed_plugins.json']).toEqual(installed.stores.dcode.after.files['.state/installed_plugins.json']);
      expect(JSON.parse(bytesToText(result.state.after!)).activations[0].pending).toBeUndefined();
    });
  }, 15_000);
}
