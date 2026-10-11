import { expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';
import { parseLifecycleReport } from '../src/lifecycle-report';
import captured from './fixtures/prior-git-source/producer-88d89c5.json';
import otherHosts from './fixtures/prior-git-source/other-hosts-88d89c5.json';
import { repoRoot } from './util';
import { hermesPublicRuntime } from './hermes-runtime-fixture';

// Frozen stores and ledger captured from an actual 88d89c5 CLI install, not a
// ledger fabricated to make the new route selectable. Only absolute home paths
// are substituted. Git transport and native version/lock boundaries are local.
const homes: Record<string, Record<string, string>> = { ...captured.homes, ...otherHosts.homes };
const links: Record<string, Record<string, string>> = otherHosts.symlinks;
for (const host of ['hermes', 'dcode', 'codex', 'claude-code', 'cursor', 'omp'] as const) {
  for (const mode of ['same-bytes', 'changed-bytes', 'missing-ledger', 'dirty-prior', 'foreign-source', 'foreign-native-origin', 'recovery-after-apply', 'killed-before-apply'] as const) {
    if ((mode === 'recovery-after-apply' || mode === 'killed-before-apply') && host !== 'dcode') continue;
    test(`${host} historical Git provenance ${mode}`, async () => {
      await withLifecycleCliHarness(async harness => {
        if (host === 'hermes') hermesPublicRuntime(harness);
        const files = homes[host]!;
        harness.writeHome(Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, bytes.replaceAll('{{HOME}}', harness.home)])));
        for (const [path, target] of Object.entries(links[host] ?? {})) {
          mkdirSync(dirname(join(harness.home, path)), { recursive: true });
          symlinkSync(target.replaceAll('{{HOME}}', harness.home), join(harness.home, path));
        }
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
        const probes: Record<string, string> = { OPEN_PLUGIN_CODEX_BIN: 'codex-cli 0.162.0', OPEN_PLUGIN_CLAUDE_CODE_BIN: '2.1.295 (Claude Code)', OPEN_PLUGIN_CURSOR_BIN: '2.4.0', OPEN_PLUGIN_OMP_BIN: '18.1.4' };
        const nativeEnv: Record<string, string> = {};
        for (const [key, version] of Object.entries(probes)) {
          const path = join(harness.home, key);
          writeFileSync(path, `#!/bin/sh\necho '${version}'\n`); chmodSync(path, 0o755); nativeEnv[key] = path;
        }
        const env = { ...nativeEnv, OPEN_PLUGIN_GIT_BIN: bin, OPEN_PLUGIN_DCODE_BIN: dcode, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root) };
        const markerPath = Object.keys(files).find(path => path.endsWith('/.plgnz-install.json'))!;
        const payloadPath = join(harness.home, markerPath.replace('.plgnz-install.json', 'payload.txt'));
        if (mode === 'missing-ledger') rmSync(join(harness.home, 'state.json'));
        if (mode === 'dirty-prior') writeFileSync(payloadPath, 'external drift\n');
        if (mode === 'foreign-native-origin') {
          const path = join(harness.home, markerPath);
          const marker = JSON.parse(readFileSync(path, 'utf8'));
          marker.source = 'https://github.com/example/foreign.git';
          if (host === 'hermes' || host === 'cursor' || host === 'omp') marker.sourceLocator = marker.source;
          writeFileSync(path, JSON.stringify(marker));
        }
        const preview = harness.run(['sync', locator, '--target', host, '--dry-run', '--json'], { env });
        const shouldRepair = mode === 'same-bytes' || mode === 'changed-bytes' || mode === 'recovery-after-apply' || mode === 'killed-before-apply';
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
        let interruptedAttempt: string | undefined;
        if (mode === 'killed-before-apply') {
          const counter = join(harness.home, 'probe-counter');
          const signal = join(harness.home, 'hold-before-apply');
          const holding = join(harness.home, 'holding-version');
          writeFileSync(holding, `#!/bin/sh\nn=0\nif [ -f '${counter}' ]; then n=$(cat '${counter}'); fi\nn=$((n+1))\nprintf '%s' "$n" > '${counter}'\nif [ "$n" -eq 3 ]; then printf ready > '${signal}'; sleep 2; fi\necho 'deepagents-code 0.1.83'\n`); chmodSync(holding, 0o755);
          const executable = process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] || process.execPath;
          const cli = join(repoRoot, process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] ? 'dist/plugnz.mjs' : 'bin/plugnz.mjs');
          const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OPEN_PLUGIN_')));
          const child = spawn(executable, [cli, 'sync', locator, '--target', host, '--json'], { cwd: harness.root, env: { ...inherited, ...env, OPEN_PLUGIN_DCODE_BIN: holding, HOME: harness.home, OPEN_PLUGIN_HOME: harness.home, OPEN_PLUGIN_DCODE_ROOT: join(harness.home, '.deepagents'), XDG_CACHE_HOME: join(harness.home, '.cache'), XDG_CONFIG_HOME: join(harness.home, '.config'), XDG_DATA_HOME: join(harness.home, '.local/share') }, stdio: 'ignore' }) as unknown as { kill(signal: string): void; on(event: 'exit', callback: () => void): void; on(event: 'error', callback: (error: Error) => void): void };
          let killed = false;
          const watcher = watch(harness.home, (_event, name) => { if (name === 'hold-before-apply') { killed = true; child.kill('SIGSTOP'); child.kill('SIGKILL'); } });
          const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
          try { await new Promise<void>((resolve, reject) => { child.on('exit', () => resolve()); child.on('error', reject); }); }
          finally { watcher.close(); clearTimeout(timeout); }
          expect(killed).toBe(true);
          expect(readFileSync(join(harness.home, markerPath), 'utf8')).toBe(files[markerPath]);
          const pending = JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8'));
          interruptedAttempt = pending.attempts.at(-1).id;
          expect(pending.attempts.at(-1).journal[0].state).toBe('applying');
          expect(pending.attempts.at(-1).journal[0].sealedOperation.sourceLocator).toBe(captured.sourceLocator);
        }
        if (mode === 'recovery-after-apply') {
          const fault = join(harness.home, '.deepagents/.state/.plgnz-dcode-readback-fault');
          const native = harness.fakeNative('failing-repair', Array.from({ length: 16 }, (_, index) => ({ args: ['--version'], stdout: 'deepagents-code 0.1.83\n', ...(index === 2 ? { writes: { [fault]: 'fault\n' } } : {}) })));
          const failed = harness.run(['sync', locator, '--target', host, '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: native.path } });
          const failedReport = parseLifecycleReport(JSON.parse(failed.stdout));
          expect(failedReport.outcomes[0]!.result).toBe('pending');
          const pending = JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8'));
          interruptedAttempt = pending.attempts.find((row: { id: string; journal: { operationId: string }[] }) => row.journal.some(entry => entry.operationId === failedReport.outcomes[0]!.operationId)).id;
          expect(pending.attempts.find((row: { id: string }) => row.id === interruptedAttempt).journal[0].sealedOperation.sourceLocator).toBe(captured.sourceLocator);
          rmSync(fault);
        }
        const repaired = harness.run(['sync', locator, '--target', host, '--json'], { env });
        if (repaired.exitCode !== 0) throw new Error(repaired.stdout + repaired.stderr);
        expect(repaired.exitCode).toBe(0);
        expect(parseLifecycleReport(JSON.parse(repaired.stdout)).outcomes[0]!.result).toBe('succeeded');
        const installedMarker = Object.entries(repaired.stores[host].after.files).find(([path]) => path.endsWith('/.plgnz-install.json'))!;
        const marker = JSON.parse(String.fromCharCode(...installedMarker[1]));
        expect(marker.source).toBe(captured.sourceLocator);
        if (host === 'claude-code') expect(JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8')).activations[0].sourceRevision).toBe(sha);
        else expect(marker.sourceRevision).toBe(sha);
        if (host === 'hermes') expect(readFileSync(payloadPath, 'utf8')).toBe(mode === 'changed-bytes' ? 'V2\n' : 'V1\n');
        if (interruptedAttempt !== undefined) {
          const after = JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8'));
          expect(after.attempts.find((row: { id: string }) => row.id === interruptedAttempt).journal[0].state).toBe('rolled-back');
          expect(after.activations[0].pending).toBeUndefined();
        }
      });
    }, 20_000);
  }
}
