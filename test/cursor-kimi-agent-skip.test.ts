import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { readState, type LifecycleStateV2 } from '../src/state';
import { kimiNativeEnv } from './kimi-fixture';
import {
  projectedState, snapshotTree, withLifecycleCliHarness,
  type CliRunResult, type LifecycleCliHarness,
} from './lifecycle-cli-harness';

const targets = ['cursor', 'kimi'] as const;
type Target = (typeof targets)[number];
const packageName = 'agent-skip-review';
const agent = '---\nname: reviewer\ndescription: Review the change\n---\nKeep the reasoning intact.\n';
const skill = '---\nname: review\ndescription: Review a change\n---\nRun the supported review skill.\n';
const manifest = JSON.stringify({ name: packageName, version: '1.0.0' });
const agents = {
  'plugin.json': manifest,
  'plugnz.agents.json': '{"version":1}\n',
  'agents/reviewer.md': agent,
};
const mixed = { ...agents, 'skills/review/SKILL.md': skill };
const agentPackages = {
  portable: { ...agents, 'README.md': 'Review package\n' },
  canonical: { 'plugin.json': manifest, 'agents/reviewer.md': agent },
  'claude-root': { 'plugin.json': manifest, '.claude/agents/reviewer.md': agent },
};

function nativeEnv(h: LifecycleCliHarness, target: Target): Record<string, string> {
  if (target === 'kimi') {
    const env = kimiNativeEnv(h.home);
    const binary = env.OPEN_PLUGIN_KIMI_BIN!;
    // Match the existing public Kimi fixture: the harness intentionally hides Bun on PATH.
    writeFileSync(binary, readFileSync(binary, 'utf8').replace('#!/usr/bin/env bun', `#!${process.execPath}`));
    return env;
  }
  const binary = h.fakeBinPath('cursor-version');
  writeFileSync(binary, '#!/bin/sh\nprintf "2.4.0\\n"\n');
  chmodSync(binary, 0o755);
  return { OPEN_PLUGIN_CURSOR_BIN: binary };
}

function reportFor(result: CliRunResult) {
  if (result.exitCode !== 0) throw new Error(`CLI exited ${result.exitCode}:\n${result.stdout}\n${result.stderr}`);
  return parseLifecycleReport(JSON.parse(result.stdout));
}

function expectWarning(result: CliRunResult, target: Target): void {
  expect(result.stderr).toMatch(/warn/i);
  expect(result.stderr.toLowerCase()).toContain(target);
  expect(result.stderr).toMatch(/agents?/i);
  expect(result.stderr).toMatch(/not|skip|ignor|unsupported/i);
}

function expectNoMutation(result: CliRunResult): void {
  expect(result.state.after).toEqual(result.state.before);
  for (const store of Object.values(result.stores)) expect(store.after).toEqual(store.before);
  expect(result.ambient.after).toEqual(result.ambient.before);
}

function expectSkipped(result: CliRunResult, target: Target): void {
  const report = reportFor(result);
  expect(report.summary.result).toBe('converged');
  expect(report.summary.mutationStarted).toBe(false);
  expect(report.summary.changed).toBe(false);
  expect(report.outcomes).toHaveLength(1);
  expect(report.outcomes[0]!.result).toBe('skipped');
  expect(report.outcomes[0]!.changed).toBe(false);
  expect(report.outcomes[0]!.ignoredComponents).toEqual(['agents']);
  if (report.command.name === 'add') {
    expect(report.verification!.operations).toHaveLength(1);
    expect(report.verification!.operations[0]!.ignoredComponents).toEqual(['agents']);
    expect(report.verification!.operations[0]!.delivery).toBe('not-observed');
  }
  expectWarning(result, target);
  expectNoMutation(result);
}

function installedRoot(h: LifecycleCliHarness, target: Target): string {
  return join(h.storePath(target), 'plugins', target === 'cursor' ? 'local' : 'managed', packageName);
}

