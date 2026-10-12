// One complete scenario per controller-owned immutable root; no home relocation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { accessSync, constants, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const [arm, source, v1, v2, v3, baseline] = process.argv.slice(2);
assert(['rollback', 'foreign', 'cache', 'inactive', 'sparse', 'malformed'].includes(arm));
const root = process.cwd();
assert.match(root, /^\/vercel\/sandbox\/proof\/codex-native-b029c54-[a-z0-9-]+$/);
const caps = readFileSync('/proc/self/status', 'utf8');
assert.match(caps, /^NoNewPrivs:\s+1$/m);
for (const field of ['Inh', 'Prm', 'Eff', 'Bnd', 'Amb']) assert.match(caps, new RegExp(`^Cap${field}:\\s+0+$`, 'm'));
assert.notEqual(process.getuid(), 22064, 'Native case must not share acquisition UID');
assert.deepEqual(process.getgroups(), [], 'No inherited acquisition group authority');
const supplierInput = JSON.parse(readFileSync('/vercel/sandbox/proof/codex-acquisition03-input.json', 'utf8'));
assert.equal(supplierInput.archiveSha256, 'ca055d81032720a7c1b5190c3597869e3da39e8613b6fdc3650c47192343882f');
assert.equal(supplierInput.locator, 'https://registry.npmjs.org/@openai/codex/0.162.0');
assert.equal(supplierInput.revision, '0.162.0');
const supplier = '/vercel/sandbox/native/codex-0162';
const binary = join(supplier, 'node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex');
const binarySha = () => createHash('sha256').update(readFileSync(binary)).digest('hex');
function verifySupplier() {
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const status = readFileSync(`/proc/${name}/status`, 'utf8');
      assert(!(Number(status.match(/^Uid:\s+(\d+)/m)?.[1]) === 22064 && !/^State:\s+Z/m.test(status)), 'Acquisition UID writers remain live');
    } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  }
  for (const path of [supplier, ...supplierInput.inventory.map(row => join(supplier, row.path))]) {
    let writable = false;
    try { accessSync(path, constants.W_OK); writable = true; } catch (error) { assert.equal(error.code, 'EACCES'); }
    assert.equal(writable, false, `Existing supplier input is writable by Native case: ${path}`);
  }
  for (const row of supplierInput.inventory) {
    const path = join(supplier, row.path), stat = lstatSync(path);
    if (row.kind === 'file') {
      assert(stat.isFile()); assert.equal(stat.size, row.bytes); assert.equal(stat.mode & 0o777, row.mode);
      assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), row.sha256);
    } else if (row.kind === 'directory') { assert(stat.isDirectory()); assert.equal(stat.mode & 0o777, row.mode); }
  }
  assert.equal(binarySha(), '50ed828f357c655a3c82054d346cab8434f24901f14ec19b8267571bdd008b38');
}
verifySupplier();
writeFileSync(join(root, 'supplier-provenance.json'), JSON.stringify({ ...supplierInput, supplierRoot: supplier, caseUid: process.getuid(), groups: process.getgroups(), caps, binaryBefore: binarySha() }, null, 2), { flag: 'wx' });
assert.match(source, /^https:\/\/github\.com\/archeism\/plugnz\.git#proof\/codex-b029c54-source-20261011(?:-[a-z0-9-]+)?$/);
for (const revision of [v1, v2, v3]) assert.match(revision, /^[a-f0-9]{40}$/);
for (const name of ['probe', 'boundary', 'surfaces', 'preflight', 'run']) {
  copyFileSync(`/vercel/sandbox/proof/codex-preserved-native-${name}.mjs`, join(root, `codex-preserved-native-${name}.mjs`));
}
copyFileSync('/vercel/sandbox/proof/plugnz-frozen-b029c54.mjs', join(root, 'plugnz-candidate.mjs'));
assert.equal(createHash('sha256').update(readFileSync(join(root, 'plugnz-candidate.mjs'))).digest('hex'), 'c72c6e9674c454bc6a54e68c0b89f8670a2017fd54c9d76131234d619fafd606');
assert(Number.isSafeInteger(Number(baseline)) && Number(baseline) > 0);
writeFileSync(join(root, 'baseline-disk.json'), JSON.stringify({ usedKiB: Number(baseline) / 1024 }), { flag: 'wx' });
writeFileSync(join(root, 'frozen-inputs.json'), JSON.stringify({ arm, source, v1, v2, v3, baseline: Number(baseline), artifactSha256: 'c72c6e9674c454bc6a54e68c0b89f8670a2017fd54c9d76131234d619fafd606' }, null, 2), { flag: 'wx' });
mkdirSync(join(root, 'tmp'));
const env = { ...process.env, TMPDIR: join(root, 'tmp'), TMP: join(root, 'tmp'), TEMP: join(root, 'tmp'), PLGNZ_PROOF_BASE: root, PLGNZ_PROOF_SOURCE: source };
function run(label, script, args) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], { env, cwd: root, encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 ** 2 });
  writeFileSync(join(root, `${label}-streams.json`), JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }, null, 2), { flag: 'wx' });
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
}
async function waitRevision(label, revision) {
  writeFileSync(join(root, 'progress.json'), JSON.stringify({ label, revision, arm, source, at: Date.now() }));
  const [url, ref] = source.split('#');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = spawnSync('git', ['ls-remote', url, `refs/heads/${ref}`], { encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024 });
    if (result.status === 0 && result.stdout.trim().split(/\s+/)[0] === revision) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.fail(`Source did not reach required immutable ${label} revision within gate deadline`);
}
await waitRevision('bootstrap-v1', v1);
run('bootstrap', 'codex-preserved-native-probe.mjs', ['bootstrap', arm, v1]);
await waitRevision('advance-v2', v2);
if (['inactive', 'sparse', 'malformed'].includes(arm)) {
  run('preflight', 'codex-preserved-native-preflight.mjs', [arm, v2]);
} else {
  run('refresh', 'codex-preserved-native-probe.mjs', ['refresh', arm, v2]);
  await waitRevision('advance-v3', v3);
  const phase = { rollback: 'native-exit', foreign: 'foreign-checkout', cache: 'foreign-cache' }[arm];
  run('fault', 'codex-preserved-native-probe.mjs', [phase, arm, v3]);
}
verifySupplier();
writeFileSync(join(root, 'complete.json'), JSON.stringify({ arm, source, binaryAfter: binarySha(), at: Date.now() }), { flag: 'wx' });
console.log(JSON.stringify({ arm, source, result: 'verified' }));
