// Manual actual-native oracle. Run only inside an owned Vercel Sandbox.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const base = '/vercel/sandbox/proof';
assert.equal(resolve(process.cwd()), base, 'Oracle requires its owned Sandbox workdir');
const [phase, expectedRevision, attempt = '01', candidate = 'd3da', run = '00'] = process.argv.slice(2);
assert.ok(['V1', 'V2'].includes(phase));
assert.match(expectedRevision ?? '', /^[a-f0-9]{40}$/u);
assert.match(attempt, /^[0-9]{2}$/u);
assert.match(run, /^[0-9]{2}$/u);
const prefix = run === '00' ? phase : `${phase}.r${run}`;
const root = join(base, `attempt-${attempt}`);
mkdirSync(root, { recursive: true });
const processStatus = readFileSync('/proc/self/status', 'utf8');
for (const field of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']) assert.match(processStatus, new RegExp(`^${field}:\\s+0+$`, 'mu'));
assert.match(processStatus, /^NoNewPrivs:\s+1$/mu);
const candidates = {
  d3da: { file: 'plugnz.mjs', sha256: 'efe017a6fb28c84a7d2f762d2ed875f0494bf962cc3c2cfe31f3eeaf2d4cebf2' },
  '04bdef3': { file: 'plugnz-04bdef3.mjs', sha256: 'ecd9dc84124bcaa39df1199bf4862c47ce915926d455a4fdcf461d857f18a837' },
};
assert.ok(Object.hasOwn(candidates, candidate), 'Oracle requires a frozen candidate');
const artifact = join(base, candidates[candidate].file);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(readFileSync(artifact)), candidates[candidate].sha256);
const native = '/vercel/sandbox/native/kimi/node_modules/.bin/kimi';
const packageJson = JSON.parse(readFileSync('/vercel/sandbox/native/kimi/node_modules/@moonshot-ai/kimi-code/package.json', 'utf8'));
assert.equal(packageJson.name, '@moonshot-ai/kimi-code');
assert.equal(packageJson.version, '2.0.1');
const home = join(root, 'kimi-home');
const nativeHome = join(home, '.kimi-code');
if (phase === 'V1') assert.equal(existsSync(home), false, 'Fresh V1 cannot overwrite a previous attempt');
else assert.ok(existsSync(join(root, 'V1.result.json')), 'V2 requires retained successful V1');
mkdirSync(nativeHome, { recursive: true });
const env = {
  PATH: process.env.PATH,
  HOME: home, OPEN_PLUGIN_HOME: home,
  XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), XDG_STATE_HOME: join(home, '.local/state'),
  KIMI_CODE_HOME: nativeHome, OPEN_PLUGIN_KIMI_BIN: native,
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', CI: '1',
};
const manifest = join(root, 'kimi-sync.json');
writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [{ operation: 'sync', source: {
  kind: 'git', locator: 'https://github.com/archeism/plugnz.git', ref: 'finish/native-kimi-zcode-proof',
}, target: { kind: 'kimi', instance: 'default' }, selectors: [{ package: 'kimi-probe', adoptExisting: false }] }] }));

function treeDigest(path) {
  if (!existsSync(path)) return null;
  const rows = [];
  function walk(file, relative) {
    const stat = lstatSync(file);
    assert.ok(!stat.isSymbolicLink(), `Unexpected native symlink: ${relative}`);
    if (stat.isDirectory()) {
      rows.push(['directory', relative, stat.mode & 0o7777]);
      for (const name of readdirSync(file).sort()) walk(join(file, name), join(relative, name));
    } else {
      assert.ok(stat.isFile());
      rows.push(['file', relative, stat.mode & 0o7777, hash(readFileSync(file))]);
    }
  }
  walk(path, '.');
  return hash(JSON.stringify(rows));
}

