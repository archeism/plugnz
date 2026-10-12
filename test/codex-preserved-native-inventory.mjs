import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
export function verifySupplierEntry(root, row) {
  const path = join(root, row.path), stat = lstatSync(path);
  if (row.kind === 'file') {
    assert(stat.isFile()); assert.equal(stat.size, row.bytes); assert.equal(stat.mode & 0o777, row.mode);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), row.sha256);
  } else if (row.kind === 'directory') {
    assert(stat.isDirectory()); assert.equal(stat.mode & 0o777, row.mode);
  } else {
    assert.equal(row.kind, 'symlink', 'Unknown supplier inventory kind');
    assert(stat.isSymbolicLink()); assert.equal(readlinkSync(path), row.target);
  }
}
