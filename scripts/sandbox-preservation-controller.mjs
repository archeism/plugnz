// Controller stays alive independently of agent/root messages. No native arm
// may start outside it. Config and each output directory are single-use.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [configPath] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
assert.match(config.sandbox, /^plugnz-[a-z0-9-]+$/u);
assert.ok(config.project && config.team && config.cli);
assert.ok(Number.isSafeInteger(config.experimentUid) && config.experimentUid >= 2000 && config.experimentUid <= 60000);
assert.ok(Number.isSafeInteger(config.archiveAt) && config.archiveAt > Date.now());
const acquisition = config.operation === 'acquisition';
const archiveMs = acquisition ? 240_000 : 50_000;
const downloadMs = acquisition ? 300_000 : 60_000;
// Larger acquisition archives get explicit conservative transport bounds;
// tiny probes are not a throughput certification for 512 MiB.
const reserveMs = 15_000 + 15_000 + archiveMs + downloadMs + (acquisition ? 60_000 : 30_000);
assert.ok(config.expiresAt - config.archiveAt >= reserveMs, 'Reserve complete bounded preservation pipeline');
assert.ok(config.diskGrowthBytes > 0 && config.diskGrowthBytes <= 3 * 1024 ** 3);
assert.ok(Number.isSafeInteger(config.baselineUsedBytes) && config.baselineUsedBytes > 0, 'Freeze wholeFS baseline before supplier acquisition');
assert.ok(config.operation === undefined || ['acquisition', 'native-proof', 'method-probe'].includes(config.operation));
assert.ok(config.diskReserveBytes >= (acquisition ? 640 : 128) * 1024 ** 2);
assert.ok(config.archiveBytes > 0 && config.archiveBytes <= (acquisition ? 512 : 100) * 1024 ** 2);
assert.match(config.evidenceRoot, /^\/vercel\/sandbox\/proof\/[a-zA-Z0-9_-]+$/u);
const output = resolve(config.output);
if (acquisition) {
  const df = spawnSync('df', ['-Pk', dirname(output)], { encoding: 'utf8' }); assert.equal(df.status, 0);
  const available = Number(df.stdout.trim().split('\n').at(-1).trim().split(/\s+/u)[3]) * 1024;
  assert.ok(available >= 3 * 1024 ** 3, 'Acquisition requires three GiB local archive/restore headroom');
}
assert.ok(!existsSync(output), 'Local attempt directory cannot be overwritten');
mkdirSync(output, { recursive: true, mode: 0o700 });
writeFileSync(join(output, 'config.json'), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
const { Sandbox } = await import(pathToFileURL(join(config.sdkRoot, 'dist/index.js')).href);
const { getAuth } = await import(pathToFileURL(join(config.sdkRoot, 'dist/auth/index.js')).href);
const sandbox = await Sandbox.get({ name: config.sandbox, projectId: config.project, teamId: config.team,
  token: getAuth()?.token, resume: false, signal: AbortSignal.timeout(10_000) });
assert.equal(sandbox.name, config.sandbox); assert.equal(sandbox.status, 'running');
assert.equal(sandbox.expiresAt?.getTime(), config.expiresAt, 'Configured expiry must equal actual running session expiry');
writeFileSync(join(output, 'sandbox-info.json'), JSON.stringify({ name: sandbox.name, expiresAt: config.expiresAt, checkedAt: Date.now() }), { flag: 'wx' });
const common = ['--project', config.project, '--team', config.team];
let sequence = 0;
async function cli(args, timeout = 70_000) {
  const label = `${String(++sequence).padStart(2, '0')}-${args[0]}`;
  const separator = args.indexOf('--');
  const scoped = separator < 0 ? [...args, ...common] : [...args.slice(0, separator), ...common, ...args.slice(separator)];
  const child = spawn(config.cli, scoped, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', bytes = 0;
  const stop = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
  const consume = (key, chunk) => {
    const remaining = Math.max(0, 4 * 1024 ** 2 - bytes); bytes += chunk.length;
    if (key === 'stdout') stdout += chunk.subarray(0, remaining).toString(); else stderr += chunk.subarray(0, remaining).toString();
    if (bytes > 4 * 1024 ** 2) stop();
  };
  child.stdout.on('data', chunk => consume('stdout', chunk)); child.stderr.on('data', chunk => consume('stderr', chunk));
  const timer = setTimeout(stop, timeout);
  const result = await new Promise(resolveExit => {
    child.once('error', error => resolveExit({ code: null, error: String(error) }));
    child.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  clearTimeout(timer);
  writeFileSync(join(output, `${label}.json`), JSON.stringify({ ...result, stdout, stderr, bytes }), { flag: 'wx' });
  return { ...result, stdout, stderr };
}
const remoteHelper = '/vercel/sandbox/proof/preservation-remote.mjs';
const remoteConfig = `${config.evidenceRoot}-config.json`;
const exec = action => {
  const duration = action === 'run' ? Math.max(1, config.archiveAt - Date.now() + 30_000) : action === 'stop' ? 15_000 : archiveMs;
  return cli(['exec', config.sandbox, '--sudo', '--timeout', `${Math.ceil(duration / 1000)}s`, '--', 'node', remoteHelper, action, remoteConfig], duration);
};
let reason = 'supplier-finished';
let preservePromise;
const preserve = () => preservePromise ??= (async () => {
  const stopped = await exec('stop'); assert.equal(stopped.code, 0, stopped.stderr);
  let settleTimer;
  try { await Promise.race([running, new Promise((_, reject) => { settleTimer = setTimeout(() => reject(new Error('Remote settlement deadline')), 15_000); })]); }
  finally { clearTimeout(settleTimer); }
  const archived = await exec('archive'); assert.equal(archived.code, 0, archived.stderr);
  const metadata = JSON.parse(archived.stdout.trim());
  assert.equal(metadata.archive, `${config.evidenceRoot}.tar.gz`);
  assert.ok(metadata.bytes <= config.archiveBytes && /^[a-f0-9]{64}$/u.test(metadata.sha256));
  const archive = join(output, 'evidence.tar.gz');
  const copied = await cli(['copy', `${config.sandbox}:${metadata.archive}`, archive], downloadMs); assert.equal(copied.code, 0, copied.stderr);
  assert.ok(Date.now() < config.expiresAt, 'Download missed actual Sandbox deadline');
  assert.equal(lstatSync(archive).size, metadata.bytes);
  assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'), metadata.sha256);
  const restored = join(output, 'restored'); mkdirSync(restored);
  const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 ** 2 });
  assert.equal(listing.status, 0, listing.stderr);
  for (const entry of listing.stdout.trim().split('\n')) assert.ok(!entry.startsWith('/') && !entry.split('/').includes('..'), 'Unsafe archive member');
  const tar = spawnSync('tar', ['-xzf', archive, '-C', restored], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(tar.status, 0, tar.stderr);
  const inventory = JSON.parse(readFileSync(join(restored, 'control/inventory.json'), 'utf8'));
  for (const row of inventory) {
    assert.ok(!row.path.startsWith('/') && !row.path.split('/').includes('..'));
    const path = join(restored, 'trial', row.path), stat = lstatSync(path);
    if (row.kind === 'symlink') { assert.ok(stat.isSymbolicLink()); assert.equal(readlinkSync(path), row.target); }
    else if (row.kind === 'directory') { assert.ok(stat.isDirectory()); assert.equal(stat.mode & 0o777, row.mode); }
    else {
      assert.ok(stat.isFile()); assert.equal(stat.mode & 0o777, row.mode);
      const bytes = readFileSync(path); assert.equal(bytes.length, row.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
    }
  }
  const suppliers = JSON.parse(readFileSync(join(restored, 'control/reconstructible-suppliers.json'), 'utf8'));
  for (const [index, supplier] of suppliers.entries()) for (const row of supplier.inventory) {
    if (supplier.omittedPaths.includes(row.path)) continue;
    const path = join(restored, 'suppliers', String(index), row.path), stat = lstatSync(path);
    if (row.kind === 'symlink') { assert.ok(stat.isSymbolicLink()); assert.equal(readlinkSync(path), row.target); }
    else if (row.kind === 'directory') { assert.ok(stat.isDirectory()); assert.equal(stat.mode & 0o777, row.mode); }
    else {
      assert.ok(stat.isFile()); assert.equal(stat.mode & 0o777, row.mode);
      const bytes = readFileSync(path); assert.equal(bytes.length, row.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
    }
  }
  writeFileSync(join(output, 'receipt.json'), JSON.stringify({ reason, ...metadata, restoredFiles: inventory.length, at: new Date().toISOString() }, null, 2), { flag: 'wx' });
})();
const helperPath = fileURLToPath(new URL('./sandbox-preservation-remote.mjs', import.meta.url));
const stagePath = fileURLToPath(new URL('./sandbox-preservation-stage.mjs', import.meta.url));
for (const [name, path] of [['controller', fileURLToPath(import.meta.url)], ['remote', helperPath], ['stage', stagePath]]) {
  const bytes = readFileSync(path);
  writeFileSync(join(output, `${name}.mjs`), bytes, { flag: 'wx' });
  writeFileSync(join(output, `${name}.sha256`), createHash('sha256').update(bytes).digest('hex'), { flag: 'wx' });
}
for (const args of [['copy', helperPath, `${config.sandbox}:${remoteHelper}`],
  ['copy', stagePath, `${config.sandbox}:/vercel/sandbox/proof/sandbox-preservation-stage.mjs`], ['copy', configPath, `${config.sandbox}:${remoteConfig}`]]) {
  const result = await cli(args, 20_000); assert.equal(result.code, 0, result.stderr);
}
assert.ok(Date.now() < config.archiveAt && config.expiresAt - Date.now() >= reserveMs, 'Setup consumed preservation reserve; refuse native launch');
const running = exec('run');
const timer = setTimeout(() => { reason = 'archive-deadline'; preserve().catch(fail); }, Math.max(0, config.archiveAt - Date.now()));
let failures = 0;
function fail(error) {
  const name = failures++ === 0 ? 'preservation-failure.json' : `preservation-failure-${failures}.json`;
  writeFileSync(join(output, name), JSON.stringify({ error: String(error), at: new Date().toISOString() }), { flag: 'wx' });
  process.exitCode = 1;
}
process.once('SIGTERM', () => { reason = 'controller-sigterm'; preserve().catch(fail); });
try {
  const result = await running;
  if (result.code !== 0 && reason === 'supplier-finished') reason = 'supplier-failure';
  await preserve();
  if (result.code !== 0) process.exitCode = 1;
} catch (error) { fail(error); }
finally { clearTimeout(timer); }
