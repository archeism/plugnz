// Bounded, unpatched official-source build; manual owned-Sandbox helper only.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
const root = '/vercel/sandbox/native';
const source = `${root}/zcode-source`;
const [phase] = process.argv.slice(2);
assert.ok(['install', 'build'].includes(phase));
const rev = spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
assert.equal(rev.status, 0); assert.equal(rev.stdout.trim(), '872ad960de7ec172591f7e1952f7849229f94521');
const gitStatus = spawnSync('git', ['-C', source, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
assert.equal(gitStatus.status, 0); assert.equal(gitStatus.stdout, '');
const env = { PATH: `${root}/node-v24.14.0-linux-x64/bin:${root}/tooling/node_modules/.bin:/usr/local/bin:/usr/bin:/bin`,
  HOME: `${root}/build-home`, XDG_CACHE_HOME: `${root}/build-home/.cache`, CI: '1' };
mkdirSync(env.HOME, { recursive: true });
const nodeVersion = spawnSync('node', ['--version'], { env, encoding: 'utf8' });
assert.equal(nodeVersion.status, 0); assert.equal(nodeVersion.stdout.trim(), 'v24.14.0');
// The authoritative root workspace includes the CLI and shared dependencies.
// Its nested historical lock is stale; never relax or rewrite frozen locks.
const command = phase === 'install' ? ['--filter', '@zcode/cli...', '--filter', 'zcode-cli', 'install', '--frozen-lockfile', '--store-dir', `${root}/pnpm-store`] : ['run', 'build'];
const evidence = { phase, command, sourceCommit: rev.stdout.trim(), node: nodeVersion.stdout.trim(), measurements: [] };
let stopped = null, bytes = 0, stdout = '', stderr = '';
function allocated() {
  const r = spawnSync('du', ['-sk', root, '/vercel/sandbox/proof', '/var/cache/dnf'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  return r.stdout.trim().split('\n').reduce((sum, line) => sum + Number(line.split(/\s/u)[0]), 0);
}
const initial = allocated(); evidence.measurements.push({ milliseconds: 0, allocatedKiB: initial });
assert.ok(initial < 900 * 1024, 'Insufficient reserved space before launch');
const started = performance.now();
const child = spawn('pnpm', command, { cwd: phase === 'install' ? source : `${source}/apps/zcode-cli`, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
function stop(reason) { stopped ??= reason; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
const consume = (which, chunk) => {
  const remaining = Math.max(0, 4 * 1024 * 1024 - bytes); bytes += chunk.length;
  if (which === 'stdout') stdout += chunk.subarray(0, remaining).toString(); else stderr += chunk.subarray(0, remaining).toString();
  if (bytes > 4 * 1024 * 1024) stop('output-budget');
};
child.stdout.on('data', chunk => consume('stdout', chunk)); child.stderr.on('data', chunk => consume('stderr', chunk));
const deadline = setTimeout(() => stop('wall-budget'), 180_000);
const monitor = setInterval(() => {
  try {
    const allocatedKiB = allocated(); evidence.measurements.push({ milliseconds: performance.now() - started, allocatedKiB });
    // Reserve 124MiB for one polling interval's growth and evidence settlement.
    if (allocatedKiB >= 900 * 1024) stop('disk-budget');
  } catch (error) { evidence.measurementError = String(error); stop('disk-measurement-failed'); }
}, 500);
let result;
try { result = await new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolveExit({ code, signal })); }); }
finally { clearTimeout(deadline); clearInterval(monitor); try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
Object.assign(evidence, result, { stopped, outputBytes: bytes, stdout, stderr, milliseconds: performance.now() - started, finalAllocatedKiB: allocated() });
const output = `/vercel/sandbox/proof/zcode-source-${phase}-${Date.now()}.json`;
writeFileSync(output, JSON.stringify(evidence, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output, code: result.code, signal: result.signal, stopped, milliseconds: evidence.milliseconds, finalAllocatedKiB: evidence.finalAllocatedKiB }));
assert.equal(stopped, null, 'Build attempt stopped; partial state and evidence retained');
assert.ok(evidence.finalAllocatedKiB <= 1024 * 1024, 'Measured allocation exceeded declared budget');
assert.equal(result.code, 0, 'Official build failed; no source patches permitted');
