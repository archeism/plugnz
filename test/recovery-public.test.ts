import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, watchFile, unwatchFile, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { withLifecycleCliHarness, bytesToText } from './lifecycle-cli-harness';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { repoRoot } from './util';

test('a later recovery failure reports earlier verified rollback receipts and aggregate native changes', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const names = ['demo', 'sibling', 'remaining'];
    const sources = names.map(name => harness.source(`multi-${name}`, { 'plugin.json': JSON.stringify({ name, version: '1.0.0' }) }));
    const steps = () => Array.from({ length: 64 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' }));
    const native = harness.fakeNative('normal', steps());
    const env = { OPEN_PLUGIN_DCODE_BIN: native.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    for (const source of sources) expect(harness.run(['sync', source, '--target', 'dcode', '--json'], { env }).exitCode).toBe(0);
    const stateFile = join(harness.home, 'state.json');
    const state: import('../src/state').LifecycleStateV2 = JSON.parse(readFileSync(stateFile, 'utf8'));
    for (const activation of state.activations) activation.activationState = 'nonconforming';
    writeFileSync(stateFile, JSON.stringify(state));
    const fault = join(harness.home, '.deepagents/.state/.plgnz-dcode-readback-fault');
    const originalOperations: string[] = [];
    for (const [index, source] of sources.entries()) {
      mkdirSync(join(source, 'commands'));
      writeFileSync(join(source, 'commands/unsupported.md'), '---\ndescription: unsupported\n---\nunsupported\n');
      const failing = harness.fakeNative(`failing-${index}`, steps().map((step, call) => call === 2 ? { ...step, writes: { [fault]: 'fault\n' } } : step));
      const failed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: failing.path } });
      const pending = parseLifecycleReport(JSON.parse(failed.stdout)).outcomes.find(row => row.result === 'pending')!;
      expect(pending.package).toBe(names[index]);
      originalOperations.push(pending.operationId);
      rmSync(fault);
    }
    const registry: { plugins: Record<string, Array<{ installPath: string }>> } = JSON.parse(readFileSync(join(harness.home, '.deepagents/.state/installed_plugins.json'), 'utf8'));
    writeFileSync(join(registry.plugins['sibling@local']![0]!.installPath, 'plugin.json'), '{"name":"sibling","version":"foreign"}');
    const manifest = join(harness.root, 'multi-resume.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: sources.map(source => ({ operation: 'sync', source: { kind: 'local', locator: source }, target: { kind: 'dcode', instance: 'default' } })) }));
    const inventory = JSON.parse(harness.run(['scopes', '--json']).stdout);
    const resumed = harness.run(['sync', '--manifest', manifest, '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(resumed.stdout));
    expect(resumed.exitCode).toBe(1);
    expect(report.outcomes).toHaveLength(3);
    expect(report.recovery!.receipts).toHaveLength(3);
    const originals = inventory.scopes.flatMap((scope: { openJournals: { operations: import('../src/recovery-proof').RecoveryOperationProof[] } }) => scope.openJournals.operations);
    const byId = (left: import('../src/recovery-proof').RecoveryOperationProof, right: import('../src/recovery-proof').RecoveryOperationProof) => left.operationId.localeCompare(right.operationId);
    expect(report.recovery!.receipts.map(row => row.original).sort(byId)).toEqual(originals.sort(byId));
    expect(report.outcomes.every(row => row.result === 'not-attempted' && !row.changed)).toBe(true);
    const restored = report.recovery!.receipts.find(row => row.original.package === 'demo')!;
    expect(restored.original.operationId).toBe(originalOperations[0]);
    expect(restored.status).toBe('completed');
    expect(restored.changed).toBe(true);
    expect(restored.activationState).toBe('retained-prior');
    expect(restored.settlement).toBe('rollback');
    expect(restored.readbackVerified).toBe(true);
    const unresolved = report.recovery!.receipts.find(row => row.original.package === 'sibling')!;
    expect(unresolved.original.operationId).toBe(originalOperations[1]);
    expect(unresolved.status).toBe('pending');
    expect(unresolved.changed).toBe(false);
    const remaining = report.recovery!.receipts.find(row => row.original.package === 'remaining')!;
    expect(remaining.original.operationId).toBe(originalOperations[2]);
    expect(remaining.status).toBe('not-attempted');
    expect(remaining.finalJournalState).toBe(remaining.original.journalState);
    expect(remaining.changed).toBe(false);
    expect(remaining.mutationStarted).toBe(false);
    expect(report.summary.changed).toBe(true);
    expect(report.summary.recoveryId).toBe(originalOperations[1]);
    expect(report.summary.readbackId).toBe(originalOperations[0]);
    const after: import('../src/state').LifecycleStateV2 = JSON.parse(bytesToText(resumed.state.after!));
    expect(after.attempts.flatMap(attempt => attempt.journal).find(row => row.operationId === originalOperations[0])!.state).toBe('rolled-back');
    expect(after.attempts.flatMap(attempt => attempt.journal).find(row => row.operationId === originalOperations[1])!.state).toBe('rollback');
    expect(after.attempts.flatMap(attempt => attempt.journal).find(row => row.operationId === originalOperations[2])!.state).toBe('rollback');
    expect(readFileSync(join(registry.plugins['sibling@local']![0]!.installPath, 'plugin.json'), 'utf8')).toContain('foreign');
  });
}, 30_000);

