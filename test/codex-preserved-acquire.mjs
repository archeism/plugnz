// Supplier acquisition only. Native lifecycle execution requires a separate gate.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
assert.match(root, /^\/vercel\/sandbox\/proof\/codex-acquire-[a-z0-9-]+$/);
writeFileSync(join(root, 'acquisition-script.mjs'), readFileSync(new URL(import.meta.url)), { flag: 'wx' });
const supplier = '/vercel/sandbox/native/codex-0162';
assert(!existsSync(supplier), 'supplier installation must be fresh');
mkdirSync(supplier, { recursive: false });
mkdirSync(join(supplier, 'tmp'));
const caps = readFileSync('/proc/self/status', 'utf8');
assert.match(caps, /^NoNewPrivs:\s+1$/m);
for (const field of ['Inh', 'Prm', 'Eff', 'Bnd', 'Amb']) assert.match(caps, new RegExp(`^Cap${field}:\\s+0+$`, 'm'));
mkdirSync(join(root, 'home'), { recursive: true });
const result = spawnSync('npm', ['install', '--prefix', supplier, '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '@openai/codex@0.162.0'], {
  env: { ...process.env, TMPDIR: join(supplier, 'tmp'), TMP: join(supplier, 'tmp'), TEMP: join(supplier, 'tmp'), NPM_CONFIG_CACHE: join(supplier, 'npm-cache') },
  encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 ** 2,
});
writeFileSync(join(root, 'install-streams.json'), JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }, null, 2), { flag: 'wx' });
assert.equal(result.status, 0, result.stderr);
const lock = JSON.parse(readFileSync(join(supplier, 'package-lock.json'), 'utf8'));
writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock, null, 2), { flag: 'wx' });
const metadata = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  assert(path.startsWith('node_modules/@openai/codex'), path);
  const name = entry.name ?? path.slice('node_modules/'.length);
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${entry.version}`, { signal: AbortSignal.timeout(15_000) });
  assert(response.ok);
  const value = await response.json();
  assert.equal(entry.integrity, value.dist.integrity);
  assert.equal(entry.resolved, value.dist.tarball);
  assert.equal(new URL(entry.resolved).hostname, 'registry.npmjs.org');
  metadata.push(value);
}
writeFileSync(join(root, 'official-supplier-metadata.json'), JSON.stringify(metadata, null, 2), { flag: 'wx' });
const binary = join(supplier, 'node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex');
const sha256 = createHash('sha256').update(readFileSync(binary)).digest('hex');
assert.equal(sha256, '50ed828f357c655a3c82054d346cab8434f24901f14ec19b8267571bdd008b38');
const version = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 10_000 });
assert.equal(version.status, 0); assert.equal(version.stdout.trim(), 'codex-cli 0.162.0');
writeFileSync(join(root, 'acquisition-result.json'), JSON.stringify({ supplier, binary, sha256, version: version.stdout.trim(), node: process.version, uid: process.getuid(), metadataCount: metadata.length }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ sha256, version: version.stdout.trim(), supplier }));
