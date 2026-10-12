import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { kimiNativeEnv } from './kimi-fixture';

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

test('public Kimi all-record update preserves two Sources with distinct native identities', async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.kimi-code/.keep': '' });
    const root = h.source('root', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const market = h.source('market', { 'marketplace.json': '{"name":"personal","plugins":[{"name":"demo","source":"./demo"}]}', 'demo/plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const env = kimiNativeEnv(h.home);
    // The real-bin harness deliberately excludes ambient Bun from PATH.
    writeFileSync(env.OPEN_PLUGIN_KIMI_BIN!, readFileSync(env.OPEN_PLUGIN_KIMI_BIN!, 'utf8').replace('#!/usr/bin/env bun', `#!${process.execPath}`));
    const addedRoot = h.run(['add', root, '--target', 'kimi', '--json'], { env });
    if (addedRoot.exitCode !== 0) throw new Error(addedRoot.stdout + addedRoot.stderr);
    expect(addedRoot.exitCode).toBe(0);
    const addedMarket = h.run(['add', market, '--target', 'kimi', '--json'], { env });
    if (addedMarket.exitCode !== 0) throw new Error(addedMarket.stdout + addedMarket.stderr);
    expect(addedMarket.exitCode).toBe(0);
    writeFileSync(join(root, 'plugin.json'), '{"name":"demo","version":"1.0.0","description":"root update"}');
    writeFileSync(join(market, 'demo/plugin.json'), '{"name":"demo","version":"1.0.0","description":"market update"}');
    const result = h.run(['update', '--target', 'kimi', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(0);
    expect(report.outcomes.map(row => row.nativeId).sort()).toEqual(['demo', 'demo@personal']);
    const state = JSON.parse(bytesToText(result.state.after!));
    expect(state.activations.map((row: { nativeId: string }) => row.nativeId).sort()).toEqual(['demo', 'demo@personal']);
    expect(Object.values(result.stores.kimi.after.files).some(bytes => bytesToText(bytes).includes('root update'))).toBe(true);
    expect(Object.values(result.stores.kimi.after.files).some(bytes => bytesToText(bytes).includes('market update'))).toBe(true);
  });
});