test('failed recovery retains every requested Desired pair and exact pending operation identity', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.deepagents/.keep': '' });
    const source = harness.source('resume-report', {
      'marketplace.json': JSON.stringify({ name: 'resume-report', plugins: [{ name: 'demo', source: './plugins/demo' }, { name: 'sibling', source: './plugins/sibling' }] }),
      'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
      'plugins/sibling/plugin.json': '{"name":"sibling","version":"1.0.0"}',
    });
    const steps = () => Array.from({ length: 64 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' }));
    const native = harness.fakeNative('normal', steps());
    const env = { OPEN_PLUGIN_DCODE_BIN: native.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    const initial = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(initial.exitCode).toBe(0);
    const state: import('../src/state').LifecycleStateV2 = JSON.parse(bytesToText(initial.state.after!));
    state.activations.find(row => row.packageId === 'demo')!.activationState = 'nonconforming';
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
    mkdirSync(join(source, 'plugins/demo/commands'));
    writeFileSync(join(source, 'plugins/demo/commands/unsupported.md'), '---\ndescription: unsupported\n---\nunsupported\n');
    const fault = join(harness.home, '.deepagents/.state/.plgnz-dcode-readback-fault');
    const failing = harness.fakeNative('failing', steps().map((step, index) => index === 3 ? { ...step, writes: { [fault]: 'fault\n' } } : step));
    const failed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: failing.path } });
    const original = parseLifecycleReport(JSON.parse(failed.stdout)).outcomes.find(row => row.result === 'pending')!;
    expect(original.package).toBe('demo');
    rmSync(fault);
    const registry: { plugins: Record<string, Array<{ installPath: string }>> } = JSON.parse(readFileSync(join(harness.home, '.deepagents/.state/installed_plugins.json'), 'utf8'));
    writeFileSync(join(registry.plugins['demo@resume-report']![0]!.installPath, 'plugin.json'), '{"name":"demo","version":"foreign"}');
    const resumed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(resumed.stdout));
    expect(resumed.exitCode).toBe(1);
    expect(report.outcomes.map(row => row.package).sort()).toEqual(['demo', 'sibling']);
    const pending = report.recovery!.receipts.find(row => row.original.package === 'demo')!;
    expect(pending.original.operationId).toBe(original.operationId);
    expect(pending.original.action).toBe(original.action);
    expect(pending.status).toBe('pending');
    expect(pending.reason!.code).toBe('recovery.required');
    const sibling = report.outcomes.find(row => row.package === 'sibling')!;
    expect(sibling.result).toBe('not-attempted');
    expect(sibling.changed).toBe(false);
    expect(report.summary.reason!.diagnostic).toContain('cross-process recovery');
    expect(resumed.state.after).toEqual(resumed.state.before);
    expect(resumed.stores.dcode.after).toEqual(resumed.stores.dcode.before);
    const retire = harness.run(['retire-source', state.scopes[0]!.id, '--target', 'dcode', '--json'], { env });
    const refused = parseLifecycleReport(JSON.parse(retire.stdout));
    expect(refused.outcomes.map(row => row.package).sort()).toEqual(['demo', 'sibling']);
    expect(refused.outcomes.every(row => row.coverage === 'retirement' && row.result === 'not-attempted')).toBe(true);
    expect(refused.summary.reason!.diagnostic).toContain("Retry the original 'sync' command");
    expect(retire.state.after).toEqual(retire.state.before);
    expect(retire.stores.dcode.after).toEqual(retire.stores.dcode.before);
    mkdirSync(join(source, 'plugins/sibling/commands'));
    writeFileSync(join(source, 'plugins/sibling/commands/unsupported.md'), '---\ndescription: unsupported\n---\nunsupported\n');
    const mixed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    const mixedReport = parseLifecycleReport(JSON.parse(mixed.stdout));
    expect(mixedReport.outcomes.map(row => row.package).sort()).toEqual(['demo', 'sibling']);
    expect(mixedReport.outcomes.find(row => row.package === 'sibling')!.result).toBe('not-attempted');
    expect(mixedReport.recovery!.receipts.find(row => row.original.package === 'demo')!.reason!.code).toBe('recovery.required');
    expect(mixed.state.after).toEqual(mixed.state.before);
    expect(mixed.stores.dcode.after).toEqual(mixed.stores.dcode.before);
  });
}, 30_000);

