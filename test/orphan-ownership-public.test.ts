import { expect, test } from 'bun:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

for (const operation of ['sync', 'retire-source'] as const) {
  test(`unproven authoritative orphan blocks the whole ${operation} batch before writes`, async () => {
    await withLifecycleCliHarness((harness) => {
      harness.writeHome({ '.cursor/.keep': '' });
      const source = harness.source('owned', {
        'alpha/plugin.json': '{"name":"alpha","version":"1.0.0"}\n',
        'beta/plugin.json': '{"name":"beta","version":"1.0.0"}\n',
      });
      const earlier = harness.source('earlier', { 'plugin.json': '{"name":"earlier","version":"1.0.0"}\n' });
      const cursor = harness.fakeNative('cursor', Array.from({ length: 48 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
      const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
      const installed = harness.run(['sync', source, '--target', 'cursor', '--json'], { env });
      expect(installed.exitCode).toBe(0);
      const state = JSON.parse(bytesToText(installed.state.after!));
      expect(state.scopes[0].authority).toBe('authoritative');
      expect(state.scopes[0].lastConverged === undefined).toBe(false);
      expect(state.activations.map((row: { packageId: string }) => row.packageId).sort()).toEqual(['alpha', 'beta']);
      const marker = join(harness.home, '.cursor/plugins/local/beta/.plgnz-install.json');
      const markerBytes = readFileSync(marker, 'utf8');
      rmSync(marker);
      const target = { kind: 'cursor', instance: 'default' };
      const manifest = join(harness.source('manifest', { 'batch.json': JSON.stringify({ schemaVersion: 1, entries: [
        { operation: 'sync', source: { kind: 'local', locator: earlier }, target },
        operation === 'sync'
          ? { operation, source: { kind: 'local', locator: source }, target, selectors: [{ package: 'alpha', adoptExisting: false }] }
          : { operation, scopeId: state.scopes[0].id, target },
      ] }) }), 'batch.json');

      for (const dryRun of [false, true]) {
        const refused = harness.run(['sync', '--manifest', manifest, '--json', ...(dryRun ? ['--dry-run'] : [])], { env });
        const report = parseLifecycleReport(JSON.parse(refused.stdout));
        expect(refused.stores.cursor.after.files['plugins/local/earlier/plugin.json']).toBeUndefined();
        expect({ exitCode: refused.exitCode, stderr: refused.stderr, plan: report.plan, outcomes: report.outcomes,
          phase: report.summary.terminalPhase, mutationStarted: report.summary.mutationStarted,
          changed: report.summary.changed, category: report.summary.failureCategory,
          diagnostic: report.summary.reason?.diagnostic }).toEqual({
          exitCode: 1, stderr: '', plan: [], outcomes: [], phase: 'preflight', mutationStarted: false,
          changed: false, category: 'internal', diagnostic: "ownership of 'beta' was not revalidated",
        });
        expect(refused.state.after).toEqual(refused.state.before);
        expect(refused.stores).toEqual(Object.fromEntries(Object.entries(refused.stores).map(([host, snapshots]) =>
          [host, { before: snapshots.before, after: snapshots.before }])));
        expect(cursor.invocations().every(row => JSON.stringify(row.args) === '["--version"]')).toBe(true);
      }

      writeFileSync(marker, markerBytes);
      const applied = harness.run(['sync', '--manifest', manifest, '--json'], { env });
      const report = parseLifecycleReport(JSON.parse(applied.stdout));
      expect(applied.exitCode).toBe(0);
      expect(report.summary.changed).toBe(true);
      expect(report.outcomes.find(row => row.package === 'earlier')?.result).toBe('succeeded');
      expect(applied.stores.cursor.after.files['plugins/local/earlier/plugin.json'] === undefined).toBe(false);
      expect(applied.stores.cursor.after.files['plugins/local/beta/plugin.json']).toBeUndefined();
      expect(JSON.parse(bytesToText(applied.state.after!)).tombstones.some((row: { packageId: string }) => row.packageId === 'beta')).toBe(true);
    });
  });
}
