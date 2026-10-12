import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';
import { parseLifecycleReport } from '../src/lifecycle-report';
import type { LifecycleStateV2 } from '../src/state';

for (const intent of ['unchanged', 'retirement'] as const) test(`successful recovery preserves historical change and current ${intent} intent`, async () => {
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
    const retirementManifest = join(harness.root, 'retire-current.json');
    if (intent === 'retirement') {
      const sibling = harness.source('other-current', { 'plugin.json': '{"name":"other","version":"1.0.0"}' });
      writeFileSync(retirementManifest, JSON.stringify({ schemaVersion: 1, entries: [
        { operation: 'retire-source', scopeId: state.scopes[0]!.id, target: { kind: 'dcode', instance: 'default' } },
        { operation: 'sync', source: { kind: 'local', locator: sibling }, target: { kind: 'dcode', instance: 'default' } },
      ] }));
      rmSync(source, { recursive: true });
    }
    const resumed = harness.run(intent === 'unchanged' ? ['sync', source, '--target', 'dcode', '--json'] : ['sync', '--manifest', retirementManifest, '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(resumed.stdout));
    expect(resumed.exitCode).toBe(0);
    expect(readFileSync(enablementFile, 'utf8') === before).toBe(false);
    if (intent === 'unchanged') {
      expect(report.outcomes.map(row => ({ package: row.package, action: row.action, changed: row.changed }))).toEqual([
        { package: 'demo', action: 'unchanged', changed: false }, { package: 'sibling', action: 'unchanged', changed: false },
      ]);
    } else {
      expect(report.outcomes.filter(row => row.coverage === 'retirement').map(row => ({ package: row.package, action: row.action, result: row.result }))).toEqual([
        { package: 'demo', action: 'retire-orphan', result: 'succeeded' }, { package: 'sibling', action: 'retire-orphan', result: 'succeeded' },
      ]);
      expect(report.outcomes.filter(row => row.coverage === 'desired-pair').map(row => row.package)).toEqual(['other']);
      expect(report.plan).toHaveLength(3);
    }
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

test('failed release after artifact disposal remains discoverable and retries without repeating native apply', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('release-after-disposal', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
    const operations = join(harness.home, '.deepagents/plugins/cache/plgnz-operations');
    const counter = join(harness.root, 'cleanup-counter');
    const denied = join(harness.root, 'deny-cleanup');
    writeFileSync(denied, `#!/bin/sh\nn=0\nif [ -f '${counter}' ]; then n=$(cat '${counter}'); fi\nn=$((n+1))\nprintf '%s' "$n" > '${counter}'\nif [ "$n" -eq 3 ]; then chmod a-w '${operations}'; fi\nprintf 'deepagents-code 0.1.83\\n'\n`);
    chmodSync(denied, 0o755);
    const interpreter = fakeDcodeLockInterpreter(harness.root);
    const env = { OPEN_PLUGIN_DCODE_BIN: denied, OPEN_PLUGIN_DCODE_PYTHON_BIN: interpreter };
    try {
      const initial = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
      expect(initial.exitCode).toBe(1);
      const before: LifecycleStateV2 = JSON.parse(bytesToText(initial.state.after!));
      const originalAttempt = before.attempts.at(-1)!;
      const originalJournal = originalAttempt.journal[0]!;
      expect(originalJournal.state).toBe('cleanup-pending');
      const rollback = originalJournal.sealedOperation!.rollbackReference;
      chmodSync(operations, 0o755);
      const failOnce = join(harness.root, 'release-fail-once');
      writeFileSync(failOnce, 'fail next lock release');
      const wrapper = join(harness.root, 'release-failing-python');
      writeFileSync(wrapper, `#!/bin/sh\n'${interpreter}' "$@"\ncode=$?\ncase "$2" in *'sys.stdin.read()'*) if [ -f '${failOnce}' ]; then rm '${failOnce}'; exit 1; fi;; esac\nexit "$code"\n`);
      chmodSync(wrapper, 0o755);
      const native = harness.fakeNative('normal', Array.from({ length: 32 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
      const retryEnv = { OPEN_PLUGIN_DCODE_BIN: native.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: wrapper };
      const failed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env: retryEnv });
      const failedReport = parseLifecycleReport(JSON.parse(failed.stdout));
      expect(failed.exitCode).toBe(1);
      expect(existsSync(rollback)).toBe(false);
      expect(failedReport.recovery!.receipts[0]!.status).toBe('pending');
      expect(failedReport.recovery!.receipts[0]!.settlement).toBe('commit');
      expect(failedReport.recovery!.receipts[0]!.reason!.diagnostic).toContain('lock process failed');
      const inventory = JSON.parse(harness.run(['scopes', '--json']).stdout);
      expect(inventory.scopes[0].openJournals.operations[0].operationId).toBe(originalJournal.operationId);
      expect(inventory.scopes[0].openJournals.operations[0].journalState).toBe('cleanup-pending');
      const resumed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env: retryEnv });
      const report = parseLifecycleReport(JSON.parse(resumed.stdout));
      expect(resumed.exitCode).toBe(0);
      expect(report.recovery!.receipts[0]!.original).toEqual(inventory.scopes[0].openJournals.operations[0]);
      expect(report.recovery!.receipts[0]!.status).toBe('completed');
      expect(report.outcomes[0]!.action).toBe('unchanged');
      expect(report.summary.changed).toBe(false);
      expect(resumed.stores.dcode.after).toEqual(resumed.stores.dcode.before);
    } finally { chmodSync(operations, 0o755); }
  });
}, 30_000);

for (const failure of ['missing-tombstone', 'foreign-reappearance', 'foreign-reappearance-retained'] as const) {
  test(`completed retirement ${failure} blocks sibling update before current apply`, async () => {
    await withLifecycleCliHarness(harness => {
      harness.writeHome({ '.deepagents/.keep': '' });
      const demo = harness.source('demo', { 'plugin.json': '{"name":"demo","version":"1.0.0"}' });
      const sibling = harness.source('sibling', { 'plugin.json': '{"name":"sibling","version":"1.0.0"}' });
      const steps = () => Array.from({ length: 64 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' }));
      const native = harness.fakeNative('normal', steps());
      const env = { OPEN_PLUGIN_DCODE_BIN: native.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
      expect(harness.run(['sync', demo, '--target', 'dcode', '--json'], { env }).exitCode).toBe(0);
      const installed = harness.run(['sync', sibling, '--target', 'dcode', '--json'], { env });
      expect(installed.exitCode).toBe(0);
      const initial: LifecycleStateV2 = JSON.parse(bytesToText(installed.state.after!));
      const demoScope = initial.scopes.find(row => row.source.locator === demo)!;
      const siblingActivation = initial.activations.find(row => row.packageId === 'sibling')!;
      const siblingRoot = siblingActivation.fingerprints.installed;
      const initialRegistry = JSON.parse(readFileSync(join(harness.home, '.deepagents/.state/installed_plugins.json'), 'utf8'));
      const siblingNativeManifest = join(initialRegistry.plugins['sibling@local'][0].installPath, 'plugin.json');
      const siblingNativeBytes = readFileSync(siblingNativeManifest, 'utf8');
      const operations = join(harness.home, '.deepagents/plugins/cache/plgnz-operations');
      const counter = join(harness.root, 'cleanup-counter');
      const denied = join(harness.root, 'deny-cleanup');
      writeFileSync(denied, `#!/bin/sh\nn=0\nif [ -f '${counter}' ]; then n=$(cat '${counter}'); fi\nn=$((n+1))\nprintf '%s' "$n" > '${counter}'\nif [ "$n" -eq 4 ]; then chmod a-w '${operations}'; fi\nprintf 'deepagents-code 0.1.83\\n'\n`);
      chmodSync(denied, 0o755);
      try {
        const initialRetirement = join(harness.root, 'initial-retirement.json');
        writeFileSync(initialRetirement, JSON.stringify({ schemaVersion: 1, entries: [
          { operation: 'retire-source', scopeId: demoScope.id, target: { kind: 'dcode', instance: 'default' } },
          { operation: 'sync', source: { kind: 'local', locator: sibling }, target: { kind: 'dcode', instance: 'default' } },
        ] }));
        const retired = harness.run(['sync', '--manifest', initialRetirement, '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: denied } });
        expect(retired.exitCode).toBe(1);
        const pending: LifecycleStateV2 = JSON.parse(bytesToText(retired.state.after!));
        const attempt = pending.attempts.at(-1)!;
        expect(attempt.journal[0]!.state).toBe('cleanup-pending');
        expect(attempt.command).toBe('sync');
        if (failure === 'missing-tombstone') pending.tombstones = pending.tombstones.filter(row => row.scopeId !== demoScope.id);
        writeFileSync(join(harness.home, 'state.json'), JSON.stringify(pending));
        chmodSync(operations, 0o755);
        rmSync(demo, { recursive: true });
        writeFileSync(join(sibling, 'plugin.json'), '{"name":"sibling","version":"2.0.0"}');
        if (failure === 'foreign-reappearance-retained') {
          mkdirSync(join(sibling, 'commands'));
          writeFileSync(join(sibling, 'commands/unsupported.md'), '---\ndescription: unsupported\n---\nunsupported\n');
        }
        const manifest = join(harness.root, 'current.json');
        writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [
          { operation: 'retire-source', scopeId: demoScope.id, target: { kind: 'dcode', instance: 'default' } },
          { operation: 'sync', source: { kind: 'local', locator: sibling }, target: { kind: 'dcode', instance: 'default' } },
        ] }));
        const registryFile = join(harness.home, '.deepagents/.state/installed_plugins.json');
        const registry: { plugins: Record<string, unknown> } = JSON.parse(readFileSync(registryFile, 'utf8'));
        const foreignRoot = join(harness.home, '.deepagents/plugins/cache/foreign-reappeared');
        const foreignManifest = join(foreignRoot, 'plugin.json');
        registry.plugins['demo@local'] = [{ installPath: foreignRoot }];
        // Inventory does not itself invoke --version. Call 2 is the fresh sibling
        // route probe after recovery, before the global current-operation check.
        const injected = harness.fakeNative('reappearance', steps().map((step, index) => failure !== 'missing-tombstone' && index === 2
          ? { ...step, writes: { [registryFile]: JSON.stringify(registry), [foreignManifest]: '{"name":"demo","version":"foreign"}' } } : step));
        const resumed = harness.run(['sync', '--manifest', manifest, '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: injected.path } });
        const report = parseLifecycleReport(JSON.parse(resumed.stdout));
        expect(resumed.exitCode).toBe(1);
        expect(report.outcomes.map(row => row.package).sort()).toEqual(['demo', 'sibling']);
        expect(report.outcomes.map(row => ({ package: row.package, result: row.result, changed: row.changed, diagnostic: row.reason?.diagnostic })))
          .toEqual(report.outcomes.map(row => ({ package: row.package, result: 'not-attempted', changed: false, diagnostic: row.reason?.diagnostic })));
        expect(report.summary.reason!.diagnostic).toContain(failure === 'missing-tombstone' ? 'tombstone proof' : 'reappeared');
        expect(report.recovery!.receipts[0]!.status).toBe('completed');
        const after: LifecycleStateV2 = JSON.parse(bytesToText(resumed.state.after!));
        expect(after.activations.find(row => row.packageId === 'sibling')!.fingerprints.installed).toBe(siblingRoot);
        expect(readFileSync(siblingNativeManifest, 'utf8')).toBe(siblingNativeBytes);
        if (failure !== 'missing-tombstone') expect(readFileSync(foreignManifest, 'utf8')).toContain('foreign');
        if (failure === 'foreign-reappearance-retained') {
          expect(report.plan.find(row => row.package === 'sibling')!.action).toBe('not-attempted');
          expect(report.plan.find(row => row.package === 'sibling')!.route).toBe('none');
        }
      } finally { chmodSync(operations, 0o755); }
    });
  }, 30_000);
}
