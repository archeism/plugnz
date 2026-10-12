// Frozen root-owned helper; execute only outside every case-owned directory.
import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verifySupplierEntry } from './codex-preserved-native-inventory.mjs';
assert.equal(process.getuid(), 0);
const [caseId, phase, caseArchiveSha256] = process.argv.slice(2);
assert.match(caseId, /^codex-native-b029c54-[a-z0-9-]+$/);
assert(['before', 'after'].includes(phase));
if (phase === 'after') assert.match(caseArchiveSha256, /^[a-f0-9]{64}$/);
else assert.equal(caseArchiveSha256, 'pending');
for (const file of [fileURLToPath(import.meta.url), '/vercel/sandbox/proof/codex-preserved-native-inventory.mjs', '/vercel/sandbox/proof/codex-acquisition03-input.json']) {
  assert(file.startsWith('/vercel/sandbox/proof/'));
  const stat = lstatSync(file); assert(stat.isFile()); assert.equal(stat.uid, 0); assert.equal(stat.mode & 0o022, 0);
}
const input = JSON.parse(readFileSync('/vercel/sandbox/proof/codex-acquisition03-input.json', 'utf8'));
assert.equal(input.archiveSha256, 'ca055d81032720a7c1b5190c3597869e3da39e8613b6fdc3650c47192343882f');
for (const name of readdirSync('/proc')) {
  if (!/^\d+$/.test(name)) continue;
  try { const status = readFileSync(`/proc/${name}/status`, 'utf8'); assert(!(Number(status.match(/^Uid:\s+(\d+)/m)?.[1]) === 22064 && !/^State:\s+Z/m.test(status))); }
  catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
}
const supplierRoot = '/vercel/sandbox/native/codex-0162';
const actual = [];
function walk(relative = '') {
  for (const name of readdirSync(join(supplierRoot, relative)).sort()) {
    const path = join(relative, name); actual.push(path);
    const stat = lstatSync(join(supplierRoot, path));
    if (stat.isDirectory()) walk(path);
  }
}
walk(); assert.deepEqual(actual.sort(), input.inventory.map(row => row.path).sort(), 'Supplier entry set changed');
for (const row of input.inventory) verifySupplierEntry(supplierRoot, row);
console.log(JSON.stringify({ caseId, phase, caseArchiveSha256, acquisitionArchiveSha256: input.archiveSha256,
  verifiedEntries: input.inventory.length, supplierInventorySha256: createHash('sha256').update(JSON.stringify(input.inventory)).digest('hex'),
  helperSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  inventoryHelperSha256: createHash('sha256').update(readFileSync('/vercel/sandbox/proof/codex-preserved-native-inventory.mjs')).digest('hex'), at: Date.now() }));