for (const target of targets) {
  describe(`${target} public agent skip policy`, () => {
    for (const hasPrior of [false, true]) {
      test(`a batch delivers its other scope without changing ${hasPrior ? 'existing' : 'absent'} skipped scope records`, async () => {
        await withLifecycleCliHarness(h => {
          const env = nativeEnv(h, target);
          const skippedSource = h.source('batch-skipped', hasPrior ? mixed : agents);
          let prior: LifecycleStateV2 | undefined;
          if (hasPrior) {
            reportFor(h.run(['install', skippedSource, '--target', target, '--json'], { env }));
            prior = JSON.parse(readFileSync(join(h.home, 'state.json'), 'utf8'));
            rmSync(join(skippedSource, 'skills'), { recursive: true });
          }
          const priorNative = snapshotTree(installedRoot(h, target));
          const deliveredSource = h.source('batch-delivered', {
            'plugin.json': '{"name":"delivered-review","version":"1.0.0"}',
            'skills/review/SKILL.md': skill,
          });
          const batch = join(h.root, 'batch.json');
          writeFileSync(batch, JSON.stringify({ schemaVersion: 1, entries: [skippedSource, deliveredSource].map(locator => ({
            operation: 'sync', source: { kind: 'local', locator }, target: { kind: target, instance: 'default' },
          })) }));
          const result = h.run(['sync', '--manifest', batch, '--json'], { env });
          const report = reportFor(result);
          expect(report.summary.result).toBe('converged');
          const skipped = report.outcomes.find(row => row.package === packageName)!;
          const delivered = report.outcomes.find(row => row.package === 'delivered-review')!;
          expect(skipped.result).toBe('skipped');
          expect(skipped.ignoredComponents).toEqual(['agents']);
          expect(delivered.result).toBe('succeeded');
          expectWarning(result, target);
          const after: LifecycleStateV2 = JSON.parse(readFileSync(join(h.home, 'state.json'), 'utf8'));
          expect(after.scopes.filter(row => row.id === skipped.scope.id)).toEqual(prior?.scopes.filter(row => row.id === skipped.scope.id) ?? []);
          expect(after.activations.filter(row => row.scopeId === skipped.scope.id)).toEqual(prior?.activations.filter(row => row.scopeId === skipped.scope.id) ?? []);
          expect(snapshotTree(installedRoot(h, target))).toEqual(priorNative);
          const priorAttempts = new Set(prior?.attempts.map(row => row.id) ?? []);
          const newAttempts = after.attempts.filter(row => !priorAttempts.has(row.id));
          expect(newAttempts.length > 0).toBe(true);
          expect(newAttempts.every(row => !row.scopeIds.includes(skipped.scope.id) && row.journal.every(entry => entry.scopeId !== skipped.scope.id))).toBe(true);
          expect(after.attempts.filter(row => priorAttempts.has(row.id))).toEqual(prior?.attempts ?? []);
          expect(after.scopes.some(row => row.id === delivered.scope.id)).toBe(true);
          const deliveredRoot = join(h.storePath(target), 'plugins', target === 'cursor' ? 'local' : 'managed', 'delivered-review');
          expect(readFileSync(join(deliveredRoot, 'skills/review/SKILL.md'), 'utf8')).toBe(skill);
          expect(result.ambient.after).toEqual(result.ambient.before);
        });
      }, 30_000);
    }

    for (const blocker of ['recovery', 'adoption']) {
      test(`a ${blocker} refusal preserves the settled skip sibling in a valid failing batch report`, async () => {
        await withLifecycleCliHarness(h => {
          const env = nativeEnv(h, 'cursor');
          const blockedSource = h.source('blocked-source', blocker === 'adoption' ? {
            'marketplace.json': JSON.stringify({ name: 'catalog', plugins: [{ source: './plugins/blocker' }] }),
            'plugins/blocker/plugin.json': '{"name":"blocker","version":"1.0.0"}',
            'plugins/blocker/skills/review/SKILL.md': skill,
          } : {
            'plugin.json': '{"name":"blocker","version":"1.0.0"}',
            'skills/review/SKILL.md': skill,
          });
          reportFor(h.run(['sync', blockedSource, '--target', 'cursor', '--json'], { env }));
          const ledgerFile = join(h.home, 'state.json');
          if (blocker === 'recovery') {
            const state: LifecycleStateV2 = JSON.parse(readFileSync(ledgerFile, 'utf8'));
            const attempt = state.attempts[0]!;
            attempt.phase = 'applying';
            attempt.mutationStarted = true;
            const row = attempt.journal[0]!;
            row.state = 'applying';
            delete row.sealedOperation;
            delete row.settlement;
            writeFileSync(ledgerFile, JSON.stringify(state));
          } else {
            const row = readState(ledgerFile)[0]!;
            writeFileSync(join(h.storePath('cursor'), 'plugins/local/blocker/.plgnz-install.json'), JSON.stringify({
              source: blockedSource, pluginId: 'blocker@catalog', fingerprint: row.fingerprint,
            }));
            writeFileSync(ledgerFile, JSON.stringify({ version: 1, installs: [{ ...row, id: 'blocker@catalog', pending: 'install' }] }));
          }
          const skippedSource = h.source('skipped-sibling', agents);
          const batch = join(h.root, 'refused-batch.json');
          writeFileSync(batch, JSON.stringify({ schemaVersion: 1, entries: [
            { operation: 'sync', source: { kind: 'local', locator: skippedSource }, target: { kind: target, instance: 'default' } },
            { operation: 'sync', source: { kind: 'local', locator: blockedSource }, target: { kind: 'cursor', instance: 'default' },
              ...(blocker === 'adoption' ? { selectors: [{ package: 'blocker', adoptExisting: true }] } : {}) },
          ] }));
          const result = h.run(['sync', '--manifest', batch, '--json'], { env });
          expect(result.exitCode !== 0).toBe(true);
          const report = parseLifecycleReport(JSON.parse(result.stdout));
          expect(report.summary.result === 'converged').toBe(false);
          expect(report.summary.mutationStarted).toBe(false);
          expect(report.outcomes).toHaveLength(2);
          const skipped = report.outcomes.find(row => row.package === packageName)!;
          expect(skipped.result).toBe('skipped');
          expect(skipped.changed).toBe(false);
          expect(skipped.ignoredComponents).toEqual(['agents']);
          expect(report.outcomes.find(row => row.package === 'blocker')!.result === 'succeeded').toBe(false);
          if (blocker === 'recovery') expect(report.recovery!.receipts[0]!.status).toBe('pending');
          expectNoMutation(result);
        });
      }, 30_000);
    }

    const nativeManifest = target === 'cursor' ? '.cursor-plugin/plugin.json' : 'kimi.plugin.json';
    const invalidNativeInputs: Record<string, Record<string, string>> = {
      'malformed-json': { [nativeManifest]: '{"name":' },
      agent: { [nativeManifest]: JSON.stringify({ name: packageName, version: '1.0.0', agent: '../outside-agent.md' }) },
      agents: { [nativeManifest]: JSON.stringify({ name: packageName, version: '1.0.0', agents: '../outside-agent.md' }) },
      ...(target === 'cursor'
        ? { 'stale-version': { [nativeManifest]: JSON.stringify({ name: packageName, version: '0.9.0' }) } }
        : {
          'invalid-skills': { [nativeManifest]: JSON.stringify({ name: packageName, version: '1.0.0', skills: '../outside' }) },
          'invalid-commands': { [nativeManifest]: JSON.stringify({ name: packageName, version: '1.0.0', commands: './elsewhere/' }) },
          'legacy-json': { '.kimi-plugin/plugin.json': '{"name":' },
          'legacy-mcp': { '.kimi-plugin/plugin.json': JSON.stringify({ mcpServers: [] }) },
          'missing-commands': { [nativeManifest]: JSON.stringify({ name: packageName, version: '1.0.0', commands: './commands/' }) },
          'root-executables': { 'plugin.json': JSON.stringify({ name: packageName, version: '1.0.0', executables: {} }) },
        }),
    };
    for (const [defect, files] of Object.entries(invalidNativeInputs)) {
      test(`agent-only ${defect} native manifest input fails rather than bypassing validation as a skip`, async () => {
        await withLifecycleCliHarness(h => {
          const source = h.source('invalid-native', {
            'plugin.json': manifest,
            'agents/reviewer.md': agent,
            ...files,
          });
          const original = snapshotTree(source);
          const result = h.run(['install', source, '--target', target, '--json'], { env: nativeEnv(h, target) });
          expect(result.exitCode !== 0).toBe(true);
          const report = parseLifecycleReport(JSON.parse(result.stdout));
          expect(report.summary.result === 'converged').toBe(false);
          expect(report.summary.mutationStarted).toBe(false);
          expect(report.outcomes.some(row => row.result === 'skipped')).toBe(false);
          expectNoMutation(result);
          expect(result.state.after).toBeUndefined();
          expect(snapshotTree(source)).toEqual(original);
        });
      }, 30_000);
    }

    test('a secondary recognized manifest cannot retain an executable agent reference after mixed projection', async () => {
      await withLifecycleCliHarness(h => {
        const secondary = target === 'cursor' ? '.codex-plugin/plugin.json' : '.plugin/plugin.json';
        const source = h.source('secondary-manifest', {
          ...mixed,
          [secondary]: JSON.stringify({ name: packageName, version: '1.0.0', agents: './agents/' }),
        });
        const original = snapshotTree(source);
        const result = h.run(['install', source, '--target', target, '--json'], { env: nativeEnv(h, target) });
        expect(result.exitCode !== 0).toBe(true);
        const report = parseLifecycleReport(JSON.parse(result.stdout));
        expect(report.summary.result === 'converged').toBe(false);
        expect(report.summary.mutationStarted).toBe(false);
        expectNoMutation(result);
        expect(result.state.after).toBeUndefined();
        expect(snapshotTree(source)).toEqual(original);
      });
    }, 30_000);
    for (const [dialect, files] of Object.entries(agentPackages)) {
      test(`${dialect} agent-only dry-run, install, repeat, add and sync warn without native or ledger writes`, async () => {
        await withLifecycleCliHarness(h => {
          const env = nativeEnv(h, target);
          const source = h.source('agents-only', files);
          const original = snapshotTree(source);
          for (const args of [
            ['install', source, '--dry-run'],
            ['install', source],
            ['install', source],
            ['add', source],
            ['sync', source],
          ]) {
            const result = h.run([...args, '--target', target, '--json'], { env });
            expectSkipped(result, target);
            expect(result.state.before).toBeUndefined();
            expect(result.state.after).toBeUndefined();
            expect(existsSync(h.storePath(target))).toBe(false);
          }
          expect(snapshotTree(source)).toEqual(original);
        });
      }, 30_000);
    }

    test('reference assets cannot turn ignored agents into a delivered package or erase resource capability checks', async () => {
      await withLifecycleCliHarness(h => {
        const env = nativeEnv(h, target);
        const source = h.source('agents-and-resources', {
          ...agents,
          'resources/reference.txt': 'Reference material\n',
        });
        const original = snapshotTree(source);
        const result = h.run(['install', source, '--target', target, '--json'], { env });
        if (target === 'cursor') {
          expectSkipped(result, target);
        } else {
          expect(result.exitCode).toBe(1);
          const report = parseLifecycleReport(JSON.parse(result.stdout));
          expect(report.summary.result).toBe('incomplete');
          expect(report.summary.mutationStarted).toBe(false);
          const diagnostics = [report.summary.reason?.diagnostic, ...report.outcomes.map(outcome => outcome.reason?.diagnostic)].join('\n');
          expect(diagnostics).toMatch(/resources/i);
          expectNoMutation(result);
        }
        expect(result.state.after).toBeUndefined();
        expect(existsSync(h.storePath(target))).toBe(false);
        expect(snapshotTree(source)).toEqual(original);
      });
    }, 30_000);

    for (const verb of ['add', 'install', 'sync']) {
      test(`${verb} delivers mixed skills but excludes agents and retains the original source snapshot`, async () => {
        await withLifecycleCliHarness(h => {
          const env = nativeEnv(h, target);
          const source = h.source('mixed', mixed);
          const original = snapshotTree(source);
          const result = h.run([verb, source, '--target', target, '--json'], { env });
          const report = reportFor(result);
          expect(report.summary.result).toBe('converged');
          expect(report.outcomes).toHaveLength(1);
          expect(report.outcomes[0]!.result).toBe('succeeded');
          expect(report.outcomes[0]!.ignoredComponents).toEqual(['agents']);
          if (report.command.name === 'add') {
            expect(report.verification!.operations[0]!.ignoredComponents).toEqual(['agents']);
          }
          expectWarning(result, target);
          const root = installedRoot(h, target);
          expect(readFileSync(join(root, 'skills/review/SKILL.md'), 'utf8')).toBe(skill);
          expect(existsSync(join(root, 'agents'))).toBe(false);
          expect(existsSync(join(root, 'plugnz.agents.json'))).toBe(false);
          const nativePaths = Object.keys(result.stores[target].after.files);
          expect(nativePaths.some(path => /(^|\/)agents\//.test(path) || path.endsWith('plugnz.agents.json'))).toBe(false);
          const state = projectedState(result.state.after!, h.home);
          expect(state.installs).toHaveLength(1);
          expect(state.installs[0]!.host).toBe(target);
          expect(state.installs[0]!.pending).toBeUndefined();
          expect(snapshotTree(source)).toEqual(original);
          const fingerprint = report.command.sourceSnapshots[0]!.reference.fingerprint;
          const cachedFiles = snapshotTree(h.home).files;
          for (const [path, bytes] of Object.entries(original.files)) {
            const cachedPath = Object.keys(cachedFiles).find(candidate => candidate.endsWith(`/source-snapshots/${fingerprint}/${path}`));
            expect(cachedPath === undefined).toBe(false);
            expect(cachedFiles[cachedPath!]).toEqual(bytes);
          }
          expect(result.ambient.after).toEqual(result.ambient.before);
        });
      }, 30_000);
    }

    test('mixed canonical agent roots are excluded from the installed skill package', async () => {
      await withLifecycleCliHarness(h => {
        const env = nativeEnv(h, target);
        const source = h.source('canonical-mixed', {
          'plugin.json': manifest,
          'skills/review/SKILL.md': skill,
          'agents/reviewer.md': agent,
          '.claude/agents/other.md': agent.replace('name: reviewer', 'name: other'),
        });
        const original = snapshotTree(source);
        const result = h.run(['install', source, '--target', target, '--json'], { env });
        const report = reportFor(result);
        expect(report.outcomes[0]!.result).toBe('succeeded');
        expect(report.outcomes[0]!.ignoredComponents).toEqual(['agents']);
        expectWarning(result, target);
        const root = installedRoot(h, target);
        expect(readFileSync(join(root, 'skills/review/SKILL.md'), 'utf8')).toBe(skill);
        expect(existsSync(join(root, 'agents'))).toBe(false);
        expect(existsSync(join(root, '.claude/agents'))).toBe(false);
        expect(snapshotTree(source)).toEqual(original);
      });
    }, 30_000);

    test('update and sync to agent-only retain the last working package and exact ledger bytes', async () => {
      await withLifecycleCliHarness(h => {
        const env = nativeEnv(h, target);
        const source = h.source('transition', mixed);
        const installed = h.run(['install', source, '--target', target, '--json'], { env });
        reportFor(installed);
        expect(installed.state.after === undefined).toBe(false);
        const priorNative = installed.stores[target].after;
        const priorLedger = installed.state.after;
        rmSync(join(source, 'skills'), { recursive: true });
        for (const args of [
          ['update', packageName, '--dry-run'],
          ['update', packageName],
          ['update', packageName],
          ['sync', source],
        ]) {
          const result = h.run([...args, '--target', target, '--json'], { env });
          expectSkipped(result, target);
          expect(result.state.after).toEqual(priorLedger);
          expect(result.stores[target].after).toEqual(priorNative);
          expect(readFileSync(join(installedRoot(h, target), 'skills/review/SKILL.md'), 'utf8')).toBe(skill);
        }
      });
    }, 30_000);

    for (const payload of ['agents-only', 'mixed']) {
      test(`malformed portable agents in ${payload} packages fail before native or ledger writes`, async () => {
        await withLifecycleCliHarness(h => {
          const env = nativeEnv(h, target);
          const source = h.source('malformed', {
            ...(payload === 'mixed' ? mixed : agents),
            'agents/reviewer.md': 'Missing required portable frontmatter.\n',
          });
          const original = snapshotTree(source);
          const result = h.run(['install', source, '--target', target, '--json'], { env });
          expect(result.exitCode !== 0).toBe(true);
          const report = parseLifecycleReport(JSON.parse(result.stdout));
          expect(report.summary.result === 'converged').toBe(false);
          expect(report.summary.mutationStarted).toBe(false);
          expectNoMutation(result);
          expect(result.state.after).toBeUndefined();
          expect(snapshotTree(source)).toEqual(original);
        });
      }, 30_000);
    }

    test('skipping agents does not discard an unrelated unsupported invocation policy', async () => {
      await withLifecycleCliHarness(h => {
        const env = nativeEnv(h, target);
        const unsupported: Record<string, string> = target === 'cursor'
          ? { 'commands/locked.toml': 'description = "Locked"\nuser-invocable = false\nprompt = "Review."\n' }
          : { 'skills/review/SKILL.md': skill.replace('description: Review a change', 'description: Review a change\nuser-invocable: false') };
        const source = h.source('unsupported', { ...mixed, ...unsupported });
        const result = h.run(['install', source, '--target', target, '--json'], { env });
        expect(result.exitCode).toBe(1);
        const report = parseLifecycleReport(JSON.parse(result.stdout));
        expect(report.summary.result).toBe('incomplete');
        expect(report.summary.mutationStarted).toBe(false);
        const diagnostics = [report.summary.reason?.diagnostic, ...report.outcomes.map(outcome => outcome.reason?.diagnostic)].join('\n');
        expect(diagnostics).toMatch(/user.invoc/i);
        expectNoMutation(result);
        expect(result.state.after).toBeUndefined();
      });
    }, 30_000);

    test('an unrelated native failure remains a failure when the package also contains agents', async () => {
      await withLifecycleCliHarness(h => {
        const env = nativeEnv(h, target);
        const source = h.source('native-failure', {
          ...mixed,
          ...(target === 'cursor' ? { '.cursor-plugin/plugin.json': JSON.stringify({ name: packageName, version: '0.9.0' }) } : {}),
        });
        const result = h.run(['install', source, '--target', target, '--json'], {
          env: { ...env, ...(target === 'kimi' ? { KIMI_FAIL_INSTALL: '1' } : {}) },
        });
        expect(result.exitCode !== 0).toBe(true);
        const report = parseLifecycleReport(JSON.parse(result.stdout));
        expect(report.summary.result === 'converged').toBe(false);
        const diagnostics = [report.summary.reason?.diagnostic, ...report.outcomes.map(outcome => outcome.reason?.diagnostic)].join('\n');
        expect(diagnostics).toMatch(target === 'cursor' ? /native manifest identity/i : /forced failure/i);
        expect(existsSync(join(installedRoot(h, target), 'skills/review/SKILL.md'))).toBe(false);
        if (result.state.after !== undefined) {
          expect(projectedState(result.state.after, h.home).installs.filter(record => record.pending === undefined)).toEqual([]);
        }
        expect(result.ambient.after).toEqual(result.ambient.before);
      });
    }, 30_000);
  });
}

test('Kimi native-only MCP remains deliverable when agents are excluded', async () => {
  await withLifecycleCliHarness(h => {
    const servers = { inspector: { command: process.execPath, args: ['--version'] } };
    const source = h.source('native-mcp', {
      ...agents,
      'kimi.plugin.json': JSON.stringify({ name: packageName, version: '1.0.0', mcpServers: servers }),
    });
    const result = h.run(['install', source, '--target', 'kimi', '--json'], { env: nativeEnv(h, 'kimi') });
    const report = reportFor(result);
    expect(report.outcomes[0]!.result).toBe('succeeded');
    expect(report.outcomes[0]!.ignoredComponents).toEqual(['agents']);
    const root = installedRoot(h, 'kimi');
    expect(JSON.parse(readFileSync(join(root, 'kimi.plugin.json'), 'utf8')).mcpServers).toEqual(servers);
    expect(existsSync(join(root, 'agents'))).toBe(false);
    expectWarning(result, 'kimi');
  });
}, 30_000);
