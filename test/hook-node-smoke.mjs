/** Run after bun run build: plain Node must build and run artifacts without Bun on PATH. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

assert.equal(process.versions.bun, undefined, 'Run this smoke check with Node');
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(repo, 'dist', 'plugnz.mjs');
const root = mkdtempSync(join(tmpdir(), 'plugnz-hook-node-'));
const env = { ...process.env, PATH: '', OPEN_PLUGIN_HOME: join(root, 'home') };
function run(args) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: root, env, timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}
try {
 for (const version of [1, 2]) {
  const inventory = run([cli, 'hooks', 'targets']);
  assert.equal(inventory.version, 1);
  assert.equal(inventory.targets.length, 6);
  const source = join(root, 'source-' + version);
  const out = join(root, 'out-' + version);
  mkdirSync(source);
  const config = { version, hooks: { 'session.start': [{ ...(version === 2 ? { requires: { context: true } } : {}), command: [process.execPath, '$' + '{PLUGIN_ROOT}/handler.mjs'] }] } };
  writeFileSync(join(source, 'plugnz.hooks.json'), JSON.stringify(config));
  writeFileSync(join(source, 'plugin.json'), JSON.stringify({ name: 'hook-node-smoke', version: '1.0.0' }));
  writeFileSync(join(source, 'handler.mjs'), [
    "let raw = '';",
    'for await (const chunk of process.stdin) raw += chunk;',
    'console.log(JSON.stringify({context:"standalone:" + JSON.parse(raw).harness}));',
  ].join('\n'));
  const result = run([cli, 'hooks', 'build', source, ...inventory.targets.flatMap(target => ['--target', target.id]), '--out', out]);
  assert.equal(result.targets.length, 6);
  for (const target of result.targets) {
    assert.equal(existsSync(join(target.path, 'hook-runtime.mjs')), true);
    assert.equal(existsSync(join(target.path, 'plugnz.hooks.json')), false);
  }
  rmSync(source, { recursive: true });
  const target = join(out, 'codex');
  const input = { version: 1, event: 'session.start', harness: 'node-smoke', cwd: root };
  const code = 'import {runHooks} from ' + JSON.stringify(join(target, 'hook-runtime.mjs')) + ';' +
    'console.log(JSON.stringify(await runHooks(' + JSON.stringify(config) + ',' + JSON.stringify(input) + ',' + JSON.stringify(target) + ')));';
  assert.deepEqual(run(['--input-type=module', '-e', code]), { context: 'standalone:node-smoke' });
  console.log(JSON.stringify({ node: process.version, hookConfigVersion: version, targets: result.targets.map(target => target.id), standaloneRuntime: true, bunOnPath: false }));
 }
} finally {
  rmSync(root, { recursive: true, force: true });
}
