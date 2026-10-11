import { expect, test } from 'bun:test';
import { chmodSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { which } from '../src/runtime';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { projectedState, withLifecycleCliHarness } from './lifecycle-cli-harness';

const COMPRESSED_SHA = '1a49ed61123091f662ba7d65aeda66aed381d455a20c203a5cf85582123add6f';
const UNPACKED_SHA = '68395da67885a85a2ba4715864b2d8b81bec7ffe01a95ef59c20e42207449ab3';

function historicalCli(home: string): { executable: string; entrypoint: string } {
  const executable = process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] || which('node');
  if (executable === null) throw new Error('Historical public CLI proof requires Node 22+');
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0 || Number(/^v(\d+)/u.exec(version.stdout)?.[1] ?? 0) < 22) throw new Error('Historical public CLI proof requires Node 22+');
  const entrypoint = join(home, 'historical-plugnz.mjs');
  const unpack = spawnSync(executable, ['--input-type=module', '-e', `
    import {readFileSync,writeFileSync} from 'node:fs';
    import {createHash} from 'node:crypto'; import {gunzipSync} from 'node:zlib';
    const compressed=readFileSync(process.argv[1]);
    const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
    if(compressed.length>500*1024||hash(compressed)!==process.argv[3])throw Error('Historical compressed artifact checksum/size mismatch');
    const raw=gunzipSync(compressed,{maxOutputLength:2*1024*1024});
    if(hash(raw)!==process.argv[4])throw Error('Historical raw artifact checksum mismatch');
    writeFileSync(process.argv[2],raw,{flag:'wx',mode:0o700});
  `, join(import.meta.dir, 'fixtures/historical-plugnz-75d/plugnz.mjs.gz'), entrypoint, COMPRESSED_SHA, UNPACKED_SHA], { encoding: 'utf8' });
  if (unpack.status !== 0) throw new Error(unpack.stderr);
  return { executable, entrypoint };
}

function nativeFixture(home: string): string {
  const binary = join(home, 'zcode-native-fixture');
  writeFileSync(binary, `#!${process.execPath}
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';import{dirname,join}from'node:path';
const args=process.argv.slice(2),root=join(process.env.ZCODE_STORAGE_DIR,'cli');
const read=(f,d)=>existsSync(f)?JSON.parse(readFileSync(f,'utf8')):d;
const save=(f,d)=>{mkdirSync(dirname(f),{recursive:true});writeFileSync(f,JSON.stringify(d));};
if(args[0]==='--version'){console.log('0.16.9');process.exit(0);}
if(args[0]==='doctor'){console.log(JSON.stringify({cli:{name:'zcode',processName:'zcode-cli'}}));process.exit(0);}
const markets=join(root,'plugins/known_marketplaces.json');
if(args[1]==='marketplace'&&args[2]==='add'){const path=args[3],manifest=read(join(path,'marketplace.json'),null);save(markets,{...read(markets,{}),[manifest.name]:path});process.exit(0);}
if(args[1]==='install'||args[1]==='update'){const id=args[2],[name,market]=id.split('@'),plugin=join(read(markets,{})[market],'plugins',name),manifest=read(join(plugin,'.zcode-plugin/plugin.json'),null),cache=join(root,'plugins/cache',market,name,manifest.version.replaceAll('+','-'));mkdirSync(dirname(cache),{recursive:true});cpSync(plugin,cache,{recursive:true});const file=join(root,'plugins/installed_plugins.json'),rows=read(file,{version:1,plugins:[]});rows.plugins=rows.plugins.filter(row=>row.id!==id);rows.plugins.push({id,name,marketplace:market,version:manifest.version,installPath:cache,scope:'user'});save(file,rows);const config=join(root,'config.json'),settings=read(config,{plugins:{enabledPlugins:{},options:{}}});settings.plugins.enabledPlugins[id]=true;save(config,settings);process.exit(0);}
process.exit(91);
`);
  chmodSync(binary, 0o755);
  return binary;
}

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
