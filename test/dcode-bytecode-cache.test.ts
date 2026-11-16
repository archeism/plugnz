import { expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fingerprintTree } from '../src/fingerprint';
import { assertDcodeManualSkillsCache, projectDcodeManualSkills } from '../src/hosts/dcode-manual-skills';
import { dcodeLifecycle } from '../src/hosts/dcode-writer';
import { writeFiles } from './util';

async function failure(run: Promise<unknown>): Promise<string> {
  try { await run; } catch (error) { return (error as Error).message; }
  throw new Error('expected failure');
}

test('owned Dcode extension observation refuses cache mode or byte drift without deleting evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dcode-owned-bytecode-'));
  const target = join(root, 'native'), plugin = join(target, 'plugins/cache/plgnz/fixture');
  const previous = process.env.OPEN_PLUGIN_DCODE_ROOT;
  process.env.OPEN_PLUGIN_DCODE_ROOT = target;
  try {
    writeFiles(plugin, { 'plugin.json': '{"name":"manual","version":"1.0.0"}', 'skills/manual/SKILL.md': '---\nname: manual\ndescription: Manual\ndisable-model-invocation: true\n---\nbody\n' });
    projectDcodeManualSkills(plugin, 'manual', true);
    const before = fingerprintTree(plugin);
    writeFiles(plugin, { '.plgnz-install.json': JSON.stringify({ source: '/source', pluginId: 'manual@local', fingerprint: 'source', sourceRevision: 'revision', projectedFingerprint: before }) });
    writeFiles(target, { '.state/installed_plugins.json': JSON.stringify({ version: 2, plugins: { 'manual@local': [{ installPath: plugin }] } }), '.state/plugin_state.json': '{"version":1,"enabledPlugins":{"manual@local":true}}' });
    const baseline = fingerprintTree(plugin);
    const identity = { kind: 'dcode', instance: 'default' };
    expect((await dcodeLifecycle.observeTarget(identity)).installations).toHaveLength(1);
    const cache = join(plugin, '__pycache__');
    expect(statSync(cache).mode & 0o777).toBe(0o555);
    expect(readdirSync(cache)).toEqual([]);
    chmodSync(cache, 0o755);
    expect(fingerprintTree(plugin)).toBe(baseline);
    expect(await failure(dcodeLifecycle.observeTarget(identity))).toContain('mode 0555');
    writeFiles(cache, { 'foreign.pyc': 'retained evidence' });
    chmodSync(cache, 0o555);
    expect(() => assertDcodeManualSkillsCache(plugin)).toThrow('empty __pycache__');
    expect(await failure(dcodeLifecycle.observeTarget(identity))).toContain('empty __pycache__');
    expect(readdirSync(cache)).toEqual(['foreign.pyc']);
    expect(fingerprintTree(plugin) === baseline).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.OPEN_PLUGIN_DCODE_ROOT; else process.env.OPEN_PLUGIN_DCODE_ROOT = previous;
    chmodSync(join(plugin, '__pycache__'), 0o755);
    rmSync(root, { recursive: true, force: true });
  }
});

test('projection preserves an authored Python cache and refuses to replace it', () => {
  const root = mkdtempSync(join(tmpdir(), 'dcode-authored-bytecode-'));
  try {
    writeFiles(root, { 'plugin.json': '{"name":"manual","version":"1.0.0"}', 'skills/manual/SKILL.md': '---\nname: manual\ndescription: Manual\ndisable-model-invocation: true\n---\nbody\n', '__pycache__/authored.pyc': 'keep' });
    expect(() => projectDcodeManualSkills(root, 'manual', true)).toThrow();
    expect(readdirSync(join(root, '__pycache__'))).toEqual(['authored.pyc']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
