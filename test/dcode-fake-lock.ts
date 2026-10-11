import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Fake native interpreter boundary; production requires verified dcode/filelock. */
export function fakeDcodeLockInterpreter(root: string): string {
  const verifiedInterpreter = process.env['OPEN_PLUGIN_TEST_DCODE_PYTHON'];
  if (verifiedInterpreter) return verifiedInterpreter;
  const file = join(root, 'dcode-python');
  writeFileSync(file, '#!/bin/sh\nprintf "DCODE_LOCK_0.1.83\\n"\ncat >/dev/null\n');
  chmodSync(file, 0o755);
  return file;
}
