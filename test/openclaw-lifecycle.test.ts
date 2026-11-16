import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLifecycleCliHarness, type LifecycleCliHarness } from './lifecycle-cli-harness';
import { openclawTargetProfile } from '../src/hosts/openclaw';
import { parseLifecycleReport } from '../src/lifecycle-report';

const fixture = {
  'plugin.json': '{"name":"demo","version":"1.0.0"}',
  'skills/proof/SKILL.md': '---\nname: proof\ndescription: proof\n---\nExact instructions.\n',
  'mcp.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/mcp.schema.json","mcpServers":{"proof":{"type":"stdio","command":"node","args":["${PLUGIN_ROOT}/server.mjs"]}}}',
  'server.mjs': 'process.stdin.resume();\n',
};
function native(h: LifecycleCliHarness): Record<string, string> {
  const path = h.fakeBinPath('openclaw');
  writeFileSync(path, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(path + '.mjs')} "$@"\n`); chmodSync(path, 0o755);
  writeFileSync(path + '.mjs', String.raw`
import {existsSync,readFileSync,readdirSync,writeFileSync,mkdirSync,chmodSync,statSync} from 'node:fs';import{join}from'node:path';
const a=process.argv.slice(2);if(a[0]==='--version'){console.log('OpenClaw '+(process.env.OPENCLAW_FIXTURE_VERSION??'2026.9.1')+' (ad6fe23)');process.exit(0)}
const root=process.env.OPENCLAW_STATE_DIR,cfg=process.env.OPENCLAW_CONFIG_PATH;const c=existsSync(cfg)?JSON.parse(readFileSync(cfg,'utf8')):{};const p=c.plugins??{},paths=p.load?.paths??[];
const rows=paths.filter(x=>existsSync(join(x,'plugin.json'))).map(x=>{const m=JSON.parse(readFileSync(join(x,'plugin.json'),'utf8'));const enabled=p.enabled!==false&&p.entries?.[m.name]?.enabled===true&&(!p.allow||p.allow.includes(m.name));return{id:m.name,name:m.name,version:m.version,rootDir:x,format:'bundle',bundleFormat:'agent',enabled,status:enabled?'loaded':'disabled'}});
if(a[0]==='plugins'&&a[1]==='list'){if(process.env.OPENCLAW_FIXTURE_PROTECT_FROZEN_MODE==='1'){const base=join(process.env.OPEN_PLUGIN_HOME,'cache'),protectedPaths=[];const visit=dir=>{if(!existsSync(dir))return;for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory()){if(name==='protected-cache'){chmodSync(path,0o555);protectedPaths.push(path)}else visit(path)}}};visit(base);writeFileSync(join(root,'frozen-mode-proof.json'),JSON.stringify(protectedPaths));}const ops=join(root,'.plgnz','operations');if(['prebackup','prebackup-empty'].includes(process.env.OPENCLAW_FIXTURE_INJECT)&&existsSync(ops)&&!existsSync(join(root,'injected-proof'))){for(const op of readdirSync(ops)){const slot=join(ops,op);if(existsSync(join(slot,'stage'))){mkdirSync(join(slot,'rollback'));if(process.env.OPENCLAW_FIXTURE_INJECT==='prebackup')writeFileSync(join(slot,'rollback','foreign-custody.txt'),'retain preexisting recovery bytes');writeFileSync(join(root,'injected-proof'),slot);break;}}}console.log(JSON.stringify({plugins:rows}));process.exit(0)}
if(a[0]==='plugins'&&a[1]==='inspect'){const row=rows.find(x=>x.id===a[2]);if(!row)process.exit(1);const mcp=join(row.rootDir,'mcp.json'),value=existsSync(mcp)?JSON.parse(readFileSync(mcp,'utf8')):null;const mcpServers=value?Object.keys(value.mcpServers).map(name=>({name,hasStdioTransport:true})):[];let invalid=process.env.OPENCLAW_FIXTURE_MCP_INVALID==='1';const operations=join(root,'.plgnz','operations');const active=existsSync(operations)?readdirSync(operations):[];
if(process.env.OPENCLAW_FIXTURE_INJECT==='mode-rollback'&&row.version==='2.0.0'){for(const op of active)for(const child of readdirSync(join(operations,op)))if(child.startsWith('rollback-')){const cache=join(operations,op,child,'bundle/resources/protected-cache');if(existsSync(cache))writeFileSync(join(root,'backup-mode-proof.json'),JSON.stringify(statSync(cache).mode&0o777));}invalid=true;}
if(process.env.OPENCLAW_FIXTURE_INJECT==='owned-config'&&row.version==='2.0.0'){c.plugins.entries[row.id].config={foreign:'preserve concurrent owned config'};writeFileSync(cfg,JSON.stringify(c));invalid=true;}
if(process.env.OPENCLAW_FIXTURE_INJECT==='cleanup'&&active.length){writeFileSync(join(operations,active[0],'foreign-custody.txt'),'retain foreign operation bytes');}
if(process.env.OPENCLAW_FIXTURE_INJECT==='rollback-backup'&&row.version==='2.0.0'){for(const op of active){const dir=join(operations,op);for(const child of readdirSync(dir))if(child.startsWith('rollback-')&&existsSync(join(dir,child,'bundle'))){writeFileSync(join(dir,child,'bundle','foreign-backup.txt'),'retain foreign backup bytes');invalid=true;}}}
console.log(JSON.stringify({plugin:row,mcpServers,diagnostics:invalid?[{pluginId:row.id,level:'warn',message:'invalid MCP server'}]:[]}));process.exit(0)}
process.exit(9);
`);
  return { OPEN_PLUGIN_OPENCLAW_BIN: path };
}
function cfg(h: LifecycleCliHarness): string { return join(h.storePath('openclaw'), 'openclaw.json'); }
function root(h: LifecycleCliHarness): string { return join(h.storePath('openclaw'), '.plgnz/bundles/demo'); }
function success(result: ReturnType<LifecycleCliHarness['run']>): void { if (result.exitCode !== 0) throw new Error(result.stdout + result.stderr); const r = parseLifecycleReport(JSON.parse(result.stdout)); expect(r.summary.reason).toBe(null); expect(result.exitCode).toBe(0); }

test('OpenClaw native bundle lifecycle installs, updates, and retires only owned config/resources', () => withLifecycleCliHarness(h => {
  const env = native(h), foreign = { channels: { retained: { enabled: false } }, plugins: { allow: ['foreign'], entries: { foreign: { enabled: true } }, load: { paths: ['/foreign/plugin'] } } };
  h.writeHome({ '.openclaw/openclaw.json': JSON.stringify(foreign), '.openclaw/plugin-data/demo/sentinel.txt': 'keep native data' });
  const source = h.source('bundle', fixture);
  success(h.run(['install', source, '--target', 'openclaw', '--json'], { env }));
  expect(JSON.parse(readFileSync(join(root(h), 'plugin.json'), 'utf8')).$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  expect(readFileSync(join(root(h), 'skills/proof/SKILL.md'), 'utf8')).toBe(fixture['skills/proof/SKILL.md']);
  let current = JSON.parse(readFileSync(cfg(h), 'utf8')); expect(current.channels).toEqual(foreign.channels); expect(current.plugins.entries.foreign).toEqual(foreign.plugins.entries.foreign);
  success(h.run(['update', 'demo', '--target', 'openclaw', '--json'], { env }));
  writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"2.0.0"}');
  success(h.run(['update', 'demo', '--target', 'openclaw', '--json'], { env }));
  expect(JSON.parse(readFileSync(join(root(h), 'plugin.json'), 'utf8')).version).toBe('2.0.0');
  success(h.run(['remove', 'demo', '--target', 'openclaw', '--json'], { env }));
  current = JSON.parse(readFileSync(cfg(h), 'utf8')); expect(current.channels).toEqual(foreign.channels); expect(current.plugins.entries.foreign).toEqual(foreign.plugins.entries.foreign); expect(current.plugins.load.paths).toEqual(['/foreign/plugin']); expect(current.plugins.allow).toEqual(['foreign']);
  expect(existsSync(root(h))).toBe(false); expect(readFileSync(join(h.storePath('openclaw'), 'plugin-data/demo/sentinel.txt'), 'utf8')).toBe('keep native data');
}), 30_000);

test('OpenClaw refuses foreign registration without native mutation', () => withLifecycleCliHarness(h => {
  const env = native(h), source = h.source('bundle', fixture);
  h.writeHome({ '.openclaw/openclaw.json': '{"plugins":{"entries":{"demo":{"enabled":false,"config":{"private":"keep"}}}}}' });
  const before = readFileSync(cfg(h), 'utf8');
  const refused = h.run(['install', source, '--target', 'openclaw', '--json'], { env }); expect(refused.exitCode).toBe(1); expect(readFileSync(cfg(h), 'utf8')).toBe(before);
}), 30_000);

for (const change of ([
  { 'agents/reviewer.md': '---\nname: reviewer\ndescription: review\n---\nNo qualified role.\n' },
  { 'skills/proof/SKILL.md': '---\nname: proof\ndescription: proof\ndisable-model-invocation: true\n---\nManual policy unsupported.\n' },
  { 'mcp.json': '{"mcpServers":{"proof":{"type":"stdio","command":"/absolute/node"}}}' },
] as Array<Record<string, string>>)) test('OpenClaw refuses unsupported semantics before active changes', () => withLifecycleCliHarness(h => {
  const env = native(h), source = h.source('unsupported', { ...fixture, ...change });
  const result = h.run(['install', source, '--target', 'openclaw', '--json'], { env }); expect(result.exitCode).toBe(1); expect(existsSync(root(h))).toBe(false); expect(existsSync(cfg(h))).toBe(false);
}), 30_000);

test('OpenClaw target contexts bind exact roots/configs and reject overlapping stores', () => {
  const a = openclawTargetProfile.parseSyncTarget({ kind: 'openclaw', instance: 'one', context: { root: '/profiles/one', configPath: '/configs/one.json' } }, 'target');
  const b = openclawTargetProfile.parseSyncTarget({ kind: 'openclaw', instance: 'two', context: { root: '/profiles/two', configPath: '/configs/two.json' } }, 'target');
  expect(openclawTargetProfile.overlaps(a, b)).toBe(false);
  expect(openclawTargetProfile.overlaps(a, { ...b, context: { root: '/profiles/one', configPath: '/configs/two.json' } })).toBe(true);
  expect(() => openclawTargetProfile.parseSyncTarget({ kind: 'openclaw', instance: 'named' }, 'target')).toThrow();
});

for (const operation of ['update', 'remove']) test(`OpenClaw preserves foreign resources injected into an owned bundle before ${operation}`, () => withLifecycleCliHarness(h => {
  const env = native(h), source = h.source('bundle', fixture);
  success(h.run(['install', source, '--target', 'openclaw', '--json'], { env }));
  mkdirSync(join(root(h), '.git'));
  writeFileSync(join(root(h), '.git/foreign.txt'), 'foreign content must survive');
  const before = readFileSync(cfg(h), 'utf8');
  const refused = h.run([operation, 'demo', '--target', 'openclaw', '--json'], { env });
  expect(refused.exitCode).toBe(1); expect(readFileSync(join(root(h), '.git/foreign.txt'), 'utf8')).toBe('foreign content must survive'); expect(readFileSync(cfg(h), 'utf8')).toBe(before);
}), 30_000);

test('OpenClaw failed native readback rolls back a first install', () => withLifecycleCliHarness(h => {
  const env = { ...native(h), OPENCLAW_FIXTURE_MCP_INVALID: '1' }, source = h.source('bundle', fixture);
  const result = h.run(['install', source, '--target', 'openclaw', '--json'], { env });
  expect(result.exitCode).toBe(1); expect(existsSync(root(h))).toBe(false);
}), 30_000);

test('OpenClaw cleanup preserves unknown operation artifacts', () => withLifecycleCliHarness(h => {
  const env = { ...native(h), OPENCLAW_FIXTURE_INJECT: 'cleanup' }, source = h.source('bundle', fixture);
  const result = h.run(['install', source, '--target', 'openclaw', '--json'], { env }); expect(result.exitCode).toBe(1);
  const operations = join(h.storePath('openclaw'), '.plgnz/operations');
  const paths = readdirSync(operations).map(name => join(operations, name, 'foreign-custody.txt')).filter(existsSync);
  expect(paths.length).toBeGreaterThan(0); for (const path of paths) expect(readFileSync(path, 'utf8')).toBe('retain foreign operation bytes');
}), 30_000);

test('OpenClaw rollback refuses changed backup content before deleting the active bundle', () => withLifecycleCliHarness(h => {
  const env = native(h), source = h.source('bundle', fixture);
  success(h.run(['install', source, '--target', 'openclaw', '--json'], { env }));
  writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"2.0.0"}');
  const failed = h.run(['update', 'demo', '--target', 'openclaw', '--json'], { env: { ...env, OPENCLAW_FIXTURE_INJECT: 'rollback-backup' } }); expect(failed.exitCode).toBe(1);
  expect(JSON.parse(readFileSync(join(root(h), 'plugin.json'), 'utf8')).version).toBe('2.0.0');
  const operations = join(h.storePath('openclaw'), '.plgnz/operations'); let found = false;
  for (const op of readdirSync(operations)) for (const child of readdirSync(join(operations, op))) if (child.startsWith('rollback-')) { const file = join(operations, op, child, 'bundle/foreign-backup.txt'); if (existsSync(file)) { found = true; expect(readFileSync(file, 'utf8')).toBe('retain foreign backup bytes'); } }
  expect(found).toBe(true);
}), 30_000);

test('OpenClaw rollback preserves concurrent owned-entry configuration before touching the live bundle', () => withLifecycleCliHarness(h => {
  const env = native(h), source = h.source('bundle', fixture);
  success(h.run(['install', source, '--target', 'openclaw', '--json'], { env }));
  writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"2.0.0"}');
  const result = h.run(['update', 'demo', '--target', 'openclaw', '--json'], { env: { ...env, OPENCLAW_FIXTURE_INJECT: 'owned-config' } });
  expect(result.exitCode).toBe(1); expect(JSON.parse(readFileSync(cfg(h), 'utf8')).plugins.entries.demo.config).toEqual({ foreign: 'preserve concurrent owned config' });
  expect(JSON.parse(readFileSync(join(root(h), 'plugin.json'), 'utf8')).version).toBe('2.0.0');
}), 30_000);

test('OpenClaw refuses a redirected managed parent without changing foreign files', () => withLifecycleCliHarness(h => {
  const env = native(h), source = h.source('bundle', fixture), foreign = h.source('foreign', { 'sentinel.txt': 'foreign root data' });
  mkdirSync(join(h.storePath('openclaw'), '.plgnz'), { recursive: true });
  symlinkSync(foreign, join(h.storePath('openclaw'), '.plgnz/bundles'));
  const result = h.run(['install', source, '--target', 'openclaw', '--json'], { env });
  expect(result.exitCode).toBe(1); expect(readFileSync(join(foreign, 'sentinel.txt'), 'utf8')).toBe('foreign root data'); expect(readdirSync(foreign)).toEqual(['sentinel.txt']);
}), 30_000);

test('OpenClaw retirement retains user configuration and preexisting allow membership', () => withLifecycleCliHarness(h => {
  const env = native(h), source = h.source('bundle', fixture);
  h.writeHome({ '.openclaw/openclaw.json': '{"plugins":{"allow":["demo","foreign"]}}' });
  success(h.run(['install', source, '--target', 'openclaw', '--json'], { env }));
  const current = JSON.parse(readFileSync(cfg(h), 'utf8')); current.plugins.entries.demo.config = { user: 'preserve native settings' }; writeFileSync(cfg(h), JSON.stringify(current));
  success(h.run(['remove', 'demo', '--target', 'openclaw', '--json'], { env }));
  const retired = JSON.parse(readFileSync(cfg(h), 'utf8')); expect(retired.plugins.entries.demo).toEqual({ enabled: false, config: { user: 'preserve native settings' } }); expect(retired.plugins.allow).toContain('demo'); expect(retired.plugins.allow).toContain('foreign');
}), 30_000);

for (const injection of ['prebackup', 'prebackup-empty']) test(`OpenClaw refuses preexisting rollback custody before capture: ${injection}`, () => withLifecycleCliHarness(h => {
  const env = { ...native(h), OPENCLAW_FIXTURE_INJECT: injection }, source = h.source('bundle', fixture);
  const result = h.run(['install', source, '--target', 'openclaw', '--json'], { env });
  expect(result.exitCode).toBe(1); expect(parseLifecycleReport(JSON.parse(result.stdout)).summary.mutationStarted).toBe(false); expect(existsSync(root(h))).toBe(false); expect(existsSync(cfg(h))).toBe(false);
  const operation = readFileSync(join(h.storePath('openclaw'), 'injected-proof'), 'utf8'), rollback = join(operation, 'rollback');
  expect(existsSync(rollback)).toBe(true);
  if (injection === 'prebackup') expect(readFileSync(join(rollback, 'foreign-custody.txt'), 'utf8')).toBe('retain preexisting recovery bytes');
  else expect(readdirSync(rollback)).toEqual([]);
}), 30_000);

test('OpenClaw preserves a controlled post-freeze 0555 projection through publication, backup and rollback', () => withLifecycleCliHarness(h => {
  // Shared Source materialization promises executable bits, not raw directory write bits.
  // The native fixture sets the controlled frozen package directory to 0555 before adapter staging.
  const env = { ...native(h), OPENCLAW_FIXTURE_PROTECT_FROZEN_MODE: '1' }, source = h.source('bundle', fixture), cache = join(source, 'resources/protected-cache');
  mkdirSync(cache, { recursive: true }); mkdirSync(h.storePath('openclaw'), { recursive: true });
  success(h.run(['install', source, '--target', 'openclaw', '--json'], { env }));
  expect(JSON.parse(readFileSync(join(h.storePath('openclaw'), 'frozen-mode-proof.json'), 'utf8')).length).toBeGreaterThan(0);
  expect(statSync(join(root(h), 'resources/protected-cache')).mode & 0o777).toBe(0o555);
  writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"2.0.0"}');
  const failed = h.run(['update', 'demo', '--target', 'openclaw', '--json'], { env: { ...env, OPENCLAW_FIXTURE_INJECT: 'mode-rollback' } });
  expect(failed.exitCode).toBe(1); expect(JSON.parse(readFileSync(join(h.storePath('openclaw'), 'backup-mode-proof.json'), 'utf8'))).toBe(0o555); expect(JSON.parse(readFileSync(join(root(h), 'plugin.json'), 'utf8')).version).toBe('1.0.0'); expect(statSync(join(root(h), 'resources/protected-cache')).mode & 0o777).toBe(0o555);
  success(h.run(['remove', 'demo', '--target', 'openclaw', '--json'], { env }));
}), 30_000);

test('OpenClaw public sync preserves immutable Git provenance across unchanged and updated snapshots', () => withLifecycleCliHarness(h => {
  const source = h.source('git-bundle', fixture), locator = 'https://github.com/example/openclaw-bundle.git';
  const git = (args: string[]): string => {
    const result = spawnSync('/usr/bin/git', ['-C', source, ...args], { encoding: 'utf8', env: { ...process.env, HOME: h.home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
    if (result.status !== 0) throw new Error(result.stderr); return result.stdout.trim();
  };
  git(['init', '--quiet', '--initial-branch=main']); git(['add', '.']);
  const commit = (): string => { git(['-c', 'user.name=Proof', '-c', 'user.email=proof@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Bundle snapshot']); return git(['rev-parse', 'HEAD']); };
  const firstRevision = commit();
  const script = join(h.home, 'fixture-git.mjs'), binary = join(h.home, 'fixture-git');
  // Only transport is redirected. Git creates and resolves the real local commits.
  writeFileSync(script, `import {spawnSync} from 'node:child_process'; const args=process.argv.slice(2).map(value=>value===${JSON.stringify(locator)}?${JSON.stringify(source)}:value); const result=spawnSync('/usr/bin/git',args,{stdio:'inherit'}); process.exit(result.status??1);`);
  writeFileSync(binary, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`); chmodSync(binary, 0o755);
  const env = { ...native(h), OPEN_PLUGIN_GIT_BIN: binary, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const args = ['sync', `${locator}#main`, '--target', 'openclaw', '--json'];
  success(h.run(args, { env }));
  const marker = (): Record<string, unknown> => JSON.parse(readFileSync(join(root(h), '.plgnz-install.json'), 'utf8'));
  expect(marker().sourceType).toBe('git'); expect(marker().sourceLocator).toBe(locator); expect(marker().sourceRevision).toBe(firstRevision);
  const unchanged = h.run(args, { env }); success(unchanged);
  expect(parseLifecycleReport(JSON.parse(unchanged.stdout)).outcomes[0]!.action).toBe('unchanged');
  expect(parseLifecycleReport(JSON.parse(unchanged.stdout)).outcomes[0]!.route).toBe('managed');
  writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"2.0.0"}'); git(['add', '.']); const nextRevision = commit();
  const updated = h.run(args, { env }); success(updated);
  expect(parseLifecycleReport(JSON.parse(updated.stdout)).outcomes[0]!.action).toBe('update');
  expect(marker().sourceRevision).toBe(nextRevision); expect(marker().sourceLocator).toBe(locator); expect(marker().sourceType).toBe('git');
}), 30_000);
