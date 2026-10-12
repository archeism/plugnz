import { expect, test } from 'bun:test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readState } from '../src/state';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { adoptionDigest } from '../src/legacy-adoption-proof';
import { parseAdoptionAdmission } from '../src/legacy-adoption-record';
import { createDeploymentScopeIdentity } from '../src/deployment-scope';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';

test('Cursor composes exact legacy admission through the public preview but hard-blocks before its unfinished mutation fence', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const launcher = join(harness.source('runtime', { cursor: '#!/bin/sh\nprintf "2.4.0\\n"\n' }), 'cursor');
    chmodSync(launcher, 0o755);
    const source = harness.source('catalog', {
      '.claude-plugin/marketplace.json': JSON.stringify({ name: 'personal', plugins: [{ source: './plugins/demo' }] }),
      'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      'plugins/demo/resources/probe.txt': 'authored bytes\n',
    });
    const env = { OPEN_PLUGIN_CURSOR_BIN: launcher };
    const installed = harness.run(['add', source, '--target', 'cursor', '--plugin', 'demo', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const row = readState(join(harness.home, 'state.json'))[0]!;
    writeFileSync(join(harness.storePath('cursor'), 'plugins/local/demo/.plgnz-install.json'),
      JSON.stringify({ source, pluginId: 'demo@personal', fingerprint: row.fingerprint }));
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [{ ...row, id: 'demo@personal', pending: 'install' }] }));
    const inventory = JSON.parse(harness.run(['scopes', '--target', 'cursor', '--json']).stdout);
    const original = inventory.scopes[0].adoptionHistory.legacyRecords[0];
    const args = ['sync', source, '--target', 'cursor', '--plugin', 'demo', '--adopt-existing', '--json'];
    const previewResult = harness.run([...args, '--dry-run'], { env });
    if (previewResult.stdout.trim() === '') throw new Error(`preview emitted no report: ${previewResult.stderr}`);
    const preview = JSON.parse(previewResult.stdout);
    expect(preview.plan[0]?.adoption?.original).toEqual(original.original);
    expect(preview.plan[0].adoption.legacyRecordDigest).toBe(original.recordDigest);
    expect(preview.plan[0].adoption.native.oldLedgerNativeId).toBe('demo@personal');
    expect(preview.plan[0].adoption.native.oldPhysicalNativeId).toBe('demo');
    expect(preview.plan[0].adoption.native.newNativeId).toBe('demo');
    expect(preview.plan[0].adoption.fresh.operationId).toBe(preview.plan[0].operationId);
    expect(preview.plan[0].adoption.fresh.nativeId).toBe(preview.plan[0].nativeId);
    expect(parseLifecycleReport(preview).summary.reason?.code).toBe('internal.invariant');
    expect(preview.summary.reason.diagnostic).toContain('mutation fence');
    expect(previewResult.exitCode).toBe(1);
    expect(preview.summary.mutationStarted).toBe(false);
    expect(preview.summary.changed).toBe(false);
    expect(previewResult.state.after).toEqual(previewResult.state.before);
    expect(previewResult.stores.cursor.after).toEqual(previewResult.stores.cursor.before);
    const falseDelivery = JSON.parse(JSON.stringify(preview));
    falseDelivery.outcomes[0].result = 'succeeded';
    falseDelivery.outcomes[0].reason = null;
    expect(reportRefusal(falseDelivery)).toContain('cannot claim delivered adoption');
    const mismatched = JSON.parse(JSON.stringify(preview));
    mismatched.outcomes[0].adoption.fresh.operationId = 'foreign-operation';
    expect(reportRefusal(mismatched)).toContain('admission');
    const falseProjection = JSON.parse(JSON.stringify(preview));
    for (const operation of [falseProjection.plan[0], falseProjection.outcomes[0]]) {
      operation.adoption.projectedFingerprint = `sha256:${'b'.repeat(64)}`;
      const { admissionId: _id, ...payload } = operation.adoption;
      operation.adoption.admissionId = adoptionDigest('plugnz/legacy-admission/v1', payload);
    }
    expect(reportRefusal(falseProjection)).toContain('projected');
    expect(parseAdoptionAdmission(preview.plan[0].adoption).native.adapterId).toBe('cursor');
    for (const kind of ['dcode', 'codex']) {
      const wrongHost = JSON.parse(JSON.stringify(preview));
      for (const operation of [wrongHost.plan[0], wrongHost.outcomes[0]]) {
        const admission = operation.adoption;
        const target = { kind, instance: 'default' };
        const scope = createDeploymentScopeIdentity(admission.original.scope.source, target);
        operation.scope = scope;
        admission.target = target;
        admission.original.scope = scope;
        admission.fresh.scopeId = scope.id;
        const { admissionId: _id, ...payload } = admission;
        admission.admissionId = adoptionDigest('plugnz/legacy-admission/v1', payload);
      }
      expect([admissionRefusal(wrongHost.plan[0].adoption), reportRefusal(wrongHost)]
        .map(reason => reason.includes('adapter'))).toEqual([true, true]);
    }
    const applied = harness.run(args, { env });
    const report = parseLifecycleReport(JSON.parse(applied.stdout));
    expect(applied.exitCode).toBe(1);
    expect(report.summary.reason?.diagnostic).toContain('mutation fence');
    expect(report.summary.mutationStarted).toBe(false);
    expect(applied.state.after).toEqual(applied.state.before);
    expect(applied.stores.cursor.after).toEqual(applied.stores.cursor.before);
    expect(readFileSync(join(harness.home, 'state.json'), 'utf8')).toContain('"version":1');
  });
}, 20_000);

