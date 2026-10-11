import { expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';
import { parseLifecycleReport } from '../src/lifecycle-report';

test('a broken recovery ledger releases the native lock and retains recovery artifacts with a loud diagnostic', async () => {
  for (const readbackFault of [true, false]) {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('disable-broken-ledger', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const steps = () => Array.from({ length: 16 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' }));
    const initial = harness.fakeNative('initial', steps());
    const env = { OPEN_PLUGIN_DCODE_BIN: initial.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    const installed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const state = JSON.parse(bytesToText(installed.state.after!));
    state.activations[0].activationState = 'nonconforming';
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
    mkdirSync(join(source, 'commands'));
    writeFileSync(join(source, 'commands/unsupported.md'), '---\ndescription: command\n---\nunsupported command\n');
    const broken = harness.fakeNative('broken-ledger', steps().map((step, index) => index === 2 ? { ...step, writes: {
      [join(harness.home, 'state.json')]: '{broken ledger',
      ...(readbackFault ? { [join(harness.home, '.deepagents/.state/.plgnz-dcode-readback-fault')]: 'fault\n' } : {}),
    } } : step));
    const failed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: broken.path }, timeoutMs: 5_000 });
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toBe('');
    const report = parseLifecycleReport(JSON.parse(failed.stdout));
    expect(report.outcomes[0]!.reason!.code).toBe('recovery.required');
    expect(report.outcomes[0]!.reason!.diagnostic).toContain('recovery ledger');
    expect(bytesToText(failed.state.after!)).toBe('{broken ledger');
    expect(Object.keys(failed.stores.dcode.after.files).some(path => path.includes('/rollback/state.json'))).toBe(true);
  });
  }
}, 20_000);

