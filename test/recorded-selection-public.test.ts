import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { kimiNativeEnv } from './kimi-fixture';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';

test('qualified imported Cursor selection refuses another Source claim for its canonical native identity', async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.cursor/.keep': '' });
    const root = h.source('root', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const market = h.source('market', { 'marketplace.json': '{"name":"personal","plugins":[{"name":"demo","source":"./demo"}]}', 'demo/plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const cursor = h.fakeNative('cursor', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    expect(h.run(['add', market, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    writeFileSync(join(h.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'cursor', id: 'demo', source: root, sourceSha: 'legacy', ownership: 'plgnz' },
      { host: 'cursor', id: 'demo@personal', source: market, sourceSha: 'legacy', ownership: 'plgnz', sourceDir: join(market, 'demo') },
    ] }));
    const result = h.run(['update', 'demo@personal', '--target', 'cursor', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    expect(report.summary.reason?.code).toBe('internal.ambiguous-ownership');
    expect(report.plan).toEqual([]);
    expect(result.state.after).toEqual(result.state.before);
    expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
  });
});

test('modern Cursor marker with qualified v1 ledger preserves pins and history through canonical update', async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.cursor/.keep': '' });
    const source = h.source('modern-cursor', {
      'marketplace.json': '{"name":"personal","plugins":[{"name":"demo","source":"./demo"}]}',
      'demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
      'demo/mcp.json': '{"mcpServers":{"demo":{"command":"node","args":[]}}}',
    });
    const cursor = h.fakeNative('cursor', Array.from({ length: 32 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const env = { OPEN_PLUGIN_CURSOR_BIN: cursor.path };
    expect(h.run(['add', source, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    expect(h.run(['pin', '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    const nativeMcp = join(h.home, '.cursor/plugins/local/demo/mcp.json');
    const pinnedBytes = readFileSync(nativeMcp, 'utf8');
    expect(JSON.parse(pinnedBytes).mcpServers.demo.command.startsWith('/')).toBe(true);
    writeFileSync(join(h.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'cursor', id: 'demo@personal', source, sourceSha: 'legacy', sourceDir: join(source, 'demo'), ownership: 'plgnz', pins: ['demo'], installedAt: '2020-01-02T03:04:05.000Z' },
    ] }));
    writeFileSync(join(source, 'demo/plugin.json'), '{"name":"demo","version":"1.0.0","description":"canonical update"}');
    const updated = h.run(['update', 'demo', '--target', 'cursor', '--json'], { env });
    expect(updated.exitCode).toBe(0);
    expect(readFileSync(nativeMcp, 'utf8')).toBe(pinnedBytes);
    const state = JSON.parse(bytesToText(updated.state.after!));
    expect(state.activations.map((row: { nativeId: string }) => row.nativeId)).toEqual(['demo']);
    expect(state.activations[0].pins).toEqual(['demo']);
    expect(state.activations[0].activatedAt).toBe('2020-01-02T03:04:05.000Z');
    expect(h.run(['update', 'demo', '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    const removed = h.run(['remove', 'demo', '--target', 'cursor', '--json'], { env });
    expect(removed.exitCode).toBe(0);
    const retired = JSON.parse(bytesToText(removed.state.after!));
    expect(retired.tombstones[0].pins).toEqual(['demo']);
    expect(retired.tombstones[0].activatedAt).toBe('2020-01-02T03:04:05.000Z');
    expect(state.attempts.every((attempt: unknown) => retired.attempts.some((kept: unknown) => JSON.stringify(kept) === JSON.stringify(attempt)))).toBe(true);
  });
});

test('public Kimi qualified update preserves distinct recorded identities under its evidenced unsupported update profile', async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.kimi-code/.keep': '' });
    const root = h.source('root', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const market = h.source('market', { 'marketplace.json': '{"name":"personal","plugins":[{"name":"demo","source":"./demo"}]}', 'demo/plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const env = kimiNativeEnv(h.home);
    // The real-bin harness deliberately excludes ambient Bun from PATH.
    writeFileSync(env.OPEN_PLUGIN_KIMI_BIN!, readFileSync(env.OPEN_PLUGIN_KIMI_BIN!, 'utf8').replace('#!/usr/bin/env bun', `#!${process.execPath}`));
    const addedMarket = h.run(['add', market, '--target', 'kimi', '--json'], { env });
    if (addedMarket.exitCode !== 0) throw new Error(addedMarket.stdout + addedMarket.stderr);
    expect(addedMarket.exitCode).toBe(0);
    writeFileSync(join(h.home, 'state.json'), JSON.stringify({ version: 1, installs: [
      { host: 'kimi', id: 'demo', source: root, sourceSha: 'legacy', ownership: 'plgnz' },
      { host: 'kimi', id: 'demo@personal', source: market, sourceSha: 'legacy', ownership: 'plgnz', sourceDir: join(market, 'demo') },
    ] }));
    writeFileSync(join(root, 'plugin.json'), '{"name":"demo","version":"1.0.0","description":"root update"}');
    writeFileSync(join(market, 'demo/plugin.json'), '{"name":"demo","version":"1.0.0","description":"market update"}');
    const result = h.run(['update', 'demo@personal', '--target', 'kimi', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    expect(report.outcomes[0]!.reason?.code).toBe('capability.unsupported');
    expect(report.outcomes[0]!.reason?.diagnostic).toBe("target 'kimi' 2.0.1 native update is unsupported");
    expect(result.state.after).toEqual(result.state.before);
    expect(result.stores.kimi.after).toEqual(result.stores.kimi.before);
    expect(report.outcomes.map(row => row.nativeId)).toEqual(['demo@personal']);
    const state = JSON.parse(bytesToText(result.state.after!));
    expect(state.installs.map((row: { id: string }) => row.id).sort()).toEqual(['demo', 'demo@personal']);
    expect(Object.values(result.stores.kimi.after.files).some(bytes => bytesToText(bytes).includes('root update'))).toBe(false);
    expect(Object.values(result.stores.kimi.after.files).some(bytes => bytesToText(bytes).includes('market update'))).toBe(false);
  });
});

test('public all-record update preserves two Sources with distinct dcode native identities', async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.deepagents/.keep': '' });
    const root = h.source('root', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const market = h.source('market', { 'marketplace.json': '{"name":"personal","plugins":[{"name":"demo","source":"./demo"}]}', 'demo/plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const dcode = h.fakeNative('dcode', Array.from({ length: 48 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
    const env = { OPEN_PLUGIN_DCODE_BIN: dcode.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(h.root) };
    expect(h.run(['add', root, '--target', 'dcode', '--json'], { env }).exitCode).toBe(0);
    expect(h.run(['add', market, '--target', 'dcode', '--json'], { env }).exitCode).toBe(0);
    writeFileSync(join(root, 'plugin.json'), '{"name":"demo","version":"1.0.0","description":"root update"}');
    writeFileSync(join(market, 'demo/plugin.json'), '{"name":"demo","version":"1.0.0","description":"market update"}');
    const result = h.run(['update', '--target', 'dcode', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(0);
    expect(report.outcomes.map(row => row.nativeId).sort()).toEqual(['demo@local', 'demo@personal']);
    const state = JSON.parse(bytesToText(result.state.after!));
    expect(state.activations.map((row: { nativeId: string }) => row.nativeId).sort()).toEqual(['demo@local', 'demo@personal']);
    expect(Object.values(result.stores.dcode.after.files).some(bytes => bytesToText(bytes).includes('root update'))).toBe(true);
    expect(Object.values(result.stores.dcode.after.files).some(bytes => bytesToText(bytes).includes('market update'))).toBe(true);
  });
});

for (const observed of [{ stdout: 'not a native version\n', label: 'unknown/unparseable' }, { stdout: 'deepagents-code 0.1.84\n', label: '0.1.84' }]) {
  test(`public imported dcode agent update refuses the ${observed.label} version profile without Native writes`, async () => {
    await withLifecycleCliHarness(h => {
      h.writeHome({ '.deepagents/.keep': '' });
      const source = h.source('version-profile', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
      const known = h.fakeNative('dcode-known', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
      const python = fakeDcodeLockInterpreter(h.root);
      expect(h.run(['add', source, '--target', 'dcode', '--json'], { env: { OPEN_PLUGIN_DCODE_BIN: known.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: python } }).exitCode).toBe(0);
      writeFileSync(join(h.home, 'state.json'), JSON.stringify({ version: 1, installs: [
        { host: 'dcode', id: 'demo@local', source, sourceSha: 'legacy', sourceDir: source, ownership: 'plgnz' },
      ] }));
      mkdirSync(join(source, 'agents'));
      writeFileSync(join(source, 'agents/helper.md'), '---\nname: helper\ndescription: helper\n---\n\nAuthored agent.\n');
      const unknown = h.fakeNative('dcode-profile', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: observed.stdout })));
      const result = h.run(['update', 'demo@local', '--target', 'dcode', '--json'], { env: { OPEN_PLUGIN_DCODE_BIN: unknown.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: python } });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(1);
      expect(report.outcomes[0]!.reason?.code).toBe('capability.unverified');
      expect(report.outcomes[0]!.reason?.diagnostic).toBe(`target 'dcode' has no verified native update profile for version '${observed.label}' and local Sources`);
      expect(report.summary.mutationStarted).toBe(false);
      expect(result.stores.dcode.after).toEqual(result.stores.dcode.before);
      expect(unknown.invocations().every(row => JSON.stringify(row.args) === '["--version"]')).toBe(true);
    });
  });
}
