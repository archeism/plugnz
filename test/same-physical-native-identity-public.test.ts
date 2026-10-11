import { expect, test } from 'bun:test';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { projectedState, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { kimiNativeEnv } from './kimi-fixture';
import { writeFiles } from './util';

for (const layout of ['same-root', 'foreign-root', 'ambiguous-registry', 'foreign-source', 'foreign-source-bad-last'] as const) {
  test(`Kimi identity repair requires its exact single physical native root: ${layout}`, async () => {
    await withLifecycleCliHarness(h => {
      h.writeHome({ '.kimi-code/.keep': '' });
      const source = h.source('catalog', {
        '.claude-plugin/marketplace.json': JSON.stringify({ name: 'catalog', plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
        'plugins/demo/skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo\n---\nBody.\n',
      });
      const env = kimiNativeEnv(h.home);
      const binary = env.OPEN_PLUGIN_KIMI_BIN!;
      writeFileSync(binary, readFileSync(binary, 'utf8').replace('#!/usr/bin/env bun', `#!${process.execPath}`));
      const initial = h.run(['sync', source, '--target', 'kimi', '--json'], { env });
      expect(initial.exitCode).toBe(0);
      const root = join(h.home, '.kimi-code/plugins/managed/demo');
      const markerFile = join(root, '.plgnz-install.json');
      const marker = { ...JSON.parse(readFileSync(markerFile, 'utf8')), pluginId: 'demo' };
      if (layout === 'foreign-source' || layout === 'foreign-source-bad-last') Object.assign(marker, {
        source: `local:${'f'.repeat(64)}`, fingerprint: 'f'.repeat(64),
        sourceType: 'local', sourceRevision: 'f'.repeat(64), sourceLocator: null,
      });
      if (layout === 'foreign-source-bad-last') writeFiles(source, {
        '.claude-plugin/marketplace.json': JSON.stringify({ name: 'catalog', plugins: [
          { name: 'aaa', source: './plugins/aaa' }, { name: 'demo', source: './plugins/demo' },
        ] }),
        'plugins/aaa/plugin.json': '{"name":"aaa","version":"1.0.0"}',
        'plugins/aaa/skills/aaa/SKILL.md': '---\nname: aaa\ndescription: Earlier valid package\n---\nBody.\n',
      });
      writeFileSync(markerFile, JSON.stringify(marker));
      h.writeHome({ 'state.json': JSON.stringify({ version: 1, installs: projectedState(initial.state.after!, h.home).installs.map(row => ({ ...row, id: 'demo' })) }) });
      const registryFile = join(h.home, '.kimi-code/plugins/installed.json');
      const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
      if (layout === 'foreign-root') {
        const foreign = join(h.home, 'foreign-demo');
        renameSync(root, foreign);
        registry.plugins[0].root = foreign;
      } else if (layout === 'ambiguous-registry') {
        registry.plugins.push({ ...registry.plugins[0] });
      }
      writeFileSync(registryFile, JSON.stringify(registry));
      for (const preview of [true, false]) {
        const result = h.run(['sync', source, '--target', 'kimi', ...(preview ? ['--dry-run'] : []), '--json'], { env });
        const report = parseLifecycleReport(JSON.parse(result.stdout));
        if (layout === 'same-root') {
          expect({ exitCode: result.exitCode, reason: report.summary.reason }).toEqual({ exitCode: 0, reason: null });
          expect(report.outcomes.map(row => ({ nativeId: row.nativeId, result: row.result }))).toEqual([{ nativeId: 'demo@catalog', result: 'succeeded' }]);
          if (!preview) {
            expect(projectedState(result.state.after!, h.home).installs.map(row => row.id)).toEqual(['demo@catalog']);
            expect(JSON.parse(readFileSync(markerFile, 'utf8')).pluginId).toBe('demo@catalog');
            expect(JSON.parse(readFileSync(registryFile, 'utf8')).plugins.map((row: { root: string }) => row.root)).toEqual([root]);
          }
        } else {
          expect(result.exitCode).toBe(1);
          expect(report.summary.reason?.category).toBe('internal');
          expect(report.summary.mutationStarted).toBe(false);
          expect(report.outcomes).toEqual([]);
        }
        if (preview || layout !== 'same-root') {
          expect(result.state.after).toEqual(result.state.before);
          expect(result.stores.kimi.after).toEqual(result.stores.kimi.before);
        }
      }
    });
  }, 30_000);
}
