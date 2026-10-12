/** Public update acceptance; obsolete helper fault coverage maps to lifecycle SPI. */
import { describe, expect, test } from 'bun:test';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli';
import { readState } from '../src/state';
import type { HostWriter } from '../src/host';
import { writers } from '../src/hosts/writers';
import { withHostEnvAsync, writeLedger, initGitRepo } from './util';
import { withKimiNative } from './kimi-fixture';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { createDeploymentScopeIdentity } from '../src/deployment-scope';

const plannedNativeId: HostWriter['plannedNativeId'] = plugin => plugin.name;
test('public update of a selected host preserves the other host recorded scope', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('selected', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    const added = harness.run(['add', source, '--target', 'cursor', '--json'], { env }); expect(added.exitCode).toBe(0);
    const state = JSON.parse(bytesToText(added.state.after!));
    const identity = createDeploymentScopeIdentity(state.scopes[0].source, { kind: 'kimi', instance: 'default' });
    const otherScope = { ...state.scopes[0], id: identity.id, target: identity.target };
    delete otherScope.lastAttemptId;
    const otherActivation = { ...state.activations[0], scopeId: identity.id };
    state.scopes.push(otherScope); state.activations.push(otherActivation);
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
    writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"1.0.0","description":"changed"}');
    const result = harness.run(['update', 'demo', '--target', 'cursor', '--json'], { env });
    expect({ code: result.exitCode, failure: parseLifecycleReport(JSON.parse(result.stdout)).summary.reason }).toEqual({ code: 0, failure: null });
    const after = JSON.parse(bytesToText(result.state.after!));
    expect(after.scopes.find((row: any) => row.id === identity.id)).toEqual(otherScope);
    expect(after.activations.find((row: any) => row.scopeId === identity.id)).toEqual(otherActivation);
    expect(result.stores.kimi.after).toEqual(result.stores.kimi.before);
  });
});
test('public update of an empty detected host is a nonmutating success', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const cursor = harness.fakeNative('cursor', [{ args: ['--version'], stdout: '2.4.0\n' }]);
    const result = harness.run(['update', '--target', 'cursor', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: cursor.path } });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(0); expect(report.outcomes).toEqual([]); expect(report.summary.mutationStarted).toBe(false);
    expect(result.state.after).toEqual(result.state.before); expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
  });
});

