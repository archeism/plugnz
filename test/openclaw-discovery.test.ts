import { expect, test } from 'bun:test';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';

test('OpenClaw default discovery requires an executable and respects exclusive explicit overrides', () => withLifecycleCliHarness(h => {
  const available = h.fakeNative('openclaw', [{ args: ['--version'], stdout: 'OpenClaw 2026.9.1 (ad6fe23)\n' }]);
  const nonExecutable = join(h.home, 'openclaw-not-executable');
  writeFileSync(nonExecutable, '#!/bin/sh\nexit 0\n'); chmodSync(nonExecutable, 0o600);
  h.writeHome({ '.openclaw/openclaw.json': '{}' });
  for (const override of ['', join(h.home, 'missing-openclaw'), nonExecutable, h.home]) {
    const result = h.run(['targets', '--json'], { env: { OPEN_PLUGIN_OPENCLAW_BIN: override } });
    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.stdout) as string[]).includes('openclaw')).toBe(false);
  }
  const result = h.run(['targets', '--json'], { env: { OPEN_PLUGIN_OPENCLAW_BIN: available.path } });
  expect(result.exitCode).toBe(0); expect(JSON.parse(result.stdout)).toContain('openclaw');
}), 30_000);
