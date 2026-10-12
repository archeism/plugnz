// Exact owned-Sandbox launcher for the final C72 Kimi proof. It creates one
// nonpersistent VM, advances only the dedicated proof ref, and delegates all
// experiment execution/preservation to the reviewed controller.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(import.meta.dirname, '..');
const sdkRoot = '/tmp/bunx-1005-sandbox@latest/node_modules/@vercel/sandbox';
const cli = '/tmp/bunx-1005-sandbox@latest/node_modules/.bin/sandbox';
const artifactPath = '/tmp/plugnz-native-git-main-integration/dist/plugnz.mjs';
const output = '/tmp/plugnz-kimi-final-c72-01';
const sandboxName = 'plugnz-kimi-final-c72-20261012';
const sourceRef = 'proof/kimi-native-c72-20261012';
const v1 = 'f60a45efeab8b608995ec06eb022ced88d42aedf';
const v2 = 'db0237713b2e4d07f5ef3baa65d66b043eab49bc';
const artifactSha256 = 'c72c6e9674c454bc6a54e68c0b89f8670a2017fd54c9d76131234d619fafd606';
const identitySha256 = '9fbe11aad39f299d70b731529921ea22cee22e51e53a43fd28f2e865cc879da7';
const inputRoot = '/vercel/sandbox/proof/final-c72-inputs';
const evidenceRoot = '/vercel/sandbox/proof/kimi-final-c72';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

assert.equal(existsSync(output), false, `Refuse existing output ${output}`);
assert.equal(sha256(readFileSync(artifactPath)), artifactSha256);
assert.equal(spawnSync('git', ['merge-base', '--is-ancestor', v1, v2], { cwd: repo }).status, 0);
const remoteBefore = spawnSync('git', ['ls-remote', 'origin', `refs/heads/${sourceRef}`], { cwd: repo, encoding: 'utf8' });
assert.equal(remoteBefore.status, 0, remoteBefore.stderr);
assert.equal(remoteBefore.stdout, '', `Dedicated proof ref already exists: ${remoteBefore.stdout.trim()}`);
const initialPush = spawnSync('git', ['push', 'origin', `${v1}:refs/heads/${sourceRef}`], { cwd: repo, encoding: 'utf8' });
assert.equal(initialPush.status, 0, initialPush.stderr);

const { Sandbox } = await import(pathToFileURL(`${sdkRoot}/dist/index.js`).href);
const { getAuth } = await import(pathToFileURL(`${sdkRoot}/dist/auth/index.js`).href);
const token = getAuth()?.token;
assert.ok(token, 'Vercel Sandbox CLI authentication is required');
const sandbox = await Sandbox.create({
  name: sandboxName, projectId: 'workspace-agent-lab', teamId: 'charfeng1s-projects', token,
  resources: { vcpus: 2 }, timeout: 25 * 60_000, persistent: false,
  signal: AbortSignal.timeout(60_000),
});
assert.equal(sandbox.name, sandboxName);
assert.equal(sandbox.persistent, false);
assert.equal(sandbox.vcpus, 2);
assert.equal(sandbox.memory, 4096);
assert.ok(sandbox.expiresAt);

await sandbox.fs.mkdir(inputRoot, { recursive: true });
await sandbox.fs.writeFile(`${inputRoot}/plugnz-c72.mjs`, readFileSync(artifactPath));
await sandbox.fs.writeFile(`${inputRoot}/kimi-native-git-probe.mjs`, readFileSync(resolve(repo, 'test/kimi-native-git-probe.mjs')));
await sandbox.fs.writeFile(`${inputRoot}/kimi-native-final-c72.mjs`, readFileSync(resolve(repo, 'test/kimi-native-final-c72.mjs')));
const readable = await sandbox.runCommand({ cmd: 'sudo', args: ['chmod', '-R', 'a=rX', inputRoot] });
assert.equal(readable.exitCode, 0, await readable.stderr());
const df = await sandbox.runCommand({ cmd: 'df', args: ['-Pk', '/'] });
assert.equal(df.exitCode, 0, await df.stderr());
const baselineUsedBytes = Number((await df.stdout()).trim().split('\n').at(-1).trim().split(/\s+/u)[2]) * 1024;
assert.ok(Number.isSafeInteger(baselineUsedBytes) && baselineUsedBytes > 0);

