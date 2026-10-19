// Opt-in, credential-free released Codex proof. Run with Bun; retains its isolated evidence.
// bun test/codex-addy-native-probe.mjs /absolute/codex /absolute/neutral-bundle
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const [binary, bundle, evidenceDirectory] = process.argv.slice(2);
assert(binary && bundle, 'provide actual Codex binary and Personal neutral bundle');
const version = spawnSync(binary, ['--version'], { encoding: 'utf8' }).stdout.trim();
const evidenceRoot = evidenceDirectory ? resolve(evidenceDirectory) : tmpdir();
mkdirSync(evidenceRoot, { recursive: true });
const root = mkdtempSync(join(evidenceRoot, 'codex-addy-native-'));
const home = join(root, 'home'), ch = join(home, '.codex');
mkdirSync(ch, { recursive: true });
const source = resolve(bundle, 'plugins/addy');
const started = Date.now();
const cpuStart = process.cpuUsage();
// Deliberately use an allowlist: no authentication environment or real HOME is inherited.
const env = { PATH: process.env.PATH, HOME: home, CODEX_HOME: ch, LANG: 'C.UTF-8', OPENAI_API_KEY: '' };
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const sync = spawnSync(process.execPath, [cli, 'sync', resolve(bundle), '--target', 'codex', '--json'], { cwd: root, env: { ...env, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_CODEX_HOME: ch, OPEN_PLUGIN_CODEX_BIN: binary }, encoding: 'utf8', timeout: 30000 });
writeFileSync(join(root, 'public-sync.stdout.json'), sync.stdout);
writeFileSync(join(root, 'public-sync.stderr.txt'), sync.stderr);
assert.equal(sync.status, 0, sync.stdout + sync.stderr);
const syncReport = JSON.parse(sync.stdout);
assert.equal(syncReport.summary.result, 'converged');
const child = spawn(binary, ['app-server'], { env, cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '', id = 0;
const pending = new Map();
child.stderr.resume();
child.stdout.on('data', chunk => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const value = JSON.parse(line), item = pending.get(value.id);
    if (item) { pending.delete(value.id); clearTimeout(item.timer); value.error ? item.reject(value.error) : item.resolve(value.result); }
  }
});
const call = (method, params) => new Promise((resolve, reject) => {
  const key = id++;
  const timer = setTimeout(() => { pending.delete(key); reject(new Error(`timeout: ${method}`)); }, 20000);
  pending.set(key, { resolve, reject, timer });
  child.stdin.write(JSON.stringify({ id: key, method, params }) + '\n');
});
let discovery;
try {
  await call('initialize', { clientInfo: { name: 'addy-native-proof', version: '1' }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  discovery = await call('skills/list', { cwds: [root], forceReload: true });
} finally { child.kill('SIGKILL'); }
const group = discovery.data.find(item => item.cwd === root);
assert.deepEqual(group.errors, []);
const skills = group.skills.filter(item => item.pluginId === 'addy@personal');
assert.equal(skills.length, 34);
writeFileSync(join(root, 'discovery.json'), JSON.stringify(discovery, null, 2));
const requests = [];
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: async req => {
  requests.push(JSON.parse(await req.text()));
  return new Response(JSON.stringify({ error: { message: 'local native request captured' } }), { status: 400 });
} });
writeFileSync(join(ch, 'config.toml'), readFileSync(join(ch, 'config.toml'), 'utf8') + `\n[model_providers.probe]\nname="Probe"\nbase_url="http://127.0.0.1:${server.port}/v1"\nwire_api="responses"\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=0\n`);
async function capture(prompt) {
  const proc = spawn(binary, ['exec', '--skip-git-repo-check', '--model', 'gpt-5.4', '-c', 'model_provider="probe"', prompt], { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.resume(); proc.stderr.resume();
  const timer = setTimeout(() => proc.kill('SIGKILL'), 20000);
  await new Promise(resolve => proc.on('close', resolve)); clearTimeout(timer);
}
try { await capture('Say hello'); await capture('$addy:ship'); } finally { server.stop(); }
assert.equal(requests.length, 2);
const automatic = JSON.stringify(requests[0].input), explicit = JSON.stringify(requests[1].input);
assert(automatic.includes('addy:incremental-implementation'));
const commands = readdirSync(join(source, 'commands')).filter(name => name.endsWith('.toml')).map(name => name.slice(0, -5));
const automaticCommands = commands.filter(name => automatic.includes(`- addy:${name}:`));
assert.deepEqual(automaticCommands, []);
assert(!automatic.includes('Persona names are not assumed to be registered tools or agent types'));
assert(explicit.includes('Persona names are not assumed to be registered tools or agent types'));
assert(explicit.includes('../../agents/<persona>.md'));
assert(explicit.includes('code-reviewer') && explicit.includes('security-auditor') && explicit.includes('test-engineer'));
writeFileSync(join(root, 'requests.json'), JSON.stringify(requests, null, 2));
const installed = join(ch, 'plugins/cache/personal/addy/0.1.0');
const personaFiles = readdirSync(join(source, 'agents')).filter(name => name.endsWith('.md')).sort();
assert.equal(personaFiles.length, 4);
const personas = personaFiles.map(name => {
  const original = readFileSync(join(source, 'agents', name));
  const path = resolve(installed, 'skills/ship', '../../agents', name);
  assert.deepEqual(readFileSync(path), original);
  return { path: `agents/${name}`, sha256: createHash('sha256').update(original).digest('hex') };
});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = { script_sha256: sha256(readFileSync(fileURLToPath(import.meta.url))), cli_source_sha256: sha256(readFileSync(cli)), public_sync: { exit_code: sync.status, result: syncReport.summary.result, report: join(root, 'public-sync.stdout.json'), source_snapshots: syncReport.command.sourceSnapshots }, date: new Date().toISOString(), cli_version: version, native_skill_count: skills.length, native_load_errors: group.errors, automatic_command_catalog: automaticCommands, explicit_ship_injected: true, persona_adaptation_injected: true, personas, elapsed_ms: Date.now() - started, model_calls: 0, token_usage: 0, resource_evidence: { runner_cpu_microseconds: process.cpuUsage(cpuStart), runner_max_rss_kib: process.resourceUsage().maxRSS, child_cpu_and_peak_memory: 'not measured', disk_kib: Number(spawnSync('du', ['-sk', root], { encoding: 'utf8' }).stdout.split(/\s+/)[0]) }, evidence_local: root, scope: 'Actual native discovery and outbound prompt capture; resource resolution and byte preservation checked locally. No model inference or dedicated native role registration claimed.' };
writeFileSync(join(root, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
