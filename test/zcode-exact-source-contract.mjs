// Private proof tooling, not a plugnz adapter or an upstream source patch.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const SOURCE = Object.freeze({
  locator: 'https://github.com/zai-org/ZCode.git',
  revision: '872ad960de7ec172591f7e1952f7849229f94521',
  nodeVersion: 'v24.14.0', pnpmVersion: '10.33.2', cliVersion: '0.16.9',
  nodeArchive: 'https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-x64.tar.xz',
  nodeSha256: '41cd79bb7877c81605a9e68ec4c91547774f46a40c67a17e34d7179ef11729df',
  pnpmArchive: 'https://registry.npmjs.org/pnpm/-/pnpm-10.33.2.tgz',
  pnpmIntegrity: 'sha512-qQ+vb+6rca1sblf5Tg/hoS9dzCLNdU20CulZPraj4LaxLjVAIYuzeuCDQEsfLObbKkEh6XmCm0r/lLmfSdoc+A==',
});

export function validateRoot(root) {
  assert.match(root, /^\/vercel\/sandbox\/proof\/zcode-acquire-[a-z0-9-]+$/u);
  return root;
}

export function assertArchiveMembers(listing, prefix) {
  const entries = listing.trim().split('\n');
  assert(entries.length > 0 && entries[0]);
  for (const entry of entries) {
    assert(!entry.startsWith('/') && !entry.split('/').includes('..') && !/[\r]/u.test(entry));
    assert(entry === `${prefix}/` || entry.startsWith(`${prefix}/`));
  }
}

export function assertPinnedManifests(root, app, cli) {
  assert.equal(root.packageManager, `pnpm@${SOURCE.pnpmVersion}`);
  assert.equal(app.name, 'zcode-cli'); assert.equal(app.version, SOURCE.cliVersion);
  assert.equal(app.engines.node, SOURCE.nodeVersion.slice(1));
  assert.equal(app.packageManager, root.packageManager);
  assert.equal(app.scripts.build, 'turbo run build');
  assert.equal(cli.name, '@zcode/cli'); assert.equal(cli.version, '0.1.0');
  assert.equal(cli.scripts.build, 'node scripts/build.mjs');
  assert.equal(cli.bin.zcode, './dist/zcode.cjs');
}

export function assertIntegrity(bytes, expected) {
  const [algorithm, digest] = expected.split('-');
  assert(['sha256', 'sha512'].includes(algorithm));
  assert.equal(createHash(algorithm).update(bytes).digest(algorithm === 'sha256' ? 'hex' : 'base64'), digest);
}

export function installArguments(supplier) {
  return ['--filter', '@zcode/cli...', '--filter', 'zcode-cli', 'install', '--frozen-lockfile',
    '--store-dir', `${supplier}/pnpm-store`];
}

export function buildEnvironment(supplier) {
  return { PATH: `${supplier}/node-v24.14.0-linux-x64/bin:${supplier}/bin:/usr/local/bin:/usr/bin:/bin`,
    HOME: `${supplier}/home`, TMPDIR: `${supplier}/tmp`, TMP: `${supplier}/tmp`, TEMP: `${supplier}/tmp`,
    XDG_CACHE_HOME: `${supplier}/home/.cache`, XDG_CONFIG_HOME: `${supplier}/home/.config`,
    XDG_DATA_HOME: `${supplier}/home/.local/share`, PNPM_HOME: `${supplier}/pnpm-home`,
    npm_config_cache: `${supplier}/npm-cache`, CI: '1', NO_COLOR: '1', TURBO_TELEMETRY_DISABLED: '1' };
}
