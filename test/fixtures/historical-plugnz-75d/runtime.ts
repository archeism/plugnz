import { chmodSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { which } from '../../../src/runtime';

const COMPRESSED_SHA = '1a49ed61123091f662ba7d65aeda66aed381d455a20c203a5cf85582123add6f';
const UNPACKED_SHA = '68395da67885a85a2ba4715864b2d8b81bec7ffe01a95ef59c20e42207449ab3';

export function historicalCli(home: string): { executable: string; entrypoint: string } {
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
  `, join(import.meta.dir, 'plugnz.mjs.gz'), entrypoint, COMPRESSED_SHA, UNPACKED_SHA], { encoding: 'utf8' });
  if (unpack.status !== 0) throw new Error(unpack.stderr);
  return { executable, entrypoint };
}

export function nativeFixture(home: string): string {
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
