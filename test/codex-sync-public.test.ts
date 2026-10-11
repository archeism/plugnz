import { expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

test('Codex managed sync records canonical native scope and source proof through update and source-free retirement', async () => {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.codex/.keep': '' });
    const source = harness.source('codex-bootstrap', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n', 'payload.txt': 'original\n' });
    const codex = harness.fakeNative('codex', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.162.0\n' })));
    const env = { OPEN_PLUGIN_CODEX_BIN: codex.path };
    const installed = harness.run(['sync', source, '--target', 'codex', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const report = parseLifecycleReport(JSON.parse(installed.stdout));
    const scopeId = report.outcomes[0]!.scope.id;
    const markerPath = Object.keys(installed.stores.codex.after.files).find(path => path.endsWith('/.plgnz-install.json'))!;
    const marker = JSON.parse(bytesToText(installed.stores.codex.after.files[markerPath]!));
    expect(marker.scopeId).toBe(scopeId);
    expect(marker.route).toBe('managed');
    expect(marker.sourceType).toBe('local');
    const state = JSON.parse(bytesToText(installed.state.after!));
    expect(marker.sourceRevision).toBe(state.activations[0].sourceRevision);
    writeFileSync(join(source, 'payload.txt'), 'updated\n');
    const updated = harness.run(['sync', source, '--target', 'codex', '--json'], { env });
    expect(updated.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(updated.stdout)).outcomes[0]!.action).toBe('update');
    expect(Object.entries(updated.stores.codex.after.files).some(([path, bytes]) => path.endsWith('/payload.txt') && bytesToText(bytes) === 'updated\n')).toBe(true);
    mkdirSync(join(harness.home, '.codex/plugins/data/demo@local'), { recursive: true });
    writeFileSync(join(harness.home, '.codex/plugins/data/demo@local/kept'), 'user data\n');
    rmSync(source, { recursive: true });
    const retired = harness.run(['retire-source', scopeId, '--target', 'codex', '--json'], { env });
    expect(parseLifecycleReport(JSON.parse(retired.stdout)).outcomes[0]!.reason).toBe(null);
    expect(retired.exitCode).toBe(0);
    expect(bytesToText(retired.stores.codex.after.files['plugins/data/demo@local/kept']!)).toBe('user data\n');
  });
}, 20_000);
