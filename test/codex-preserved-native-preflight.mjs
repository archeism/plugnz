// Public route admission probes against homes bootstrapped by the released CLI.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureSurfaces, treeDigest } from './codex-preserved-native-surfaces.mjs';

const [arm, revision] = process.argv.slice(2);
assert(['inactive', 'sparse', 'malformed'].includes(arm));
assert.match(revision, /^[a-f0-9]{40}$/);
const base = process.env.PLGNZ_PROOF_BASE ?? '/vercel/sandbox/proof/codex-native-b029c54-01';
assert.match(base, /^\/vercel\/sandbox\/proof\/codex-native-b029c54-[a-z0-9-]+$/);
const source = process.env.PLGNZ_PROOF_SOURCE ?? 'https://github.com/archeism/plugnz.git#proof/codex-b029c54-source-20261011';
assert.match(source, /^https:\/\/github\.com\/archeism\/plugnz\.git#proof\/codex-b029c54-source-20261011(?:-[a-z0-9-]+)?$/);
const root = join(base, arm), home = join(root, 'home'), codexHome = join(home, '.codex');
const file = join(codexHome, 'config.toml');
let config = readFileSync(file, 'utf8');
assert.equal((config.match(/ref = "[a-f0-9]{40}"/g) ?? []).length, 1);
config = config.replace(/ref = "[a-f0-9]{40}"/, `ref = "${revision}"`);
const slot = join(codexHome, 'plugins/cache/plugnz-proof/lifecycle-probe');
if (arm === 'inactive') {
  const older = join(slot, '0.0.9'); mkdirSync(older);
  writeFileSync(join(older, 'plugin.json'), '{"name":"lifecycle-probe","version":"0.0.9"}');
  writeFileSync(join(older, '.plgnz-install.json'), JSON.stringify({ source: 'https://github.com/archeism/plugnz.git', pluginId: 'lifecycle-probe@plugnz-proof', fingerprint: 'retained-history' }));
  writeFileSync(join(older, 'valuable.txt'), 'older canonical inactive bytes\n');
  chmodSync(older, 0o750); chmodSync(join(older, 'valuable.txt'), 0o600);
  writeFileSync(join(slot, 'user-note.json'), '{"valuable":"retained metadata"}');
} else {
  const value = arm === 'sparse' ? '["test/fixtures/codex-native-proof"]' : '"invalid scalar"';
  assert(config.includes('[marketplaces.plugnz-proof]'));
  config = config.replace('[marketplaces.plugnz-proof]', `[marketplaces.plugnz-proof]\nsparse_paths = ${value}`);
}
writeFileSync(file, config);
mkdirSync(join(home, '.cursor'), { recursive: true });
const before = captureSurfaces(codexHome);
const cursorBefore = treeDigest(join(home, '.cursor'));
const stateBefore = treeDigest(join(home, 'state.json'));
const olderBefore = treeDigest(join(slot, '0.0.9'));
const noteBefore = treeDigest(join(slot, 'user-note.json'));
const wrapper = join(base, 'codex-preserved-native-boundary.mjs'); chmodSync(wrapper, 0o755);
const result = spawnSync(process.execPath, [join(base, 'plugnz-candidate.mjs'), 'sync',
  source,
  ...(arm === 'malformed' ? ['--target', 'cursor'] : []), '--target', 'codex', '--json'], {
  env: { ...process.env, HOME: home, CODEX_HOME: codexHome, OPEN_PLUGIN_HOME: home,
    OPEN_PLUGIN_CODEX_HOME: codexHome, OPEN_PLUGIN_CODEX_BIN: wrapper, PLGNZ_PROOF_ROOT: root },
  cwd: root, encoding: 'utf8', timeout: 150_000, maxBuffer: 4 * 1024 ** 2,
});
writeFileSync(join(root, 'preflight-streams.json'), JSON.stringify({ ...result }, null, 2), { flag: 'wx' });
const report = JSON.parse(result.stdout);
writeFileSync(join(root, 'preflight-report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
const trace = join(root, 'native-calls.jsonl');
const calls = existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
assert(!calls.some(args => args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'upgrade'));
if (arm === 'malformed') {
  assert.equal(result.status, 1); assert.equal(report.summary.mutationStarted, false);
  assert.deepEqual(captureSurfaces(codexHome), before);
  assert.equal(treeDigest(join(home, '.cursor')), cursorBefore);
  assert.equal(treeDigest(join(home, 'state.json')), stateBefore);
  assert.match(JSON.stringify(report), /invalid Codex marketplace sparse_paths/);
} else {
  assert.equal(result.status, 0);
  assert.equal(report.summary.result, 'converged');
  assert.equal(report.outcomes.length, 1); assert.equal(report.outcomes[0].route, 'managed');
  assert.equal(treeDigest(join(slot, '0.0.9')), olderBefore);
  assert.equal(treeDigest(join(slot, 'user-note.json')), noteBefore);
}
console.log(JSON.stringify({ arm, revision, before, after: captureSurfaces(codexHome), calls, summary: report.summary }));
