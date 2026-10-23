import { expect, test } from 'bun:test';
import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, projectedState, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { main } from '../src/cli';
import { writers } from '../src/hosts/writers';
import type { HostWriter } from '../src/host';
import { withHostEnvAsync, writeFiles } from './util';
import { readState } from '../src/state';
import { piHookWriter } from '../src/hosts/pi-hook-writer';
import { resolveSource } from '../src/source';
import { CompatibilityError } from '../src/compatibility';

const agentDefinition = `---\nname: reviewer\ndescription: Review the change\n---\nKeep the reasoning intact.\n`;
const manifest = '{"name":"pi-portable-review","version":"1.0.0"}';
const agents = {
  'plugin.json': manifest,
  'plugnz.agents.json': JSON.stringify({ version: 1 }),
  'agents/reviewer.md': agentDefinition,
};
const hooks = {
  'plugin.json': manifest,
  'plugnz.hooks.json': JSON.stringify({ version: 1, hooks: { 'session.start': [{ command: [process.execPath, '${PLUGIN_ROOT}/context.mjs'] }] } }),
  'context.mjs': 'console.log(JSON.stringify({context:"pi-context"}));\n',
};
const mixed = { ...hooks, 'plugnz.agents.json': agents['plugnz.agents.json'], 'agents/reviewer.md': agentDefinition };

/** A PATH-independent version shim: admission probes the Pi binary once per preflight. */
function piVersion(harness: { fakeBinPath(name: string): string }): string {
  const binary = harness.fakeBinPath('pi-version');
  writeFileSync(binary, "#!/bin/sh\nprintf '%s\\n' '1.1.0'\n");
  chmodSync(binary, 0o755);
  return binary;
}

test('Pi-only portable agents are skipped loudly with no state, extension, dependency, or agent files', async () => {
  await withLifecycleCliHarness((h) => {
    h.writeHome({ '.pi/agent/.keep': '' });
    const source = h.source('pi-agents-only', agents);

    const dry = h.run(['install', source, '--target', 'pi', '--dry-run', '--json']);
    expect(dry.exitCode).toBe(0);
    const dryReport = parseLifecycleReport(JSON.parse(dry.stdout));
    expect(dryReport.summary).toEqual({
      result: 'converged', terminalPhase: 'complete', mutationStarted: false, changed: false,
      failureCategory: null, reason: null, recoveryId: null, readbackId: null,
    });
    const dryOutcome = dryReport.outcomes[0]!;
    expect({
      action: dryOutcome.action, route: dryOutcome.route, result: dryOutcome.result, changed: dryOutcome.changed,
      resourceState: dryOutcome.resourceState, activationState: dryOutcome.activationState, ignoredComponents: dryOutcome.ignoredComponents,
    }).toEqual({
      action: 'skip', route: 'none', result: 'skipped', changed: false,
      resourceState: 'absent', activationState: 'inactive', ignoredComponents: ['agents'],
    });
    expect({ ...dryOutcome.reason! }).toEqual({
      category: 'capability', code: 'capability.unsupported', diagnostic: dryOutcome.reason!.diagnostic,
      capabilityId: 'agents', evidenceId: null,
    });
    expect(dryReport.verification!.operations).toEqual([{
      operationId: dryReport.outcomes[0]!.operationId,
      compatibility: 'unsupported', registration: 'not-checked', executionApproval: 'not-checked', delivery: 'not-observed',
      ignoredComponents: ['agents'],
    }]);
    expect(dry.stderr).toContain('WARNING (pi)');
    expect(dry.stderr).toContain('NOT installed');
    expect(dry.stderr).toContain('treats this package as skipped');
    expect(dry.stores.pi.before).toEqual(dry.stores.pi.after);
    expect(dry.state.after).toBeUndefined();

    const applied = h.run(['install', source, '--target', 'pi', '--json']);
    expect(applied.exitCode).toBe(0);
    const appliedReport = parseLifecycleReport(JSON.parse(applied.stdout));
    expect(appliedReport.summary.result).toBe('converged');
    expect(appliedReport.outcomes[0]!.result).toBe('skipped');
    expect(applied.stderr).toContain('WARNING (pi)');
    expect(applied.stores.pi.before).toEqual(applied.stores.pi.after);
    expect(Object.keys(applied.stores.pi.after.files)).toEqual(['.keep']);
    expect(applied.state.before).toBeUndefined();
    expect(applied.state.after).toBeUndefined();
    expect(existsSync(join(h.storePath('pi'), 'settings.json'))).toBe(false);
    expect(existsSync(join(h.storePath('pi'), '.plgnz'))).toBe(false);

    const again = h.run(['install', source, '--target', 'pi', '--json']);
    expect(again.exitCode).toBe(0);
    expect(again.stderr).toContain('WARNING (pi)');
    expect(again.stores.pi.before).toEqual(again.stores.pi.after);
    expect(again.state.before).toBeUndefined();
    expect(again.state.after).toBeUndefined();
  });
}, 30_000);

