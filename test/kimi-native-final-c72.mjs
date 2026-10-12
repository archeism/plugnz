// Genuine Kimi 2.0.1 NativeGit workflow. Run only through the reviewed
// preservation controller inside an owned, nonpersistent Vercel Sandbox.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(process.cwd());
assert.match(root, /^\/vercel\/sandbox\/proof\/[a-zA-Z0-9_-]+$/u, 'Workflow requires one owned Sandbox proof root');
const inputRoot = '/vercel/sandbox/proof/final-c72-inputs';
const sourceRef = 'proof/kimi-native-c72-20261012';
const v1 = 'f60a45efeab8b608995ec06eb022ced88d42aedf';
const v2 = 'db0237713b2e4d07f5ef3baa65d66b043eab49bc';
const artifact = join(root, 'plugnz-c72.mjs');
const oracle = join(root, 'kimi-native-git-probe.mjs');
const supplier = '/vercel/sandbox/native/kimi';
const identity = '@moonshot-ai/kimi-code@2.0.1\n';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const artifactBytes = readFileSync(join(inputRoot, 'plugnz-c72.mjs'));
assert.equal(hash(artifactBytes), 'c72c6e9674c454bc6a54e68c0b89f8670a2017fd54c9d76131234d619fafd606');
writeFileSync(artifact, artifactBytes, { flag: 'wx' });
writeFileSync(oracle, readFileSync(join(inputRoot, 'kimi-native-git-probe.mjs')), { flag: 'wx' });
writeFileSync(join(root, 'kimi-native-final-c72.mjs'), readFileSync(fileURLToPath(import.meta.url)), { flag: 'wx' });
mkdirSync(supplier, { recursive: false });
writeFileSync(join(supplier, '.plugnz-supplier-identity'), identity, { flag: 'wx' });

function command(label, executable, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(executable, args, {
    cwd: root, env: process.env, encoding: 'utf8', timeout: options.timeout ?? 240_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const record = { label, args, status: result.status, signal: result.signal, error: result.error === undefined ? null : String(result.error),
    milliseconds: performance.now() - started, stdout: result.stdout, stderr: result.stderr };
  writeFileSync(join(root, `${label}.json`), JSON.stringify(record, null, 2), { flag: 'wx' });
  assert.equal(result.error, undefined, `${label}: ${String(result.error)}`);
  assert.equal(result.status, 0, `${label}: ${result.stdout}\n${result.stderr}`);
  return result;
}

command('npm-install', 'npm', ['install', '--prefix', supplier, '--cache', join(supplier, '.npm-cache'),
  '--no-audit', '--no-fund', '--loglevel=error', '@moonshot-ai/kimi-code@2.0.1']);
const packageJson = JSON.parse(readFileSync(join(supplier, 'node_modules/@moonshot-ai/kimi-code/package.json'), 'utf8'));
assert.equal(packageJson.name, '@moonshot-ai/kimi-code');
assert.equal(packageJson.version, '2.0.1');
command('kimi-v1', process.execPath, [oracle, 'V1', v1, '01', 'c72', '00', sourceRef]);
writeFileSync(join(root, 'V1.ready.json'), JSON.stringify({ sourceRef, revision: v1, at: new Date().toISOString() }), { flag: 'wx' });

let observed = null;
for (let attempt = 0; attempt < 180; attempt++) {
  const lookup = spawnSync('git', ['ls-remote', 'https://github.com/archeism/plugnz.git', `refs/heads/${sourceRef}`], {
    cwd: root, env: process.env, encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(lookup.error, undefined, String(lookup.error));
  assert.equal(lookup.status, 0, lookup.stderr);
  observed = lookup.stdout.trim().split(/\s+/u)[0] ?? null;
  if (observed === v2) break;
  assert.ok(observed === v1 || observed === '', `Proof ref moved to unexpected revision ${observed}`);
  await new Promise(resolveWait => setTimeout(resolveWait, 1_000));
}
assert.equal(observed, v2, 'Proof ref did not advance from V1 to V2 within 180 seconds');
command('kimi-v2', process.execPath, [oracle, 'V2', v2, '01', 'c72', '00', sourceRef]);
writeFileSync(join(root, 'workflow.result.json'), JSON.stringify({ sourceRef, v1, v2, candidate: 'c72', artifactSha256: hash(readFileSync(artifact)),
  supplier: { name: packageJson.name, version: packageJson.version, identitySha256: hash(identity) } }, null, 2), { flag: 'wx' });
