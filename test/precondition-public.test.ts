import { expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness, type FakeNativeStep } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

test('a zero-write apply refusal preserves concurrent native bytes and permits a clean retry', async () => {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('concurrent', {
      'demo/plugin.json': '{"name":"demo","version":"1.0.0"}\n', 'demo/payload.txt': 'original\n',
      'orphan/plugin.json': '{"name":"orphan","version":"1.0.0"}\n', 'orphan/payload.txt': 'retained orphan\n',
    });
    const steps = (): FakeNativeStep[] => Array.from({ length: 16 }, () => ({ args: ['--version'], stdout: '2.4.0\n' }));
    const initial = harness.fakeNative('initial', steps());
    const installed = harness.run(['sync', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: initial.path } });
    expect(installed.exitCode).toBe(0);
    const relative = Object.keys(installed.stores.cursor.after.files).find((path) => path.endsWith('/payload.txt'))!;
    const payload = join(harness.home, '.cursor', relative);
    writeFileSync(join(source, 'demo/payload.txt'), 'desired update\n');
    rmSync(join(source, 'orphan'), { recursive: true });
    mkdirSync(join(source, 'later'));
    writeFileSync(join(source, 'later/plugin.json'), '{"name":"later","version":"1.0.0"}\n');
    const concurrent = steps();
    concurrent[4] = { ...concurrent[4]!, writes: { [payload]: 'external native change\n' } };
    const racer = harness.fakeNative('racer', concurrent);
    const refused = harness.run(['sync', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: racer.path } });
    const report = parseLifecycleReport(JSON.parse(refused.stdout));
    expect(refused.exitCode).toBe(1);
    expect(bytesToText(refused.stores.cursor.after.files[relative]!)).toBe('external native change\n');
    expect(report.summary.mutationStarted).toBe(false);
    expect(report.outcomes[0]!.changed).toBe(false);
    expect(report.outcomes.filter((row) => row.package !== 'demo').map((row) => row.result)).toEqual(['not-attempted', 'not-attempted']);
    expect(Object.entries(refused.stores.cursor.after.files).some(([path, bytes]) => path.endsWith('/payload.txt') && bytesToText(bytes) === 'retained orphan\n')).toBe(true);
    const clean = harness.fakeNative('clean', steps());
    const retry = harness.run(['sync', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: clean.path } });
    expect(retry.exitCode).toBe(0);
    expect(bytesToText(retry.stores.cursor.after.files[relative]!)).toBe('desired update\n');
  });
}, 20_000);

test('a zero-write retirement refusal leaves no false applying journal or stale rollback', async () => {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('retirement-race', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n', 'payload.txt': 'original\n' });
    const steps = (): FakeNativeStep[] => Array.from({ length: 16 }, () => ({ args: ['--version'], stdout: '2.4.0\n' }));
    const initial = harness.fakeNative('initial', steps());
    const installed = harness.run(['sync', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: initial.path } });
    expect(installed.exitCode).toBe(0);
    const relative = Object.keys(installed.stores.cursor.after.files).find((path) => path.endsWith('/payload.txt'))!;
    const payload = join(harness.home, '.cursor', relative);
    const concurrent = steps();
    concurrent[2] = { ...concurrent[2]!, writes: { [payload]: 'external native change\n' } };
    const racer = harness.fakeNative('racer', concurrent);
    const refused = harness.run(['retire-source', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: racer.path } });
    const report = parseLifecycleReport(JSON.parse(refused.stdout));
    expect(refused.exitCode).toBe(1);
    expect(report.summary.mutationStarted).toBe(false);
    expect(report.outcomes[0]!.changed).toBe(false);
    expect(bytesToText(refused.stores.cursor.after.files[relative]!)).toBe('external native change\n');
    writeFileSync(payload, 'original\n');
    const clean = harness.fakeNative('clean', steps());
    const retry = harness.run(['retire-source', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: clean.path } });
    expect(retry.exitCode).toBe(0);
  });
}, 20_000);

test('a partly failed source retirement retains authority and desired state until every package is verified retired', async () => {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('partial-retirement', {
      'alpha/plugin.json': '{"name":"alpha","version":"1.0.0"}\n',
      'beta/plugin.json': '{"name":"beta","version":"1.0.0"}\n',
      'gamma/plugin.json': '{"name":"gamma","version":"1.0.0"}\n',
    });
    const steps = (): FakeNativeStep[] => Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: '2.4.0\n' }));
    const initial = harness.fakeNative('initial', steps());
    const installed = harness.run(['sync', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: initial.path } });
    expect(installed.exitCode).toBe(0);
    const prior = JSON.parse(bytesToText(installed.state.after!));
    const failing = harness.fakeNative('readback-failure', steps().map((step, index) => index === 4 ? {
      ...step, writes: { [join(harness.home, '.cursor/plugins/retained/beta/data')]: 'not a retained directory\n' },
    } : step));
    const failed = harness.run(['retire-source', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: failing.path } });
    const report = parseLifecycleReport(JSON.parse(failed.stdout));
    expect(failed.exitCode).toBe(1);
    expect(report.outcomes.map(row => row.result)).toEqual(['succeeded', 'failed', 'not-attempted']);
    const after = JSON.parse(bytesToText(failed.state.after!));
    expect(after.scopes[0].lifecycle).toBe('active');
    expect(after.scopes[0].selectorMode).toBe(prior.scopes[0].selectorMode);
    expect(after.scopes[0].authority).toBe('authoritative');
    expect(after.scopes[0].desired).toEqual(prior.scopes[0].desired);
    expect(after.scopes[0].lastConverged).toEqual(prior.scopes[0].lastConverged);
    expect(after.activations.map((row: { packageId: string }) => row.packageId).sort()).toEqual(['beta', 'gamma']);
    rmSync(join(harness.home, '.cursor/plugins/retained/beta/data'));
    const clean = harness.fakeNative('clean', steps());
    const retry = harness.run(['retire-source', source, '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: clean.path } });
    expect(retry.exitCode).toBe(0);
    const retired = JSON.parse(bytesToText(retry.state.after!));
    expect(retired.scopes[0].lifecycle).toBe('retired');
    expect(retired.scopes[0].desired).toBeUndefined();
    expect(retired.activations).toEqual([]);
  });
}, 20_000);