test('Cursor ignores an unrelated original pin before resolving the selected package MCP commands', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const launcher = join(harness.source('runtime', { cursor: '#!/bin/sh\nprintf "2.4.0\\n"\n' }), 'cursor');
    chmodSync(launcher, 0o755);
    const env = { OPEN_PLUGIN_CURSOR_BIN: launcher };
    const source = harness.source('catalog', {
      '.claude-plugin/marketplace.json': JSON.stringify({ name: 'personal', plugins: [
        { source: './plugins/other' }, { source: './plugins/demo' },
      ] }),
      'plugins/other/plugin.json': '{"name":"other","version":"1.0.0"}\n',
      'plugins/other/.mcp.json': '{"mcpServers":{"server":{"command":"true","args":[]}}}\n',
      'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      'plugins/demo/.mcp.json': '{"mcpServers":{"server":{"command":"plugnz-fixture-missing-executable","args":[]}}}\n',
    });
    expect(harness.run(['add', source, '--target', 'cursor', '--plugin', 'other', '--json'], { env }).exitCode).toBe(0);
    expect(harness.run(['pin', '--target', 'cursor', '--json']).exitCode).toBe(0);
    expect(harness.run(['add', source, '--target', 'cursor', '--plugin', 'demo', '--json'], { env }).exitCode).toBe(0);
    const rows = readState(join(harness.home, 'state.json'));
    expect(rows.find(row => row.id === 'other')?.pins).toEqual(['server']);
    for (const row of rows) {
      writeFileSync(join(harness.storePath('cursor'), `plugins/local/${row.id}/.plgnz-install.json`),
        JSON.stringify({ source, pluginId: `${row.id}@personal`, fingerprint: row.fingerprint }));
    }
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: rows.map(row => ({
      ...row, id: `${row.id}@personal`, pending: 'install',
    })) }));
    for (const dryRun of [true, false]) {
      const result = harness.run(['sync', source, '--target', 'cursor', '--plugin', 'demo', '--adopt-existing',
        ...(dryRun ? ['--dry-run'] : []), '--json'], { env });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(report.plan[0]?.adoption?.original.nativeId).toBe('demo@personal');
      expect(report.plan[0]?.adoption?.native.pins).toEqual([]);
      expect(report.summary.reason?.diagnostic).toContain('mutation fence');
      expect(result.exitCode).toBe(1);
      expect(result.state.after).toEqual(result.state.before);
      expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
    }
    writeFileSync(join(source, 'plugins/other/.mcp.json'),
      '{"mcpServers":{"server":{"command":"plugnz-fixture-missing-executable","args":[]}}}\n');
    const selectedPin = harness.run(['sync', source, '--target', 'cursor', '--plugin', 'other', '--adopt-existing', '--json'], { env });
    const selectedReport = parseLifecycleReport(JSON.parse(selectedPin.stdout));
    expect(selectedPin.exitCode).toBe(1);
    expect(selectedReport.summary.reason?.code).toBe('runtime.operation-failed');
    expect(selectedReport.summary.reason?.diagnostic).toContain('does not resolve');
    expect(selectedPin.state.after).toEqual(selectedPin.state.before);
    expect(selectedPin.stores.cursor.after).toEqual(selectedPin.stores.cursor.before);
  });
}, 20_000);

