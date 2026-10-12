// Read-only registry proof; writes only an explicitly fresh evidence directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
assert(/^\/tmp\/plugnz-release-0013-verify\.[A-Za-z0-9]+$/u.test(dir ?? ''));
assert.equal(realpathSync(dir), dir);
assert.equal(readdirSync(dir).length, 0);
const response = await fetch('https://registry.npmjs.org/plugnz/0.0.13');
assert.equal(response.status, 200);
const metadata = await response.json();
assert.equal(metadata.version, '0.0.13');
assert.equal(metadata.gitHead, 'a04a305f0ae3ee0c495f2c109194d34473eebece');
const url = new URL(metadata.dist.tarball);
assert.equal(url.protocol, 'https:');
assert.equal(url.hostname, 'registry.npmjs.org');
const tarResponse = await fetch(url, { redirect: 'error' });
assert.equal(tarResponse.status, 200);
const bytes = Buffer.from(await tarResponse.arrayBuffer());
assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, metadata.dist.integrity);
writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
writeFileSync(join(dir, 'plugnz-0.0.13.tgz'), bytes);
console.log(JSON.stringify({ version: metadata.version, gitHead: metadata.gitHead,
  tarballSha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }));
