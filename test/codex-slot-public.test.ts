import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';

for (const requestedVersion of ['0.9.0', '0.8.0']) {
test(`an occupied or shadowed inactive Codex downgrade ${requestedVersion} blocks the entire batch before earlier siblings write`, async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.codex/.keep': '' });
    const source = h.source('existing', { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'payload.txt': 'owned active bytes' });
    const native = h.fakeNative('codex', Array.from({ length: 64 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.162.0\n' })));
    const env = { OPEN_PLUGIN_CODEX_BIN: native.path };
    expect(h.run(['sync', source, '--target', 'codex', '--json'], { env }).exitCode).toBe(0);
    const activeMarker = JSON.parse(readFileSync(join(h.home, '.codex/plugins/cache/local/demo/1.0.0/.plgnz-install.json'), 'utf8'));
    h.writeHome({
      '.codex/plugins/cache/local/demo/0.9.0/valuable.txt': 'inactive bytes without historical authority',
      '.codex/plugins/cache/local/demo/0.9.0/.plgnz-install.json': JSON.stringify({ ...activeMarker, fingerprint: 'unproven-old-fingerprint' }),
    });
    writeFileSync(join(source, 'plugin.json'), JSON.stringify({ name: 'demo', version: requestedVersion }));
    const fresh = h.source('earlier', { 'plugin.json': '{"name":"fresh","version":"1.0.0"}', 'payload.txt': 'new earlier package' });
    const manifest = join(h.home, 'batch.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [fresh, source].map(locator => ({ operation: 'sync', source: { kind: 'local', locator }, target: { kind: 'codex', instance: 'default' } })) }));
    for (const preview of [true, false]) {
      const result = h.run(['sync', '--manifest', manifest, ...(preview ? ['--dry-run'] : []), '--json'], { env });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(1);
      expect(report.summary.reason?.category).toBe('internal');
      expect(report.summary.reason?.diagnostic).toContain(requestedVersion === '0.9.0' ? 'inactive requested version' : 'inactive cache version');
      expect(report.summary.mutationStarted).toBe(false);
      expect(report.outcomes).toEqual([]);
      expect(result.state.after).toEqual(result.state.before);
      expect(result.stores.codex.after).toEqual(result.stores.codex.before);
    }
  });
}, 20_000);
}
