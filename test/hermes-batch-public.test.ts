import { expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLifecycleCliHarness, bytesToText, snapshotTree } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { hermesPublicRuntime } from './hermes-runtime-fixture';

test('public lifecycle preserves two Hermes physical contexts through apply, update and offline retirement', async () => {
  await withLifecycleCliHarness(harness => {
    hermesPublicRuntime(harness);
    const source = harness.source('hermes-context-source', {
      'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"demo","version":"1.0.0"}\n',
      'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nfirst\n',
    });
    const targets = ['work', 'personal'].map(instance => {
      const root = join(harness.home, `hermes-${instance}`);
      return { kind: 'hermes', instance, context: { root, configPath: join(root, 'config.yaml') } };
    });
    harness.writeHome({
      'hermes-work/config.yaml': 'model: work-preserved\n',
      'hermes-personal/config.yaml': 'model: personal-preserved\n',
      '.hermes/config.yaml': 'model: unused-default\n',
    });
    const unused = snapshotTree(join(harness.home, '.hermes'));
    const manifest = join(harness.source('hermes-context-manifest', {}), 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: targets.map(target => ({
      operation: 'sync', source: { kind: 'local', locator: source }, target,
    })) }));
    const installed = harness.run(['sync', '--manifest', manifest, '--json']);
    const report = parseLifecycleReport(JSON.parse(installed.stdout));
    expect({ code: installed.exitCode, reasons: report.outcomes.map(row => row.reason) }).toEqual({ code: 0, reasons: [null, null] });
    const state = JSON.parse(bytesToText(installed.state.after!));
    expect(state.scopes.map((scope: { target: unknown }) => scope.target)).toEqual(targets);
    for (const target of targets) {
      expect(existsSync(join(target.context.root, 'plugins/demo/plugin.json'))).toBe(true);
      expect(readFileSync(target.context.configPath, 'utf8')).toContain(`${target.instance}-preserved`);
    }
    const beforeRebind = targets.map(target => snapshotTree(target.context.root));
    const reboundManifest = join(harness.source('hermes-rebound-manifest', {}), 'manifest.json');
    const rebound = { ...targets[0]!, context: { root: join(harness.home, 'hermes-other'), configPath: join(harness.home, 'hermes-other/config.yaml') } };
    harness.writeHome({ 'hermes-other/config.yaml': 'model: unused-rebind\n' });
    writeFileSync(reboundManifest, JSON.stringify({ schemaVersion: 1, entries: [targets[1]!, rebound].map(target => ({
      operation: 'sync', source: { kind: 'local', locator: source }, target,
    })) }));
    const refused = harness.run(['sync', '--manifest', reboundManifest, '--json']);
    expect(refused.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(refused.stdout)).summary.reason?.diagnostic).toContain('target context changed');
    expect(refused.state.after).toEqual(refused.state.before);
    expect(targets.map(target => snapshotTree(target.context.root))).toEqual(beforeRebind);
    expect(existsSync(join(rebound.context.root, 'plugins'))).toBe(false);
    writeFileSync(join(source, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: demo\n---\nsecond\n');
    const updated = harness.run(['sync', '--manifest', manifest, '--json']);
    expect(updated.exitCode).toBe(0);
    for (const target of targets) expect(readFileSync(join(target.context.root, 'plugins/demo/skills/demo/SKILL.md'), 'utf8')).toContain('second');
    const personalBefore = snapshotTree(targets[1]!.context.root);
    rmSync(source, { recursive: true });
    const scopeId = report.outcomes.find(row => row.scope.target.instance === 'work')!.scope.id;
    const retired = harness.run(['retire-source', scopeId, '--target', 'hermes', '--instance', 'work', '--json']);
    expect(retired.exitCode).toBe(0);
    expect(existsSync(join(targets[0]!.context.root, 'plugins/demo/plugin.json'))).toBe(false);
    expect(snapshotTree(targets[1]!.context.root)).toEqual(personalBefore);
    expect(snapshotTree(join(harness.home, '.hermes'))).toEqual(unused);
  });
});
