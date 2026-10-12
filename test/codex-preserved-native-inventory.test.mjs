import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifySupplierEntry } from './codex-preserved-native-inventory.mjs';
test('supplier inventory refuses a changed link even when both targets have identical bytes', () => {
  const root = mkdtempSync('/tmp/plugnz-codex-supplier-inventory-');
  try {
    writeFileSync(join(root, 'original'), 'same bytes'); writeFileSync(join(root, 'replacement'), 'same bytes');
    symlinkSync('original', join(root, 'link'));
    const row = { path: 'link', kind: 'symlink', target: 'original' };
    verifySupplierEntry(root, row);
    unlinkSync(join(root, 'link')); symlinkSync('replacement', join(root, 'link'));
    let rejected = false; try { verifySupplierEntry(root, row); } catch { rejected = true; }
    expect(rejected).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
