import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';
import { readLifecycleState } from '../src/state';

test('v1 bare ledger accepts only its adapter-proven qualified selector', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('qualified', {
      'marketplace.json': '{"name":"personal","plugins":[{"name":"demo","source":"./demo"}]}',
      'demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
    });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 32 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    expect(harness.run(['add', source, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'cursor', id: 'demo', source, sourceSha: 'legacy', sourceDir: join(source, 'demo'), ownership: 'plgnz' },
    ] }));
    const foreign = harness.run(['update', 'demo@foreign', '--target', 'cursor', '--json'], { env });
    expect(foreign.exitCode).toBe(1);
    const refused = parseLifecycleReport(JSON.parse(foreign.stdout));
    expect(refused.summary.mutationStarted).toBe(false);
    expect(refused.plan).toEqual([]);
    expect(refused.summary.reason?.code).toBe('internal.ambiguous-ownership');
    expect(refused.summary.reason?.diagnostic).toBe("no install record for 'demo@foreign' in state.json — not installed by plgnz; refusing to modify it");
    expect(foreign.state.after).toEqual(foreign.state.before);
    expect(foreign.stores.cursor.after).toEqual(foreign.stores.cursor.before);
    writeFileSync(join(source, 'demo/plugin.json'), '{"name":"demo","version":"1.0.0","description":"updated"}');
    const selected = harness.run(['update', 'demo@personal', '--target', 'cursor', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(selected.stdout));
    expect(selected.exitCode).toBe(0);
    expect(report.outcomes.map(row => ({ package: row.package, nativeId: row.nativeId, result: row.result }))).toEqual([
      { package: 'demo', nativeId: 'demo', result: 'succeeded' },
    ]);
    expect(bytesToText(selected.stores.cursor.after.files['plugins/local/demo/plugin.json']!)).toContain('updated');
  });
});

for (const includeSourceDir of [true, false]) test(`v1 qualified dcode ledger accepts its adapter-proven bare package selector (sourceDir ${includeSourceDir ? 'recorded' : 'omitted'})`, async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('dcode-qualified', {
      'marketplace.json': '{"name":"personal","plugins":[{"name":"demo","source":"./demo"}]}',
      'demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
      'demo/mcp.json': '{"mcpServers":{"demo":{"command":"node","args":[]}}}',
    });
    const dcode = harness.fakeNative('dcode', Array.from({ length: 32 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
    const env = { OPEN_PLUGIN_DCODE_BIN: dcode.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    expect(harness.run(['add', source, '--target', 'dcode', '--json'], { env }).exitCode).toBe(0);
    const pinned = harness.run(['pin', '--target', 'dcode', '--json'], { env });
    expect(pinned.exitCode).toBe(0);
    const pinnedMcp = Object.entries(pinned.stores.dcode.after.files).find(([path]) => path.endsWith('/mcp.json'))!;
    const pinnedCommand = JSON.parse(bytesToText(pinnedMcp[1])).mcpServers.demo.command;
    expect(pinnedCommand.startsWith('/')).toBe(true);
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'dcode', id: 'demo@personal', source, sourceSha: 'legacy', ...(includeSourceDir ? { sourceDir: join(source, 'demo') } : {}), ownership: 'plgnz', pins: ['demo'], installedAt: '2020-01-02T03:04:05.000Z' },
    ] }));
    const foreign = harness.run(['update', 'demo@foreign', '--target', 'dcode', '--json'], { env });
    const refused = parseLifecycleReport(JSON.parse(foreign.stdout));
    expect(foreign.exitCode).toBe(1); expect(refused.plan).toEqual([]);
    expect(refused.summary.reason?.code).toBe('internal.ambiguous-ownership');
    expect(refused.summary.reason?.diagnostic).toBe("no install record for 'demo@foreign' in state.json — not installed by plgnz; refusing to modify it");
    expect(foreign.state.after).toEqual(foreign.state.before); expect(foreign.stores.dcode.after).toEqual(foreign.stores.dcode.before);
    writeFileSync(join(source, 'demo/plugin.json'), '{"name":"demo","version":"1.0.0","description":"bare selected"}');
    const selected = harness.run(['update', 'demo', '--target', 'dcode', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(selected.stdout));
    expect(selected.exitCode).toBe(0);
    expect(report.outcomes.map(row => ({ package: row.package, nativeId: row.nativeId, result: row.result }))).toEqual([
      { package: 'demo', nativeId: 'demo@personal', result: 'succeeded' },
    ]);
    expect(Object.entries(selected.stores.dcode.after.files).some(([path, bytes]) =>
      path.endsWith('/plugin.json') && bytesToText(bytes).includes('bare selected'))).toBe(true);
    const selectedMcp = Object.entries(selected.stores.dcode.after.files).find(([path]) => path.endsWith('/mcp.json'))!;
    expect(JSON.parse(bytesToText(selectedMcp[1])).mcpServers.demo.command).toBe(pinnedCommand);
    const retry = harness.run(['update', 'demo', '--target', 'dcode', '--json'], { env });
    expect(retry.exitCode).toBe(0);
    const retried = JSON.parse(bytesToText(retry.state.after!));
    expect(retried.activations.map((row: { packageId: string; nativeId: string }) => ({ package: row.packageId, nativeId: row.nativeId }))).toEqual([
      { package: 'demo', nativeId: 'demo@personal' },
    ]);
    expect(retried.activations[0].pins).toEqual(['demo']);
    expect(retried.activations[0].activatedAt).toBe('2020-01-02T03:04:05.000Z');
    const removed = harness.run(['remove', 'demo', '--target', 'dcode', '--json'], { env });
    expect(removed.exitCode).toBe(0);
    const retired = JSON.parse(bytesToText(removed.state.after!));
    expect(retired.activations).toEqual([]);
    expect(retired.tombstones.map((row: { packageId: string; nativeId: string }) => ({ package: row.packageId, nativeId: row.nativeId }))).toEqual([
      { package: 'demo', nativeId: 'demo@personal' },
    ]);
    expect(retried.attempts.every((attempt: { id: string }) =>
      retired.attempts.some((kept: { id: string }) => JSON.stringify(kept) === JSON.stringify(attempt)))).toBe(true);
    expect(retired.tombstones[0].retentionState).toBe('plugin-state-retained');
    expect(retired.tombstones[0].sourceRelativeDir).toBe('demo');
    for (const field of ['sourceRevision', 'route', 'ownership', 'fingerprints', 'pins', 'activatedAt']) {
      expect(retired.tombstones[0][field]).toEqual(retried.activations[0][field]);
    }
    expect(dcode.invocations().every(row => JSON.stringify(row.args) === '["--version"]')).toBe(true);
  });
});

