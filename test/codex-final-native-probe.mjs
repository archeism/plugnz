// Actual released-native proof. Invoke only in its disposable Sandbox.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
assert.match(readFileSync('/proc/self/status', 'utf8'), /^NoNewPrivs:\s+1$/m);
if (phase === 'bootstrap') { assert(!existsSync(root)); mkdirSync(codexHome, { recursive: true }); }
const streamsPath = join(root, 'streams.json');
const streams = existsSync(streamsPath) ? JSON.parse(readFileSync(streamsPath, 'utf8')) : [];
const env = {
  ...process.env, HOME: home, CODEX_HOME: codexHome, OPEN_PLUGIN_HOME: home,
  OPEN_PLUGIN_CODEX_HOME: codexHome, OPEN_PLUGIN_CODEX_BIN: native,
  OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', PLGNZ_PROOF_ROOT: root,
};
const started = Date.now(), cpu = process.cpuUsage();
function diskUsage(label) {
  const result = spawnSync('df', ['-Pk', '/'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const usedKiB = Number(result.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[2]);
  assert(Number.isSafeInteger(usedKiB) && usedKiB > 0);
  const baseline = JSON.parse(readFileSync(join(base, 'baseline-disk.json'), 'utf8'));
  assert(Number.isSafeInteger(baseline.usedKiB) && baseline.usedKiB > 0);
  writeFileSync(join(root, `${phase}-${label}-disk.json`), JSON.stringify({ usedKiB, baselineKiB: baseline.usedKiB, raw: result.stdout }));
  assert(usedKiB <= 4.25 * 1024 * 1024, `whole Sandbox filesystem exceeds 4.25 GiB: ${usedKiB} KiB`);
  assert(usedKiB - baseline.usedKiB <= 1.5 * 1024 * 1024, 'experiment growth exceeds 1.5 GiB');
  return usedKiB;
}
const diskBeforeKiB = diskUsage('before');
function command(label, executable, args, allowed = [0]) {
  const began = Date.now();
  const result = spawnSync(executable, args, { env, cwd: root, encoding: 'utf8', timeout: 150_000, maxBuffer: 4 * 1024 * 1024 });
  streams.push({ label, args, status: result.status, signal: result.signal, error: result.error?.message ?? null, stdout: result.stdout, stderr: result.stderr, elapsedMs: Date.now() - began });
  writeFileSync(streamsPath, JSON.stringify(streams, null, 2));
  assert(allowed.includes(result.status), `${label}: ${result.status}\n${result.stdout}\n${result.stderr}`);
  return result;
}
async function discoverSkill() {
  const child = spawn(native, ['app-server'], { env, cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '', stderr = '', outputBytes = 0;
  const responses = [];
  try {
    const result = await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('actual skills/list timed out')), 20_000);
      const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
      child.on('error', error => finish(error));
      child.stdin.on('error', error => finish(error));
      child.on('close', code => finish(new Error(`actual app-server closed before discovery: ${code}`)));
      child.stderr.on('data', chunk => {
        stderr += chunk;
        if (Buffer.byteLength(stderr) > 1024 * 1024) finish(new Error('app-server stderr exceeds bound'));
      });
      child.stdout.on('data', chunk => {
        outputBytes += chunk.length;
        if (outputBytes > 4 * 1024 * 1024) { finish(new Error('app-server stdout exceeds bound')); return; }
        buffer += chunk;
        try {
          let boundary;
          while ((boundary = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
            if (!line) continue;
            const message = JSON.parse(line); responses.push(message);
            if (message.id === 0) {
              assert(!message.error, line);
              send({ method: 'initialized', params: {} });
              send({ id: 1, method: 'skills/list', params: { cwds: [root], forceReload: true } });
            }
            if (message.id === 1) { assert(!message.error, line); finish(null, message.result); }
          }
        } catch (error) { finish(error); }
      });
      send({ id: 0, method: 'initialize', params: { clientInfo: { name: 'plugnz-final-native-proof', version: '1.0.0' }, capabilities: { experimentalApi: true } } });
    });
    assert(Array.isArray(result.data));
    const group = result.data.find(row => row.cwd === root);
    assert(group, 'actual skills/list missing selected cwd');
    assert.deepEqual(group.errors, []);
    const rows = group.skills.filter(row => row.pluginId === 'lifecycle-probe@plugnz-proof');
    assert.equal(rows.length, 1, 'exactly one native plugin skill');
    assert.equal(rows[0].name, 'lifecycle-probe:probe'); assert.equal(rows[0].enabled, true);
    assert.equal(rows[0].path, join(codexHome, 'plugins/cache/plugnz-proof/lifecycle-probe/0.1.0/skills/probe/SKILL.md'));
    assert.match(readFileSync(rows[0].path, 'utf8'), phase === 'bootstrap' ? /Proof bytes V1\./ : /Proof bytes V2, unchanged declared version\./);
    return rows[0];
  } finally {
    writeFileSync(join(root, `${phase}-skills-list.json`), JSON.stringify({ responses, stderr }, null, 2));
    child.stdin.end(); child.kill('SIGKILL');
    if (child.exitCode === null && child.signalCode === null) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('actual app-server did not close after SIGKILL')), 5000);
      child.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
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
const statePath = join(home, 'state.json');
const priorAttemptIds = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')).attempts.map(row => row.id) : [];
const result = command(`public-${phase}`, process.execPath, [artifact, 'sync', source, '--target', 'codex', '--json'], faulting ? [1] : [0]);
const report = JSON.parse(result.stdout), after = captureSurfaces(codexHome);
const state = JSON.parse(readFileSync(statePath, 'utf8'));
writeFileSync(join(root, `${phase}-state.json`), JSON.stringify(state, null, 2));
writeFileSync(join(root, `${phase}-report.json`), JSON.stringify(report, null, 2));
assert.equal(report.outcomes.length, 1);
const outcome = report.outcomes[0];
assert.equal(outcome.package, 'lifecycle-probe');
assert.equal(outcome.nativeId, 'lifecycle-probe@plugnz-proof');
assert.equal(report.command.sourceSnapshots.length, 1);
assert.equal(report.command.sourceSnapshots[0].reference.revision, revision);
let discoveredSkill = null;
if (!faulting) {
  assert.equal(report.summary.result, 'converged');
  assert.equal(report.outcomes.length, 1);
  assert.equal(report.outcomes[0].route, phase === 'bootstrap' ? 'managed' : 'native');
  assert.equal(report.outcomes[0].activationState, 'active-conforming');
  if (phase === 'refresh') {
    assert.equal(command('actual-checkout-head', 'git', ['-C', join(codexHome, '.tmp/marketplaces/plugnz-proof'), 'rev-parse', 'HEAD']).stdout.trim(), revision);
    assert.notEqual(after.cache, before.cache);
  }
  discoveredSkill = await discoverSkill();
  assert.equal(readFileSync(join(codexHome, 'plugins/cache/plugnz-proof/lifecycle-probe/0.1.0/resources/probe.txt'), 'utf8'), phase === 'bootstrap' ? 'Proof resource V1.\n' : 'Proof resource V2, unchanged declared version.\n');
} else {
  const boundary = JSON.parse(readFileSync(join(root, 'native-boundary-result.json'), 'utf8'));
  assert.equal(boundary.status, 1, 'require the actual native nonzero exit');
  assert.match(boundary.stderr, /permission denied|Permission denied|os error 13/);
  assert.equal(boundary.postNativeHead.status, 0, boundary.postNativeHead.stderr);
  assert.equal(boundary.postNativeHead.stdout.trim(), revision, 'actual native must reach exact V3 before foreign injection');
  assert.equal(outcome.route, 'native'); assert.equal(outcome.action, 'update');
  const matches = state.attempts.flatMap(attempt => attempt.journal.filter(row => row.operationId === outcome.operationId).map(journal => ({ attempt, journal })));
  assert.equal(matches.length, 1, 'exactly one retained failed-operation journal');
  const { attempt, journal } = matches[0];
  assert(!priorAttemptIds.includes(attempt.id), 'failed trial must create a fresh attempt');
  assert.equal(attempt.command, 'sync'); assert.equal(attempt.mutationStarted, true);
  assert.equal(journal.scopeId, outcome.scope.id); assert.equal(journal.packageId, outcome.package);
  assert.equal(journal.nativeId, outcome.nativeId); assert.equal(journal.action, 'update');
  const sealed = journal.sealedOperation;
  assert(sealed, 'retain exact sealed operation');
  assert.equal(sealed.attemptId, attempt.id); assert.equal(sealed.operationId, outcome.operationId);
  assert.equal(sealed.scopeId, outcome.scope.id); assert.equal(sealed.nativeId, outcome.nativeId);
  assert.equal(sealed.route, 'native'); assert.equal(sealed.sourceRevision, revision);
  const rollbackPath = join(codexHome, '.plgnz-rollback', attempt.id, outcome.operationId);
  const stagePath = join(codexHome, '.plgnz-lifecycle', `${attempt.id}:${outcome.operationId}`);
  assert.equal(report.summary.mutationStarted, true);
  assert.equal(report.summary.result, 'incomplete');
  if (phase === 'native-exit') {
    assert.deepEqual(after, before, 'public adapter must restore all bounded prior surfaces');
    assert.equal(report.summary.failureCategory, 'runtime');
    assert.equal(report.summary.recoveryId, null, 'native failure rollback must settle');
    assert.equal(attempt.phase, 'failed'); assert.equal(journal.state, 'rolled-back');
    assert.equal(journal.settlement, 'rollback');
    assert(state.activations.every(row => row.pending === undefined), 'no remaining pending activation');
    assert(state.attempts.every(row => row.journal.every(item => ['completed', 'rolled-back', 'not-attempted'].includes(item.state))), 'no remaining unresolved journal');
    assert(!existsSync(rollbackPath), 'settled rollback bundle must be cleaned');
    assert(!existsSync(stagePath), 'settled stage must be cleaned');
  } else {
    assert.deepEqual(after, boundary.postCallSurfaces, 'foreign state must survive without any rollback restore write');
    assert.equal(report.summary.recoveryId, outcome.operationId, 'foreign rollback refusal correlates to exact pending operation');
    assert.equal(attempt.phase, 'recovery-required'); assert.equal(journal.state, 'rollback');
    assert.equal(journal.settlement, undefined);
    assert(existsSync(rollbackPath), 'foreign refusal retains prior rollback bytes');
    assert.equal(readFileSync(join(codexHome, '.tmp/marketplaces/plugnz-proof/foreign-proof.txt'), 'utf8'), 'foreign writer after the actual native exit\n');
  }
}
assert.equal(readFileSync(join(codexHome, 'plugins/data/lifecycle-probe/keep.txt'), 'utf8'), 'valuable runtime data\n');
const diskAfterKiB = diskUsage('after');
const evidence = { phase, source, revision, artifactSha256: sha(readFileSync(artifact)), before, after, summary: report.summary, discoveredSkill, diskBeforeKiB, diskAfterKiB, caps, wallMs: Date.now() - started, cpuMicroseconds: process.cpuUsage(cpu) };
writeFileSync(join(root, `${phase}-result.json`), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
