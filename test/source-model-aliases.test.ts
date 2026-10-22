import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSource } from '../src/source';
import { fingerprintTree } from '../src/fingerprint';
import { modelAliasesFile } from '../src/paths';
import { planPortableAgents } from '../src/portable-agents';

const cleanups: string[] = [];
const previous = process.env['OPEN_PLUGIN_HOME'];
afterEach(() => {
  if (previous === undefined) delete process.env['OPEN_PLUGIN_HOME'];
  else process.env['OPEN_PLUGIN_HOME'] = previous;
  for (const root of cleanups.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(): { root: string; home: string; source: string } {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-alias-source-'));
  cleanups.push(root);
  const home = join(root, 'home');
  mkdirSync(home);
  process.env['OPEN_PLUGIN_HOME'] = home;
  return { root, home, source: join(root, 'source') };
}
function packageAt(path: string, name: string, portable = true): void {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'plugin.json'), JSON.stringify({ name, version: '1.0.0' }));
  if (!portable) return;
  writeFileSync(join(path, 'plugnz.agents.json'), JSON.stringify({ version: 1, modelAliases: { fast: { 'claude-code': 'haiku', 'zcode-cli': 'zai/fast' } } }));
  mkdirSync(join(path, 'agents'));
  writeFileSync(join(path, 'agents/reviewer.md'), '---\nname: reviewer\ndescription: Review changes\nmodelAlias: fast\nmodels:\n  zcode-cli: zai/specific\n---\nReview the diff.\n');
}
function configure(model: string): void {
  writeFileSync(modelAliasesFile(), JSON.stringify({ version: 1, modelAliases: { fast: { 'claude-code': model } } }));
}

describe('shared model aliases in immutable source resolution', () => {
  test('an alias-only change produces new fingerprints while previous snapshots and authored bytes stay unchanged', () => {
    const { source } = fixture();
    packageAt(source, 'portable');
    const authored = readFileSync(join(source, 'plugnz.agents.json'), 'utf8');
    const original = resolveSource(source);
    configure('sonnet');
    const first = resolveSource(source);
    configure('opus');
    const second = resolveSource(source);
    expect(first.snapshot.fingerprint === original.snapshot.fingerprint).toBe(false);
    expect(second.snapshot.fingerprint === first.snapshot.fingerprint).toBe(false);
    expect(second.plugins[0]!.contentFingerprint === first.plugins[0]!.contentFingerprint).toBe(false);
    expect(first.snapshot.fingerprint).toBe(fingerprintTree(first.snapshotDir));
    expect(planPortableAgents(first.plugins[0]!.dir, 'claude-code')![0]!.model).toBe('sonnet');
    expect(planPortableAgents(second.plugins[0]!.dir, 'claude-code')![0]!.model).toBe('opus');
    expect(planPortableAgents(first.plugins[0]!.dir, 'zcode-cli')![0]!.model).toBe('zai/specific');
    expect(readFileSync(join(original.snapshotDir, 'plugnz.agents.json'), 'utf8')).toBe(authored);
    expect(readFileSync(join(source, 'plugnz.agents.json'), 'utf8')).toBe(authored);
    expect(first.snapshot.binding).toEqual(original.snapshot.binding);
    expect(first.snapshot.revision).toBe(original.snapshot.revision);
    expect(first.plugins[0]!.sourceDir).toBe(source);
    expect(resolveSource(source).snapshotDir).toBe(second.snapshotDir);
    rmSync(modelAliasesFile());
    expect(resolveSource(source)).toEqual(original);
  });

  test('marketplaces capture aliases for each portable package and leave native package bytes intact', () => {
    const { source } = fixture();
    const portable = join(source, 'plugins', 'portable');
    const another = join(source, 'plugins', 'another');
    const native = join(source, 'plugins', 'native');
    packageAt(portable, 'portable');
    packageAt(another, 'another');
    packageAt(native, 'native', false);
    writeFileSync(join(source, 'marketplace.json'), JSON.stringify({ name: 'collection', plugins: ['portable', 'another', 'native'].map(name => ({ name, source: `./plugins/${name}` })) }));
    const original = resolveSource(source);
    configure('sonnet');
    const effective = resolveSource(source);
    expect(effective.plugins.map(plugin => plugin.sourceDir)).toEqual([portable, another, native]);
    for (const plugin of effective.plugins.slice(0, 2)) {
      expect(planPortableAgents(plugin.dir, 'claude-code')![0]!.model).toBe('sonnet');
      expect(plugin.contentFingerprint).toBe(fingerprintTree(plugin.dir));
    }
    expect(effective.plugins[2]!.contentFingerprint).toBe(original.plugins[2]!.contentFingerprint);
    expect(effective.snapshot.fingerprint).toBe(fingerprintTree(effective.snapshotDir));
  });

  test('identical aliases reuse the original snapshot without reserializing authored sidecar', () => {
    const { source } = fixture();
    packageAt(source, 'portable');
    const original = resolveSource(source);
    configure('haiku');
    expect(resolveSource(source)).toEqual(original);
  });

  test('native packages ignore alias configuration, including malformed config', () => {
    const { source } = fixture();
    packageAt(source, 'native', false);
    const original = resolveSource(source);
    writeFileSync(modelAliasesFile(), 'not json');
    expect(resolveSource(source)).toEqual(original);
  });

  test('malformed and duplicate-key shared configurations fail before resolution returns installable bytes', () => {
    const { source } = fixture();
    packageAt(source, 'portable');
    for (const raw of [
      'not json',
      '{"version":1,"version":1}',
      '{"version":1,"modelAliases":{"fast":{"claude-code":"a","claude-code":"b"}}}',
      '{"version":2}',
      '{"version":1,"modelAliases":{"fast":{"claude-code":false}}}',
      '{"version":1,"toolPreferences":{}}',
    ]) {
      writeFileSync(modelAliasesFile(), raw);
      expect(() => resolveSource(source)).toThrow('Invalid portable agents');
    }
  });
});