function reportRefusal(value: unknown): string {
  try { parseLifecycleReport(value); return 'accepted'; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
}

function admissionRefusal(value: unknown): string {
  try { parseAdoptionAdmission(value); return 'accepted'; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
}

test('a bad last legacy admission refuses the complete batch before an earlier proven admission writes', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const launcher = join(harness.source('runtime', { cursor: '#!/bin/sh\nprintf "2.4.0\\n"\n' }), 'cursor');
    chmodSync(launcher, 0o755);
    const env = { OPEN_PLUGIN_CURSOR_BIN: launcher };
    const sources = ['alpha', 'demo'].map(name => ({ name, source: harness.source(`${name}-catalog`, {
      '.claude-plugin/marketplace.json': JSON.stringify({ name: 'personal', plugins: [{ source: `./plugins/${name}` }] }),
      [`plugins/${name}/plugin.json`]: JSON.stringify({ name, version: '1.0.0' }),
      [`plugins/${name}/resources/probe.txt`]: `${name} authored bytes\n`,
    }) }));
    for (const { name, source } of sources) expect(harness.run(['add', source, '--target', 'cursor', '--plugin', name, '--json'], { env }).exitCode).toBe(0);
    const rows = readState(join(harness.home, 'state.json'));
    for (const { name, source } of sources) {
      const row = rows.find(row => row.id === name)!;
      writeFileSync(join(harness.storePath('cursor'), `plugins/local/${name}/.plgnz-install.json`),
        JSON.stringify({ source, pluginId: `${name}@personal`, fingerprint: row.fingerprint }));
    }
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: sources.map(({ name }) => ({
      ...rows.find(row => row.id === name)!, id: `${name}@personal`, pending: 'install',
    })) }));
    const manifest = join(harness.source('batch', {}), 'manifest.json');
    const entries = sources.map(({ name, source }) => ({ operation: 'sync', source: { kind: 'local', locator: source },
      target: { kind: 'cursor', instance: 'default' }, selectors: [{ package: name, adoptExisting: true }] }));
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries }));
    const previewResult = harness.run(['sync', '--manifest', manifest, '--dry-run', '--json'], { env });
    const preview = parseLifecycleReport(JSON.parse(previewResult.stdout));
    expect(preview.plan.length).toBe(2);
    expect(preview.plan.every(operation => operation.adoption !== undefined)).toBe(true);
    const expectedEntries = entries.map((entry, index) => ({ ...entry, selectors: [{ ...entry.selectors[0],
      expectedAdoption: { schemaVersion: 1, admissionId: preview.plan[index]!.adoption!.admissionId },
    }] }));
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: expectedEntries }));
    const valid = harness.run(['sync', '--manifest', manifest, '--json'], { env });
    const validReport = parseLifecycleReport(JSON.parse(valid.stdout));
    expect(validReport.plan.map(row => row.adoption?.admissionId)).toEqual(preview.plan.map(row => row.adoption?.admissionId));
    expect(validReport.summary.reason?.diagnostic).toContain('mutation fence');
    expect(valid.state.after).toEqual(valid.state.before);
    expect(valid.stores.cursor.after).toEqual(valid.stores.cursor.before);
    const last = expectedEntries[1]!;
    const stale = { ...last, selectors: [{ ...last.selectors[0], expectedAdoption: { schemaVersion: 1, admissionId: `sha256:${'f'.repeat(64)}` } }] };
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [expectedEntries[0], stale] }));
    for (const dryRun of [true, false]) {
      const result = harness.run(['sync', '--manifest', manifest, ...(dryRun ? ['--dry-run'] : []), '--json'], { env });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(1);
      expect(report.summary.reason?.diagnostic).toContain('expected adoption admission changed');
      expect(report.summary.mutationStarted).toBe(false);
      expect(report.summary.changed).toBe(false);
      expect(result.state.after).toEqual(result.state.before);
      expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
    }
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: expectedEntries }));
    writeFileSync(join(harness.storePath('cursor'), 'plugins/local/demo/resources/probe.txt'), 'foreign last bytes\n');
    const foreign = harness.run(['sync', '--manifest', manifest, '--json'], { env });
    expect(parseLifecycleReport(JSON.parse(foreign.stdout)).summary.reason?.diagnostic).toContain('native payload');
    expect(foreign.exitCode).toBe(1);
    expect(foreign.state.after).toEqual(foreign.state.before);
    expect(foreign.stores.cursor.after).toEqual(foreign.stores.cursor.before);
  });
}, 20_000);

