// Manual actual-native oracle. Run only inside an owned Vercel Sandbox.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const root = '/vercel/sandbox/proof';
assert.equal(resolve(process.cwd()), root, 'Oracle requires its owned Sandbox workdir');
const [phase, expectedRevision] = process.argv.slice(2);
assert.ok(['V1', 'V2'].includes(phase));
assert.match(expectedRevision ?? '', /^[a-f0-9]{40}$/u);
const artifact = join(root, 'plugnz.mjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(readFileSync(artifact)), 'efe017a6fb28c84a7d2f762d2ed875f0494bf962cc3c2cfe31f3eeaf2d4cebf2');
const native = '/vercel/sandbox/native/kimi/node_modules/.bin/kimi';
const packageJson = JSON.parse(readFileSync('/vercel/sandbox/native/kimi/node_modules/@moonshot-ai/kimi-code/package.json', 'utf8'));
assert.equal(packageJson.name, '@moonshot-ai/kimi-code');
assert.equal(packageJson.version, '2.0.1');
const home = join(root, 'kimi-home');
const nativeHome = join(home, '.kimi-code');
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
      rows.push(['directory', relative]);
      for (const name of readdirSync(file).sort()) walk(join(file, name), join(relative, name));
    } else {
      assert.ok(stat.isFile());
      rows.push(['file', relative, hash(readFileSync(file))]);
    }
  }
  walk(path, '.');
  return hash(JSON.stringify(rows));
}

async function command(label, executable, args, commandEnv = env) {
  const started = performance.now();
  const child = spawn(executable, args, { cwd: root, env: commandEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
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
  const result = { code, signal, timedOut, milliseconds: performance.now() - started, stdout, stderr };
  writeFileSync(join(root, `${phase}.${label}.streams.json`), JSON.stringify(result, null, 2));
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
    assert.equal(result.code, 1, 'Unverified native update must not be admitted by the fixture');
    assert.equal(parsed.outcomes[0].reason.category, 'capability');
    assert.equal(parsed.summary.mutationStarted, false);
    assert.equal(after, before, 'Unsupported changed sync wrote native state');
  }
  outputs.push({ label, code: result.code, before, after, summary: parsed.summary, outcome: parsed.outcomes[0] });
}

const cache = join(nativeHome, 'plugins/managed/kimi-probe');
assert.ok(readFileSync(join(cache, 'skills/probe/SKILL.md'), 'utf8').includes('payload V1.'));
const marker = JSON.parse(readFileSync(join(cache, '.plgnz-install.json'), 'utf8'));
assert.equal(marker.sourceType, 'git');
assert.equal(marker.sourceLocator, 'https://github.com/archeism/plugnz.git');
const registry = JSON.parse(readFileSync(join(nativeHome, 'plugins/installed.json'), 'utf8'));
assert.equal(registry.plugins.length, 1); assert.equal(registry.plugins[0].enabled, true);
assert.equal(realpathSync(registry.plugins[0].root), realpathSync(cache));

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
  await new Promise(resolveExit => { if (server.exitCode !== null || server.signalCode !== null) resolveExit(); else server.once('close', resolveExit); });
}
const allocated = spawnSync('du', ['-sk', '/vercel/sandbox/native', root], { encoding: 'utf8' });
assert.equal(allocated.status, 0);
const kilobytes = allocated.stdout.trim().split('\n').reduce((sum, line) => sum + Number(line.split(/\s/u)[0]), 0);
assert.ok(kilobytes <= 1024 * 1024, 'Owned native/proof allocation exceeded 1GiB budget');
const evidence = { phase, expectedRevision, artifactSha256: hash(readFileSync(artifact)), nativePackage: packageJson.name, nativeVersion: packageJson.version, nativeEntrypointSha256: hash(readFileSync(realpathSync(native))), outputs, discovery, allocatedKiB: kilobytes };
writeFileSync(join(root, `${phase}.result.json`), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
