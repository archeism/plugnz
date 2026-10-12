import { test, expect } from 'bun:test';
import { SOURCE, assertIntegrity, assertPinnedManifests, buildEnvironment, installArguments, validateRoot, assertArchiveMembers } from './zcode-exact-source-contract.mjs';

test('supplier workflow contract module exists', async () => {
  expect(typeof SOURCE.revision).toBe('string');
});
test('runtime archives cannot extract traversal or another package namespace', () => {
  assertArchiveMembers('package/\npackage/bin/pnpm.cjs\n', 'package');
  for (const listing of ['../escape\n', '/tmp/escape\n', 'package/../escape\n', 'other/bin\n']) expect(() => assertArchiveMembers(listing, 'package')).toThrow();
});
test('requires a single-use isolated acquisition root, never real home or traversal', () => {
  expect(validateRoot('/vercel/sandbox/proof/zcode-acquire-01')).toEndWith('01');
  for (const root of ['/home/user', '/vercel/sandbox/proof/zcode-acquire-../native', '/vercel/sandbox/native']) expect(() => validateRoot(root)).toThrow();
});
test('keeps authoritative frozen root lock and dependency closure without platform overrides', () => {
  expect(installArguments('/vercel/sandbox/native/zcode-0169')).toEqual(['--filter', '@zcode/cli...', '--filter', 'zcode-cli', 'install', '--frozen-lockfile', '--store-dir', '/vercel/sandbox/native/zcode-0169/pnpm-store']);
});
test('does not pass LLM secrets or machine home into supplier commands', () => {
  const env = buildEnvironment('/vercel/sandbox/native/zcode-0169');
  expect(env.HOME).toBe('/vercel/sandbox/native/zcode-0169/home');
  expect(env.TMPDIR).toBe('/vercel/sandbox/native/zcode-0169/tmp');
  expect(Object.keys(env).filter(key => /TOKEN|API_KEY|SECRET/u.test(key))).toEqual([]);
  expect(env.PATH).not.toContain('bun');
});
test('verifies immutable archive integrity rather than trusting URL/version alone', () => {
  assertIntegrity(Buffer.from('abc'), 'sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(() => assertIntegrity(Buffer.from('abd'), 'sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toThrow();
});
test('distinguishes app CLI version from private workspace package version and rejects drift', () => {
  const root = { packageManager: 'pnpm@10.33.2' };
  const app = { name: 'zcode-cli', version: '0.16.9', engines: { node: '24.14.0' }, packageManager: 'pnpm@10.33.2', scripts: { build: 'turbo run build' } };
  const cli = { name: '@zcode/cli', version: '0.1.0', scripts: { build: 'node scripts/build.mjs' }, bin: { zcode: './dist/zcode.cjs' } };
  assertPinnedManifests(root, app, cli);
  expect(() => assertPinnedManifests(root, { ...app, version: '0.17.0' }, cli)).toThrow();
  expect(() => assertPinnedManifests(root, app, { ...cli, scripts: { build: 'bun build' } })).toThrow();
});
