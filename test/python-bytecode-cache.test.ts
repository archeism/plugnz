import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { which } from '../src/runtime';

test('Node protected copies preserve empty cache modes through fresh backup and existing-root rollback', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-node-bytecode-copy-'));
  try {
    const node = which('node');
    if (node === null) throw new Error('Node >=22 is required to verify the published runtime copy contract');
    const result = spawnSync(node, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', `
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, statSync, readdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { protectPythonBytecodeCache, copyPythonBytecodeProtectedTree } from ${JSON.stringify(resolve('src/python-bytecode-cache.ts'))};
const root = ${JSON.stringify(root)};
const source = join(root, 'source'), backup = join(root, 'backup'), restored = join(root, 'restored');
mkdirSync(source); writeFileSync(join(source, 'extension.py'), 'original bytes');
protectPythonBytecodeCache(source, 'native fixture');
copyPythonBytecodeProtectedTree(source, backup, 'native fixture');
assert.equal(statSync(join(backup, '__pycache__')).mode & 0o777, 0o555);
copyPythonBytecodeProtectedTree(backup, restored, 'native fixture');
writeFileSync(join(restored, 'extension.py'), 'changed owned bytes');
copyPythonBytecodeProtectedTree(backup, restored, 'native fixture');
assert.equal(readFileSync(join(restored, 'extension.py'), 'utf8'), 'original bytes');
assert.equal(statSync(join(restored, '__pycache__')).mode & 0o777, 0o555);
assert.deepEqual(readdirSync(join(restored, '__pycache__')), []);
chmodSync(join(restored, '__pycache__'), 0o755);
writeFileSync(join(restored, '__pycache__/foreign.pyc'), 'foreign bytes');
chmodSync(join(restored, '__pycache__'), 0o555);
writeFileSync(join(restored, 'extension.py'), 'must remain untouched');
assert.throws(() => copyPythonBytecodeProtectedTree(backup, restored, 'native fixture'), /empty __pycache__/);
assert.equal(readFileSync(join(restored, 'extension.py'), 'utf8'), 'must remain untouched');
assert.equal(readFileSync(join(restored, '__pycache__/foreign.pyc'), 'utf8'), 'foreign bytes');
chmodSync(join(restored, '__pycache__'), 0o755);
console.log(JSON.stringify({ runtime: process.version, freshBackupMode: statSync(join(backup, '__pycache__')).mode & 0o777, rollbackPreserved: true, foreignCacheUntouched: true }));
`], { encoding: 'utf8', timeout: 10_000 });
    expect({ code: result.status, error: result.stderr }).toEqual({ code: 0, error: '' });
    const evidence = JSON.parse(result.stdout);
    expect(evidence.freshBackupMode).toBe(0o555);
    expect(evidence.rollbackPreserved).toBe(true);
    expect(evidence.foreignCacheUntouched).toBe(true);
  } finally {
    for (const name of ['source', 'backup', 'restored']) {
      const cache = join(root, name, '__pycache__');
      if (existsSync(cache)) chmodSync(cache, 0o755);
    }
    rmSync(root, { recursive: true, force: true });
  }
});
