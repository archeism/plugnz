import { expect, test } from 'bun:test';
import { accessSync, chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertHermesCompanionCache, protectHermesCompanionCache } from '../src/hosts/hermes-companion-cache';
import { fingerprintTree } from '../src/fingerprint';
import { hermesLifecycle, hermesWriter } from '../src/hosts/hermes-writer';
import { writeFiles } from './util';

async function failure(run: Promise<unknown>): Promise<string> {
  try { await run; } catch (error) { return (error as Error).message; }
  throw new Error('expected failure');
}

test('managed companion readback refuses directory-mode drift and never ignores bytecode', async () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-hermes-cache-'));
  const previous = process.env.OPEN_PLUGIN_HERMES_ROOT;
  process.env.OPEN_PLUGIN_HERMES_ROOT = join(root, '.hermes');
  try {
    const source = join(root, 'source');
    writeFiles(source, {
      'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"cache-proof","version":"1.0.0"}',
      'skills/manual/SKILL.md': '---\nname: manual\ndescription: Manual fixture\ndisable-model-invocation: true\n---\nmanual\n',
    });
    const plugin = { dir: source, name: 'cache-proof', version: '1.0.0', contentFingerprint: fingerprintTree(source) };
    const resolved = { sourceUri: source, sha: 'local', isGit: false, plugins: [plugin] };
    await hermesWriter.add(plugin, resolved);
    const companion = join(root, '.hermes/plugins/cache-proof.plgnz-commands');
    const cache = join(companion, '__pycache__');
    expect(statSync(cache).mode & 0o777).toBe(0o555);
    expect(readdirSync(cache)).toEqual([]);
    const before = fingerprintTree(companion);
    chmodSync(cache, 0o755);
    expect(fingerprintTree(companion)).toBe(before);
    const target = { kind: 'hermes', instance: 'default', context: { root: join(root, '.hermes'), configPath: join(root, '.hermes/config.yaml') } };
    expect(await failure(hermesWriter.add(plugin, resolved))).toContain('mode 0555');
    expect(await failure(hermesLifecycle.observeTarget(target))).toContain('mode 0555');
    writeFiles(cache, { 'foreign.pyc': 'untrusted cache bytes' });
    chmodSync(cache, 0o555);
    expect(() => assertHermesCompanionCache(companion)).toThrow('empty __pycache__');
    expect(readdirSync(cache)).toEqual(['foreign.pyc']);
  } finally {
    if (previous === undefined) delete process.env.OPEN_PLUGIN_HERMES_ROOT; else process.env.OPEN_PLUGIN_HERMES_ROOT = previous;
    const cache = join(root, '.hermes/plugins/cache-proof.plgnz-commands/__pycache__');
    if (existsSync(cache)) chmodSync(cache, 0o755);
    rmSync(root, { recursive: true, force: true });
  }
});

test('protection refuses effective privilege that can still write the readonly cache', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-hermes-cache-access-'));
  try {
    const cache = join(root, '__pycache__');
    let rejected = false;
    try { protectHermesCompanionCache(root); } catch { rejected = true; }
    let writable = false;
    try { accessSync(cache, 2); writable = true; } catch { /* Native write denial. */ }
    expect(rejected).toBe(writable);
    if (!writable) { assertHermesCompanionCache(root); expect(readdirSync(cache)).toEqual([]); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
