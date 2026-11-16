/** Keep native Python imports from changing an immutable managed projection. */
import { accessSync, chmodSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function assertPythonBytecodeCache(root: string, owner: string, protectionOwner = owner): void {
  const cache = join(root, '__pycache__');
  const stat = lstatSync(cache);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o555 || readdirSync(cache).length !== 0) {
    throw new Error(`${owner} requires an empty __pycache__ directory with mode 0555: ${cache}`);
  }
  let writable = false;
  try { accessSync(cache, 2 /* W_OK */); writable = true; } catch { /* Effective write denial is required. */ }
  if (writable) throw new Error(`${protectionOwner} bytecode protection is ineffective for this runtime user: ${cache}`);
}

export function protectPythonBytecodeCache(root: string, owner: string, protectionOwner = owner): void {
  const cache = join(root, '__pycache__');
  mkdirSync(cache);
  chmodSync(cache, 0o555);
  assertPythonBytecodeCache(root, owner, protectionOwner);
}
