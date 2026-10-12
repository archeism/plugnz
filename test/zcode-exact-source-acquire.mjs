// NO launcher: this helper runs only inside the reviewed preservation controller.
// All source, downloads, dependency stores, build output and failed prefixes are
// retained. Do not replace this with a desktop asset/community repackaging.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE, assertArchiveMembers, assertIntegrity, assertPinnedManifests,
  buildEnvironment, installArguments, validateRoot } from './zcode-exact-source-contract.mjs';

const trial = validateRoot(process.cwd());
const supplier = '/vercel/sandbox/native/zcode-0169';
const source = join(supplier, 'source');
const record = (name, value) => writeFileSync(join(trial, `${name}.json`), JSON.stringify(value, null, 2), { flag: 'wx' });
for (const name of ['zcode-exact-source-acquire.mjs', 'zcode-exact-source-contract.mjs']) {
  copyFileSync(new URL(name, import.meta.url), join(trial, name));
}
record('frozen-source-inputs', { ...SOURCE, supplier, trial, controllerRequired: 'private-large-acquisition',
  nativeLifecycleAcceptance: false, startedAt: new Date().toISOString() });
const caps = readFileSync('/proc/self/status', 'utf8');
assert.match(caps, /^NoNewPrivs:\s+1$/mu);
for (const field of ['Inh', 'Prm', 'Eff', 'Bnd', 'Amb']) assert.match(caps, new RegExp(`^Cap${field}:\\s+0+$`, 'm'));
assert(process.getuid() >= 2000 && process.getuid() <= 60000);
assert(!existsSync(supplier), 'Supplier acquisition is single-use');
mkdirSync(supplier);
for (const name of ['downloads', 'tmp', 'home', 'pnpm-home', 'bin']) mkdirSync(join(supplier, name));
writeFileSync(join(supplier, 'acquisition-identity.txt'), `${SOURCE.revision}\n`, { flag: 'wx' });
const env = buildEnvironment(supplier);
let sequence = 0;
function run(label, executable, args, cwd = supplier, timeout = 120_000, maxBuffer = 4 * 1024 ** 2) {
  const started = Date.now();
  const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer });
  record(`${String(++sequence).padStart(2, '0')}-${label}`, { executable, args, cwd, started,
    milliseconds: Date.now() - started, status: result.status, signal: result.signal,
    error: result.error?.message, stdout: result.stdout, stderr: result.stderr });
  assert.equal(result.status, 0, `${label} failed; complete stopped prefix must be preserved by controller`);
  return result.stdout;
}
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
try {
  // curl writes partial downloads into retained supplier storage even on timeout.
  for (const [label, url, file, integrity, namespace] of [
    ['node', SOURCE.nodeArchive, 'node.tar.xz', `sha256-${SOURCE.nodeSha256}`, 'node-v24.14.0-linux-x64'],
    ['pnpm', SOURCE.pnpmArchive, 'pnpm.tgz', SOURCE.pnpmIntegrity, 'package'],
  ]) {
    const path = join(supplier, 'downloads', file);
    run(`download-${label}`, 'curl', ['--fail', '--location', '--max-time', '110', '--output', path, url]);
    assertIntegrity(readFileSync(path), integrity);
    record(`${label}-archive-integrity`, { url, integrity, sha256: sha(path), bytes: lstatSync(path).size });
    const listing = run(`list-${label}`, 'tar', ['-tf', path], supplier, 30_000, 16 * 1024 ** 2);
    assertArchiveMembers(listing, namespace);
    run(`extract-${label}`, 'tar', ['-xf', path, '-C', supplier], supplier, 60_000);
  }
  const node = join(supplier, 'node-v24.14.0-linux-x64/bin/node');
  const pnpm = join(supplier, 'package/bin/pnpm.cjs');
  symlinkSync('../package/bin/pnpm.cjs', join(supplier, 'bin/pnpm'));
  assert.equal(run('node-version', node, ['--version']).trim(), SOURCE.nodeVersion);
  assert.equal(run('pnpm-version', node, [pnpm, '--version']).trim(), SOURCE.pnpmVersion);
  mkdirSync(source);
  run('source-init', 'git', ['init', '--quiet'], source);
  run('source-remote', 'git', ['remote', 'add', 'origin', SOURCE.locator], source);
  run('source-fetch', 'git', ['fetch', '--depth=1', '--no-tags', 'origin', SOURCE.revision], source, 180_000);
  run('source-checkout', 'git', ['checkout', '--detach', '--quiet', 'FETCH_HEAD'], source);
  assert.equal(run('source-revision', 'git', ['rev-parse', 'HEAD'], source).trim(), SOURCE.revision);
  assert.equal(run('source-clean-before', 'git', ['status', '--porcelain', '--untracked-files=no'], source), '');
  assertPinnedManifests(readJSON(join(source, 'package.json')), readJSON(join(source, 'apps/zcode-cli/package.json')),
    readJSON(join(source, 'apps/zcode-cli/packages/cli/package.json')));
  const rootLock = join(source, 'pnpm-lock.yaml');
  const lockSha256 = sha(rootLock);
  record('source-tree-before', { revision: SOURCE.revision, tree: run('tree', 'git', ['rev-parse', 'HEAD^{tree}'], source).trim(), lockSha256,
    workspaceSha256: sha(join(source, 'pnpm-workspace.yaml')) });
  // No --ignore-scripts, architecture override, nested lock or lock relaxation.
  run('frozen-root-install', node, [pnpm, ...installArguments(supplier)], source, 900_000);
  assert.equal(sha(rootLock), lockSha256);
  assert.equal(run('source-clean-after-install', 'git', ['status', '--porcelain', '--untracked-files=no'], source), '');
  // Run upstream's own app build, including its unmodified Turbo dependency DAG.
  run('official-app-build', node, [pnpm, 'run', 'build'], join(source, 'apps/zcode-cli'), 900_000);
  assert.equal(sha(rootLock), lockSha256);
  assert.equal(run('source-clean-after-build', 'git', ['status', '--porcelain', '--untracked-files=no'], source), '');
  const cli = join(source, 'apps/zcode-cli/packages/cli/dist/zcode.cjs');
  assert(lstatSync(cli).isFile()); assert.equal(lstatSync(cli).mode & 0o777, 0o755);
  assert(readFileSync(cli, 'utf8').startsWith('#!/usr/bin/env node\n'));
  const version = run('actual-cli-version', node, [cli, '--version'], source, 30_000).trim();
  assert.match(version, /(?:^|\s)0\.16\.9(?:$|\s)/u);
  record('supplier-result', { ...SOURCE, cli, node, pnpm, version, cliSha256: sha(cli),
    nodeSha256: sha(node), lockSha256, cliMode: 0o755, supplierRoot: supplier,
    runtimeClosure: 'entire restored supplier workspace/store/runtime, not single bundle',
    nativeLifecycleAcceptance: false, requiresIndependentFullArchiveRestore: true, completedAt: new Date().toISOString() });
} catch (error) {
  record('supplier-failure', { error: String(error), stack: error.stack, at: new Date().toISOString(),
    preserveAllPartialSourceAndCompilerData: true });
  throw error;
}
