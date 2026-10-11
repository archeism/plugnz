import { expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { kimiNativeEnv } from './kimi-fixture';
import { parseLifecycleReport } from '../src/lifecycle-report';

declare const TextDecoder: { new (): { decode(input: Uint8Array): string } };

for (const host of ['kimi', 'zcode-cli'] as const) {
  for (const sourceKind of ['git', 'local'] as const) {
  test(`${host} ${sourceKind} native install preserves canonical Source and scope on unchanged sync`, async () => {
    await withLifecycleCliHarness(harness => {
      harness.writeHome({ [host === 'kimi' ? '.kimi-code/.keep' : '.zcode/cli/.keep']: '' });
      const source = harness.source('git-native', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n', 'skills/demo/SKILL.md': host === 'zcode-cli' ? '---\nname: demo\ndescription: demo\ndisable-model-invocation: true\n---\n\nSee [notes](notes.txt).\n' : '---\nname: demo\ndescription: demo\n---\n\nBody.\n', ...(host === 'zcode-cli' ? { 'skills/demo/notes.txt': 'original resource\n' } : {}) });
      const git = (args: string[]) => {
        const result = spawnSync('/usr/bin/git', ['-C', source, ...args], { encoding: 'utf8', env: { ...process.env, HOME: harness.home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
        if (result.status !== 0) throw new Error(result.stderr);
        return result.stdout.trim();
      };
      if (sourceKind === 'git') { git(['init', '--quiet']); git(['add', '.']); git(['-c', 'user.name=Proof', '-c', 'user.email=proof@example.invalid', 'commit', '--quiet', '-m', 'V1']); }
      const locator = 'https://github.com/example/native-proof.git';
      const transport = join(harness.home, 'git-transport');
      writeFileSync(transport, `#!${process.execPath}\nimport {spawnSync} from 'node:child_process'; const args=process.argv.slice(2).map(x=>x===${JSON.stringify(locator)}?${JSON.stringify(source)}:x); const r=spawnSync('/usr/bin/git',args,{stdio:'inherit'}); process.exit(r.status??1);`); chmodSync(transport, 0o755);
      let nativeEnv: Record<string, string>;
      if (host === 'kimi') {
        nativeEnv = kimiNativeEnv(harness.home);
        const binary = nativeEnv.OPEN_PLUGIN_KIMI_BIN!;
        writeFileSync(binary, readFileSync(binary, 'utf8').replace('#!/usr/bin/env bun', `#!${process.execPath}`));
      } else {
        const binary = join(harness.home, 'zcode-native');
        writeFileSync(binary, `#!${process.execPath}
import {cpSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs'; import {dirname,join} from 'node:path';
const args=process.argv.slice(2),root=join(process.env.ZCODE_STORAGE_DIR,'cli');
const read=(file,otherwise)=>existsSync(file)?JSON.parse(readFileSync(file,'utf8')):otherwise;
const save=(file,value)=>{mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value));};
if(args[0]==='--version'){console.log('0.16.9');process.exit(0);}
if(args[0]==='doctor'){console.log(JSON.stringify({cli:{name:'zcode',processName:'zcode-cli'}}));process.exit(0);}
if(args[1]==='update'&&process.env.ZCODE_FAIL_UPDATE==='1'){console.error('forced native update failure');process.exit(1);}
const markets=join(root,'plugins/known_marketplaces.json');
if(args[1]==='marketplace'){if(args[2]==='add'){const path=args[3],manifest=read(join(path,'marketplace.json'),null); save(markets,{...read(markets,{}),[manifest.name]:path});}process.exit(0);}
if(args[1]==='install'||args[1]==='update'){const id=args[2],[name,market]=id.split('@'),plugin=join(read(markets,{})[market],'plugins',name),manifest=read(join(plugin,'.zcode-plugin/plugin.json'),null),cache=join(root,'plugins/cache',market,name,manifest.version.replaceAll('+','-'));rmSync(cache,{recursive:true,force:true});mkdirSync(dirname(cache),{recursive:true});cpSync(plugin,cache,{recursive:true});const registry=join(root,'plugins/installed_plugins.json'),rows=read(registry,{version:1,plugins:[]});rows.plugins=rows.plugins.filter(row=>row.id!==id);rows.plugins.push({id,name,marketplace:market,version:manifest.version,installPath:cache,scope:'user'});save(registry,rows);const file=join(root,'config.json'),config=read(file,{plugins:{enabledPlugins:{},options:{}}});config.plugins.enabledPlugins[id]=true;save(file,config);process.exit(0);}
process.exit(91);
`); chmodSync(binary, 0o755);
        nativeEnv = { OPEN_PLUGIN_ZCODE_CLI_BIN: binary };
      }
      const env = { ...nativeEnv, OPEN_PLUGIN_GIT_BIN: transport };
      const input = sourceKind === 'git' ? locator : source;
      const installed = harness.run(['sync', input, '--target', host, '--json'], { env });
      const installedReport = parseLifecycleReport(JSON.parse(installed.stdout));
      expect({ exitCode: installed.exitCode, reason: installedReport.summary.reason, outcomes: installedReport.outcomes.map(row => row.reason) }).toEqual({ exitCode: 0, reason: null, outcomes: [null] });
      expect(installedReport.outcomes[0]!.route).toBe('native');
      const nativeId = installedReport.outcomes[0]!.nativeId;
      for (const dryRun of [true, false]) {
        const result = harness.run(['sync', input, '--target', host, ...(dryRun ? ['--dry-run'] : []), '--json'], { env });
        const report = parseLifecycleReport(JSON.parse(result.stdout));
        expect({ exitCode: result.exitCode, reason: report.summary.reason }).toEqual({ exitCode: 0, reason: null });
        expect(report.outcomes[0]!.action).toBe('unchanged');
        expect(report.outcomes[0]!.nativeId).toBe(nativeId);
        expect(result.stores[host].after).toEqual(result.stores[host].before);
        if (dryRun) expect(result.state.after).toEqual(result.state.before);
      }
      if (host === 'zcode-cli') {
        const markerRelative = Object.keys(installed.stores[host].after.files).find(path => path.endsWith('/.plgnz-install.json') && path.startsWith('plugins/cache/'))!;
        const marker = JSON.parse(readFileSync(join(harness.storePath(host), markerRelative), 'utf8'));
        const resource = join(marker.resourcePath, 'skills/demo/notes.txt');
        writeFileSync(resource, 'external resource drift\n');
        const preview = harness.run(['sync', input, '--target', host, '--dry-run', '--json'], { env });
        expect(preview.exitCode).toBe(0);
        expect(parseLifecycleReport(JSON.parse(preview.stdout)).outcomes[0]!.action).toBe('update');
        expect(preview.stores[host].after).toEqual(preview.stores[host].before);
        const sharedConfigPath = join(harness.storePath(host), 'config.json');
        const sharedConfig = JSON.parse(readFileSync(sharedConfigPath, 'utf8'));
        sharedConfig.plugins.options['foreign-user-plugin'] = { untouched: 'user-owned options' };
        sharedConfig.foreignUserSetting = { untouched: true };
        writeFileSync(sharedConfigPath, JSON.stringify(sharedConfig));
        const failed = harness.run(['sync', input, '--target', host, '--json'], { env: { ...env, ZCODE_FAIL_UPDATE: '1' } });
        expect(failed.exitCode).toBe(1);
        expect(parseLifecycleReport(JSON.parse(failed.stdout)).summary.mutationStarted).toBe(true);
        for (const prefix of ['plugins/cache/', 'plgnz-resources/']) {
          const selected = (files: Record<string, number[]>) => Object.fromEntries(Object.entries(files).filter(([path]) => path.startsWith(prefix)));
          expect(selected(failed.stores[host].after.files)).toEqual(selected(failed.stores[host].before.files));
        }
        for (const file of ['config.json', 'plugins/installed_plugins.json', 'plugins/known_marketplaces.json']) {
          expect(JSON.parse(readFileSync(join(harness.storePath(host), file), 'utf8'))).toEqual(JSON.parse(new TextDecoder().decode(new Uint8Array(failed.stores[host].before.files[file]!))));
        }
        expect(Object.keys(failed.stores[host].after.files).filter(path => path.startsWith('.plgnz-zcode-stage/'))).toEqual([]);
        expect(readFileSync(resource, 'utf8')).toBe('external resource drift\n');
        const repaired = harness.run(['sync', input, '--target', host, '--json'], { env });
        expect(repaired.exitCode).toBe(0);
        expect(parseLifecycleReport(JSON.parse(repaired.stdout)).outcomes[0]!.changed).toBe(true);
        expect(readFileSync(resource, 'utf8')).toBe('original resource\n');
        const retainedRoot = join(harness.home, 'retained-resource-prior');
        renameSync(marker.resourcePath, retainedRoot);
        const missing = harness.run(['sync', input, '--target', host, '--json'], { env });
        expect(missing.exitCode).toBe(0);
        expect(parseLifecycleReport(JSON.parse(missing.stdout)).outcomes[0]!.action).toBe('update');
        expect(readFileSync(resource, 'utf8')).toBe('original resource\n');
        const goodRoot = join(harness.home, 'retained-resource-candidate');
        renameSync(marker.resourcePath, goodRoot);
        const foreignRoot = join(harness.home, 'foreign-resource'); mkdirSync(foreignRoot);
        writeFileSync(join(foreignRoot, 'untouched'), 'foreign user bytes\n');
        symlinkSync(foreignRoot, marker.resourcePath);
        const redirected = harness.run(['sync', input, '--target', host, '--json'], { env });
        expect(redirected.exitCode).toBe(1);
        expect(parseLifecycleReport(JSON.parse(redirected.stdout)).summary.mutationStarted).toBe(false);
        expect(redirected.stores[host].after).toEqual(redirected.stores[host].before);
        expect(redirected.state.after).toEqual(redirected.state.before);
        expect(readFileSync(join(foreignRoot, 'untouched'), 'utf8')).toBe('foreign user bytes\n');
        rmSync(marker.resourcePath); renameSync(goodRoot, marker.resourcePath);
      }
      if (sourceKind === 'git') {
        const markerRelative = Object.keys(installed.stores[host].after.files).find(path => path.endsWith('/.plgnz-install.json') && (host === 'kimi' || path.startsWith('plugins/cache/')))!;
        const markerPath = join(harness.storePath(host), markerRelative);
        const original = readFileSync(markerPath, 'utf8');
        for (const invalid of ['foreign-origin', 'foreign-scope', 'invalid-revision'] as const) {
          const marker = JSON.parse(original);
          if (invalid === 'foreign-origin') marker[host === 'kimi' ? 'source' : 'sourceLocator'] = 'https://github.com/example/foreign.git';
          if (invalid === 'foreign-scope') marker.scopeId = 'foreign-scope';
          if (invalid === 'invalid-revision') marker[host === 'kimi' ? 'fingerprint' : 'sourceRevision'] = 'not-an-immutable-Git-revision';
          writeFileSync(markerPath, JSON.stringify(marker));
          const refused = harness.run(['sync', input, '--target', host, '--json'], { env });
          expect(refused.exitCode).toBe(1);
          expect(parseLifecycleReport(JSON.parse(refused.stdout)).summary.mutationStarted).toBe(false);
          expect(refused.stores[host].after).toEqual(refused.stores[host].before);
          expect(refused.state.after).toEqual(refused.state.before);
        }
        writeFileSync(markerPath, original);
      }
      writeFileSync(join(source, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: demo\n---\n\nChanged.\n');
      if (sourceKind === 'git') { git(['add', '.']); git(['-c', 'user.name=Proof', '-c', 'user.email=proof@example.invalid', 'commit', '--quiet', '-m', 'V2']); }
      const changed = harness.run(['sync', input, '--target', host, '--json'], { env });
      const changedReport = parseLifecycleReport(JSON.parse(changed.stdout));
      expect(changed.exitCode).toBe(host === 'kimi' ? 1 : 0);
      expect(changedReport.outcomes[0]!.action).toBe(host === 'kimi' ? 'retain-prior' : 'update');
      expect(changedReport.outcomes[0]!.nativeId).toBe(nativeId);
      if (host === 'kimi') expect(changed.stores[host].after).toEqual(changed.stores[host].before);
      if (host === 'zcode-cli') {
        const data = join(harness.home, '.zcode/cli/plugins/data', nativeId!, 'user.txt');
        mkdirSync(join(data, '..'), { recursive: true }); writeFileSync(data, 'retained user data\n');
        const configPath = join(harness.home, '.zcode/cli/config.json');
        const config = JSON.parse(readFileSync(configPath, 'utf8')); config.plugins.options[nativeId!] = { retained: true }; writeFileSync(configPath, JSON.stringify(config));
        rmSync(source, { recursive: true });
        const retired = harness.run(['retire-source', installedReport.outcomes[0]!.scope.id, '--target', host, '--json'], { env });
        expect(retired.exitCode).toBe(0);
        expect(parseLifecycleReport(JSON.parse(retired.stdout)).outcomes[0]!.action).toBe('retire-orphan');
        expect(readFileSync(data, 'utf8')).toBe('retained user data\n');
        expect(JSON.parse(readFileSync(configPath, 'utf8')).plugins.options[nativeId!]).toEqual({ retained: true });
      }
    });
  }, 60_000);
  }
}
