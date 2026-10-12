// Prepare a frozen archived dependency identity from the verified acquisition.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = '/tmp/plugnz-codex-b029c54-acquisition-03';
const read = path => JSON.parse(readFileSync(`${source}/${path}`, 'utf8'));
const receipt = read('receipt.json');
const expected = 'ca055d81032720a7c1b5190c3597869e3da39e8613b6fdc3650c47192343882f';
assert.equal(receipt.sha256, expected);
assert.equal(createHash('sha256').update(readFileSync(`${source}/evidence.tar.gz`)).digest('hex'), expected);
const suppliers = read('restored/control/reconstructible-suppliers.json');
assert.equal(suppliers.length, 1);
const supplier = suppliers[0];
assert.equal(supplier.acquisition, 'verified-bodies');
const metadata = read('restored/trial/official-supplier-metadata.json');
const input = { archiveSha256: expected, receipt, locator: supplier.locator, revision: supplier.revision,
  inventory: supplier.inventory, omittedPaths: supplier.omittedPaths,
  packageLock: read('restored/trial/package-lock.json'),
  registryBindings: metadata.map(row => ({ name: row.name, version: row.version, dist: row.dist })) };
writeFileSync('/tmp/plugnz-codex-acquisition03-input.json', JSON.stringify(input, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ archiveSha256: expected, inventoryEntries: supplier.inventory.length, registryBindings: metadata.length }));
