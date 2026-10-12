// One-shot launcher for the exact official ZCode supplier acquisition. This
// creates no Native arm: the reviewed preservation controller owns the sole
// unprivileged build, stopped archive, download and fresh local restore.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(import.meta.dirname, '..');
const sdkRoot = '/tmp/bunx-1005-sandbox@latest/node_modules/@vercel/sandbox';
const cli = '/tmp/bunx-1005-sandbox@latest/node_modules/.bin/sandbox';
const output = '/tmp/plugnz-zcode-acquisition-02';
const sandboxName = 'plugnz-zcode-acquire-20261012-02';
const evidenceRoot = '/vercel/sandbox/proof/zcode-acquire-02';
const supplierScratchRoot = '/vercel/sandbox/native';
const sourceRevision = '872ad960de7ec172591f7e1952f7849229f94521';
const workflowCommit = '9b0ce4ccd2a48e2c31ddd9305f875543a2fc40bc';
const methodCommit = '4499573de4452cbbe7fb8afecd30f5e71de095c0';
const localFloorBytes = 6 * 1024 ** 3;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const frozenFiles = Object.freeze({
  'test/zcode-exact-source-acquire.mjs': '93608b484518331db4c0509f1c230424ec486fcf3238d5f6f6b8010517e49d39',
  'test/zcode-exact-source-contract.mjs': '17604b7b33ab3eec74e7d6bde0030af0e513a1a8e8d4e0adf22dc8de6b277426',
  'scripts/sandbox-preservation-controller.mjs': '38e1139ec043a916de7e09dc7179e11da6bf440a9a99cd390d9ef058d403ee89',
  'scripts/sandbox-preservation-budget.mjs': '3853812ede9ebad87e6409c64b33f3c619b38b89de316bada741de148b9e2938',
  'scripts/sandbox-preservation-remote.mjs': '0d063025d01da8d0f25f92534c08d0eb1de53ff751ef58e79b2160356ed9a2bc',
  'scripts/sandbox-preservation-stage.mjs': 'fbd9e5a6464167eaed63777e4159edb3107994484213574bd7e54af963bc7d46',
  'scripts/sandbox-preservation-monitor.mjs': '7bf2734eb90ac363f47310e6979b2910c59647fa022a930b36ebf8ce6f8fe46a',
  'scripts/sandbox-preservation-supervisor.mjs': '600a15db721c2812a69d984b34301e419a52ba949a3c829b636518254fd36418',
});

assert.equal(existsSync(output), false, `Refuse existing output ${output}`);
assert.equal(spawnSync('git', ['diff', '--quiet'], { cwd: repo }).status, 0, 'Tracked worktree must be clean');
for (const commit of [workflowCommit, methodCommit]) {
  assert.equal(spawnSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], { cwd: repo }).status, 0,
    `Frozen prerequisite is not an ancestor: ${commit}`);
}
for (const [path, expected] of Object.entries(frozenFiles)) {
  assert.equal(sha256(readFileSync(resolve(repo, path))), expected, `Frozen input changed: ${path}`);
}
assert.equal(JSON.parse(readFileSync(`${sdkRoot}/package.json`, 'utf8')).version, '3.6.1');
const cliVersion = spawnSync(cli, ['--version'], { encoding: 'utf8' });
assert.equal(cliVersion.status, 0, cliVersion.stderr);
assert.equal(cliVersion.stdout.trim(), '4.7.1');

const setup = mkdtempSync('/tmp/plugnz-zcode-acquisition-02-setup-');
const configPath = `${setup}/config.json`;
const controllerLog = `${setup}/controller.log`;
const { Sandbox } = await import(pathToFileURL(`${sdkRoot}/dist/index.js`).href);
const { getAuth } = await import(pathToFileURL(`${sdkRoot}/dist/auth/index.js`).href);
const token = getAuth()?.token;
assert.ok(token, 'Vercel Sandbox CLI authentication is required');
const authScope = await Sandbox.list({ projectId: 'workspace-agent-lab', teamId: 'charfeng1s-projects', token,
  limit: 1, signal: AbortSignal.timeout(10_000) });
assert.ok(Array.isArray(authScope.sandboxes), 'Vercel Sandbox project/team authentication scope is required');

// This is deliberately the final local operation before remote allocation.
const localDf = spawnSync('df', ['-PB1', '/tmp'], { encoding: 'utf8' });
assert.equal(localDf.status, 0, localDf.stderr);
const localAvailableBytes = Number(localDf.stdout.trim().split('\n').at(-1).trim().split(/\s+/u)[3]);
assert.ok(Number.isSafeInteger(localAvailableBytes) && localAvailableBytes >= localFloorBytes,
  `Private large acquisition requires ${localFloorBytes} local bytes; found ${localAvailableBytes}`);
const sandbox = await Sandbox.create({
  name: sandboxName, projectId: 'workspace-agent-lab', teamId: 'charfeng1s-projects', token,
  resources: { vcpus: 2 }, timeout: 45 * 60_000, persistent: false,
  signal: AbortSignal.timeout(60_000),
});
assert.equal(sandbox.name, sandboxName);
assert.equal(sandbox.persistent, false);
assert.equal(sandbox.vcpus, 2);
assert.equal(sandbox.memory, 4096);
assert.ok(sandbox.expiresAt);

