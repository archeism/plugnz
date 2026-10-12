// Isolated worker for private large-acquisition retention measurement. A slow
// filesystem walk cannot block the supervisor's whole-FS guard or kill timer.
import assert from 'node:assert/strict';
import { existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { fileHash, inventoryArchiveSource, measureRetainedArchive } from './sandbox-preservation-budget.mjs';

function retainedSupplier(supplier, index) {
  assert.ok(resolve(supplier.root).startsWith('/vercel/sandbox/native/'));
  assert.ok(supplier.locator && supplier.revision && supplier.integrityFiles.length > 0);
  const omittedPaths = [];
  for (const file of supplier.integrityFiles) {
    assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'));
    assert.match(file.sha256, /^[a-f0-9]{64}$/u);
    const path = join(supplier.root, file.path);
    if (existsSync(path) && lstatSync(path).isFile() && fileHash(path) === file.sha256) omittedPaths.push(file.path);
  }
  if (existsSync(supplier.root)) assert.ok(lstatSync(supplier.root).isDirectory() && !lstatSync(supplier.root).isSymbolicLink(),
    'Supplier root redirected');
  return { namespace: `suppliers/${index}`, root: supplier.root,
    inventory: existsSync(supplier.root) ? inventoryArchiveSource(supplier.root, { hashFiles: false }) : [], omittedPaths };
}

try {
  const sources = [{ namespace: 'trial', root: workerData.root,
    inventory: inventoryArchiveSource(workerData.root, { hashFiles: false }), omittedPaths: [] },
  ...(workerData.suppliers ?? []).map(retainedSupplier)];
  parentPort.postMessage({ measurement: measureRetainedArchive(sources) });
} catch (error) { parentPort.postMessage({ error: String(error) }); }
