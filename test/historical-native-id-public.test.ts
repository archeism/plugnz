import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { projectedState, withLifecycleCliHarness } from './lifecycle-cli-harness';

import { historicalCli, nativeFixture } from './fixtures/historical-plugnz-75d/runtime';

for (const badLastBatch of [false, true]) {
  for (const legacyClaim of ['modern', 'v1', 'v1-missing-path']) {
  test(`historical physical Native-ID migration blocks globally without duplicate installs, badLastBatch=${badLastBatch}, legacyClaim=${legacyClaim}`, async () => {
    await withLifecycleCliHarness(h => {
      h.writeHome({ '.zcode/cli/.keep': '' });
      const source = h.source('catalog', {
        '.claude-plugin/marketplace.json': JSON.stringify({ name: 'catalog', plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        'plugins/demo/plugin.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
        'plugins/demo/skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo\ndisable-model-invocation: true\n---\nSee [notes](notes.txt).\n',
        'plugins/demo/skills/demo/notes.txt': 'authentic old resource\n',
      });
      const env = { OPEN_PLUGIN_ZCODE_CLI_BIN: nativeFixture(h.home) };
      const old = h.run(['sync', source, '--target', 'zcode-cli', '--json'], { env, cliArtifact: historicalCli(h.home) });
      expect(old.exitCode).toBe(0);
      expect(parseLifecycleReport(JSON.parse(old.stdout)).outcomes[0]!.nativeId).toBe('demo@catalog');
      if (legacyClaim !== 'modern') {
        // This is an honestly weaker v1 claim projected from the actual old
        // installation. It invents no modern Scope or ownership authority.
        const projected = projectedState(old.state.after!, h.home);
        const installs = projected.installs.map(row => {
          const claim = { ...row };
          if (legacyClaim === 'v1-missing-path') delete claim.sourceDir;
          return claim;
        });
        h.writeHome({ 'state.json': JSON.stringify({ version: 1, installs }) });
      }
      let args = ['sync', source, '--target', 'zcode-cli'];
      if (badLastBatch) {
        const good = h.source('new-package', { 'plugin.json': '{"name":"fresh","version":"1.0.0"}', 'skills/fresh/SKILL.md': '---\nname: fresh\ndescription: Fresh\n---\nFresh bytes.\n' });
        const manifest = join(h.home, 'sync.json');
        writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [good, source].map(locator => ({ operation: 'sync', source: { kind: 'local', locator }, target: { kind: 'zcode-cli', instance: 'default' } })) }));
        args = ['sync', '--manifest', manifest];
      }
      for (const preview of [true, false]) {
        const current = h.run([...args, ...(preview ? ['--dry-run'] : []), '--json'], { env });
        const report = parseLifecycleReport(JSON.parse(current.stdout));
        expect(current.exitCode).toBe(1);
        expect(report.summary.reason?.code).toBe('internal.invariant');
        expect(report.summary.reason?.diagnostic).toContain('native identity');
        expect(report.summary.mutationStarted).toBe(false);
        expect(report.outcomes).toEqual([]);
        expect(current.state.after).toEqual(current.state.before);
        expect(current.stores).toEqual(Object.fromEntries(Object.entries(current.stores).map(([host, store]) => [host, { before: store.before, after: store.before }])));
      }
    });
  }, 30_000);
  }
}