test('public update cannot mutate a recorded host which is unavailable', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ 'state.json': JSON.stringify({ version: 1, installs: [{ host: 'cursor', id: 'demo', source: '/must-not-read', sourceSha: 'old' }] }) });
    const result = harness.run(['update', '--target', 'cursor', '--json']);
    expect(result.exitCode).toBe(2); expect(parseLifecycleReport(JSON.parse(result.stdout)).summary.mutationStarted).toBe(false);
    expect(result.state.after).toEqual(result.state.before); expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
  });
});
describe('public update failure and imported identity', () => {
  test('reports a target detection exception as a preflight defect', async () => {
    await withHostEnvAsync('codex', async () => {
      const originalWriters = [...writers];
      const exploding: HostWriter = {
        id: 'codex',
        gui: false, plannedNativeId,
        detect: () => { throw ''; },
        stores: () => [],
        listInstalled: () => [],
        mcpEntries: () => [],
        add: async () => {},
        remove: async () => {},
        pin: async () => ({ changes: [], refusals: [] }),
      };
      const output: string[] = [];
      const originalLog = console.log;
      writers.splice(0, writers.length, exploding);
      console.log = (value: string) => output.push(value);
      try {
        expect(await main(['update', '--target', 'codex', '--json'])).toBe(1);
      } finally {
        writers.splice(0, writers.length, ...originalWriters);
        console.log = originalLog;
      }
      const report = parseLifecycleReport(JSON.parse(output.join('')));
      expect(report.outcomes).toEqual([]);
      expect(report.summary).toEqual({
        result: 'incomplete',
        terminalPhase: 'preflight',
        mutationStarted: false,
        changed: false,
        failureCategory: 'internal',
        reason: {
          category: 'internal',
          code: 'internal.defect',
          diagnostic: 'unknown thrown value',
          capabilityId: null,
          evidenceId: null,
        },
        recoveryId: null,
        readbackId: null,
      });
    });
  });


  test('public update canonicalizes a Kimi marketplace ledger and historical bare marker', async () => {
    await withHostEnvAsync('kimi', async (home) => {
      await withKimiNative(home, async () => {
        const repo = join(home, 'kimi-marketplace-source');
        const sha = initGitRepo(repo, {
          '.claude-plugin/marketplace.json': JSON.stringify({
            name: 'personal',
            plugins: [{ name: 'demo', source: './plugins/demo' }],
          }),
          'plugins/demo/plugin.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
        });
        expect(await main(['add', repo, '--target', 'kimi'])).toBe(0);
        const marker = join(home, '.kimi-code', 'plugins', 'managed', 'demo', '.plgnz-install.json');
        const ownership = JSON.parse(readFileSync(marker, 'utf8')) as Record<string, unknown>;
        writeFileSync(marker, JSON.stringify({ ...ownership, pluginId: 'demo' }));
        writeLedger(home, [{ host: 'kimi', id: 'demo', source: repo, sourceSha: sha }]);

        const output: string[] = [];
        const originalLog = console.log;
        console.log = (value: string) => output.push(value);
        let exitCode: number;
        try {
          exitCode = await main(['update', 'demo', '--target', 'kimi', '--json']);
        } finally {
          console.log = originalLog;
        }
        const report = parseLifecycleReport(JSON.parse(output.join('')));
        expect({
          exitCode,
          plan: report.plan.map(({ nativeId }) => nativeId),
          outcomes: report.outcomes.map(({ nativeId, result }) => ({ nativeId, result })),
          records: readState().map(({ id, pending }) => ({ id, pending })),
          markerId: (JSON.parse(readFileSync(marker, 'utf8')) as Record<string, unknown>).pluginId,
        }).toEqual({
          exitCode: 0,
          plan: ['demo@personal'],
          outcomes: [{ nativeId: 'demo@personal', result: 'succeeded' }],
          records: [{ id: 'demo@personal', pending: undefined }],
          markerId: 'demo@personal',
        });
        const current = JSON.parse(readFileSync(marker, 'utf8')) as Record<string, unknown>;
        writeFileSync(marker, JSON.stringify({ source: current.source, pluginId: 'demo', fingerprint: current.fingerprint }));
        writeLedger(home, [{ host: 'kimi', id: 'demo', source: repo, sourceSha: sha, ownership: 'plgnz' }]);
        const before = readFileSync(join(home, 'state.json'), 'utf8'), markerBefore = readFileSync(marker, 'utf8');
        output.length = 0; console.log = (value: string) => output.push(value);
        try { expect(await main(['update', 'demo', '--target', 'kimi', '--json'])).toBe(1); }
        finally { console.log = originalLog; }
        const unproven = parseLifecycleReport(JSON.parse(output.join('')));
        expect(unproven.summary.mutationStarted).toBe(false);
        expect(unproven.summary.failureCategory).toBe('internal');
        expect(readFileSync(join(home, 'state.json'), 'utf8')).toBe(before);
        expect(readFileSync(marker, 'utf8')).toBe(markerBefore);
      });
    });
  });


});

