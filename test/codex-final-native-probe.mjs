// Actual released-native proof. Invoke only in its disposable Sandbox.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { captureSurfaces } from './codex-final-native-surfaces.mjs';

const [phase, name, revision] = process.argv.slice(2);
assert(['bootstrap', 'refresh', 'native-exit', 'foreign-checkout'].includes(phase));
assert(['rollback', 'foreign'].includes(name));
assert(/^[a-f0-9]{40}$/.test(revision));
const base = '/vercel/sandbox/codex-final-proof';
const root = join(base, name), home = join(root, 'home'), codexHome = join(home, '.codex');
const native = '/vercel/sandbox/native-tools/node_modules/.bin/codex';
const artifact = join(base, 'plugnz-candidate.mjs');
const source = 'https://github.com/archeism/plugnz.git#finish/codex-native-proof-final-fixture';
const sha = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha(readFileSync(artifact)), 'd82ecd244e9d06647f7ea528ae614fa5bd0face7042f5e1ae3fa7f680e99d1dd');
const caps = readFileSync('/proc/self/status', 'utf8').split('\n').filter(line => /^Cap(Inh|Prm|Eff|Bnd|Amb):/.test(line));
assert.equal(caps.length, 5); assert(caps.every(line => /\s0+$/.test(line)), caps.join('\n'));
if (phase === 'bootstrap') { assert(!existsSync(root)); mkdirSync(codexHome, { recursive: true }); }
const streamsPath = join(root, 'streams.json');
const streams = existsSync(streamsPath) ? JSON.parse(readFileSync(streamsPath, 'utf8')) : [];
const env = {
  ...process.env, HOME: home, CODEX_HOME: codexHome, OPEN_PLUGIN_HOME: home,
  OPEN_PLUGIN_CODEX_HOME: codexHome, OPEN_PLUGIN_CODEX_BIN: native,
  OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', PLGNZ_PROOF_ROOT: root,
};
const started = Date.now(), cpu = process.cpuUsage();
function command(label, executable, args, allowed = [0]) {
  const began = Date.now();
  const result = spawnSync(executable, args, { env, cwd: root, encoding: 'utf8', timeout: 150_000, maxBuffer: 4 * 1024 * 1024 });
  streams.push({ label, args, status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, elapsedMs: Date.now() - began });
  writeFileSync(streamsPath, JSON.stringify(streams, null, 2));
  assert(allowed.includes(result.status), `${label}: ${result.status}\n${result.stdout}\n${result.stderr}`);
  return result;
}
assert.equal(command('actual-version', native, ['--version']).stdout.trim(), 'codex-cli 0.162.0');
if (phase === 'bootstrap') {
  command('actual-marketplace-config', native, ['plugin', 'marketplace', 'add', 'https://github.com/archeism/plugnz.git', '--ref', revision, '--json']);
  const data = join(codexHome, 'plugins/data/lifecycle-probe/keep.txt');
  mkdirSync(dirname(data), { recursive: true }); writeFileSync(data, 'valuable runtime data\n');
} else {
  const file = join(codexHome, 'config.toml'), config = readFileSync(file, 'utf8');
  assert.equal((config.match(/ref = "[a-f0-9]{40}"/g) ?? []).length, 1);
  writeFileSync(file, config.replace(/ref = "[a-f0-9]{40}"/, `ref = "${revision}"`));
}
const faulting = phase === 'native-exit' || phase === 'foreign-checkout';
if (faulting) {
  writeFileSync(join(root, 'fault.json'), JSON.stringify({ mode: phase }));
  const wrapper = join(base, 'codex-final-native-boundary.mjs');
  chmodSync(wrapper, 0o755); env.OPEN_PLUGIN_CODEX_BIN = wrapper;
}
const before = captureSurfaces(codexHome);
const result = command(`public-${phase}`, process.execPath, [artifact, 'sync', source, '--target', 'codex', '--json'], faulting ? [1] : [0]);
const report = JSON.parse(result.stdout), after = captureSurfaces(codexHome);
writeFileSync(join(root, `${phase}-report.json`), JSON.stringify(report, null, 2));
if (!faulting) {
  assert.equal(report.summary.result, 'converged');
  assert.equal(report.outcomes.length, 1);
  assert.equal(report.outcomes[0].route, phase === 'bootstrap' ? 'managed' : 'native');
  assert.equal(report.outcomes[0].activationState, 'active-conforming');
  if (phase === 'refresh') {
    assert.equal(command('actual-checkout-head', 'git', ['-C', join(codexHome, '.tmp/marketplaces/plugnz-proof'), 'rev-parse', 'HEAD']).stdout.trim(), revision);
    assert.notEqual(after.cache, before.cache);
  }
} else {
  const boundary = JSON.parse(readFileSync(join(root, 'native-boundary-result.json'), 'utf8'));
  assert.equal(boundary.status, 1, 'require the actual native nonzero exit');
  assert.match(boundary.stderr, /permission denied|Permission denied|os error 13/);
  assert.equal(report.summary.mutationStarted, true);
  assert.equal(report.summary.result, 'incomplete');
  if (phase === 'native-exit') {
    assert.deepEqual(after, before, 'public adapter must restore all bounded prior surfaces');
    assert.equal(report.summary.failureCategory, 'runtime');
    assert.equal(report.summary.recoveryId, null, 'native failure rollback must settle');
    assert.notEqual(boundary.postCallSurfaces.checkout, before.checkout, 'native failure must actually advance checkout');
  } else {
    assert.deepEqual(after, boundary.postCallSurfaces, 'foreign state must survive without any rollback restore write');
    assert.notEqual(report.summary.recoveryId, null, 'foreign rollback refusal remains pending');
    assert.equal(readFileSync(join(codexHome, '.tmp/marketplaces/plugnz-proof/foreign-proof.txt'), 'utf8'), 'foreign writer after the actual native exit\n');
  }
}
assert.equal(readFileSync(join(codexHome, 'plugins/data/lifecycle-probe/keep.txt'), 'utf8'), 'valuable runtime data\n');
const evidence = { phase, source, revision, artifactSha256: sha(readFileSync(artifact)), before, after, summary: report.summary, caps, wallMs: Date.now() - started, cpuMicroseconds: process.cpuUsage(cpu) };
writeFileSync(join(root, `${phase}-result.json`), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
