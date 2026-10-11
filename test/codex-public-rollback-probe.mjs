import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,relative,dirname} from 'node:path';
const root='/vercel/sandbox/codex-native-proof/public-01', home=join(root,'home'), codexHome=join(home,'.codex');
const env={...process.env,HOME:home,CODEX_HOME:codexHome,OPEN_PLUGIN_HOME:home,OPEN_PLUGIN_CODEX_HOME:codexHome,OPEN_PLUGIN_CODEX_BIN:'/vercel/sandbox/codex-native-proof/native-permission-fault.mjs',OPENAI_API_KEY:''};
const checkout=join(codexHome,'.tmp/marketplaces/plugnz-proof'), slot=join(codexHome,'plugins/cache/plugnz-proof/lifecycle-probe/0.1.0');
const streams=[];
function command(label,exe,args,allowed=[0]) { const result=spawnSync(exe,args,{env,cwd:root,encoding:'utf8',timeout:150000,maxBuffer:2*1024*1024});streams.push({label,args,status:result.status,stdout:result.stdout,stderr:result.stderr});writeFileSync(join(root,'rollback-streams.json'),JSON.stringify(streams,null,2));assert(allowed.includes(result.status),`${label}: ${result.stdout}\n${result.stderr}`);return result; }
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function tree(path) {const rows=[];const walk=dir=>{for(const name of readdirSync(dir).sort()){const file=join(dir,name),info=statSync(file);if(info.isDirectory())walk(file);else rows.push([relative(path,file),sha(readFileSync(file)),info.mode&0o111]);}};walk(path);return sha(JSON.stringify(rows));}
const data=join(codexHome,'plugins/data/lifecycle-probe-plugnz-proof/keep.txt');mkdirSync(dirname(data),{recursive:true});writeFileSync(data,'valuable native runtime data\n');
writeFileSync(join(slot,'resources/probe.txt'),'Prior observed resource drift; must survive failed update rollback.\n');
command('preseed-native-checkout-v1','git',['-C',checkout,'checkout','d42234b1adc9bac2a4d1a93d5cab26070494d751']);
const before={checkout:tree(checkout),slot:tree(slot),config:sha(readFileSync(join(codexHome,'config.toml'))),data:sha(readFileSync(data))};
const result=command('public-native-permission-failure','node',['/vercel/sandbox/plugnz-candidate.mjs','update','lifecycle-probe','--target','codex','--json'],[1]);
const report=JSON.parse(result.stdout);writeFileSync(join(root,'rollback-report.json'),JSON.stringify(report,null,2));
const after={checkout:tree(checkout),slot:tree(slot),config:sha(readFileSync(join(codexHome,'config.toml'))),data:sha(readFileSync(data))};
assert.deepEqual(after,before,'rollback must restore exact bounded surfaces');
assert.equal(command('rollback-checkout-head','git',['-C',checkout,'rev-parse','HEAD']).stdout.trim(),'d42234b1adc9bac2a4d1a93d5cab26070494d751');
assert.equal(report.summary.result,'incomplete');assert.equal(report.summary.recoveryId,null);
assert.equal(report.summary.mutationStarted,true,'must actually enter native mutation');
assert.equal(report.summary.failureCategory,'runtime','must observe native failure, not capability refusal');
writeFileSync(join(root,'rollback-result.json'),JSON.stringify({before,after,report},null,2));console.log(JSON.stringify({exactRollback:true,summary:report.summary,outcomes:report.outcomes}));
