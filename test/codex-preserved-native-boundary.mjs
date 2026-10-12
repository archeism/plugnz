#!/usr/bin/env node
// Proof-only fault boundary: every invocation delegates to the released CLI.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { captureSurfaces } from './codex-preserved-native-surfaces.mjs';

const root = process.env.PLGNZ_PROOF_ROOT;
assert.match(root ?? '', /^\/vercel\/sandbox\/proof\/codex-native-b029c54-[a-z0-9-]+\/(?:rollback|foreign|cache|inactive|sparse|malformed)$/);
const native = '/vercel/sandbox/native/codex-0162/node_modules/.bin/codex';
const args = process.argv.slice(2);
appendFileSync(join(root, 'native-calls.jsonl'), `${JSON.stringify(args)}\n`);
const upgrade = args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'upgrade';
const fault = upgrade && existsSync(join(root, 'fault.json'))
  ? JSON.parse(readFileSync(join(root, 'fault.json'), 'utf8')) : null;
const slot = join(root, 'home/.codex/plugins/cache/plugnz-proof/lifecycle-probe/0.1.0');
const parent = dirname(slot);
const mode = fault === null ? null : statSync(parent).mode & 0o777;
if (fault !== null) {
  assert(['native-exit', 'foreign-checkout', 'foreign-cache'].includes(fault.mode));
  chmodSync(parent, 0o555);
}
let result;
try {
  result = spawnSync(native, args, { env: process.env, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
} finally {
  if (mode !== null) chmodSync(parent, mode);
}
if (fault !== null) {
  const head = spawnSync('git', ['-C', join(root, 'home/.codex/.tmp/marketplaces/plugnz-proof'), 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024 });
  const preInjectionSurfaces = captureSurfaces(join(root, 'home/.codex'));
  if (fault.mode === 'foreign-checkout') {
    writeFileSync(join(root, 'home/.codex/.tmp/marketplaces/plugnz-proof/foreign-proof.txt'), 'foreign writer after the actual native exit\n');
  }
  if (fault.mode === 'foreign-cache') {
    mkdirSync(join(parent, '0.0.9'), { recursive: true });
    writeFileSync(join(parent, '0.0.9/foreign-proof.txt'), 'foreign writer after the actual native exit\n');
  }
  writeFileSync(join(root, 'native-boundary-result.json'), JSON.stringify({
    args, status: result.status, signal: result.signal,
    stdout: result.stdout, stderr: result.stderr,
    postNativeHead: { status: head.status, stdout: head.stdout, stderr: head.stderr },
    preInjectionSurfaces,
    postCallSurfaces: captureSurfaces(join(root, 'home/.codex')),
  }, null, 2));
}
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
assert(result.status !== null, `actual native process did not settle: ${result.error ?? result.signal}`);
process.exitCode = result.status;
