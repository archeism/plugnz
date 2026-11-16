/** Keep native Python imports from changing an immutable managed projection. */
import { accessSync, chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
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

/** Copy caller-owned, verified trees without losing directory protection under Node. */
export function copyPythonBytecodeProtectedTree(source: string, destination: string, owner: string, protectionOwner = owner): void {
  assertPythonBytecodeCache(source, owner, protectionOwner);
  if (existsSync(destination)) assertPythonBytecodeCache(destination, owner, protectionOwner);
  cpSync(source, destination, { recursive: true });
  const cache = join(destination, '__pycache__');
  const stat = lstatSync(cache);
  if (!stat.isDirectory() || stat.isSymbolicLink() || readdirSync(cache).length !== 0) {
    throw new Error(`${owner} copy did not preserve the empty bytecode cache: ${cache}`);
  }
  // Node creates copied directories with its default mode; this is a fresh
  // caller-owned copy, or an existing destination validated before mutation.
  chmodSync(cache, 0o555);
  assertPythonBytecodeCache(destination, owner, protectionOwner);
}
