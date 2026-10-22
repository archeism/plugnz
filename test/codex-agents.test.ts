import { afterEach, describe, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'smol-toml';
import { CODEX_AGENTS_INDEX, projectCodexAgents, readCodexAgents } from '../src/hosts/codex-agents';
import { PORTABLE_AGENTS_FILE } from '../src/portable-agents';

const roots: string[] = [];
function fixture(metadata = '', body = '\nReview carefully.\n', config: unknown = { version: 1 }) {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-codex-agents-'));
  roots.push(root);
  const source = join(root, 'source');
  const stage = join(root, 'stage');
  mkdirSync(join(source, 'agents'), { recursive: true });
  writeFileSync(join(source, PORTABLE_AGENTS_FILE), JSON.stringify(config));
  const markdown = `---\nname: reviewer\ndescription: Review changes.\n${metadata}---\n${body}`;
  writeFileSync(join(source, 'agents/reviewer.md'), markdown);
  cpSync(source, stage, { recursive: true });
  return { root, source, stage, markdown };
}
function native(stage: string) { return parse(readFileSync(join(stage, 'agents/reviewer.toml'), 'utf8')); }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('Codex native portable agents', () => {
  test('projects a native role and keeps source Markdown as a linked resource', () => {
    const { source, stage, markdown } = fixture();
    expect(projectCodexAgents(source, stage, 'addy')).toBe(true);
    expect(native(stage)).toEqual({ name: 'addy:reviewer', description: 'Review changes.', developer_instructions: '\nReview carefully.\n' });
    expect(readCodexAgents(stage)).toEqual([{ name: 'addy:reviewer', description: 'Review changes.', path: 'agents/reviewer.toml' }]);
    expect(readFileSync(join(stage, 'agents/reviewer.md'), 'utf8')).toBe(markdown);
    expect(readFileSync(join(source, 'agents/reviewer.md'), 'utf8')).toBe(markdown);
    expect(existsSync(join(source, PORTABLE_AGENTS_FILE))).toBe(true);
    expect(existsSync(join(source, 'agents/reviewer.toml'))).toBe(false);
    expect(existsSync(join(stage, PORTABLE_AGENTS_FILE))).toBe(false);
  });

  test('round-trips exact CRLF prose, Unicode, quotes, backslashes and control characters', () => {
    const body = '\r\nReasoning: "quoted" \\path\\中文 😀\r\n\tKeep\b\f\u0001\u007f these.\r\n';
    const { source, stage } = fixture('', body);
    expect(projectCodexAgents(source, stage, 'plugin.name')).toBe(true);
    expect(native(stage)['developer_instructions']).toBe(body);
    expect(readCodexAgents(stage)[0]?.name).toBe('plugin.name:reviewer');
  });

  test('direct model overrides captured user aliases; unresolved targets omit model', () => {
    for (const [metadata, aliases, expected] of [
      ['modelAlias: smart\nmodels:\n  codex: explicit-model\n', { smart: { codex: 'captured-user-model' } }, 'explicit-model'],
      ['modelAlias: smart\n', { smart: { codex: 'captured-user-model' } }, 'captured-user-model'],
      ['modelAlias: smart\n', { smart: { 'claude-code': 'opus' } }, undefined],
      ['', {}, undefined],
    ] as const) {
      const { source, stage } = fixture(metadata, 'Review.', { version: 1, modelAliases: aliases });
      projectCodexAgents(source, stage, 'addy');
      expect(native(stage)['model']).toBe(expected);
      expect(Object.hasOwn(native(stage), 'model')).toBe(expected !== undefined);
      expect(Object.hasOwn(native(stage), 'modelAlias')).toBe(false);
      expect(Object.hasOwn(native(stage), 'models')).toBe(false);
    }
  });

  test('instruction-only agents register without requiring a model sidecar', () => {
    const { source, stage } = fixture();
    rmSync(join(source, PORTABLE_AGENTS_FILE));
    rmSync(join(stage, PORTABLE_AGENTS_FILE));
    expect(projectCodexAgents(source, stage, 'addy')).toBe(true);
    expect(readCodexAgents(stage)[0]?.name).toBe('addy:reviewer');
    expect(Object.hasOwn(native(stage), 'model')).toBe(false);
  });

  test('packages without agents remain unchanged', () => {
    const { source, stage } = fixture();
    rmSync(join(source, PORTABLE_AGENTS_FILE));
    rmSync(join(source, 'agents'), { recursive: true });
    expect(projectCodexAgents(source, stage, 'addy')).toBe(false);
    expect(readCodexAgents(stage)).toEqual([]);
  });

  test('plain definitions reject native metadata and require opt-in for portable models', () => {
    for (const metadata of ['model: gpt-model\n', 'tools: [Read]\n', 'modelAlias: fast\n', 'models:\n  codex: chosen\n']) {
      const { source, stage } = fixture(metadata);
      rmSync(join(source, PORTABLE_AGENTS_FILE));
      expect(() => projectCodexAgents(source, stage, 'addy')).toThrow('unsupported field');
      expect(existsSync(join(stage, 'agents/reviewer.toml'))).toBe(false);
    }
  });

  test('rejects reserved source index and native TOML collisions before writing', () => {
    for (const path of [CODEX_AGENTS_INDEX, 'agents/reviewer.toml']) {
      const { source, stage } = fixture();
      writeFileSync(join(source, path), 'owned by source');
      expect(() => projectCodexAgents(source, stage, 'addy')).toThrow(path);
      expect(existsSync(join(stage, 'agents/reviewer.toml'))).toBe(false);
      expect(existsSync(join(stage, PORTABLE_AGENTS_FILE))).toBe(true);
    }
  });

  test('rejects stage collisions, symlinked agent directories and in-place projection', () => {
    const { root, source, stage } = fixture();
    writeFileSync(join(stage, 'agents/reviewer.toml'), 'keep');
    expect(() => projectCodexAgents(source, stage, 'addy')).toThrow('collides');
    expect(readFileSync(join(stage, 'agents/reviewer.toml'), 'utf8')).toBe('keep');
    expect(() => projectCodexAgents(source, source, 'addy')).toThrow('distinct');
    const linked = join(root, 'linked');
    mkdirSync(linked);
    symlinkSync(join(source, 'agents'), join(linked, 'agents'));
    expect(() => projectCodexAgents(source, linked, 'addy')).toThrow('regular directory');
  });

  test('rejects unsafe namespace strings', () => {
    const { source, stage } = fixture();
    for (const namespace of ['', '../escape', 'a:b', 'bad name']) {
      expect(() => projectCodexAgents(source, stage, namespace)).toThrow('namespace');
    }
  });

  test('validates index schema, canonical paths and unique registration identities', () => {
    const { source, stage } = fixture();
    projectCodexAgents(source, stage, 'addy');
    const valid = { name: 'addy:reviewer', description: 'Review changes.', path: 'agents/reviewer.toml' };
    for (const index of [
      { version: 2, agents: [valid] },
      { version: 1, agents: [] },
      { version: 1, agents: [valid], extra: true },
      { version: 1, agents: [valid, valid] },
      { version: 1, agents: [{ ...valid, path: '../reviewer.toml' }] },
      { version: 1, agents: [{ ...valid, name: 'unqualified' }] },
      { version: 1, agents: [{ ...valid, description: null }] },
    ]) {
      writeFileSync(join(stage, CODEX_AGENTS_INDEX), JSON.stringify(index));
      expect(() => readCodexAgents(stage)).toThrow('Invalid Codex agents');
    }
  });

  test('validates native content matches the registration and adds no permissions', () => {
    const { source, stage } = fixture();
    projectCodexAgents(source, stage, 'addy');
    const valid = native(stage);
    for (const change of [{ name: 'other:reviewer' }, { description: 'Other' }, { developer_instructions: '' }, { model: '' }, { tools: [] }]) {
      writeFileSync(join(stage, 'agents/reviewer.toml'), stringify({ ...valid, ...change }));
      expect(() => readCodexAgents(stage)).toThrow('does not match');
    }
  });

  test('rejects symlinked index and native files instead of following them', () => {
    const { root, source, stage } = fixture();
    projectCodexAgents(source, stage, 'addy');
    for (const path of [CODEX_AGENTS_INDEX, 'agents/reviewer.toml']) {
      const original = readFileSync(join(stage, path), 'utf8');
      writeFileSync(join(root, 'outside'), original);
      rmSync(join(stage, path));
      symlinkSync(join(root, 'outside'), join(stage, path));
      expect(() => readCodexAgents(stage)).toThrow('regular file');
      rmSync(join(stage, path));
      writeFileSync(join(stage, path), original);
    }
  });
});
