import { expect, test } from 'bun:test';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';
import { parseLifecycleReport } from '../src/lifecycle-report';
import captured from './fixtures/prior-git-source/producer-88d89c5.json';

// Frozen stores and ledger captured from an actual 88d89c5 CLI install, not a
// ledger fabricated to make the new route selectable. Only absolute home paths
// are substituted. Git transport and native version/lock boundaries are local.
for (const host of ['hermes', 'dcode'] as const) {
  for (const mode of ['same-bytes', 'changed-bytes', 'missing-ledger', 'dirty-prior', 'foreign-source', 'foreign-native-origin'] as const) {
    test(`${host} historical Git provenance ${mode}`, async () => {
      await withLifecycleCliHarness(harness => {
        const files = captured.homes[host];
        harness.writeHome(Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, bytes.replaceAll('{{HOME}}', harness.home)])));
        const source = harness.source('git', { 'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"demo","version":"1.0.0"}', 'payload.txt': mode === 'changed-bytes' ? 'V2\n' : 'V1\n' });
        const git = (args: string[]): string => {
          const result = spawnSync('/usr/bin/git', ['-C', source, ...args], { encoding: 'utf8', env: { ...process.env, HOME: harness.home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
          if (result.status !== 0) throw new Error(result.stderr);
          return result.stdout.trim();
        };
        git(['init', '--quiet']); git(['add', '.']); git(['-c', 'user.name=Proof', '-c', 'user.email=proof@example.invalid', 'commit', '--quiet', '-m', 'desired']);
        const sha = git(['rev-parse', 'HEAD']);
        const script = join(harness.home, 'source-git.mjs');
        const bin = join(harness.home, 'source-git');
        const locator = mode === 'foreign-source' ? 'https://github.com/example/foreign.git' : captured.sourceLocator;
        writeFileSync(script, `import {spawnSync} from 'node:child_process'; const args=process.argv.slice(2).map(x=>x===${JSON.stringify(locator)}?${JSON.stringify(source)}:x); const r=spawnSync('/usr/bin/git',args,{stdio:'inherit'}); process.exit(r.status??1);`);
        writeFileSync(bin, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`); chmodSync(bin, 0o755);
        // Version probing can occur more than once; use an unlimited local probe.
        const dcode = join(harness.home, 'dcode-version');
        writeFileSync(dcode, '#!/bin/sh\necho "deepagents-code 0.1.83"\n'); chmodSync(dcode, 0o755);
        const env = { OPEN_PLUGIN_GIT_BIN: bin, OPEN_PLUGIN_DCODE_BIN: dcode, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
        const markerPath = Object.keys(files).find(path => path.endsWith('/.plgnz-install.json'))!;
        const payloadPath = join(harness.home, markerPath.replace('.plgnz-install.json', 'payload.txt'));
        if (mode === 'missing-ledger') rmSync(join(harness.home, 'state.json'));
        if (mode === 'dirty-prior') writeFileSync(payloadPath, 'external drift\n');
        if (mode === 'foreign-native-origin') {
          const path = join(harness.home, markerPath);
          const marker = JSON.parse(readFileSync(path, 'utf8'));
          marker.source = 'https://github.com/example/foreign.git';
          if (host === 'hermes') marker.sourceLocator = marker.source;
          writeFileSync(path, JSON.stringify(marker));
        }
        const preview = harness.run(['sync', locator, '--target', host, '--dry-run', '--json'], { env });
        const shouldRepair = mode === 'same-bytes' || mode === 'changed-bytes';
        expect(preview.exitCode).toBe(shouldRepair ? 0 : 1);
        expect(preview.state.after).toEqual(preview.state.before);
        expect(preview.stores[host].after).toEqual(preview.stores[host].before);
        if (!shouldRepair) {
          const refused = harness.run(['sync', locator, '--target', host, '--json'], { env });
          expect(refused.exitCode).toBe(1);
          expect(refused.state.after).toEqual(refused.state.before);
          expect(refused.stores[host].after).toEqual(refused.stores[host].before);
          return;
        }
        expect(parseLifecycleReport(JSON.parse(preview.stdout)).plan[0]!.action).toBe('update');
        const repaired = harness.run(['sync', locator, '--target', host, '--json'], { env });
        if (repaired.exitCode !== 0) throw new Error(repaired.stdout + repaired.stderr);
        expect(repaired.exitCode).toBe(0);
        expect(parseLifecycleReport(JSON.parse(repaired.stdout)).outcomes[0]!.result).toBe('succeeded');
        const installedMarker = Object.entries(repaired.stores[host].after.files).find(([path]) => path.endsWith('/.plgnz-install.json'))!;
        const marker = JSON.parse(String.fromCharCode(...installedMarker[1]));
        expect(marker.source).toBe(captured.sourceLocator);
        expect(marker.sourceRevision).toBe(sha);
        if (host === 'hermes') expect(readFileSync(payloadPath, 'utf8')).toBe(mode === 'changed-bytes' ? 'V2\n' : 'V1\n');
      });
    }, 20_000);
  }
}