test('mixed Pi hooks and portable agents install hooks, prune agents, and warn on install and update', async () => {
  await withLifecycleCliHarness((h) => {
    h.writeHome({ '.pi/agent/.keep': '' });
    const source = h.source('pi-mixed', mixed);
    const env = { OPEN_PLUGIN_PI_BIN: piVersion(h) };

    const installed = h.run(['install', source, '--target', 'pi', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const report = parseLifecycleReport(JSON.parse(installed.stdout));
    expect(report.summary.result).toBe('converged');
    expect(report.summary.changed).toBe(true);
    const mixedOutcome = report.outcomes[0]!;
    expect({
      action: mixedOutcome.action, route: mixedOutcome.route, result: mixedOutcome.result, changed: mixedOutcome.changed,
      reason: mixedOutcome.reason, ignoredComponents: mixedOutcome.ignoredComponents,
    }).toEqual({
      action: 'install', route: 'managed', result: 'succeeded', changed: true, reason: null, ignoredComponents: ['agents'],
    });
    expect(report.verification!.operations).toEqual([{
      operationId: report.outcomes[0]!.operationId,
      compatibility: 'admitted', registration: 'verified', executionApproval: 'not-checked', delivery: 'not-observed',
      ignoredComponents: ['agents'],
    }]);
    expect(installed.stderr).toContain('WARNING (pi)');
    expect(installed.stderr).toContain('only the portable hooks are eligible');
    const installedKeys = Object.keys(installed.stores.pi.after.files);
    expect(installedKeys.some((path) => path.endsWith('/extension.mjs'))).toBe(true);
    expect(installedKeys.some((path) => path.endsWith('/context.mjs'))).toBe(true);
    expect(installedKeys.some((path) => path.includes('/agents/') || path.endsWith('plugnz.agents.json'))).toBe(false);
    const settings = JSON.parse(bytesToText(installed.stores.pi.after.files['settings.json']!)) as { extensions: string[] };
    expect(settings.extensions).toHaveLength(1);
    expect(settings.extensions[0]).toContain('/.plgnz/hook-packages/');
    const state = projectedState(installed.state.after!, h.home);
    expect(state.installs.map((record) => record.host)).toEqual(['pi']);
    expect(state.installs[0]!.pending).toBeUndefined();

    const preview = h.run(['update', '--target', 'pi', '--dry-run', '--json'], { env });
    expect(preview.exitCode).toBe(0);
    expect(preview.stderr).toContain('WARNING (pi)');
    expect(preview.stores.pi.before).toEqual(preview.stores.pi.after);
    const previewReport = parseLifecycleReport(JSON.parse(preview.stdout));
    expect(previewReport.outcomes[0]!.ignoredComponents).toEqual(['agents']);
    expect(previewReport.verification!.operations).toEqual([{
      operationId: previewReport.outcomes[0]!.operationId,
      compatibility: 'admitted', registration: 'not-checked', executionApproval: 'not-checked', delivery: 'not-observed',
      ignoredComponents: ['agents'],
    }]);

    const updated = h.run(['update', '--target', 'pi', '--json'], { env });
    expect(updated.exitCode).toBe(0);
    expect(updated.stderr).toContain('WARNING (pi)');
    const updatedKeys = Object.keys(updated.stores.pi.after.files);
    expect(updatedKeys.some((path) => path.endsWith('/extension.mjs'))).toBe(true);
    expect(updatedKeys.some((path) => path.includes('/agents/') || path.endsWith('plugnz.agents.json'))).toBe(false);
    expect(JSON.parse(bytesToText(updated.stores.pi.after.files['settings.json']!)).extensions).toHaveLength(1);
    expect(projectedState(updated.state.after!, h.home).installs.map((record) => record.host)).toEqual(['pi']);
    const updatedReport = parseLifecycleReport(JSON.parse(updated.stdout));
    expect(updatedReport.outcomes[0]!.ignoredComponents).toEqual(['agents']);
    expect(updatedReport.verification!.operations).toEqual([{
      operationId: updatedReport.outcomes[0]!.operationId,
      compatibility: 'admitted', registration: 'verified', executionApproval: 'not-checked', delivery: 'not-observed',
      ignoredComponents: ['agents'],
    }]);
  });
}, 30_000);

test('malformed and unrelated unsupported Pi packages still fail without warning or writes', async () => {
  await withLifecycleCliHarness((h) => {
    h.writeHome({ '.pi/agent/.keep': '' });
    const malformed = h.source('pi-agents-malformed', {
      'plugin.json': manifest,
      'plugnz.agents.json': JSON.stringify({ version: 1 }),
      'agents/reviewer.md': 'no frontmatter here\n',
    });
    const broken = h.run(['install', malformed, '--target', 'pi', '--json']);
    expect(broken.exitCode).toBe(1);
    const brokenReport = parseLifecycleReport(JSON.parse(broken.stdout));
    expect(brokenReport.summary.result).toBe('incomplete');
    expect(brokenReport.summary.mutationStarted).toBe(false);
    expect(brokenReport.outcomes[0]!.result).toBe('failed');
    expect(broken.stderr.includes('WARNING (pi)')).toBe(false);
    expect(broken.stores.pi.before).toEqual(broken.stores.pi.after);
    expect(broken.state.after).toBeUndefined();

    const mixedMalformed = h.source('pi-mixed-malformed', {
      ...hooks,
      'plugnz.agents.json': JSON.stringify({ version: 1 }),
      'agents/reviewer.md': 'no frontmatter here\n',
    });
    const mixedBroken = h.run(['install', mixedMalformed, '--target', 'pi', '--json'], { env: { OPEN_PLUGIN_PI_BIN: piVersion(h) } });
    expect(mixedBroken.exitCode).toBe(1);
    expect(mixedBroken.stores.pi.before).toEqual(mixedBroken.stores.pi.after);
    expect(mixedBroken.state.after).toBeUndefined();

    const skillsMixed = h.source('pi-agents-skills', {
      ...agents,
      'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nbody\n',
    });
    const refused = h.run(['install', skillsMixed, '--target', 'pi', '--json']);
    expect(refused.exitCode).toBe(1);
    const refusedReport = parseLifecycleReport(JSON.parse(refused.stdout));
    expect(refusedReport.outcomes[0]!.result).toBe('failed');
    expect(refusedReport.outcomes[0]!.reason!.code).toBe('capability.unsupported');
    expect(refusedReport.outcomes[0]!.reason!.diagnostic).toContain('ordinary-skills');
    expect(refused.stores.pi.before).toEqual(refused.stores.pi.after);
    expect(refused.state.after).toBeUndefined();
  });
}, 30_000);

test('update to an agents-only source skips without pending intent or data loss', async () => {
  await withLifecycleCliHarness((h) => {
    h.writeHome({ '.pi/agent/.keep': '' });
    const source = h.source('pi-update-transition', mixed);
    const env = { OPEN_PLUGIN_PI_BIN: piVersion(h) };
    const installed = h.run(['install', source, '--target', 'pi', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const priorState = installed.state.after!;
    rmSync(join(source, 'plugnz.hooks.json'));

    const preview = h.run(['update', '--target', 'pi', '--dry-run', '--json'], { env });
    expect(preview.exitCode).toBe(0);
    const previewReport = parseLifecycleReport(JSON.parse(preview.stdout));
    expect(previewReport.summary.result).toBe('converged');
    expect(previewReport.summary.mutationStarted).toBe(false);
    expect({
      action: previewReport.outcomes[0]!.action, result: previewReport.outcomes[0]!.result,
      resourceState: previewReport.outcomes[0]!.resourceState, activationState: previewReport.outcomes[0]!.activationState,
      ignoredComponents: previewReport.outcomes[0]!.ignoredComponents,
    }).toEqual({
      action: 'skip', result: 'skipped', resourceState: 'retained', activationState: 'retained-prior', ignoredComponents: ['agents'],
    });
    expect(previewReport.verification!.operations[0]!.registration).toBe('not-checked');
    expect(preview.stores.pi.before).toEqual(preview.stores.pi.after);
    expect(bytesToText(preview.state.after!)).toBe(bytesToText(priorState));
    expect(preview.stderr).toContain('WARNING (pi)');
    expect(preview.stderr).toContain('treats this package as skipped');

    const applied = h.run(['update', '--target', 'pi', '--json'], { env });
    expect(applied.exitCode).toBe(0);
    const appliedReport = parseLifecycleReport(JSON.parse(applied.stdout));
    expect({
      action: appliedReport.outcomes[0]!.action, result: appliedReport.outcomes[0]!.result,
      resourceState: appliedReport.outcomes[0]!.resourceState, activationState: appliedReport.outcomes[0]!.activationState,
      ignoredComponents: appliedReport.outcomes[0]!.ignoredComponents,
    }).toEqual({
      action: 'skip', result: 'skipped', resourceState: 'retained', activationState: 'retained-prior', ignoredComponents: ['agents'],
    });
    expect(applied.stores.pi.before).toEqual(applied.stores.pi.after);
    expect(bytesToText(applied.state.after!)).toBe(bytesToText(priorState));
    expect(projectedState(applied.state.after!, h.home).installs.map((record) => ({ host: record.host, pending: record.pending })))
      .toEqual([{ host: 'pi', pending: undefined }]);
  });
}, 30_000);

test('an earlier writer failure keeps a later Pi skip outcome valid', async () => {
  await withHostEnvAsync('codex', async (home) => {
    writeFiles(join(home, '.pi', 'agent'), { '.keep': '' });
    const source = join(home, 'agents-source');
    writeFiles(source, agents);
    const originalWriters = [...writers];
    const failing: HostWriter = {
      id: 'opencode', gui: false, plannedNativeId: (plugin) => `${plugin.name}@${plugin.marketplace ?? 'local'}`,
      detect: () => true, stores: () => [], listInstalled: () => [], mcpEntries: () => [],
      preflightAdd: async () => {},
      add: async () => { throw new Error('synthetic native failure'); },
      remove: async () => {},
      pin: async () => ({ changes: [], refusals: [] }),
    };
    const pi = originalWriters.find((writer) => writer.id === 'pi')!;
    const stdout: string[] = [];
    const stderr: string[] = [];
    const log = console.log, error = console.error;
    console.log = (value: string) => stdout.push(String(value));
    console.error = (value: unknown) => stderr.push(String(value));
    writers.splice(0, writers.length, failing, pi);
    try {
      for (const dryRun of [true, false]) {
        stdout.length = 0;
        stderr.length = 0;
        const code = await main(['install', source, '--target', 'opencode', '--target', 'pi', ...(dryRun ? ['--dry-run'] : []), '--json']);
        expect(code).toBe(1);
        const report = parseLifecycleReport(JSON.parse(stdout.join('')));
        const piOutcome = report.outcomes.find((outcome) => outcome.scope.target.kind === 'pi')!;
        const failingOutcome = report.outcomes.find((outcome) => outcome.scope.target.kind === 'opencode')!;
        expect(piOutcome.action).toBe('skip');
        expect(piOutcome.result).toBe('skipped');
        expect(piOutcome.resourceState).toBe('absent');
        expect(failingOutcome.result).toBe(dryRun ? 'failed' : 'pending');
        expect(stderr.join('')).toContain('WARNING (pi)');
        expect(existsSync(join(home, '.pi', 'agent', 'settings.json'))).toBe(false);
        expect(existsSync(join(home, '.pi', 'agent', '.plgnz'))).toBe(false);
        if (dryRun) expect(existsSync(join(home, 'state.json'))).toBe(false);
        else expect(readState().map((record) => ({ host: record.host, pending: record.pending })))
          .toEqual([{ host: 'opencode', pending: 'install' }]);
      }
    } finally {
      console.log = log;
      console.error = error;
      writers.splice(0, writers.length, ...originalWriters);
    }
  });
});

test('a corrupt Pi native store fails the skip instead of hiding the error', async () => {
  await withLifecycleCliHarness((h) => {
    h.writeHome({
      '.pi/agent/.keep': '',
      '.pi/agent/skills/broken/.plgnz-install.json': 'not json',
    });
    const source = h.source('pi-corrupt-store', agents);
    const result = h.run(['install', source, '--target', 'pi', '--json']);
    expect(result.exitCode).toBe(1);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(report.summary.result).toBe('incomplete');
    expect(report.summary.mutationStarted).toBe(false);
    expect({ action: report.outcomes[0]!.action, result: report.outcomes[0]!.result }).toEqual({ action: 'not-attempted', result: 'failed' });
    expect(report.outcomes[0]!.reason!.code).toBe('internal.defect');
    expect(report.outcomes[0]!.reason!.diagnostic).toContain('invalid Pi ownership marker');
    expect(result.stores.pi.before).toEqual(result.stores.pi.after);
    expect(result.state.after).toBeUndefined();
  });
}, 30_000);

test('a direct Pi writer add refuses an ignored-only package before compiling', async () => {
  await withHostEnvAsync('codex', async (home) => {
    writeFiles(join(home, '.pi', 'agent'), { '.keep': '' });
    const source = join(home, 'direct-agents');
    writeFiles(source, agents);
    const resolved = resolveSource(source);
    let error: unknown;
    try { await piHookWriter.add(resolved.plugins[0]!, resolved); }
    catch (caught) { error = caught; }
    expect(error instanceof CompatibilityError).toBe(true);
    expect((error as CompatibilityError).message).toContain('ignored-only');
    expect(existsSync(join(home, '.pi', 'agent', '.plgnz'))).toBe(false);
    expect(existsSync(join(home, '.pi', 'agent', 'settings.json'))).toBe(false);
    expect(existsSync(join(home, 'state.json'))).toBe(false);
  });
});

test('a failing multi-target install still reports the Pi skip truthfully', async () => {
  await withLifecycleCliHarness((h) => {
    h.writeHome({ '.pi/agent/.keep': '', '.claude/settings.json': 'not json' });
    h.fakeNative('claude', Array.from({ length: 60 }, () => ({ args: ['--version'], stdout: '2.1.285 (Claude Code)\n' })));
    const source = h.source('pi-claude-failing', agents);
    const result = h.run(['install', source, '--target', 'claude-code', '--target', 'pi', '--json']);
    expect(result.exitCode).toBe(1);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(report.summary.result).toBe('incomplete');
    const piOutcome = report.outcomes.find((outcome) => outcome.scope.target.kind === 'pi')!;
    expect(piOutcome.action).toBe('skip');
    expect(piOutcome.result).toBe('skipped');
    expect(piOutcome.ignoredComponents).toEqual(['agents']);
    expect(result.stores.pi.before).toEqual(result.stores.pi.after);
    expect(result.state.after).toBeUndefined();
    expect(result.stderr).toContain('WARNING (pi)');
  });
}, 30_000);

test('a valid multi-target install continues while Pi skips portable agents', async () => {
  await withLifecycleCliHarness((h) => {
    h.writeHome({ '.pi/agent/.keep': '' });
    h.fakeNative('claude', Array.from({ length: 60 }, () => ({ args: ['--version'], stdout: '2.1.285 (Claude Code)\n' })));
    const source = h.source('pi-claude-agents', agents);

    const result = h.run(['install', source, '--target', 'claude-code', '--target', 'pi', '--json']);
    expect(result.exitCode).toBe(0);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(report.summary.result).toBe('converged');
    const piOutcome = report.outcomes.find((outcome) => outcome.scope.target.kind === 'pi')!;
    const claudeOutcome = report.outcomes.find((outcome) => outcome.scope.target.kind === 'claude-code')!;
    expect(piOutcome.result).toBe('skipped');
    expect(piOutcome.ignoredComponents).toEqual(['agents']);
    expect(claudeOutcome.result).toBe('succeeded');
    expect(claudeOutcome.ignoredComponents).toBeUndefined();
    expect(result.stderr).toContain('WARNING (pi)');
    expect(Object.keys(result.stores['claude-code']!.after.files).some((path) => path.endsWith('/agents/reviewer.md') || path === 'agents/reviewer.md')).toBe(true);
    expect(result.stores.pi.before).toEqual(result.stores.pi.after);
    expect(projectedState(result.state.after!, h.home).installs.map((record) => record.host)).toEqual(['claude-code']);
  });
}, 30_000);
