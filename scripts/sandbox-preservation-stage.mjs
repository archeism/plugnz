// Private stopped-state archive staging. No content copies, basename transforms,
// wildcard exclusions, or chmod on hardlinked files.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, chownSync, closeSync, lchownSync, linkSync, lstatSync, mkdirSync, openSync, readlinkSync, readSync, realpathSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

function hash(path) {
  const fd = openSync(path, 'r'), digest = createHash('sha256'), buffer = Buffer.alloc(64 * 1024);
  try { let bytes; while ((bytes = readSync(fd, buffer)) > 0) digest.update(buffer.subarray(0, bytes)); }
  finally { closeSync(fd); }
  return digest.digest('hex');
}
function within(parent, child) { return child === parent || child.startsWith(parent + sep); }
function rowPath(path) {
  assert.ok(typeof path === 'string' && path.length > 0 && !path.startsWith('/') &&
    !path.split('/').some(part => part === '..' || part === '.' || part === '') && !/[\r\n]/u.test(path), 'Invalid inventory path');
}
export function stageBundle(bundle, sources) {
  assert.equal(bundle, resolve(bundle));
  const roots = sources.map(source => {
    assert.match(source.namespace, /^(trial|control|suppliers\/(0|[1-9]\d*))$/u);
    assert.equal(source.root, resolve(source.root));
    const stat = lstatSync(source.root); assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    return realpathSync(source.root);
  });
  assert.equal(new Set(sources.map(source => source.namespace)).size, sources.length, 'Duplicate archive namespace');
  for (let left = 0; left < roots.length; left++) for (let right = left + 1; right < roots.length; right++) {
    assert.ok(!within(roots[left], roots[right]) && !within(roots[right], roots[left]), 'Archive source roots overlap');
  }
  const physicalBundle = join(realpathSync(dirname(bundle)), bundle.split(sep).at(-1));
  for (const root of roots) assert.ok(!within(root, physicalBundle), 'Bundle cannot be inside a source');
  mkdirSync(bundle, { mode: 0o700 });
  const checks = [];
  for (const [index, source] of sources.entries()) {
    const namespace = join(bundle, source.namespace); mkdirSync(namespace, { recursive: true, mode: 0o700 });
    const omissions = new Set(source.omittedPaths);
    for (const path of omissions) rowPath(path);
    for (const row of source.inventory) {
      rowPath(row.path);
      if (omissions.has(row.path)) { assert.equal(row.kind, 'file', 'Only literal regular-file bodies may be omitted'); continue; }
      const src = join(source.root, row.path), dst = join(namespace, row.path), stat = lstatSync(src);
      assert.ok(within(roots[index], realpathSync(dirname(src))), 'Source ancestor redirected');
      mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
      if (row.kind === 'directory') {
        assert.ok(stat.isDirectory() && !stat.isSymbolicLink()); assert.equal(stat.mode & 0o777, row.mode);
        mkdirSync(dst, { recursive: true, mode: 0o700 });
      } else if (row.kind === 'symlink') {
        assert.ok(stat.isSymbolicLink()); assert.equal(readlinkSync(src), row.target); symlinkSync(row.target, dst); lchownSync(dst, stat.uid, stat.gid);
      } else {
        assert.equal(row.kind, 'file'); assert.ok(stat.isFile() && !stat.isSymbolicLink());
        assert.equal(stat.size, row.bytes); assert.equal(stat.mode & 0o777, row.mode); assert.equal(hash(src), row.sha256);
        assert.equal(stat.dev, lstatSync(bundle).dev, 'Cross-device staging would require an unbudgeted content copy');
        linkSync(src, dst);
      }
      checks.push({ src, dst, row, inode: stat.ino, device: stat.dev, root: source.root, physicalRoot: roots[index] });
    }
    // Directories are independently created, not hardlinked. Finalize their
    // captured modes only after all children exist; never chmod linked files.
    for (const row of source.inventory) if (row.kind === 'directory') {
      const src = lstatSync(join(source.root, row.path)), dst = join(namespace, row.path);
      chownSync(dst, src.uid, src.gid); chmodSync(dst, row.mode);
    }
    const sourceStat = lstatSync(source.root);
    chownSync(namespace, sourceStat.uid, sourceStat.gid); chmodSync(namespace, sourceStat.mode & 0o777);
  }
  for (const check of checks) {
    assert.equal(realpathSync(check.root), check.physicalRoot, 'Source root redirected');
    const src = lstatSync(check.src), dst = lstatSync(check.dst);
    assert.equal(src.ino, check.inode); assert.equal(src.dev, check.device);
    if (check.row.kind === 'file') {
      assert.equal(dst.ino, src.ino); assert.equal(dst.dev, src.dev);
      assert.equal(src.mode & 0o777, check.row.mode); assert.equal(dst.mode & 0o777, check.row.mode);
      assert.equal(hash(check.src), check.row.sha256); assert.equal(hash(check.dst), check.row.sha256);
    } else if (check.row.kind === 'symlink') assert.equal(readlinkSync(check.dst), check.row.target);
    else assert.equal(dst.mode & 0o777, check.row.mode);
  }
  return { files: checks.filter(check => check.row.kind === 'file').length, strategy: 'same-filesystem-hardlinks' };
}
