// Released native Codex primitive probe; no model/API credentials are used.
// Run in a disposable Sandbox under setpriv with all capability sets dropped.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { cpus, totalmem } from 'node:os';

const root = process.argv[2];
assert(root && root.startsWith('/vercel/sandbox/codex-native-proof/'));
assert(!existsSync(root), 'use a fresh named proof root');
mkdirSync(root, { recursive: true });
const started = Date.now(), cpuStarted = process.cpuUsage();
const home = join(root, 'home'), codexHome = join(home, '.codex');
mkdirSync(home);
mkdirSync(codexHome);
const native = '/vercel/sandbox/native-tools/node_modules/.bin/codex';
const env = { ...process.env, HOME: home, CODEX_HOME: codexHome, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' };
const url = 'https://github.com/archeism/plugnz.git';
const v1 = 'c7e8ddd43e5419be18eac7817275f59ac80beb11';
const v2 = 'c49adb733cd8e19d8c116707b2d24101b4f2ea10';
const streams = [];
function command(label, executable, args, allowed = [0]) {
  const began = Date.now();
  const result = spawnSync(executable, args, { env, cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 });
  streams.push({ label, executable, args, status: result.status, signal: result.signal, elapsedMs: Date.now() - began, stdout: result.stdout, stderr: result.stderr });
  writeFileSync(join(root, 'streams.json'), JSON.stringify(streams, null, 2));
  assert(allowed.includes(result.status), `${label}: ${result.status}: ${result.stderr}`);
  return result;
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function tree(path) {
  if (!existsSync(path)) return null;
  const rows = [];
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name), info = statSync(file);
      if (info.isDirectory()) walk(file);
      else rows.push([relative(path, file), sha(readFileSync(file)), info.mode & 0o777]);
    }
  }
  walk(path); return { digest: sha(JSON.stringify(rows)), files: rows };
}
function retarget(revision) {
  const config = join(codexHome, 'config.toml'), prior = readFileSync(config, 'utf8');
  assert(prior.includes(url));
  assert(prior.includes(`ref = "${v1}"`) || prior.includes(`ref = "${v2}"`));
  writeFileSync(config, prior.replace(/ref = "[0-9a-f]{40}"/u, `ref = "${revision}"`));
}

const version = command('version', native, ['--version']).stdout.trim();
assert.equal(version, 'codex-cli 0.162.0');
const capabilityStatus = readFileSync('/proc/self/status', 'utf8').split('\n').filter(line => /^(Cap(Inh|Prm|Eff|Bnd|Amb)|NoNewPrivs):/u.test(line));
assert(capabilityStatus.filter(line => line.startsWith('Cap')).every(line => /\s0+$/u.test(line)), capabilityStatus.join('\n'));
command('marketplace-v1', native, ['plugin', 'marketplace', 'add', url, '--ref', v1, '--json']);
const added = JSON.parse(command('plugin-add-v1', native, ['plugin', 'add', 'lifecycle-probe@plugnz-proof', '--json']).stdout);
writeFileSync(join(root, 'native-add-result.json'), JSON.stringify(added, null, 2));
const slot = join(codexHome, 'plugins/cache/plugnz-proof/lifecycle-probe/0.1.0');
assert(readFileSync(join(slot, 'skills/probe/SKILL.md'), 'utf8').includes('V1.'));
const checkout = join(codexHome, '.tmp/marketplaces/plugnz-proof');
assert(existsSync(checkout), 'verify actual checkout location');
const data = join(codexHome, 'plugins/data/lifecycle-probe/keep.txt'); mkdirSync(dirname(data), { recursive: true }); writeFileSync(data, 'valuable runtime data\n');
const beforeUpgrade = { plugin: tree(slot), checkout: tree(checkout), config: sha(readFileSync(join(codexHome, 'config.toml'))) };
retarget(v2);
const upgraded = JSON.parse(command('native-exact-same-version-upgrade', native, ['plugin', 'marketplace', 'upgrade', 'plugnz-proof', '--json']).stdout);
assert.deepEqual(upgraded.errors, []);
assert(readFileSync(join(slot, 'skills/probe/SKILL.md'), 'utf8').includes('V2, unchanged declared version.'));
assert(readFileSync(join(slot, 'resources/probe.txt'), 'utf8').includes('V2, unchanged declared version.'));
assert.equal(readFileSync(data, 'utf8'), 'valuable runtime data\n');
const checkoutRevision = command('checkout-revision-v2', 'git', ['-C', checkout, 'rev-parse', 'HEAD']).stdout.trim(); assert.equal(checkoutRevision, v2);
const afterUpgrade = { plugin: tree(slot), checkout: tree(checkout), config: sha(readFileSync(join(codexHome, 'config.toml'))) };
assert.notEqual(beforeUpgrade.checkout.digest, afterUpgrade.checkout.digest);

// A plugin-cache failure can happen after the native marketplace checkout has
// already advanced. Capture all collateral roots, not only the plugin cache.
const backup = join(root, 'rollback-home'); cpSync(codexHome, backup, { recursive: true });
const beforeFailure = tree(codexHome);
retarget(v1);
chmodSync(dirname(slot), 0o555);
const failed = command('native-failed-upgrade', native, ['plugin', 'marketplace', 'upgrade', 'plugnz-proof', '--json'], [1]);
chmodSync(dirname(slot), 0o755);
const afterFailure = tree(codexHome);
const failedCheckoutRevision = command('checkout-revision-after-failure', 'git', ['-C', checkout, 'rev-parse', 'HEAD']).stdout.trim();
// This restoration is deliberately explicit probe control, not evidence that
// Codex natively performs a whole-marketplace rollback on its own.
rmSync(codexHome, { recursive: true }); cpSync(backup, codexHome, { recursive: true });
assert.equal(tree(codexHome).digest, beforeFailure.digest);
assert.equal(readFileSync(data, 'utf8'), 'valuable runtime data\n');
assert.equal(command('checkout-revision-after-controlled-rollback', 'git', ['-C', checkout, 'rev-parse', 'HEAD']).stdout.trim(), v2);
const result = { schemaVersion: 1, version, node: process.version, url, frozenRevisions: { v1, v2 }, platform: process.platform, cpuCount: cpus().length, memoryBytes: totalmem(), capabilityStatus, nativeSameVersionUpgrade: upgraded, nativeFailure: { status: failed.status, stdout: failed.stdout, stderr: failed.stderr, checkoutRevision: failedCheckoutRevision, nativeCollateralChanged: afterFailure.digest !== beforeFailure.digest }, controlledRollbackExact: true, beforeUpgrade, afterUpgrade, beforeFailure, afterFailure, elapsedMs: Date.now() - started, controllerCpuMicroseconds: process.cpuUsage(cpuStarted) };
writeFileSync(join(root, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ version, sameVersionUpgrade: true, failedUpgradeStatus: failed.status, failedCheckoutRevision, controlledRollbackExact: true, elapsedMs: result.elapsedMs }));
