import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { hermesNativeBootstrap7dbbb0f } from '../src/hosts/hermes-launcher-templates';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { hermesPublicRuntime } from './hermes-runtime-fixture';
import { writeFiles } from './util';

const revision = '7dbbb0f4a6ebeec9a8714ec37fa41340fe9e4e00';
for (const variant of ['official', 'modified-body', 'shadow', 'unknown-revision', 'dirty-revision'] as const) {
  test(`Hermes 7dbbb0f bootstrap: ${variant}`, async () => {
    await withLifecycleCliHarness(harness => {
      const runtime = hermesPublicRuntime(harness, variant === 'unknown-revision' ? 'f'.repeat(40) : revision,
        variant === 'dirty-revision' ? ' M hermes_cli/main.py\n' : '');
      let code = hermesNativeBootstrap7dbbb0f.replaceAll("'/__PLUGNZ_HERMES_ROOT__'", `'${runtime.sourceRoot}'`);
      if (variant === 'modified-body') code = code.replace('import hermes_bootstrap', 'import arbitrary_bootstrap');
      writeFileSync(runtime.executable, `#!/bin/sh\nexec /usr/bin/python3 -I -c '${code.replace(/'/gu, `'"'"'`)}' "$@"\n`);
      if (variant === 'shadow') writeFiles(runtime.sourceRoot, { 'hermes_cli/main.so': 'untrusted shadow; never executed' });
      harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
      const source = harness.source('plugin', {
        'plugin.json': '{"name":"demo","version":"1.0.0"}',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo\n---\nDemo.\n',
      });
      const result = harness.run(['add', source, '--target', 'hermes', '--dry-run', '--json']);
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(variant === 'official' ? 0 : 1);
      expect(report.outcomes[0]?.reason?.code ?? null).toBe(variant === 'official' ? null : 'capability.unverified');
      expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
      expect(result.state.after).toEqual(result.state.before);
      expect(result.nativeInvocations.hermes).toEqual([]);
    });
  });
}