await sandbox.fs.mkdir('/vercel/sandbox/proof', { recursive: true });
for (const name of ['zcode-exact-source-acquire.mjs', 'zcode-exact-source-contract.mjs']) {
  await sandbox.fs.writeFile(`/vercel/sandbox/proof/${name}`, readFileSync(resolve(repo, `test/${name}`)));
}
const readable = await sandbox.runCommand({ cmd: 'sudo', args: ['chmod', 'a=rX',
  '/vercel/sandbox/proof/zcode-exact-source-acquire.mjs', '/vercel/sandbox/proof/zcode-exact-source-contract.mjs'] });
assert.equal(readable.exitCode, 0, await readable.stderr());
const preflight = await sandbox.runCommand({ cmd: 'sh', args: ['-c',
  'set -eu; for name in tar xz curl git setpriv node; do command -v "$name"; done; test ! -e /vercel/sandbox/native; test ! -e /vercel/sandbox/proof/zcode-acquire-02'] });
assert.equal(preflight.exitCode, 0, await preflight.stderr());
const remoteDf = await sandbox.runCommand({ cmd: 'df', args: ['-Pk', '/'] });
assert.equal(remoteDf.exitCode, 0, await remoteDf.stderr());
const baselineUsedBytes = Number((await remoteDf.stdout()).trim().split('\n').at(-1).trim().split(/\s+/u)[2]) * 1024;
assert.ok(Number.isSafeInteger(baselineUsedBytes) && baselineUsedBytes > 0);

const expiresAt = sandbox.expiresAt.getTime();
const archiveAt = expiresAt - 780_000;
assert.ok(archiveAt > Date.now(), 'Setup consumed the source-build window');
const config = {
  sandbox: sandboxName, project: 'workspace-agent-lab', team: 'charfeng1s-projects', cli, sdkRoot,
  expiresAt, baselineUsedBytes, operation: 'private-large-acquisition', experimentUid: 21072,
  evidenceRoot, supplierScratchRoot, output, archiveAt,
  diskGrowthBytes: 6 * 1024 ** 3, diskReserveBytes: 2_944 * 1024 ** 2,
  retainedBodyBytes: 2_560 * 1024 ** 2, archiveBytes: 2_816 * 1024 ** 2,
  command: ['node', '/vercel/sandbox/proof/zcode-exact-source-acquire.mjs'],
  suppliers: [{ root: '/vercel/sandbox/native/zcode-0169',
    locator: 'https://github.com/zai-org/ZCode.git', revision: sourceRevision,
    integrityFiles: [{ path: 'acquisition-identity.txt',
      sha256: '1dcf663d41bc117f65e7334f077a526456af12ac7b09c088cdd7f46048618a1a' }] }],
  inputs: { workflowCommit, methodCommit, sourceRevision, frozenFiles, cliVersion: '4.7.1', sdkVersion: '3.6.1',
    localFloorBytes, localAvailableBytes },
};
writeFileSync(configPath, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
writeFileSync(`${setup}/sandbox.json`, JSON.stringify({ name: sandbox.name, persistent: sandbox.persistent,
  vcpus: sandbox.vcpus, memory: sandbox.memory, expiresAt: sandbox.expiresAt.toISOString(), baselineUsedBytes,
  preflight: (await preflight.stdout()).trim().split('\n'), localAvailableBytes }, null, 2), { flag: 'wx' });

const controllerLogFd = openSync(controllerLog, 'wx', 0o600);
const controller = spawn(process.execPath, [resolve(repo, 'scripts/sandbox-preservation-controller.mjs'), configPath], {
  cwd: repo, env: process.env, stdio: ['ignore', controllerLogFd, controllerLogFd],
});
writeFileSync(`${setup}/controller.json`, JSON.stringify({ pid: controller.pid, startedAt: new Date().toISOString(),
  log: controllerLog }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ phase: 'launched', sandbox: sandbox.name, controllerPid: controller.pid, setup,
  controllerLog, output, localAvailableBytes, baselineUsedBytes, expiresAt, archiveAt }));
const terminal = await new Promise(resolveExit => {
  controller.once('error', error => resolveExit({ code: null, signal: null, error: String(error) }));
  controller.once('close', (code, signal) => resolveExit({ code, signal, error: null }));
});
closeSync(controllerLogFd);
const receipt = existsSync(`${output}/receipt.json`) ? JSON.parse(readFileSync(`${output}/receipt.json`, 'utf8')) : null;
writeFileSync(`${setup}/terminal.json`, JSON.stringify({ terminal, receipt }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ phase: 'controller-terminal', terminal, receipt }));
assert.ok(receipt, 'Preservation controller produced no complete receipt; leave the Sandbox untouched until expiry');
const stopped = await sandbox.stop({ signal: AbortSignal.timeout(30_000) });
writeFileSync(`${setup}/stop.json`, JSON.stringify({ status: stopped.status, snapshot: stopped.snapshot ?? null }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ phase: 'stopped', status: stopped.status, snapshot: stopped.snapshot ?? null }));
assert.equal(stopped.snapshot ?? null, null, 'Nonpersistent proof must not create a snapshot');
assert.equal(terminal.code, 0, `Exact-source supplier acquisition did not converge: ${JSON.stringify(terminal)}`);
