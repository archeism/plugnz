import { expect, test } from 'bun:test';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { kimiNativeEnv } from './kimi-fixture';
import { parseLifecycleReport } from '../src/lifecycle-report';

test('Kimi native install stays Native on immediate preview and unchanged retry without admitting updates', async () => {
  await withLifecycleCliHarness((harness) => {
    harness.writeHome({ '.kimi-code/.keep': '' });
    const source = harness.source('kimi-repeat', {
      'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\n\nBody.\n',
    });
    const env = kimiNativeEnv(harness.home);
    const binary = env.OPEN_PLUGIN_KIMI_BIN!;
    writeFileSync(binary, readFileSync(binary, 'utf8').replace('#!/usr/bin/env bun', `#!${process.execPath}`));
    const installed = harness.run(['sync', source, '--target', 'kimi', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(installed.stdout)).outcomes[0]!.route).toBe('native');
    for (const dryRun of [true, false]) {
      const result = harness.run(['sync', source, '--target', 'kimi', ...(dryRun ? ['--dry-run'] : []), '--json'], { env });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect({ exitCode: result.exitCode, reasons: report.outcomes.map(row => row.reason) }).toEqual({ exitCode: 0, reasons: [null] });
      expect(report.summary.reason).toBe(null);
      expect(report.outcomes[0]!.action).toBe('unchanged');
      expect(report.outcomes[0]!.route).toBe('native');
      expect(report.summary.mutationStarted).toBe(false);
      expect(result.stores.kimi.after).toEqual(result.stores.kimi.before);
      if (dryRun) expect(result.state.after).toEqual(result.state.before);
    }
    const nativeSkill = join(harness.home, '.kimi-code/plugins/managed/demo/skills/demo/SKILL.md');
    const priorSkill = readFileSync(nativeSkill, 'utf8');
    writeFileSync(nativeSkill, `${priorSkill}\nNative drift.\n`);
    const drift = harness.run(['sync', source, '--target', 'kimi', '--json'], { env });
    expect(drift.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(drift.stdout)).outcomes[0]!.action).toBe('retain-prior');
    expect(drift.stores.kimi.after).toEqual(drift.stores.kimi.before);
    writeFileSync(nativeSkill, priorSkill);
    const registryPath = join(harness.home, '.kimi-code/plugins/installed.json');
    const registryBefore = readFileSync(registryPath, 'utf8');
    const registry = JSON.parse(registryBefore);
    const unknownRoot = join(harness.home, 'unknown-kimi-root');
    cpSync(registry.plugins[0].root, unknownRoot, { recursive: true });
    registry.plugins[0].root = unknownRoot;
    writeFileSync(registryPath, JSON.stringify(registry));
    const unknown = harness.run(['sync', source, '--target', 'kimi', '--dry-run', '--json'], { env });
    expect(unknown.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(unknown.stdout)).outcomes[0]!.action).toBe('retain-prior');
    expect(unknown.stores.kimi.after).toEqual(unknown.stores.kimi.before);
    expect(unknown.state.after).toEqual(unknown.state.before);
    writeFileSync(registryPath, registryBefore);
    for (const args of [['update', 'demo', '--target', 'kimi', '--json'], ['sync', source, '--target', 'kimi', '--json']]) {
      if (args[0] === 'sync') writeFileSync(`${source}/plugin.json`, '{"name":"demo","version":"1.0.0","description":"changed"}\n');
      const refused = harness.run(args, { env });
      expect(refused.exitCode).toBe(1);
      expect(parseLifecycleReport(JSON.parse(refused.stdout)).outcomes[0]!.reason!.code).toBe('capability.unsupported');
      expect(refused.stores.kimi.after).toEqual(refused.stores.kimi.before);
    }
  });
}, 20_000);
