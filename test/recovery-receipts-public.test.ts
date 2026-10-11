import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';
import { parseLifecycleReport } from '../src/lifecycle-report';
import type { LifecycleStateV2 } from '../src/state';

test('successful recovery reports a real native change separately from unchanged current Desired', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('recovery-accounting', {
      'marketplace.json': JSON.stringify({ name: 'recovery-accounting', plugins: [{ name: 'demo', source: './plugins/demo' }, { name: 'sibling', source: './plugins/sibling' }] }),
      'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
      'plugins/sibling/plugin.json': '{"name":"sibling","version":"1.0.0"}',
    });
    const steps = () => Array.from({ length: 64 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' }));
    const native = harness.fakeNative('normal', steps());
    const env = { OPEN_PLUGIN_DCODE_BIN: native.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    const initial = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(initial.exitCode).toBe(0);
    const state: LifecycleStateV2 = JSON.parse(bytesToText(initial.state.after!));
    state.activations.find(row => row.packageId === 'demo')!.activationState = 'nonconforming';
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
    const commands = join(source, 'plugins/demo/commands');
    mkdirSync(commands);
    writeFileSync(join(commands, 'unsupported.md'), '---\ndescription: unsupported\n---\nunsupported\n');
    const fault = join(harness.home, '.deepagents/.state/.plgnz-dcode-readback-fault');
    const failing = harness.fakeNative('failing', steps().map((step, index) => index === 3 ? { ...step, writes: { [fault]: 'fault\n' } } : step));
    const failed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: failing.path } });
    const original = parseLifecycleReport(JSON.parse(failed.stdout)).outcomes.find(row => row.result === 'pending')!;
    expect(original.package).toBe('demo');
    rmSync(fault);
    rmSync(join(commands, 'unsupported.md'));
    rmSync(commands, { recursive: true });
    const enablementFile = join(harness.home, '.deepagents/.state/plugin_state.json');
    const candidate: { enabledPlugins: Record<string, boolean> } = JSON.parse(readFileSync(enablementFile, 'utf8'));
    // Exact sealed disabled candidate, not a foreign state or claimed SIGKILL proof.
    candidate.enabledPlugins['demo@recovery-accounting'] = false;
    writeFileSync(enablementFile, JSON.stringify(candidate, null, 2) + '\n');
    const inventory = JSON.parse(harness.run(['scopes', '--json']).stdout);
    const before = readFileSync(enablementFile, 'utf8');
    const resumed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(resumed.stdout));
    expect(resumed.exitCode).toBe(0);
    expect(readFileSync(enablementFile, 'utf8') === before).toBe(false);
    expect(report.outcomes.map(row => ({ package: row.package, action: row.action, changed: row.changed }))).toEqual([
      { package: 'demo', action: 'unchanged', changed: false }, { package: 'sibling', action: 'unchanged', changed: false },
    ]);
    expect(report.summary.changed).toBe(true);
    expect(report.summary.mutationStarted).toBe(true);
    expect(report.recovery!.receipts).toHaveLength(1);
    const receipt = report.recovery!.receipts[0]!;
    expect(receipt.original).toEqual(inventory.scopes[0].openJournals.operations[0]);
    expect(receipt.original.operationId).toBe(original.operationId);
    expect({ status: receipt.status, settlement: receipt.settlement, changed: receipt.changed, verified: receipt.readbackVerified })
      .toEqual({ status: 'completed', settlement: 'rollback', changed: true, verified: true });
  });
}, 30_000);