async function command(label, executable, args, commandEnv = env) {
  const started = performance.now();
  const child = spawn(executable, args, { cwd: root, env: commandEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', outputBytes = 0, overflow = false;
  const consume = (which, chunk) => {
    const remaining = Math.max(0, 4 * 1024 * 1024 - outputBytes);
    outputBytes += chunk.length;
    const bounded = chunk.subarray(0, remaining).toString('utf8');
    if (which === 'stdout') stdout += bounded; else stderr += bounded;
    if (outputBytes > 4 * 1024 * 1024 && !overflow) { overflow = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  };
  child.stdout.on('data', chunk => consume('stdout', chunk));
  child.stderr.on('data', chunk => consume('stderr', chunk));
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 90_000);
  let code, signal;
  try {
    [code, signal] = await new Promise((resolveExit, reject) => {
      child.on('error', reject); child.on('close', (exitCode, exitSignal) => resolveExit([exitCode, exitSignal]));
    });
  } finally {
    clearTimeout(timer);
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const result = { code, signal, timedOut, overflow, outputBytes, milliseconds: performance.now() - started, stdout, stderr };
  writeFileSync(join(root, `${prefix}.${label}.streams.json`), JSON.stringify(result, null, 2), { flag: 'wx' });
  assert.equal(overflow, false, `${label} output overflow; retained bounded partial streams`);
  assert.equal(timedOut, false, `${label} timed out; retained full streams`);
  return result;
}

function report(result) {
  const value = JSON.parse(result.stdout);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.command.sourceSnapshots[0].reference.revision, expectedRevision);
  assert.equal(value.outcomes.length, 1);
  return value;
}

const version = await command('native-version', native, ['--version']);
assert.equal(version.code, 0); assert.equal(version.stdout.trim(), '2.0.1');
const outputs = [];
for (const [label, dryRun] of phase === 'V1' ? [['install', false], ['same-head-preview', true], ['same-head-apply', false]] : [['changed-preview', true], ['changed-apply', false]]) {
  const before = treeDigest(nativeHome);
  const result = await command(label, process.execPath, [artifact, 'sync', '--manifest', manifest, ...(dryRun ? ['--dry-run'] : []), '--json']);
  const parsed = report(result);
  const after = treeDigest(nativeHome);
  if (phase === 'V1') {
    assert.equal(result.code, 0, JSON.stringify(parsed.summary));
    assert.equal(parsed.outcomes[0].route, 'native');
    assert.equal(parsed.outcomes[0].result, 'succeeded');
    assert.equal(parsed.outcomes[0].action, label === 'install' ? 'install' : 'unchanged');
    if (label !== 'install') assert.equal(after, before, 'Unchanged Git sync wrote native state');
  } else {
    assert.equal(result.code, 1, 'Unsupported native update must not be admitted by the fixture');
    // Frozen d3da kimiUpdateProfile explicitly marks update unsupported.
    assert.deepEqual(parsed.outcomes[0].reason, { category: 'capability', code: 'capability.unsupported',
      diagnostic: "target 'kimi' 2.0.1 native update is unsupported", capabilityId: 'operation.update',
      evidenceId: 'sha256:754f910c5cfa319ab144e4b7002bfeb67183752b023d28dc6be17bf4737c3452' });
    assert.equal(parsed.summary.mutationStarted, false);
    assert.equal(parsed.summary.changed, false);
    assert.equal(after, before, 'Unsupported changed sync wrote native state');
  }
  outputs.push({ label, code: result.code, before, after, summary: parsed.summary, outcome: parsed.outcomes[0] });
}

const cache = join(nativeHome, 'plugins/managed/kimi-probe');
assert.ok(readFileSync(join(cache, 'skills/probe/SKILL.md'), 'utf8').includes('payload V1.'));
assert.equal(readFileSync(join(cache, 'commands/report.md'), 'utf8'), '---\ndescription: Controlled Kimi command probe\n---\nKimi static command payload V1.\n');
const marker = JSON.parse(readFileSync(join(cache, '.plgnz-install.json'), 'utf8'));
assert.equal(marker.sourceType, 'git');
assert.equal(marker.sourceLocator, 'https://github.com/archeism/plugnz.git');
const registry = JSON.parse(readFileSync(join(nativeHome, 'plugins/installed.json'), 'utf8'));
assert.equal(registry.plugins.length, 1); assert.equal(registry.plugins[0].enabled, true);
assert.equal(registry.plugins[0].id, 'kimi-probe');
assert.equal(realpathSync(registry.plugins[0].root), realpathSync(cache));
const state = JSON.parse(readFileSync(join(home, 'state.json'), 'utf8'));
const activation = state.activations.find(row => row.nativeId === 'kimi-probe@plugnz-nativegit-proof');
assert.ok(activation);
assert.equal(marker.pluginId, activation.nativeId); assert.equal(marker.scopeId, activation.scopeId);
const scope = state.scopes.find(row => row.id === activation.scopeId);
assert.deepEqual(scope.source, { kind: 'git', locator: 'https://github.com/archeism/plugnz.git', ref: 'finish/native-kimi-zcode-proof' });
assert.deepEqual(scope.target, { kind: 'kimi', instance: 'default' });
const original = state.attempts.flatMap(row => row.journal).find(row => row.action === 'install' && row.nativeId === activation.nativeId);
assert.ok(original?.sealedOperation);
const stagedSource = join(nativeHome, 'plugins/.plgnz-kimi-lifecycle', original.sealedOperation.attemptId, original.operationId, 'stage/kimi-probe');
// Exact 2.0.1 vendor pluginSourceSchema: local-path | zip-url | github.
assert.equal(registry.plugins[0].source, 'local-path');
assert.equal(registry.plugins[0].originalSource, stagedSource);

const port = await new Promise((resolvePort, reject) => {
  const server = createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolvePort(port)); });
});
const server = spawn(native, ['web', '--no-open', '--port', String(port), '--log-level', 'silent'], { cwd: root, env, detached: true, stdio: 'ignore' });
let discovery;
try {
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.equal(server.exitCode, null, 'Native discovery server exited early');
    try { const response = await fetch(`${base}/api/v1/healthz`, { signal: AbortSignal.timeout(500) }); if ((await response.json()).data?.ok === true) break; } catch {}
    await new Promise(resolveSleep => setTimeout(resolveSleep, 100));
  }
  const token = readFileSync(join(nativeHome, 'server.token'), 'utf8').trim();
  const response = await fetch(`${base}/api/v1/plugins`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
  const body = await response.json(); assert.equal(body.code, 0);
  const rows = Array.isArray(body.data) ? body.data : body.data.plugins;
  const plugin = rows.find(row => row.id === 'kimi-probe');
  assert.ok(plugin, 'Actual native plugin discovery omitted installed plugin');
  assert.equal(plugin.enabled, true); assert.equal(plugin.hasErrors, false);
  assert.equal(plugin.skillCount, 1); assert.equal(plugin.commandCount, 1);
  discovery = { id: plugin.id, enabled: plugin.enabled, skillCount: plugin.skillCount, commandCount: plugin.commandCount, hasErrors: plugin.hasErrors };
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  await Promise.race([
    new Promise(resolveExit => { if (server.exitCode !== null || server.signalCode !== null) resolveExit(); else server.once('close', resolveExit); }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Native server close exceeded 5s')), 5_000); timer.unref(); }),
  ]);
}
const allocated = spawnSync('du', ['-sk', '/vercel/sandbox/native', base], { encoding: 'utf8' });
assert.equal(allocated.status, 0);
const kilobytes = allocated.stdout.trim().split('\n').reduce((sum, line) => sum + Number(line.split(/\s/u)[0]), 0);
assert.ok(kilobytes <= 1024 * 1024, 'Owned native/proof allocation exceeded 1GiB budget');
const evidence = { phase, run, candidate, node: process.version, expectedRevision, artifactSha256: hash(readFileSync(artifact)), nativePackage: packageJson.name, nativeVersion: packageJson.version, nativeEntrypointSha256: hash(readFileSync(realpathSync(native))), outputs, discovery, allocatedKiB: kilobytes };
writeFileSync(join(root, `${prefix}.result.json`), JSON.stringify(evidence, null, 2), { flag: 'wx' });
console.log(JSON.stringify(evidence, null, 2));