const setup = mkdtempSync('/tmp/plugnz-kimi-final-c72-setup-');
const configPath = `${setup}/config.json`;
const config = {
  sandbox: sandboxName, project: 'workspace-agent-lab', team: 'charfeng1s-projects', cli, sdkRoot,
  expiresAt: sandbox.expiresAt.getTime(), baselineUsedBytes,
  diskGrowthBytes: 2 * 1024 ** 3, diskReserveBytes: 640 * 1024 ** 2, archiveBytes: 512 * 1024 ** 2,
  operation: 'acquisition', experimentUid: 21041, evidenceRoot, supplierScratchRoot: '/vercel/sandbox/native',
  output, archiveAt: Date.now() + 8 * 60_000,
  command: ['node', `${inputRoot}/kimi-native-final-c72.mjs`],
  suppliers: [{ root: '/vercel/sandbox/native/kimi',
    locator: 'https://registry.npmjs.org/@moonshot-ai/kimi-code/-/kimi-code-2.0.1.tgz',
    revision: 'sha512-MiNaN3kQ5t979evcHHFYh6LcsceZ4c67Cv/JDl6Vw+EJd97IazY4pgT0ILHRQ2CGNzQ3rIutgIx7BmBmcjwv/w==',
    integrityFiles: [{ path: '.plugnz-supplier-identity', sha256: identitySha256 }] }],
  inputs: { artifactSha256, oracleSha256: sha256(readFileSync(resolve(repo, 'test/kimi-native-git-probe.mjs'))),
    workflowSha256: sha256(readFileSync(resolve(repo, 'test/kimi-native-final-c72.mjs'))), sourceRef, v1, v2 },
};
writeFileSync(configPath, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
writeFileSync(`${setup}/sandbox.json`, JSON.stringify({ name: sandbox.name, persistent: sandbox.persistent,
  vcpus: sandbox.vcpus, memory: sandbox.memory, expiresAt: sandbox.expiresAt.toISOString(), baselineUsedBytes }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ phase: 'launched', sandbox: sandbox.name, setup, output, expiresAt: config.expiresAt, archiveAt: config.archiveAt }));

const controller = spawn(process.execPath, [resolve(repo, 'scripts/sandbox-preservation-controller.mjs'), configPath], {
  cwd: repo, env: process.env, stdio: ['ignore', 'inherit', 'inherit'],
});
const controllerDone = new Promise(resolveExit => {
  controller.once('error', error => resolveExit({ code: null, signal: null, error: String(error) }));
  controller.once('close', (code, signal) => resolveExit({ code, signal, error: null }));
});

let ready = null;
for (let attempt = 0; attempt < 420; attempt++) {
  const done = await Promise.race([controllerDone, new Promise(resolveWait => setTimeout(() => resolveWait(null), 1_000))]);
  if (done !== null) throw new Error(`Controller exited before V1 readiness: ${JSON.stringify(done)}`);
  try { ready = JSON.parse(await sandbox.fs.readFile(`${evidenceRoot}/V1.ready.json`, 'utf8')); break; }
  catch (error) { if (!String(error).includes('404') && !String(error).includes('ENOENT')) throw error; }
}
assert.deepEqual(ready, { sourceRef, revision: v1, at: ready?.at });
assert.match(ready.at, /^\d{4}-\d{2}-\d{2}T/u);
const finalPush = spawnSync('git', ['push', 'origin', `${v2}:refs/heads/${sourceRef}`], { cwd: repo, encoding: 'utf8' });
assert.equal(finalPush.status, 0, finalPush.stderr);
console.log(JSON.stringify({ phase: 'source-advanced', sourceRef, revision: v2 }));

const terminal = await controllerDone;
const receipt = existsSync(`${output}/receipt.json`) ? JSON.parse(readFileSync(`${output}/receipt.json`, 'utf8')) : null;
writeFileSync(`${setup}/terminal.json`, JSON.stringify({ terminal, receipt }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ phase: 'controller-terminal', terminal, receipt }));
assert.ok(receipt, 'Preservation controller produced no complete receipt');
assert.equal(terminal.code, 0, `Kimi workflow did not converge: ${JSON.stringify(terminal)}`);
const stopped = await sandbox.stop({ signal: AbortSignal.timeout(30_000) });
writeFileSync(`${setup}/stop.json`, JSON.stringify({ status: stopped.status, snapshot: stopped.snapshot ?? null }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ phase: 'stopped', status: stopped.status, snapshot: stopped.snapshot ?? null }));
