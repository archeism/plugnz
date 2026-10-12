// Manual evidence helper: measure the exact pinned ZCode lock against primary
// GitHub/npm metadata without downloading package bodies.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import YAML from 'yaml';

const [output] = process.argv.slice(2);
assert.ok(output, 'usage: node scripts/zcode-source-budget-measure.mjs <new-output.json>');

const revision = '872ad960de7ec172591f7e1952f7849229f94521';
const lockUrl = `https://raw.githubusercontent.com/zai-org/ZCode/${revision}/pnpm-lock.yaml`;
const lockResponse = await fetch(lockUrl);
assert.equal(lockResponse.status, 200);
const lockText = await lockResponse.text();
const lock = YAML.parse(lockText);
assert.equal(lock.lockfileVersion, '9.0');

const packages = Object.keys(lock.packages).map((key) => {
  const base = key.split('(')[0];
  const separator = base.lastIndexOf('@');
  assert.ok(separator > 0);
  return { key, name: base.slice(0, separator), version: base.slice(separator + 1) };
});
assert.equal(packages.length, 1881);

function allows(values, actual) {
  if (!Array.isArray(values)) return true;
  if (values.includes(`!${actual}`)) return false;
  const positive = values.filter((value) => !value.startsWith('!'));
  return positive.length === 0 || positive.includes(actual) || positive.includes('any');
}

let next = 0;
const rows = [];
async function worker() {
  for (;;) {
    const index = next++;
    if (index >= packages.length) return;
    const item = packages[index];
    const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(item.name)}/${encodeURIComponent(item.version)}`;
    const metadataResponse = await fetch(metadataUrl);
    assert.equal(metadataResponse.status, 200, metadataUrl);
    const metadata = await metadataResponse.json();
    const applicable = allows(metadata.os, 'linux') && allows(metadata.cpu, 'x64') && allows(metadata.libc, 'glibc');
    let packedBytes = null;
    let rangeStatus = null;
    if (applicable) {
      assert.ok(metadata.dist?.tarball && metadata.dist?.integrity, metadataUrl);
      const range = await fetch(metadata.dist.tarball, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
      rangeStatus = range.status;
      const match = /\/(\d+)$/u.exec(range.headers.get('content-range') ?? '');
      assert.equal(range.status, 206, metadata.dist.tarball);
      assert.ok(match, metadata.dist.tarball);
      packedBytes = Number(match[1]);
      assert.ok(Number.isSafeInteger(packedBytes) && packedBytes > 0);
      await range.body?.cancel();
    }
    rows.push({
      ...item,
      applicable,
      os: metadata.os ?? null,
      cpu: metadata.cpu ?? null,
      libc: metadata.libc ?? null,
      unpackedBytes: metadata.dist?.unpackedSize ?? null,
      packedBytes,
      rangeStatus,
      tarball: metadata.dist?.tarball ?? null,
      integrity: metadata.dist?.integrity ?? null,
    });
  }
}

await Promise.all(Array.from({ length: 32 }, worker));
rows.sort((a, b) => a.key.localeCompare(b.key));
const applicable = rows.filter((row) => row.applicable);
const unpacked = applicable.filter((row) => Number.isSafeInteger(row.unpackedBytes));
const result = {
  schema: 1,
  source: { repository: 'zai-org/ZCode', revision, lockUrl },
  lock: {
    bytes: Buffer.byteLength(lockText),
    sha256: createHash('sha256').update(lockText).digest('hex'),
    importers: Object.keys(lock.importers).length,
    packages: packages.length,
  },
  platform: { os: 'linux', cpu: 'x64', libc: 'glibc' },
  summary: {
    applicablePackages: applicable.length,
    packedPackages: applicable.filter((row) => Number.isSafeInteger(row.packedBytes)).length,
    packedBytes: applicable.reduce((sum, row) => sum + row.packedBytes, 0),
    unpackedPackages: unpacked.length,
    missingUnpackedPackages: applicable.length - unpacked.length,
    knownUnpackedBytes: unpacked.reduce((sum, row) => sum + row.unpackedBytes, 0),
  },
  rows,
};
assert.deepEqual(result.summary, {
  applicablePackages: 1636,
  packedPackages: 1636,
  packedBytes: 432452312,
  unpackedPackages: 1560,
  missingUnpackedPackages: 76,
  knownUnpackedBytes: 1696408662,
});
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output, lock: result.lock, summary: result.summary }));