test('unsupported desired functionality disables a proven nonconforming dcode activation without delivering or deleting it', async () => {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('disable', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n', 'payload.txt': 'retained bytes\n' });
    const binary = harness.fakeNative('dcode', Array.from({ length: 24 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
    const env = { OPEN_PLUGIN_DCODE_BIN: binary.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    const installed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const state = JSON.parse(bytesToText(installed.state.after!));
    state.activations[0].activationState = 'nonconforming';
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
    mkdirSync(join(source, 'commands'));
    writeFileSync(join(source, 'commands/unsupported.md'), '---\ndescription: command\n---\nunsupported command\n');
    const preview = harness.run(['sync', source, '--target', 'dcode', '--dry-run', '--json'], { env });
    const expectedReason = parseLifecycleReport(JSON.parse(preview.stdout)).outcomes[0]!.reason;
    expect(parseLifecycleReport(JSON.parse(preview.stdout)).plan[0]!.action).toBe('disable-nonconforming');
    const disabled = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(disabled.stderr).toBe('');
    const report = parseLifecycleReport(JSON.parse(disabled.stdout));
    expect(disabled.exitCode).toBe(1);
    expect(report.outcomes[0]).toEqual({ ...report.plan[0]!, result: 'failed', resourceState: 'retained', activationState: 'inactive', changed: true, reason: expectedReason });
    expect(report.summary.mutationStarted).toBe(true);
    expect(Object.entries(disabled.stores.dcode.after.files).some(([path, bytes]) => path.endsWith('/payload.txt') && bytesToText(bytes) === 'retained bytes\n')).toBe(true);
    const flags = JSON.parse(bytesToText(disabled.stores.dcode.after.files['.state/plugin_state.json']!));
    expect(flags.enabledPlugins['demo@local']).toBe(false);
    const after = JSON.parse(bytesToText(disabled.state.after!));
    expect(after.activations[0].activationState).toBe('inactive');
    expect(after.scopes[0].lastConverged).toEqual(state.scopes[0].lastConverged);
  });
}, 20_000);

test('disable readback failure restores enablement and durably blocks until rollback verification is recovered', async () => {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('disable-recovery', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n', 'payload.txt': 'retained bytes\n' });
    const steps = () => Array.from({ length: 16 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' }));
    const binary = harness.fakeNative('initial', steps());
    const env = { OPEN_PLUGIN_DCODE_BIN: binary.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    const installed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const state = JSON.parse(bytesToText(installed.state.after!));
    state.activations[0].activationState = 'nonconforming';
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
    mkdirSync(join(source, 'commands'));
    writeFileSync(join(source, 'commands/unsupported.md'), '---\ndescription: command\n---\nunsupported command\n');
    const fault = join(harness.home, '.deepagents/.state/.plgnz-dcode-readback-fault');
    const failedSteps = steps().map((step, index) => index === 2 ? { ...step, writes: { [fault]: 'fault\n' } } : step);
    const failing = harness.fakeNative('failing', failedSteps);
    const failed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: failing.path } });
    expect(failed.stderr).toBe('');
    const report = parseLifecycleReport(JSON.parse(failed.stdout));
    expect(report.outcomes[0]!.result).toBe('pending');
    expect(report.outcomes[0]!.reason!.code).toBe('recovery.required');
    const pending = JSON.parse(bytesToText(failed.state.after!));
    expect(pending.activations[0].pending.operation).toBe('disable-nonconforming');
    expect(pending.activations[0].pending.phase).toBe('rollback');
    const journal = pending.attempts.find((attempt: { id: string }) => attempt.id === pending.activations[0].pending.attemptId).journal[0];
    expect({ schemaVersion: journal.sealedOperation.schemaVersion, adapterId: journal.sealedOperation.adapterId, scopeId: journal.sealedOperation.scopeId, operationId: journal.sealedOperation.operationId, nativeId: journal.sealedOperation.nativeId, action: journal.sealedOperation.action }).toEqual({ schemaVersion: 1, adapterId: 'dcode', scopeId: journal.scopeId, operationId: journal.operationId, nativeId: 'demo@local', action: 'disable-nonconforming' });
    expect(JSON.parse(bytesToText(failed.stores.dcode.after.files['.state/plugin_state.json']!)).enabledPlugins['demo@local']).toBe(true);
    rmSync(fault);
    const retry = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(retry.exitCode).toBe(1);
    const retried = parseLifecycleReport(JSON.parse(retry.stdout));
    expect(retried.outcomes[0]!.reason!.category).toBe('capability');
    expect(retried.outcomes[0]!.activationState).toBe('inactive');
    expect(JSON.parse(bytesToText(retry.state.after!)).activations[0].pending).toBeUndefined();
  });
}, 20_000);

test('disable precondition refusal preserves external enablement without a false rollback or pending intent', async () => {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('disable-precondition', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const steps = () => Array.from({ length: 16 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' }));
    const binary = harness.fakeNative('initial', steps());
    const env = { OPEN_PLUGIN_DCODE_BIN: binary.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    const installed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const state = JSON.parse(bytesToText(installed.state.after!));
    state.activations[0].activationState = 'nonconforming';
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
    mkdirSync(join(source, 'commands'));
    writeFileSync(join(source, 'commands/unsupported.md'), '---\ndescription: command\n---\nunsupported command\n');
    const flags = '{"version":1,"enabledPlugins":{"demo@local":false}}';
    const concurrent = harness.fakeNative('concurrent', steps().map((step, index) => index === 2
      ? { ...step, writes: { [join(harness.home, '.deepagents/.state/plugin_state.json')]: flags } } : step));
    const refused = harness.run(['sync', source, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: concurrent.path } });
    const report = parseLifecycleReport(JSON.parse(refused.stdout));
    expect(refused.exitCode).toBe(1);
    expect(report.summary.mutationStarted).toBe(false);
    expect(report.outcomes[0]!.reason!.code).toBe('runtime.operation-failed');
    expect(bytesToText(refused.stores.dcode.after.files['.state/plugin_state.json']!)).toBe(flags);
    expect(JSON.parse(bytesToText(refused.state.after!)).activations[0].pending).toBeUndefined();
  });
}, 20_000);