for (const pending of ['install', 'remove'] as const) test(`same-native qualified v1 pending ${pending} is retained by every public install verb`, async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('pending-qualified', {
      'marketplace.json': '{"name":"personal","plugins":[{"name":"demo","source":"./demo"}]}',
      'demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
    });
    const dcode = harness.fakeNative('dcode', Array.from({ length: 48 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
    const env = { OPEN_PLUGIN_DCODE_BIN: dcode.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    expect(harness.run(['add', source, '--target', 'dcode', '--json'], { env }).exitCode).toBe(0);
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'dcode', id: 'demo@personal', source, sourceSha: 'legacy', sourceDir: join(source, 'demo'), ownership: 'plgnz', pending },
    ] }));
    for (const argv of [['update', 'demo'], ['add', source], ['sync', source, '--plugin', 'demo']]) {
      const result = harness.run([...argv, '--target', 'dcode', '--json'], { env });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(1);
      expect(report.summary.reason?.code).toBe('internal.invariant');
      expect(report.summary.mutationStarted).toBe(false);
      expect(report.plan).toEqual([]);
      expect(result.state.after).toEqual(result.state.before);
      expect(result.stores.dcode.after).toEqual(result.stores.dcode.before);
    }
  });
});

test('shared preflight refuses contradictory or multiple same-native imported claims without dropping metadata', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('ambiguous-qualified', {
      'marketplace.json': '{"name":"personal","plugins":[{"name":"demo","source":"./demo"}]}',
      'demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
    });
    const dcode = harness.fakeNative('dcode', Array.from({ length: 48 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
    const env = { OPEN_PLUGIN_DCODE_BIN: dcode.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    expect(harness.run(['add', source, '--target', 'dcode', '--json'], { env }).exitCode).toBe(0);
    const ledger = join(harness.home, 'state.json');
    writeFileSync(ledger, JSON.stringify({ version: 1, installs: [
      { host: 'dcode', id: 'demo@personal', source, sourceSha: 'legacy', sourceDir: join(source, 'demo'), ownership: 'plgnz' },
    ] }));
    const imported = readLifecycleState(ledger).state;
    for (const variant of ['directory', 'foreign', 'multiple']) {
      const state = JSON.parse(JSON.stringify(imported));
      state.stateGeneration = 1;
      if (variant === 'directory') state.activations[0]!.sourceRelativeDir = 'other';
      else if (variant === 'foreign') state.activations[0]!.packageId = 'foreign';
      else state.activations.push({ ...state.activations[0]!, packageId: 'foreign' });
      writeFileSync(ledger, JSON.stringify(state));
      readLifecycleState(ledger);
      for (const argv of [['add', source], ['sync', source, '--plugin', 'demo']]) {
        const result = harness.run([...argv, '--target', 'dcode', '--json'], { env });
        const report = parseLifecycleReport(JSON.parse(result.stdout));
        expect(result.exitCode).toBe(1);
        expect(report.summary.reason?.code).toBe('internal.ambiguous-ownership');
        expect(report.summary.reason?.diagnostic).toBe("imported activation contradicts the exact Source/native binding for 'demo'");
        expect(report.plan).toEqual([]);
        expect(result.state.after).toEqual(result.state.before);
        expect(result.stores.dcode.after).toEqual(result.stores.dcode.before);
      }
    }
  });
});

test('v1 update refuses a renamed marketplace before any mutation', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('market', {
      'marketplace.json': '{"name":"original","plugins":[{"name":"demo","source":"./demo"}]}',
      'demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
    });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    const added = harness.run(['add', source, '--target', 'cursor', '--json'], { env });
    expect(added.exitCode).toBe(0);
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'cursor', id: 'demo@original', source, sourceSha: 'legacy', sourceDir: join(source, 'demo'), ownership: 'plgnz' },
    ] }));
    writeFileSync(join(source, 'marketplace.json'), '{"name":"renamed","plugins":[{"name":"demo","source":"./demo"}]}');
    const result = harness.run(['update', 'demo@original', '--target', 'cursor', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    expect(report.summary.mutationStarted).toBe(false);
    expect(report.plan).toEqual([]);
    expect(result.state.after).toEqual(result.state.before);
    expect(Object.values(result.stores).every(store => JSON.stringify(store.after) === JSON.stringify(store.before))).toBe(true);
  });
});

