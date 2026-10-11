import { expect, test } from 'bun:test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

/** Native boundary double proves public planning/transaction policy, not released CLI behavior. */
test('same-revision native cache drift repairs through an explicitly planned Managed migration', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.codex/.keep': '' });
    const locator = 'https://github.com/example/proof.git';
    const source = harness.source('git-proof', {
      '.claude-plugin/marketplace.json': JSON.stringify({ name: 'proof-market', plugins: [{ name: 'demo', source: './plugins/demo' }] }),
      'plugins/demo/plugin.json': JSON.stringify({ name: 'demo', version: '1.0.0', description: 'proof' }),
      'plugins/demo/.codex-plugin/plugin.json': JSON.stringify({ name: 'demo', version: '1.0.0', description: 'proof', skills: './skills/' }),
      'plugins/demo/payload.txt': 'desired bytes\n',
    });
    const git = (args: string[]): string => {
      const result = spawnSync('/usr/bin/git', ['-C', source, ...args], { encoding: 'utf8', env: { ...process.env, HOME: harness.home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    git(['init', '--quiet']); git(['add', '.']); git(['-c', 'user.name=Proof', '-c', 'user.email=proof@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
    const sha = git(['rev-parse', 'HEAD']);
    const gitScript = join(harness.home, 'source-git.mjs');
    const gitBin = join(harness.home, 'source-git');
    const codexScript = join(harness.home, 'native-codex.mjs');
    const codexBin = join(harness.home, 'native-codex');
    writeFileSync(gitScript, `import {spawnSync} from 'node:child_process'; const args=process.argv.slice(2).map(x=>x===${JSON.stringify(locator)}?${JSON.stringify(source)}:x); const r=spawnSync('/usr/bin/git',args,{stdio:'inherit'}); process.exit(r.status??1);`);
    writeFileSync(gitBin, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(gitScript)} "$@"\n`); chmodSync(gitBin, 0o755);
    writeFileSync(codexScript, `import {cpSync,mkdirSync,readdirSync,readFileSync,rmSync} from 'node:fs'; import {join} from 'node:path';
const args=process.argv.slice(2); if(args[0]==='--version'){console.log('codex-cli 0.162.0');process.exit(0)};
if(JSON.stringify(args)!==JSON.stringify(['plugin','marketplace','upgrade','proof-market','--json']))throw Error('unexpected native command '+JSON.stringify(args));
const root=process.env.OPEN_PLUGIN_CODEX_HOME; const prep=join(root,'.plgnz-lifecycle');
for(const name of readdirSync(prep)){const stage=join(prep,name);const marker=JSON.parse(readFileSync(join(stage,'.plgnz-install.json'),'utf8'));if(marker.route!=='native')continue;const dest=join(root,'plugins/cache/proof-market/demo/1.0.0');rmSync(dest,{recursive:true,force:true});mkdirSync(dest,{recursive:true});cpSync(stage,dest,{recursive:true})};console.log(JSON.stringify({errors:[],selectedMarketplaces:['proof-market']}));`);
    writeFileSync(codexBin, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(codexScript)} "$@"\n`); chmodSync(codexBin, 0o755);
    const env = { OPEN_PLUGIN_GIT_BIN: gitBin, OPEN_PLUGIN_CODEX_BIN: codexBin };
    const boot = harness.run(['sync', locator, '--target', 'codex', '--json'], { env });
    expect(boot.exitCode).toBe(0);
    writeFileSync(join(harness.home, '.codex/config.toml'), `[marketplaces.proof-market]\nsource_type = "git"\nsource = "${locator}"\nref = "${sha}"\n\n[plugins."demo@proof-market"]\nenabled = true\n`);
    const native = harness.run(['sync', locator, '--target', 'codex', '--json'], { env });
    if (native.exitCode !== 0) throw new Error(`native fixture failed: ${native.stdout} ${native.stderr}`);
    expect(native.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(native.stdout)).outcomes[0]!.route).toBe('native');
    const payload = join(harness.home, '.codex/plugins/cache/proof-market/demo/1.0.0/payload.txt');
    writeFileSync(payload, 'external code drift\n');
    const preview = harness.run(['sync', locator, '--target', 'codex', '--dry-run', '--json'], { env });
    const planned = parseLifecycleReport(JSON.parse(preview.stdout));
    expect(planned.plan[0]!.action).toBe('route-migrate');
    expect(planned.plan[0]!.route).toBe('managed');
    expect(preview.state.after).toEqual(preview.state.before);
    const repaired = harness.run(['sync', locator, '--target', 'codex', '--json'], { env });
    expect(repaired.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(repaired.stdout)).outcomes[0]!.route).toBe('managed');
    expect(readFileSync(payload, 'utf8')).toBe('desired bytes\n');
    const marker = JSON.parse(readFileSync(join(harness.home, '.codex/plugins/cache/proof-market/demo/1.0.0/.plgnz-install.json'), 'utf8'));
    expect(marker.scopeId).toBe(planned.plan[0]!.scope.id);
    expect(marker.sourceRevision).toBe(sha);
    expect(marker.source).toBe(locator);
  });
}, 20_000);
