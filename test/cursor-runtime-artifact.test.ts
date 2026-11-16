import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CryptoHasher } from '../src/runtime';
import { hasCursorRuntimeArtifact } from '../src/hosts/cursor';
import { writeFiles } from './util';

test('native Cursor runtime qualification binds resolved version directory and exact artifact bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-cursor-runtime-'));
  try {
    const version = '2026.10.01-e373342';
    const directory = join(root, version), binary = join(directory, 'cursor-agent');
    const bytes = 'isolated native artifact fixture';
    const digest = new CryptoHasher('sha256').update(bytes).digest('hex');
    writeFiles(directory, { 'cursor-agent': '#!/bin/sh\n', '6136.index.js': bytes });
    const link = join(root, 'cursor-agent'); symlinkSync(binary, link);
    expect(hasCursorRuntimeArtifact(link, version, '6136.index.js', digest)).toBe(true);
    expect(hasCursorRuntimeArtifact(link, 'other-version', '6136.index.js', digest)).toBe(false);
    writeFileSync(join(directory, '6136.index.js'), 'mutated or stock bytes');
    expect(hasCursorRuntimeArtifact(link, version, '6136.index.js', digest)).toBe(false);
    rmSync(join(directory, '6136.index.js'));
    expect(hasCursorRuntimeArtifact(link, version, '6136.index.js', digest)).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
