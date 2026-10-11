// One complete scenario per controller-owned immutable root; no home relocation.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const [arm, source, v1, v2, v3, baseline] = process.argv.slice(2);
assert(['rollback', 'foreign', 'cache', 'inactive', 'sparse', 'malformed'].includes(arm));
const root = process.cwd();
assert.match(root, /^\/vercel\/sandbox\/proof\/codex-native-b029c54-[a-z0-9-]+$/);
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
writeFileSync(join(root, 'complete.json'), JSON.stringify({ arm, source, at: Date.now() }), { flag: 'wx' });
console.log(JSON.stringify({ arm, source, result: 'verified' }));