test('a bare Cursor original resolves its recorded pins without dropping or rewriting legacy history', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const launcher = join(harness.source('runtime', { cursor: '#!/bin/sh\nprintf "2.4.0\\n"\n' }), 'cursor');
    chmodSync(launcher, 0o755);
    const env = { OPEN_PLUGIN_CURSOR_BIN: launcher };
    const source = harness.source('demo', {
      'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      '.mcp.json': '{"mcpServers":{"server":{"command":"true","args":[]}}}\n',
    });
    expect(harness.run(['add', source, '--target', 'cursor', '--json'], { env }).exitCode).toBe(0);
    expect(harness.run(['pin', '--target', 'cursor', '--json']).exitCode).toBe(0);
    const row = readState(join(harness.home, 'state.json'))[0]!;
    writeFileSync(join(harness.storePath('cursor'), 'plugins/local/demo/.plgnz-install.json'),
      JSON.stringify({ source, pluginId: 'demo', fingerprint: row.fingerprint }));
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [{ ...row, id: 'demo', pending: 'install' }] }));
    const args = ['sync', source, '--target', 'cursor', '--plugin', 'demo', '--adopt-existing', '--json'];
    const preview = harness.run([...args, '--dry-run'], { env });
    const report = parseLifecycleReport(JSON.parse(preview.stdout));
    if (report.plan[0]?.adoption === undefined) throw new Error(`bare pin admission refused: ${JSON.stringify(report.summary.reason)}`);
    expect(report.plan[0]?.adoption?.original.nativeId).toBe('demo');
    expect(report.plan[0]?.adoption?.native.pins).toEqual(['server']);
    expect(preview.state.after).toEqual(preview.state.before);
    expect(preview.stores.cursor.after).toEqual(preview.stores.cursor.before);
    writeFileSync(join(source, '.mcp.json'), '{"mcpServers":{}}\n');
    const removed = harness.run(args, { env });
    expect(parseLifecycleReport(JSON.parse(removed.stdout)).summary.reason?.diagnostic).toContain('resolved pins');
    expect(removed.exitCode).toBe(1);
    expect(removed.state.after).toEqual(removed.state.before);
    expect(removed.stores.cursor.after).toEqual(removed.stores.cursor.before);
  });
}, 20_000);
