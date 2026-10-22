import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planPortableAgents, PORTABLE_AGENTS_FILE, renderPortableAgentMarkdown } from '../src/portable-agents';
import { yamlParse } from '../src/yaml';

const roots: string[] = [];
function fixture(config: unknown = { version: 1 }, metadata = 'name: reviewer\ndescription: Review the changes.', body = '\nReview prose.\n\nKeep this spacing.\n'): string {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-agents-'));
  roots.push(root);
  mkdirSync(join(root, 'agents'));
  writeFileSync(join(root, PORTABLE_AGENTS_FILE), JSON.stringify(config));
  writeFileSync(join(root, 'agents/reviewer.md'), `---\n${metadata}\n---\n${body}`);
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const defaults = { version: 1, modelAliases: { smart: { 'claude-code': 'opus', codex: 'gpt-smart' }, fast: { 'claude-code': 'haiku' } } };
const basic = 'name: reviewer\ndescription: Review the changes.';

describe('portable agent authoring', () => {
  test('native packages without the sidecar remain opaque', () => {
    const root = fixture({}, `${basic}\ntools: [Read]\nmodel: native-model`);
    rmSync(join(root, PORTABLE_AGENTS_FILE));
    expect(planPortableAgents(root, 'claude-code')).toBe(null);
  });
  test('direct mappings override only their own target; aliases serve other targets', () => {
    const root = fixture(defaults, `${basic}\nmodelAlias: smart\nmodels:\n  claude-code: sonnet`);
    expect(planPortableAgents(root, 'claude-code')?.[0]?.model).toBe('sonnet');
    expect(planPortableAgents(root, 'codex')?.[0]?.model).toBe('gpt-smart');
    expect(Object.hasOwn(planPortableAgents(root, 'zcode-cli')![0]!, 'model')).toBe(false);
  });
  test('direct maps work without aliases', () => {
    const root = fixture({ version: 1 }, `${basic}\nmodels:\n  claude-code: sonnet`);
    expect(planPortableAgents(root, 'claude-code')?.[0]?.model).toBe('sonnet');
    expect(Object.hasOwn(planPortableAgents(root, 'codex')![0]!, 'model')).toBe(false);
  });
  test('missing model configuration and unresolved aliases omit model, never synthesize inherit', () => {
    for (const metadata of [basic, `${basic}\nmodelAlias: fast`, `${basic}\nmodelAlias: custom-review`]) {
      const root = fixture({ version: 1 }, metadata);
      const agent = planPortableAgents(root, 'claude-code')![0]!;
      expect(Object.hasOwn(agent, 'model')).toBe(false);
      expect(renderPortableAgentMarkdown(agent).includes('model:')).toBe(false);
    }
  });
  test('custom aliases and future target identifiers need no built-in model registry', () => {
    const root = fixture({ version: 1, modelAliases: { 'review-v2': { 'future-host': 'provider/model-1' } } }, `${basic}\nmodelAlias: review-v2`);
    expect(planPortableAgents(root, 'future-host')?.[0]?.model).toBe('provider/model-1');
  });
  test('user alias overrides merge per destination; direct mappings still win', () => {
    const root = fixture(defaults, `${basic}\nmodelAlias: smart\nmodels:\n  claude-code: sonnet`);
    const overrides = { modelAliases: { smart: { 'claude-code': 'override-claude', 'zcode-cli': 'provider/model' } } };
    expect(planPortableAgents(root, 'claude-code', overrides)?.[0]?.model).toBe('sonnet');
    expect(planPortableAgents(root, 'codex', overrides)?.[0]?.model).toBe('gpt-smart');
    expect(planPortableAgents(root, 'zcode-cli', overrides)?.[0]?.model).toBe('provider/model');
  });
  test('preserves instruction prose exactly, strips portable fields, and never mutates source', () => {
    const body = '\r\nExplain reasoning: yes.\r\n\r\n  Indented prose.  \n';
    const root = fixture(defaults, `${basic}\nmodelAlias: smart\nmodels:\n  claude-code: 'odd: "model"'`, body);
    const sourceBefore = readFileSync(join(root, 'agents/reviewer.md'), 'utf8');
    const agent = planPortableAgents(root, 'claude-code')![0]!;
    const output = renderPortableAgentMarkdown(agent);
    expect(agent.body).toBe(body);
    expect(output.slice(output.indexOf('\n---\n') + 5)).toBe(body);
    expect(output.includes('modelAlias:')).toBe(false);
    expect(output.includes('models:')).toBe(false);
    expect(yamlParse(output.split('\n---\n')[0]!.slice(4))).toEqual({ name: 'reviewer', description: 'Review the changes.', model: 'odd: "model"' });
    expect(readFileSync(join(root, 'agents/reviewer.md'), 'utf8')).toBe(sourceBefore);
  });
  test('orders agents predictably', () => {
    const root = fixture();
    writeFileSync(join(root, 'agents/author.md'), '---\nname: author\ndescription: Write code.\n---\nWrite.');
    expect(planPortableAgents(root, 'codex')!.map(agent => agent.name)).toEqual(['author', 'reviewer']);
  });
  for (const [label, metadata] of [
    ['null map', `${basic}\nmodels: null`],
    ['empty model', `${basic}\nmodels:\n  codex: ''`],
    ['numeric model', `${basic}\nmodels:\n  codex: 123`],
    ['array model map', `${basic}\nmodels: []`],
    ['empty alias', `${basic}\nmodelAlias: ''`],
    ['native tools', `${basic}\ntools: [Read]`],
    ['native model', `${basic}\nmodel: inherit`],
    ['missing description', 'name: reviewer'],
    ['mismatched name', 'name: other\ndescription: Review.'],
    ['path name', 'name: ../reviewer\ndescription: Review.'],
    ['duplicate key', `${basic}\nmodelAlias: fast\nmodelAlias: smart`],
    ['duplicate target', `${basic}\nmodels:\n  codex: first\n  codex: second`],
  ] as const) test(`rejects malformed portable frontmatter: ${label}`, () => {
    expect(() => planPortableAgents(fixture(defaults, metadata), 'codex')).toThrow('Invalid portable agents');
  });
  for (const [index, config] of [
    null, [], { version: 2 }, { version: 1, models: {} },
    { version: 1, modelAliases: null }, { version: 1, modelAliases: { smart: [] } },
    { version: 1, modelAliases: { smart: { codex: '' } } },
  ].entries()) test(`rejects invalid sidecar ${index}`, () => {
    expect(() => planPortableAgents(fixture(config), 'codex')).toThrow('Invalid portable agents');
  });
  test('rejects duplicate JSON keys rather than accepting the last', () => {
    const root = fixture();
    writeFileSync(join(root, PORTABLE_AGENTS_FILE), '{"version":1,"modelAliases":{"smart":{"codex":"a","codex":"b"}}}');
    expect(() => planPortableAgents(root, 'codex')).toThrow('Map keys must be unique');
  });
  test('sidecar is JSON, not arbitrary YAML', () => {
    const root = fixture();
    writeFileSync(join(root, PORTABLE_AGENTS_FILE), 'version: 1');
    expect(() => planPortableAgents(root, 'codex')).toThrow('Invalid portable agents');
  });
  test('rejects blank instruction prose', () => {
    expect(() => planPortableAgents(fixture(defaults, basic, ' \n\t'), 'codex')).toThrow('instructions');
  });
  test('does not silently skip invalid mappings for other targets', () => {
    const root = fixture(defaults, `${basic}\nmodels:\n  claude-code: valid\n  codex: false`);
    expect(() => planPortableAgents(root, 'claude-code')).toThrow('models.codex');
  });
  test('rejects symlinked definitions and an empty agent directory', () => {
    const root = fixture();
    rmSync(join(root, 'agents/reviewer.md'));
    expect(() => planPortableAgents(root, 'codex')).toThrow('at least one');
    symlinkSync(join(root, PORTABLE_AGENTS_FILE), join(root, 'agents/reviewer.md'));
    expect(() => planPortableAgents(root, 'codex')).toThrow('regular file');
  });
  test('rejects hidden native agent roots alongside portable definitions', () => {
    const root = fixture();
    mkdirSync(join(root, '.claude/agents'), { recursive: true });
    writeFileSync(join(root, '.claude/agents/native.md'), 'Native instructions.');
    expect(() => planPortableAgents(root, 'claude-code')).toThrow('cannot coexist');
  });
  test('rejects nested definitions instead of silently omitting them', () => {
    const root = fixture();
    mkdirSync(join(root, 'agents/nested/deep'), { recursive: true });
    writeFileSync(join(root, 'agents/nested/deep/other.md'), 'Agent instructions.');
    expect(() => planPortableAgents(root, 'claude-code')).toThrow('immediate agents/*.md');
  });
  test('leaves ordinary non-Markdown resources alone', () => {
    const root = fixture();
    writeFileSync(join(root, '.gitignore'), '*.tmp');
    mkdirSync(join(root, 'agents/resources'));
    writeFileSync(join(root, 'agents/resources/input.json'), '{}');
    expect(planPortableAgents(root, 'claude-code')!.length).toBe(1);
  });
  test('handles prototype-shaped aliases as ordinary own keys', () => {
    const root = fixture({ version: 1 }, `${basic}\nmodelAlias: constructor`);
    expect(Object.hasOwn(planPortableAgents(root, 'codex')![0]!, 'model')).toBe(false);
    writeFileSync(join(root, PORTABLE_AGENTS_FILE), '{"version":1,"modelAliases":{"constructor":{"codex":"specific"}}}');
    expect(planPortableAgents(root, 'codex')?.[0]?.model).toBe('specific');
  });
});
