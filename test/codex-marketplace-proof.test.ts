import { expect, test } from 'bun:test';
import { chmodSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprintSourceTree, fingerprintTree } from '../src/fingerprint';
import { codexMarketplaceSourceFingerprint } from '../src/hosts/codex-marketplace-proof';
import { withHostEnvAsync, writeFiles } from './util';

const filename = '.codex-marketplace-install.json';
const expected = { locator: 'https://github.com/archeism/plugnz.git', revision: 'a'.repeat(40) };
const metadata = { source_type: 'git', source: expected.locator, ref_name: expected.revision, sparse_paths: [], revision: expected.revision };

test('validated native metadata permits exact Source proof without changing the rollback fingerprint', async () => {
  await withHostEnvAsync('codex', async home => {
    const source = join(home, 'source');
    const checkout = join(home, 'checkout');
    const files = { 'plugin.json': '{"name":"demo"}', 'skills/probe/SKILL.md': 'same Source bytes' };
    writeFiles(source, files); writeFiles(checkout, files);
    const prior = fingerprintTree(checkout);
    writeFiles(checkout, { [filename]: JSON.stringify(metadata), '.git/HEAD': expected.revision });
    expect(codexMarketplaceSourceFingerprint(checkout, expected)).toBe(fingerprintSourceTree(source));
    expect(fingerprintTree(checkout) === prior).toBe(false);
    expect(fingerprintSourceTree(checkout) === fingerprintSourceTree(source)).toBe(false);
  });
});

test('missing native metadata retains legacy clean checkout proof', async () => {
  await withHostEnvAsync('codex', async home => {
    const checkout = join(home, 'checkout');
    writeFiles(checkout, { 'plugin.json': '{}' });
    expect(codexMarketplaceSourceFingerprint(checkout, expected)).toBe(fingerprintSourceTree(checkout));
  });
});

test('unknown or mismatched native identity never grants Source proof', async () => {
  await withHostEnvAsync('codex', async home => {
    const checkout = join(home, 'checkout');
    for (const invalid of [
      { ...metadata, source_type: 'local' }, { ...metadata, source: 'https://example.com/foreign.git' },
      { ...metadata, revision: 'b'.repeat(40) }, { ...metadata, ref_name: 'main' },
      { ...metadata, sparse_paths: ['plugins/demo'] }, { ...metadata, extra: true }, {}, null,
    ]) {
      writeFiles(checkout, { [filename]: JSON.stringify(invalid) });
      expect(codexMarketplaceSourceFingerprint(checkout, expected)).toBe(null);
    }
    writeFiles(checkout, { [filename]: '{invalid' });
    expect(codexMarketplaceSourceFingerprint(checkout, expected)).toBe(null);
  });
});

test('metadata cannot hide foreign Source changes or a nested namesake', async () => {
  await withHostEnvAsync('codex', async home => {
    const checkout = join(home, 'checkout');
    writeFiles(checkout, { 'plugin.json': '{}' });
    const original = fingerprintSourceTree(checkout);
    writeFiles(checkout, { [filename]: JSON.stringify(metadata), ['nested/'+filename]: 'foreign bytes' });
    expect(codexMarketplaceSourceFingerprint(checkout, expected) === original).toBe(false);
    writeFiles(checkout, { 'plugin.json': '{"foreign":true}' });
    expect(codexMarketplaceSourceFingerprint(checkout, expected) === original).toBe(false);
  });
});

test('executable, directory, and symlink metadata cannot grant Source proof', async () => {
  await withHostEnvAsync('codex', async home => {
    const executable = join(home, 'executable');
    writeFiles(executable, { [filename]: JSON.stringify(metadata) });
    chmodSync(join(executable, filename), 0o755);
    expect(codexMarketplaceSourceFingerprint(executable, expected)).toBe(null);
    const directory = join(home, 'directory');
    mkdirSync(join(directory, filename), { recursive: true });
    expect(codexMarketplaceSourceFingerprint(directory, expected)).toBe(null);
    const link = join(home, 'link');
    mkdirSync(link); symlinkSync(join(executable, filename), join(link, filename));
    expect(codexMarketplaceSourceFingerprint(link, expected)).toBe(null);
  });
});