test('a fresh sync process recovers pending disable rollback before applying current Desired', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.deepagents/.keep': '', '.deepagents/plugins/data/demo/keep.txt': 'retained user data' });
    const source = harness.source('resume-disable', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const steps = () => Array.from({ length: 32 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' }));
    const initial = harness.fakeNative('initial', steps());
    const env = { OPEN_PLUGIN_DCODE_BIN: initial.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
    const installed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const state = JSON.parse(bytesToText(installed.state.after!));
    state.activations[0].activationState = 'nonconforming';
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
    mkdirSync(join(source, 'commands'));
    writeFileSync(join(source, 'commands/unsupported.md'), '---\ndescription: command\n---\nunsupported command\n');
    const fault = join(harness.home, '.deepagents/.state/.plgnz-dcode-readback-fault');
    const failing = harness.fakeNative('failing', steps().map((step, index) => index === 2 ? { ...step, writes: { [fault]: 'fault\n' } } : step));
    const failed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: failing.path } });
    expect(parseLifecycleReport(JSON.parse(failed.stdout)).outcomes[0]!.result).toBe('pending');
    const pending = JSON.parse(bytesToText(failed.state.after!));
    const oldAttempt = pending.activations[0].pending.attemptId;
    rmSync(fault);
    const crossVerb = harness.run(['retire-source', pending.scopes[0].id, '--target', 'dcode', '--json'], { env });
    expect(crossVerb.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(crossVerb.stdout)).summary.reason!.diagnostic).toContain(`Retry the original 'sync' command`);
    expect(crossVerb.state.after).toEqual(crossVerb.state.before);
    expect(crossVerb.stores.dcode.after).toEqual(crossVerb.stores.dcode.before);
    const manifest = join(harness.root, 'bad-last.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [
      { operation: 'sync', source: pending.scopes[0].source, target: pending.scopes[0].target },
      { operation: 'sync', source: { kind: 'local', locator: join(harness.root, 'missing-source') }, target: { kind: 'cursor', instance: 'default' } },
    ] }));
    const refused = harness.run(['sync', '--manifest', manifest, '--json'], { env });
    expect(refused.exitCode).toBe(2);
    expect(parseLifecycleReport(JSON.parse(refused.stdout)).summary.reason!.diagnostic).toContain('missing-source');
    expect(refused.state.after).toEqual(refused.state.before);
    expect(refused.stores.dcode.after).toEqual(refused.stores.dcode.before);
    const malformed = harness.source('bad-policy', { 'plugin.json': '{"name":"bad-policy","version":"1.0.0"}\n', 'skills/bad/SKILL.md': '---\nname: bad\ndisable-model-invocation: maybe\n---\ninvalid\n' });
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [
      { operation: 'sync', source: pending.scopes[0].source, target: pending.scopes[0].target },
      { operation: 'sync', source: { kind: 'local', locator: malformed }, target: { kind: 'cursor', instance: 'default' } },
    ] }));
    const badPolicy = harness.run(['sync', '--manifest', manifest, '--json'], { env });
    expect(badPolicy.exitCode).toBe(2);
    expect(parseLifecycleReport(JSON.parse(badPolicy.stdout)).summary.reason!.diagnostic).toContain('must be boolean');
    expect(badPolicy.state.after).toEqual(badPolicy.state.before);
    expect(badPolicy.stores.dcode.after).toEqual(badPolicy.stores.dcode.before);
    const legacySource = harness.source('bad-adoption', { 'plugin.json': '{"name":"legacy","version":"1.0.0"}\n' });
    const legacyRoot = join(harness.home, '.deepagents/plugins/cache/unmanaged-legacy');
    mkdirSync(legacyRoot, { recursive: true }); writeFileSync(join(legacyRoot, 'plugin.json'), '{"name":"legacy","version":"2.0.0"}\n');
    const registryFile = join(harness.home, '.deepagents/.state/installed_plugins.json');
    const originalRegistry = readFileSync(registryFile, 'utf8');
    const registry = JSON.parse(originalRegistry); registry.plugins['legacy@local'] = [{ installPath: legacyRoot }]; writeFileSync(registryFile, JSON.stringify(registry));
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [
      { operation: 'sync', source: pending.scopes[0].source, target: pending.scopes[0].target },
      { operation: 'sync', source: { kind: 'local', locator: legacySource }, target: { kind: 'dcode', instance: 'default' }, selectors: [{ package: 'legacy', adoptExisting: true }] },
    ] }));
    const badAdoption = harness.run(['sync', '--manifest', manifest, '--json'], { env });
    expect(badAdoption.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(badAdoption.stdout)).summary.mutationStarted).toBe(false);
    expect(badAdoption.state.after).toEqual(badAdoption.state.before);
    expect(badAdoption.stores.dcode.after).toEqual(badAdoption.stores.dcode.before);
    writeFileSync(registryFile, originalRegistry); rmSync(legacyRoot, { recursive: true });
    const nativeSlot = JSON.parse(readFileSync(join(harness.home, '.deepagents/.state/installed_plugins.json'), 'utf8')).plugins['demo@local'][0].installPath;
    const nativeManifest = join(nativeSlot, 'plugin.json');
    const priorManifest = readFileSync(nativeManifest, 'utf8');
    writeFileSync(nativeManifest, '{"name":"demo","version":"foreign"}\n');
    const stale = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    expect(stale.stderr).toBe('');
    const staleReport = parseLifecycleReport(JSON.parse(stale.stdout));
    expect(staleReport.outcomes[0]!.result).toBe('not-attempted');
    expect(staleReport.recovery!.receipts[0]!.status).toBe('pending');
    expect(staleReport.recovery!.receipts[0]!.reason!.code).toBe('recovery.required');
    expect(stale.stores.dcode.after).toEqual(stale.stores.dcode.before);
    expect(stale.state.after).toEqual(stale.state.before);
    writeFileSync(nativeManifest, priorManifest);
    const resumed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
    const report = parseLifecycleReport(JSON.parse(resumed.stdout));
    expect(resumed.exitCode).toBe(1); // Recovery does not deliver unsupported functionality.
    expect(report.outcomes[0]!.reason!.category).toBe('capability');
    expect(report.outcomes[0]!.activationState).toBe('inactive');
    const after = JSON.parse(bytesToText(resumed.state.after!));
    expect(after.activations[0].pending).toBeUndefined();
    expect(after.attempts.find((attempt: { id: string }) => attempt.id === oldAttempt).journal[0].state).toBe('rolled-back');
    expect(Object.keys(resumed.stores.dcode.after.files).some(path => path.includes('/rollback/state.json'))).toBe(false);
    expect(readFileSync(join(harness.home, '.deepagents/plugins/data/demo/keep.txt'), 'utf8')).toBe('retained user data');
  });
}, 30_000);

