import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

test('a supplied adoption expectation without matching legacy proof blocks every native scope before writes', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const alpha = harness.source('alpha', { 'plugin.json': '{"name":"alpha","version":"1.0.0"}\n' });
    const demo = harness.source('demo', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const manifest = join(harness.source('batch', {}), 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [alpha, demo].map((locator, index) => ({
      operation: 'sync', source: { kind: 'local', locator }, target: { kind: 'cursor', instance: 'default' },
      selectors: [{ package: index === 0 ? 'alpha' : 'demo', adoptExisting: index === 1,
        ...(index === 0 ? {} : { expectedAdoption: { schemaVersion: 1, admissionId: `sha256:${'a'.repeat(64)}` } }) }],
    })) }));
    const result = harness.run(['sync', '--manifest', manifest, '--json']);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    expect(report.summary.reason?.diagnostic).toContain('no independently proven matching legacy operation');
    expect(report.summary.mutationStarted).toBe(false);
    expect(result.state.after).toBeUndefined();
    expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
  });
});

test('unsealed legacy history is retained with an actionable diagnostic instead of a nonexistent retry verb', async () => {
  await withLifecycleCliHarness(harness => {
    const source = harness.source('legacy', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    harness.writeHome({ '.cursor/.keep': '', 'state.json': JSON.stringify({ version: 1, installs: [{
      host: 'cursor', id: 'demo@personal', source, sourceSha: 'original-revision', ownership: 'plgnz', pending: 'install',
    }] }) });
    const result = harness.run(['sync', source, '--target', 'cursor', '--plugin', 'demo', '--adopt-existing', '--json']);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    expect(report.summary.reason!.diagnostic).toContain('no durable sealed recovery authority');
    expect(report.summary.reason!.diagnostic.includes("Retry the original 'legacy-recovery' command")).toBe(false);
    expect(result.state.after).toEqual(result.state.before);
    expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
  });
});
