import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stageBundle } from '../scripts/sandbox-preservation-stage.mjs';

function inventory(root) {
  const rows = [];
  function walk(relative = '') {
    for (const name of readdirSync(join(root, relative)).sort()) {
      const path = join(relative, name), file = join(root, path), stat = lstatSync(file);
      if (stat.isDirectory()) { rows.push({ path, kind: 'directory', mode: stat.mode & 0o777 }); walk(path); }
      else if (stat.isSymbolicLink()) rows.push({ path, kind: 'symlink', target: readlinkSync(file) });
      else rows.push({ path, kind: 'file', mode: stat.mode & 0o777, bytes: stat.size,
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex') });
    }
  }
  walk(); return rows;
}
async function archiveFixture(temp, root, controlParent, suppliers) {
  const archive = join(temp, 'evidence.tar.gz');
    const bundle = join(temp, 'bundle');
    stageBundle(bundle, [{ namespace: 'trial', root, inventory: inventory(root), omittedPaths: [] },
      { namespace: 'control', root: join(controlParent, 'control'), inventory: inventory(join(controlParent, 'control')), omittedPaths: [] },
      ...suppliers.map((supplier, index) => ({ ...supplier, namespace: `suppliers/${index}` }))]);
    const tar = spawnSync('tar', ['-czf', archive, '-C', bundle, '.']); expect(tar.status).toBe(0);
  const restored = join(temp, 'restored'); mkdirSync(restored);
  const result = spawnSync('tar', ['-xzf', archive, '-C', restored]); expect(result.status).toBe(0);
  return restored;
}
for (const trialName of ['trial', 'control']) test(`archive namespaces ignore duplicate supplier and ${trialName} basenames`, async () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-namespace-');
  try {
    const root = join(temp, 'proof', trialName), controlParent = join(temp, 'private');
    mkdirSync(root, { recursive: true }); mkdirSync(join(controlParent, 'control'), { recursive: true });
    writeFileSync(join(root, 'sentinel'), 'trial bytes'); writeFileSync(join(controlParent, 'control', 'receipt'), 'privileged bytes');
    const suppliers = [];
    for (const [index, name] of ['same', 'same', 'trial', 'control'].entries()) {
      const supplier = join(temp, `vendor-${index}`, name); mkdirSync(supplier, { recursive: true });
      writeFileSync(join(supplier, 'sentinel'), `supplier ${index}`);
      suppliers.push({ root: supplier, inventory: inventory(supplier), omittedPaths: [] });
    }
    const restored = await archiveFixture(temp, root, controlParent, suppliers);
    expect(readFileSync(join(restored, 'trial/sentinel'), 'utf8')).toBe('trial bytes');
    expect(readFileSync(join(restored, 'control/receipt'), 'utf8')).toBe('privileged bytes');
    for (let index = 0; index < suppliers.length; index++) expect(readFileSync(join(restored, `suppliers/${index}/sentinel`), 'utf8')).toBe(`supplier ${index}`);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test('archive exclusion is an exact literal wildcard filename', async () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-namespace-');
  try {
    const root = join(temp, 'proof/arm'), controlParent = join(temp, 'private'), supplier = join(temp, 'native/vendor');
    for (const dir of [root, join(controlParent, 'control'), supplier]) mkdirSync(dir, { recursive: true });
    writeFileSync(join(supplier, 'literal*.txt'), 'verified body'); writeFileSync(join(supplier, 'literalX.txt'), 'unknown must survive');
    const restored = await archiveFixture(temp, root, controlParent, [{ root: supplier, inventory: inventory(supplier), omittedPaths: ['literal*.txt'] }]);
    expect(existsSync(join(restored, 'suppliers/0/literal*.txt'))).toBe(false);
    expect(readFileSync(join(restored, 'suppliers/0/literalX.txt'), 'utf8')).toBe('unknown must survive');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test('staging hardlinks regular bytes without copying or changing their mode', () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-namespace-');
  try {
    const root = join(temp, 'source'), bundle = join(temp, 'bundle'); mkdirSync(root);
    mkdirSync(join(root, 'nested')); chmodSync(join(root, 'nested'), 0o750);
    writeFileSync(join(root, 'nested/file'), 'same inode'); chmodSync(join(root, 'nested/file'), 0o700);
    symlinkSync('nested/file', join(root, 'link'));
    const original = lstatSync(join(root, 'nested/file'));
    const result = stageBundle(bundle, [{ namespace: 'trial', root, inventory: inventory(root), omittedPaths: [] }]);
    const staged = lstatSync(join(bundle, 'trial/nested/file'));
    expect(result.strategy).toBe('same-filesystem-hardlinks'); expect(result.files).toBe(1);
    expect(staged.dev).toBe(original.dev); expect(staged.ino).toBe(original.ino);
    expect(lstatSync(join(root, 'nested/file')).mode).toBe(original.mode);
    expect(lstatSync(join(bundle, 'trial/nested')).mode & 0o777).toBe(0o750);
    expect(readlinkSync(join(bundle, 'trial/link'))).toBe('nested/file');
    expect(() => stageBundle(bundle, [{ namespace: 'trial', root, inventory: inventory(root), omittedPaths: [] }])).toThrow();
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test('staging refuses stale bytes and overlapping source roots', () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-namespace-');
  try {
    const root = join(temp, 'source'); mkdirSync(root); mkdirSync(join(root, 'child'));
    writeFileSync(join(root, 'file'), 'prior'); const prior = inventory(root); writeFileSync(join(root, 'file'), 'after');
    expect(() => stageBundle(join(temp, 'stale'), [{ namespace: 'trial', root, inventory: prior, omittedPaths: [] }])).toThrow();
    expect(() => stageBundle(join(temp, 'overlap'), [{ namespace: 'trial', root, inventory: inventory(root), omittedPaths: [] },
      { namespace: 'suppliers/0', root: join(root, 'child'), inventory: [], omittedPaths: [] }])).toThrow('overlap');
    expect(existsSync(join(temp, 'overlap'))).toBe(false);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
test.skipIf(!existsSync('/dev/shm'))('staging refuses cross-device fallback copies', () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-namespace-'), root = mkdtempSync('/dev/shm/plugnz-preservation-namespace-');
  try {
    writeFileSync(join(root, 'file'), 'tiny RAM fixture');
    if (lstatSync(temp).dev === lstatSync(root).dev) return;
    expect(() => stageBundle(join(temp, 'bundle'), [{ namespace: 'trial', root, inventory: inventory(root), omittedPaths: [] }])).toThrow('Cross-device');
  } finally { rmSync(temp, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
});
