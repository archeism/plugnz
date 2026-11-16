/** Preserve the Hermes companion contract while sharing its native cache guard. */
import { assertPythonBytecodeCache, protectPythonBytecodeCache } from '../python-bytecode-cache';

export function assertHermesCompanionCache(root: string): void {
  assertPythonBytecodeCache(root, 'Hermes managed companion', 'Hermes companion');
}

export function protectHermesCompanionCache(root: string): void {
  protectPythonBytecodeCache(root, 'Hermes managed companion', 'Hermes companion');
}
