// Official supplier installation only in the fresh disposable proof Sandbox.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const base = '/vercel/sandbox/codex-final-proof';
const tools = '/vercel/sandbox/native-tools';
assert(!existsSync(base) && !existsSync(tools), 'fresh measurement-only Sandbox required');
mkdirSync(base, { recursive: true });
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`); return result.stdout;
};
const disk = () => {
  const raw = run('df', ['-Pk', '/']);
  const usedKiB = Number(raw.trim().split('\n').at(-1).trim().split(/\s+/)[2]);
  assert(Number.isSafeInteger(usedKiB) && usedKiB > 0 && usedKiB <= 4.25 * 1024 * 1024);
  return { usedKiB, raw };
};
const baseline = disk();
writeFileSync(join(base, 'baseline-disk.json'), JSON.stringify(baseline, null, 2));
const result = spawnSync('npm', ['install', '--prefix', tools, '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '@openai/codex@0.162.0'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
writeFileSync(join(base, 'official-install-streams.json'), JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }, null, 2));
assert.equal(result.status, 0, result.stderr);
const lock = JSON.parse(readFileSync(join(tools, 'package-lock.json'), 'utf8'));
const supplierMetadata = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || !existsSync(join(tools, path))) continue;
  assert(path.startsWith('node_modules/@openai/codex'), `unexpected dependency: ${path}`);
  const name = path.slice('node_modules/'.length);
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${entry.version}`);
  assert(response.ok);
  const metadata = await response.json();
  supplierMetadata.push(metadata);
  writeFileSync(join(base, 'official-supplier-metadata.json'), JSON.stringify(supplierMetadata, null, 2));
  assert.equal(entry.integrity, metadata.dist.integrity);
  assert.equal(entry.resolved, metadata.dist.tarball);
  assert(new URL(entry.resolved).hostname === 'registry.npmjs.org');
}
const binaries = [];
const visit = path => {
  for (const name of readdirSync(path)) {
    const file = join(path, name), stat = statSync(file);
    if (stat.isDirectory()) visit(file);
    else if (name === 'codex' && stat.isFile()) binaries.push({ path: file, bytes: stat.size, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') });
  }
};
visit(join(tools, 'node_modules/@openai'));
assert(binaries.length > 0);
const after = disk(); assert(after.usedKiB - baseline.usedKiB <= 1.5 * 1024 * 1024);
const evidence = { baseline, after, binaries, node: process.version, nativeVersion: run(join(tools, 'node_modules/.bin/codex'), ['--version']).trim() };
assert.equal(evidence.nativeVersion, 'codex-cli 0.162.0');
writeFileSync(join(base, 'official-install-result.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
