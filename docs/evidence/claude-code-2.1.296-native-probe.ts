import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {claudeCodeWriter} from '../../src/hosts/claude-code-writer';
const base=mkdtempSync('/tmp/plugnz-claude296-');
const root=join(base,'profile'), source=join(base,'source');
process.env.OPEN_PLUGIN_CLAUDE_CODE_ROOT=root;
const files={ 'plugin.json':JSON.stringify({name:'profile-proof',version:'1.0.0'}), '.claude-plugin/plugin.json':JSON.stringify({name:'profile-proof',version:'1.0.0',skills:'./skills/'}), 'skills/proof/SKILL.md':'---\nname: proof\ndescription: Original profile proof\n---\nProof body original.\n','commands/check.md':'---\ndescription: Check the profile proof\n---\nProof command.\n'};
for(const [path,body] of Object.entries(files)){mkdirSync(join(source,path,'..'),{recursive:true});writeFileSync(join(source,path),body);}
const plugin={dir:source,name:'profile-proof',marketplace:'profile296',contentFingerprint:'original'};
const resolved={sourceUri:source,sha:'1.0.0',isGit:false,plugins:[plugin]};
const results:any[]=[];
function cli(args:string[]){const p=spawnSync('/Users/cfeng1/.bun/bin/claude',args,{env:{...process.env,CLAUDE_CONFIG_DIR:root},encoding:'utf8',timeout:30000});const r={args,status:p.status,stdout:p.stdout,stderr:p.stderr};results.push(r);if(p.status!==0)throw Error(JSON.stringify(r));return p.stdout;}
cli(['--version']);
await claudeCodeWriter.add(plugin,resolved);
cli(['plugin','list','--json']);
const first=cli(['plugin','details','profile-proof@profile296']);
if(!first.includes('proof')||!first.includes('check'))throw Error('original native inventory missing');
writeFileSync(join(source,'skills/proof/SKILL.md'),'---\nname: refreshed-proof\ndescription: Refreshed profile proof\n---\nProof body refreshed.\n');renameSync(join(source,'skills/proof'),join(source,'skills/refreshed-proof'));plugin.contentFingerprint='refreshed';
await claudeCodeWriter.add(plugin,resolved);
const refreshed=cli(['plugin','details','profile-proof@profile296']);
if(!refreshed.includes('refreshed-proof'))throw Error('refresh not visible');
// Recovery through restoring the frozen original source and reapplying the same slot.
renameSync(join(source,'skills/refreshed-proof'),join(source,'skills/proof'));writeFileSync(join(source,'skills/proof/SKILL.md'),files['skills/proof/SKILL.md']);plugin.contentFingerprint='original';
await claudeCodeWriter.add(plugin,resolved);
if(cli(['plugin','details','profile-proof@profile296']).includes('refreshed-proof'))throw Error('recovery failed');
await claudeCodeWriter.remove('profile-proof@profile296');
if(cli(['plugin','list','--json']).includes('profile-proof@profile296'))throw Error('retirement failed');
const receipt={recordedAt:new Date().toISOString(),base,checks:['native loader skills and commands','native registry readback','same-version refresh','original-source recovery','retirement'],results};
writeFileSync(new URL('./claude-code-2.1.296-native-20261013.json', import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({base,checks:receipt.checks}));
