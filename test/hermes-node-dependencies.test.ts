import { expect, test } from 'bun:test';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { hermesPublicRuntime, nativeHermesFixtureLauncher } from './hermes-runtime-fixture';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { writeFiles } from './util';

for (const shadow of [false, true]) {
  test(`Hermes native npm workspace symlink ${shadow ? 'does not hide a Python source shadow' : 'does not prevent source admission'}`, async () => {
    await withLifecycleCliHarness(harness => {
      const runtime = hermesPublicRuntime(harness, '6e7b83a2f1c093e992a8d838ed77ea320fbd8e51');
      writeFiles(runtime.sourceRoot, { 'node_modules/.keep': '', 'ui-tui/package.json': '{"name":"hermes-tui"}' });
      symlinkSync('../ui-tui', join(runtime.sourceRoot, 'node_modules', 'hermes-tui'));
      if (shadow) writeFiles(runtime.sourceRoot, { 'hermes_cli/main.so': 'foreign extension; never imported' });
      writeFileSync(runtime.executable, nativeHermesFixtureLauncher(runtime.sourceRoot));
      harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
      const source = harness.source('plugin', {
        'plugin.json': '{"name":"demo","version":"1.0.0"}',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo\n---\nDemo.\n',
      });
      const result = harness.run(['add', source, '--target', 'hermes', '--dry-run', '--json']);
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(shadow ? 1 : 0);
      expect(report.outcomes[0]?.reason?.code ?? null).toBe(shadow ? 'capability.unverified' : null);
      expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
      expect(result.state.after).toEqual(result.state.before);
    });
  });
}
