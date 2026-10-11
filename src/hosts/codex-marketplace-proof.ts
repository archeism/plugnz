import { fingerprintSourceTree } from '../fingerprint';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Pinned native contract: openai/codex c138238, core-plugins/src/marketplace_upgrade/activation.rs.
const metadataFile = '.codex-marketplace-install.json';

/** Read-only proof of distributed Source bytes in a native marketplace checkout. */
export function codexMarketplaceSourceFingerprint(
  checkout: string,
  expected: { readonly locator: string; readonly revision: string },
): string | null {
  try {
    let stat;
    try { stat = lstatSync(join(checkout, metadataFile)); }
    catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return fingerprintSourceTree(checkout);
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o111) !== 0) return null;
    const value: unknown = JSON.parse(readFileSync(join(checkout, metadataFile), 'utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (Object.keys(row).sort().join(',') !== 'ref_name,revision,source,source_type,sparse_paths'
      || !/^[0-9a-f]{40}$/u.test(expected.revision)
      || row['source_type'] !== 'git' || row['source'] !== expected.locator
      || row['ref_name'] !== expected.revision || row['revision'] !== expected.revision
      || !Array.isArray(row['sparse_paths']) || row['sparse_paths'].length !== 0) return null;
    return fingerprintSourceTree(checkout, [metadataFile]);
  } catch { return null; }
}