for (const scenario of ['dry-run', 'refresh', 'all', 'missing-package', 'missing-source', 'unknown-name', 'corrupt', 'legacy-json'] as const) {
  test(`public update ${scenario} preserves its exact lifecycle boundary`, async () => {
    await withLifecycleCliHarness(harness => {
      harness.writeHome({ '.cursor/.keep': '' });
      const source = harness.source('recorded', { 'plugin.json': '{"name":"demo","version":"1.0.0","description":"original"}' });
      const cursor = harness.fakeNative('cursor', Array.from({ length: 36 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
      const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
      expect(harness.run(['add', source, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
      const revised = '{"name":"demo","version":"1.0.0","description":"revised"}';
      if (scenario === 'missing-package') writeFileSync(join(source, 'plugin.json'), '{"name":"different","version":"1.0.0"}');
      else if (scenario === 'missing-source') rmSync(source, { recursive: true });
      else if (scenario === 'corrupt') writeFileSync(join(harness.home, 'state.json'), '{broken');
      else writeFileSync(join(source, 'plugin.json'), revised);
      const args = ['update', ...(scenario === 'all' ? [] : [scenario === 'unknown-name' ? 'unrecorded' : 'demo']), '--target', 'cursor',
        ...(scenario === 'dry-run' ? ['--dry-run'] : []), scenario === 'legacy-json' ? '--legacy-json' : '--json'];
      const result = harness.run(args, { env });
      const failure = ['missing-package', 'missing-source', 'unknown-name', 'corrupt'].includes(scenario);
      expect(result.exitCode).toBe(scenario === 'missing-package' ? 2 : failure ? 1 : 0);
      const parsed = JSON.parse(result.stdout);
      expect(result.stdout.trim()).toBe(JSON.stringify(parsed, null, 2));
      if (scenario === 'legacy-json') {
        expect(Array.isArray(parsed)).toBe(true);
        expect({ plugin: parsed[0].plugin, target: parsed[0].target, status: parsed[0].status }).toEqual({ plugin: 'demo', target: 'cursor', status: 'installed' });
      } else {
        const report = parseLifecycleReport(parsed);
        expect(report.command.name).toBe('update');
        expect(report.plan.every(row => row.coverage !== 'retirement')).toBe(true);
        if (failure) expect(report.summary.mutationStarted).toBe(false);
        else expect(report.outcomes[0]?.result).toBe('succeeded');
      }
      if (failure || scenario === 'dry-run') {
        expect(result.state.after).toEqual(result.state.before);
        expect(Object.values(result.stores).every(store => JSON.stringify(store.after) === JSON.stringify(store.before))).toBe(true);
      } else {
        expect(bytesToText(result.stores.cursor.after.files['plugins/local/demo/plugin.json']!)).toBe(revised);
        expect(JSON.parse(bytesToText(result.state.after!)).version).toBe(2);
      }
    });
  });
}

for (const target of ['not-a-target', 'pi'] as const) test(`public update refuses ${target} before Source access`, async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ 'state.json': JSON.stringify({ version: 1, installs: [{ host: 'pi', id: 'demo', source: '/must-not-read', sourceSha: 'old', ownership: 'plgnz' }] }) });
    const result = harness.run(['update', '--target', target, '--json']);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(target === 'pi' ? 1 : 2);
    expect(report.summary.reason?.code).toBe(target === 'pi' ? 'capability.unsupported' : 'usage.invalid-selection');
    expect(report.summary.mutationStarted).toBe(false);
    expect(result.state.after).toEqual(result.state.before);
  });
});

test('public update freezes every recorded Source before an independent update can write', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const first = harness.source('first', { 'plugin.json': '{"name":"first","version":"1.0.0"}' });
    const last = harness.source('last', { 'plugin.json': '{"name":"last","version":"1.0.0"}' });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 36 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    expect(harness.run(['add', first, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    expect(harness.run(['add', last, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    writeFileSync(join(first, 'plugin.json'), '{"name":"first","version":"1.0.0","description":"changed"}');
    rmSync(last, { recursive: true });
    const result = harness.run(['update', '--target', 'cursor', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    expect(report.summary.mutationStarted).toBe(false);
    expect(report.plan).toEqual([]);
    expect(result.state.after).toEqual(result.state.before);
    expect(Object.values(result.stores).every(store => JSON.stringify(store.after) === JSON.stringify(store.before))).toBe(true);
  });
});