test('v1 dcode update reports authored agents as a typed capability gap', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('dcode', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const dcode = harness.fakeNative('dcode', Array.from({ length: 32 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
    const env = { OPEN_PLUGIN_DCODE_BIN: dcode.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    expect(harness.run(['add', source, '--target', 'dcode', '--json'], { env }).exitCode).toBe(0);
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'dcode', id: 'demo@local', source, sourceSha: 'legacy', sourceDir: source, ownership: 'plgnz' },
    ] }));
    mkdirSync(join(source, 'agents'));
    writeFileSync(join(source, 'agents/helper.md'), '---\nname: helper\ndescription: helper\n---\n\nAuthored agent.\n');
    const result = harness.run(['update', 'demo@local', '--target', 'dcode', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    const failure = report.outcomes[0]?.reason;
    expect({ category: failure?.category, code: failure?.code, capabilityId: failure?.capabilityId }).toEqual({ category: 'capability', code: 'capability.unverified', capabilityId: 'profile' });
    expect(report.outcomes[0]?.reason?.diagnostic).toBe("target 'dcode' has no verified native update profile for version '0.1.83' and local Sources");
    expect(report.summary.mutationStarted).toBe(false);
    expect(result.stores.dcode.after).toEqual(result.stores.dcode.before);
    expect(dcode.invocations().every(row => JSON.stringify(row.args) === '["--version"]')).toBe(true);
  });
});

test('v1 update reapplies a recorded pin in the sealed activation', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('pinned', {
      'plugin.json': '{"name":"demo","version":"1.0.0"}',
      'mcp.json': '{"mcpServers":{"demo":{"command":"node","args":[]}}}',
    });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    expect(harness.run(['add', source, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    expect(harness.run(['pin', '--target', 'cursor'], { env }).exitCode).toBe(0);
    const prior = readFileSync(join(harness.home, '.cursor/plugins/local/demo/mcp.json'), 'utf8');
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'cursor', id: 'demo', source, sourceSha: 'legacy', sourceDir: source, ownership: 'plgnz', pins: ['demo'] },
    ] }));
    writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"1.0.0","description":"changed"}');
    const result = harness.run(['update', 'demo', '--target', 'cursor', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(0);
    expect(report.outcomes[0]?.result).toBe('succeeded');
    const state = JSON.parse(bytesToText(result.state.after!));
    expect(state.version).toBe(2);
    expect(state.activations[0].pins).toEqual(['demo']);
    expect(state.attempts.some((attempt: any) => attempt.journal.some((row: any) => row.sealedOperation?.projectedFingerprint === state.activations[0].fingerprints.projected))).toBe(true);
    expect(readFileSync(join(harness.home, '.cursor/plugins/local/demo/mcp.json'), 'utf8')).toBe(prior);
    writeFileSync(join(source, 'mcp.json'), '{"mcpServers":{"demo":{"command":"missing-pin-executable-fixture","args":[]}}}');
    const refused = harness.run(['update', 'demo', '--target', 'cursor', '--json'], { env });
    expect(refused.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(refused.stdout)).summary.mutationStarted).toBe(false);
    expect(refused.stores.cursor.after).toEqual(refused.stores.cursor.before);
  });
});

for (const pending of [undefined, 'install'] as const) test(`v1 unproven ${pending ?? 'owned'} update refuses before any mutation`, async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const source = harness.source('legacy', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const cursor = harness.fakeNative('cursor', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    expect(harness.run(['add', source, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    writeFileSync(join(harness.home, '.cursor/plugins/local/demo/.plgnz-install.json'), JSON.stringify({ source, pluginId: 'demo', fingerprint: 'legacy' }));
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'cursor', id: 'demo', source, sourceSha: 'legacy', sourceDir: source, ownership: 'plgnz', ...(pending ? { pending } : {}) },
    ] }));
    const result = harness.run(['update', 'demo', '--target', 'cursor', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    expect(report.summary.terminalPhase).toBe('preflight');
    expect(report.summary.mutationStarted).toBe(false);
    expect(report.summary.failureCategory).toBe('internal');
    expect(result.state.after).toEqual(result.state.before);
    expect(Object.values(result.stores).every(store => JSON.stringify(store.after) === JSON.stringify(store.before))).toBe(true);
  });
});