for (const action of ['install', 'update', 'retire'] as const) {
  test(`fresh ${action === 'retire' ? 'retire-source' : 'sync'} finishes committed ${action} cleanup without undoing accepted native state`, async () => {
    await withLifecycleCliHarness(harness => {
      harness.writeHome({ '.deepagents/.keep': '', '.deepagents/plugins/data/demo/keep.txt': 'retained user data' });
      const source = harness.source(`resume-${action}`, { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
      const steps = Array.from({ length: 32 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' }));
      const native = harness.fakeNative('normal', steps);
      const env = { OPEN_PLUGIN_DCODE_BIN: native.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
      let scopeId: string | undefined;
      if (action !== 'install') {
        const initial = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
        expect(initial.exitCode).toBe(0);
        scopeId = JSON.parse(bytesToText(initial.state.after!)).scopes[0].id;
      }
      if (action === 'update') writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"2.0.0"}\n');
      const operations = join(harness.home, '.deepagents/plugins/cache/plgnz-operations');
      const counter = join(harness.root, 'counter');
      const denied = join(harness.root, 'deny-cleanup');
      writeFileSync(denied, `#!/bin/sh\nn=0\nif [ -f '${counter}' ]; then n=$(cat '${counter}'); fi\nn=$((n+1))\nprintf '%s' "$n" > '${counter}'\nif [ "$n" -eq 3 ]; then chmod a-w '${operations}'; fi\nprintf 'deepagents-code 0.1.83\\n'\n`);
      chmodSync(denied, 0o755);
      const args = action === 'retire' ? ['retire-source', scopeId!, '--target', 'dcode', '--json'] : ['sync', source, '--target', 'dcode', '--json'];
      try {
        const failed = harness.run(args, { env: { ...env, OPEN_PLUGIN_DCODE_BIN: denied } });
        expect(failed.exitCode).toBe(1);
        const before = JSON.parse(bytesToText(failed.state.after!));
        const oldAttempt = before.attempts.at(-1);
        expect(oldAttempt.journal[0].state).toBe('cleanup-pending');
        expect(before.activations.length).toBe(action === 'retire' ? 0 : 1);
        if (action === 'retire') expect(before.scopes[0].desired === undefined).toBe(false);
        const acceptedTombstones = before.tombstones;
        const registry = join(harness.home, '.deepagents/.state/installed_plugins.json');
        const acceptedRegistry = readFileSync(registry, 'utf8');
        if (action === 'retire') rmSync(source, { recursive: true });
        chmodSync(operations, 0o755);
        if (action === 'update') {
          const handle = oldAttempt.journal[0].sealedOperation;
          const rollback = handle.rollbackReference;
          mkdirSync(rollback, { recursive: true });
          const sentinel = join(harness.home, '.deepagents/plugins/cache/unrelated');
          mkdirSync(sentinel, { recursive: true }); writeFileSync(join(sentinel, 'keep.txt'), 'unrelated native bytes');
          const priorMetadata = JSON.stringify({ row: handle.prior.contentRoots.map((root: { path: string }) => ({ installPath: root.path })), enabled: true, registryExisted: true, enablementExisted: true });
          const expectedMetadata = JSON.stringify({ target: handle.expected.contentRoots[0].path });
          for (const artifact of ['state.json', 'next-path.json']) {
            writeFileSync(join(rollback, 'state.json'), artifact === 'state.json' ? JSON.stringify({ row: [{ installPath: sentinel }], enabled: true }) : priorMetadata);
            writeFileSync(join(rollback, 'next-path.json'), artifact === 'next-path.json' ? JSON.stringify({ target: sentinel }) : expectedMetadata);
            const corrupted = harness.run(args, { env });
            expect(corrupted.exitCode).toBe(1);
            expect(parseLifecycleReport(JSON.parse(corrupted.stdout)).recovery!.receipts[0]!.status).toBe('pending');
            expect(readFileSync(join(sentinel, 'keep.txt'), 'utf8')).toBe('unrelated native bytes');
            expect(existsSync(join(rollback, artifact))).toBe(true);
            expect(readFileSync(registry, 'utf8')).toBe(acceptedRegistry);
          }
          writeFileSync(join(rollback, 'state.json'), priorMetadata); writeFileSync(join(rollback, 'next-path.json'), expectedMetadata);
        }
        const resumeNative = action === 'update' ? harness.fakeNative('source-drift', steps.map((step, index) => index === 0 ? { ...step, writes: { [join(source, 'plugin.json')]: '{"name":"demo","version":"3.0.0"}\n' } } : step)) : native;
        const priorInventory = JSON.parse(harness.run(['scopes', '--json']).stdout);
        const resumed = harness.run(args, { env: { ...env, OPEN_PLUGIN_DCODE_BIN: resumeNative.path } });
        expect(resumed.exitCode).toBe(0);
        const resumedReport = parseLifecycleReport(JSON.parse(resumed.stdout));
        expect(resumedReport.recovery!.receipts.map(row => row.original)).toEqual(priorInventory.scopes[0].openJournals.operations);
        expect(resumedReport.recovery!.receipts.every(row => row.status === 'completed' && row.settlement === 'commit')).toBe(true);
        if (action === 'retire') {
          expect(resumedReport.outcomes.map(row => ({ package: row.package, action: row.action, result: row.result,
            resource: row.resourceState, activation: row.activationState, changed: row.changed }))).toEqual([
            { package: 'demo', action: 'retire-orphan', result: 'succeeded', resource: 'absent', activation: 'inactive', changed: false },
          ]);
          expect(resumedReport.outcomes[0]!.operationId === resumedReport.recovery!.receipts[0]!.original.operationId).toBe(false);
        }
        const after = JSON.parse(bytesToText(resumed.state.after!));
        expect(after.attempts.find((attempt: { id: string }) => attempt.id === oldAttempt.id).journal[0].state).toBe('completed');
        expect(readFileSync(registry, 'utf8')).toBe(acceptedRegistry);
        expect(after.tombstones).toEqual(acceptedTombstones);
        expect(readFileSync(join(harness.home, '.deepagents/plugins/data/demo/keep.txt'), 'utf8')).toBe('retained user data');
        if (action === 'retire') expect(after.scopes[0].lifecycle).toBe('retired');
        else expect(after.activations[0].pending).toBeUndefined();
      } finally { if (existsSync(operations)) chmodSync(operations, 0o755); }
    });
  }, 30_000);
}

for (const action of ['accepted-install', 'install', 'disable', 'retire'] as const) {
  test(`SIGKILL after durable applying intent resumes ${action} from journals in a fresh CLI`, async () => {
    await withLifecycleCliHarness(async harness => {
      harness.writeHome({ '.deepagents/.keep': '', '.deepagents/plugins/data/demo/keep.txt': 'retained user data' });
      const source = harness.source(`kill-${action}`, { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n', 'large.txt': 'data'.repeat(500_000) });
      const native = harness.fakeNative('normal', Array.from({ length: 64 }, () => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n' })));
      const env = { OPEN_PLUGIN_DCODE_BIN: native.path, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
      let scopeId: string | undefined;
      const freshInstall = action === 'install' || action === 'accepted-install';
      if (!freshInstall) {
        const installed = harness.run(['sync', source, '--target', 'dcode', '--json'], { env });
        expect(installed.exitCode).toBe(0);
        const state = JSON.parse(bytesToText(installed.state.after!)); scopeId = state.scopes[0].id;
        if (action === 'disable') {
          state.activations[0].activationState = 'nonconforming';
          writeFileSync(join(harness.home, 'state.json'), JSON.stringify(state));
          mkdirSync(join(source, 'commands')); writeFileSync(join(source, 'commands/no.md'), '---\ndescription: unsupported\n---\ncommand\n');
        }
      }
      const args = action === 'retire' ? ['retire-source', scopeId!, '--target', 'dcode', '--json'] : ['sync', source, '--target', 'dcode', '--json'];
      let killed = false, interruptedId: string | undefined;
      let child: { kill(signal: string): void; on(event: 'exit', callback: () => void): void; on(event: 'error', callback: (error: Error) => void): void };
      const stateFile = join(harness.home, 'state.json');
      // Directory watch events may coalesce all atomic replaces on macOS. Poll
      // the state inode so the durable applying boundary remains observable.
      const observeState = () => {
        if (killed || !existsSync(stateFile)) return;
        const state = JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8'));
        const attempt = state.attempts.at(-1);
        if (attempt?.journal[0]?.state !== (action === 'accepted-install' ? 'pending' : 'applying')) return;
        if (action === 'accepted-install' && attempt.journal[0].sealedOperation !== undefined) return;
        interruptedId = attempt.id; killed = true;
        child.kill('SIGSTOP'); child.kill('SIGKILL');
      };
      watchFile(stateFile, { interval: 1 }, observeState);
      try {
        const executable = process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] || process.execPath;
        const cli = join(repoRoot, process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] ? 'dist/plugnz.mjs' : 'bin/plugnz.mjs');
        child = spawn(executable, [cli, ...args], { cwd: harness.root, env: { ...process.env, ...env, HOME: harness.home, OPEN_PLUGIN_HOME: harness.home, OPEN_PLUGIN_DCODE_ROOT: join(harness.home, '.deepagents') }, stdio: 'ignore' }) as unknown as typeof child;
        await new Promise<void>((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
      } finally { unwatchFile(stateFile, observeState); }
      expect(killed).toBe(true);
      const interrupted = JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8'));
      const interruptedJournal = interrupted.attempts.find((attempt: { id: string }) => attempt.id === interruptedId).journal[0];
      if (action === 'accepted-install') expect(interruptedJournal.sealedOperation).toBeUndefined();
      else expect(interruptedJournal.sealedOperation.schemaVersion).toBe(1);
      if (freshInstall) expect(interrupted.activations.length).toBe(0);
      const diagnosed = harness.run(['doctor', '--target', 'dcode', '--json'], { env });
      expect(diagnosed.exitCode).toBe(1);
      expect(diagnosed.stdout).toContain(interruptedJournal.operationId);
      expect(diagnosed.state.after).toEqual(diagnosed.state.before);
      expect(diagnosed.stores.dcode.after).toEqual(diagnosed.stores.dcode.before);
      const listed = harness.run(['list', '--target', 'dcode', '--json'], { env });
      expect(JSON.parse(listed.stdout)[0].recovery[0].operationId).toBe(interruptedJournal.operationId);
      if (action === 'retire') rmSync(source, { recursive: true });
      if (action !== 'accepted-install') {
        const refusedRecovery = harness.run(args, { env: { ...env, OPEN_PLUGIN_DCODE_PYTHON_BIN: join(harness.root, 'missing-lock-runtime') } });
        const refusedReport = parseLifecycleReport(JSON.parse(refusedRecovery.stdout));
        expect(refusedRecovery.exitCode).toBe(1);
        expect(refusedReport.outcomes).toHaveLength(1);
        expect(refusedReport.recovery!.receipts[0]!.original.operationId).toBe(interruptedJournal.operationId);
        expect(refusedReport.outcomes[0]!.coverage).toBe(action === 'retire' ? 'retirement' : 'desired-pair');
        expect(refusedReport.outcomes[0]!.result).toBe('not-attempted');
        expect(refusedReport.recovery!.receipts[0]!.status).toBe('pending');
        expect(refusedReport.recovery!.receipts[0]!.reason!.code).toBe('recovery.required');
        expect(refusedRecovery.state.after).toEqual(refusedRecovery.state.before);
        expect(refusedRecovery.stores.dcode.after).toEqual(refusedRecovery.stores.dcode.before);
      }
      const resumed = harness.run(args, { env });
      const report = parseLifecycleReport(JSON.parse(resumed.stdout));
      expect(resumed.exitCode).toBe(action === 'disable' ? 1 : 0);
      if (action === 'disable') expect(report.outcomes[0]!.reason!.category).toBe('capability');
      const after = JSON.parse(bytesToText(resumed.state.after!));
      expect(after.attempts.find((attempt: { id: string }) => attempt.id === interruptedId).journal[0].state).toBe(action === 'accepted-install' ? 'not-attempted' : 'rolled-back');
      expect(after.activations.length).toBe(action === 'retire' ? 0 : 1);
      expect(readFileSync(join(harness.home, '.deepagents/plugins/data/demo/keep.txt'), 'utf8')).toBe('retained user data');
    });
  }, 30_000);
}
