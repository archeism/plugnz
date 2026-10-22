import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { admitPackageSemanticsFromProfiles } from '../src/capability-evidence';
import { zcodeCliEvidenceProfiles } from '../src/hosts/zcode-cli-writer';
import { projectZcodePayload, type ZcodeProjectionTree } from '../src/hosts/zcode-cli-projection';
import { yamlParse } from '../src/yaml';

function fixture(fn: (root: string, agent: (name: string, extra?: string) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-zcode-agents-'));
  const agent = (name: string, extra = '') => writeFileSync(join(root, 'agents', `${name}.md`), `---\nname: ${name}\ndescription: ${name} reviewer\n${extra}---\nReason carefully.\n\nKeep this prose.\n`);
  try {
    mkdirSync(join(root, 'agents'));
    writeFileSync(join(root, 'plugin.json'), JSON.stringify({ name: 'reviewers', version: '1.0.0' }));
    writeFileSync(join(root, 'plugnz.agents.json'), JSON.stringify({ version: 1, modelAliases: { smart: { 'zcode-cli': 'provider/alias-model', 'claude-code': 'opus' } } }));
    agent('reviewer');
    fn(root, agent);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function content(tree: ZcodeProjectionTree, path: string): string {
  const entry = tree.get(path);
  if (entry?.kind !== 'file') throw new Error(`Missing projected file ${path}`);
  return new TextDecoder().decode(entry.bytes);
}
function metadata(tree: ZcodeProjectionTree, name: string): Record<string, unknown> {
  const raw = content(tree, `agents/${name}.md`);
  return yamlParse(/^---\n([\s\S]*?)\n---\n/u.exec(raw)![1]!) as Record<string, unknown>;
}
const project = (root: string) => projectZcodePayload(root, '/captured/resources', '1.0.0+plgnz.fixture');
function admit(root: string, operation: 'install' | 'update' = 'install', detectedVersion = '0.16.9') {
  return admitPackageSemanticsFromProfiles({ host: 'zcode-cli', detectedVersion, sourceType: 'local', route: 'native', operation,
    inventory: inventoryPackageSemantics({ name: 'reviewers', dir: root }) }, zcodeCliEvidenceProfiles);
}

test('ZCode projects explicit destination over alias, alias fallback and native omission', () => fixture((root, agent) => {
  agent('reviewer', 'modelAlias: smart\nmodels:\n  zcode-cli: provider/explicit-model\n');
  agent('alias', 'modelAlias: smart\n');
  agent('unmapped', 'modelAlias: fast\nmodels:\n  claude-code: sonnet\n');
  const original = readFileSync(join(root, 'agents/reviewer.md'), 'utf8');
  const tree = project(root).payload;
  expect(metadata(tree, 'reviewer')).toEqual({ name: 'reviewer', description: 'reviewer reviewer', model: 'provider/explicit-model' });
  expect(metadata(tree, 'alias').model).toBe('provider/alias-model');
  expect(metadata(tree, 'unmapped')).toEqual({ name: 'unmapped', description: 'unmapped reviewer' });
  expect(content(tree, 'agents/reviewer.md').split('\n---\n')[1]).toBe('Reason carefully.\n\nKeep this prose.\n');
  expect(readFileSync(join(root, 'agents/reviewer.md'), 'utf8')).toBe(original);
  expect(JSON.parse(content(tree, '.zcode-plugin/plugin.json')).agents).toBe('agents');
  expect(Object.hasOwn(metadata(tree, 'reviewer'), 'tools')).toBe(false);
  expect(tree.has('plugnz.agents.json')).toBe(false);
}));

test('ZCode model alias edits change projected bytes deterministically', () => fixture((root, agent) => {
  agent('reviewer', 'modelAlias: smart\n');
  const before = content(project(root).payload, 'agents/reviewer.md');
  writeFileSync(join(root, 'plugnz.agents.json'), JSON.stringify({ version: 1, modelAliases: { smart: { 'zcode-cli': 'provider/changed' } } }));
  const after = content(project(root).payload, 'agents/reviewer.md');
  expect(after === before).toBe(false);
  expect(content(project(root).payload, 'agents/reviewer.md')).toBe(after);
}));

for (const model of ['inherit', 'main', 'sonnet', 'opus', 'haiku', 'bare-model', 'provider/', '/model', 'provider/ $high', 'provider/  $high', 'custom:provider']) {
  test(`ZCode refuses silent inherited selection ${model}`, () => fixture((root, agent) => {
    agent('reviewer', `models:\n  zcode-cli: ${JSON.stringify(model)}\n`);
    expect(() => project(root)).toThrow('native provider/model');
  }));
}
for (const model of ['provider/model', 'provider/family/model$high', 'custom:provider%2Fpath:model%24literal', 'custom:builtin:openai:model']) {
  test(`ZCode preserves native model selection ${model}`, () => fixture((root, agent) => {
    agent('reviewer', `models:\n  zcode-cli: ${JSON.stringify(model)}\n`);
    expect(metadata(project(root).payload, 'reviewer').model).toBe(model);
  }));
}

test('portable agent admission is scoped to qualified ZCode version and excludes mixed hooks', () => fixture(root => {
  for (const operation of ['install', 'update'] as const) {
    const result = admit(root, operation);
    expect(result.status).toBe('admitted');
    expect(result.profile?.packageFormat).toBe('portable-agents');
    expect(result.profile?.agentPolicy).toBe('portable-native');
  }
  expect(admit(root, 'install', '0.16.10').status).toBe('refused');
  mkdirSync(join(root, 'hooks'));
  writeFileSync(join(root, 'hooks/hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'true' }] }] } }));
  expect(admit(root).status).toBe('refused');
}));

test('native-only agents keep their unsupported admission instead of gaining portable semantics', () => fixture(root => {
  rmSync(join(root, 'plugnz.agents.json'));
  expect(admit(root).status).toBe('refused');
  expect(() => project(root)).toThrow('require the portable');
}));

test('portable projection permits only conventional native agent declaration', () => fixture(root => {
  mkdirSync(join(root, '.zcode-plugin'));
  writeFileSync(join(root, '.zcode-plugin/plugin.json'), JSON.stringify({ name: 'reviewers', agents: './agents' }));
  expect(JSON.parse(content(project(root).payload, '.zcode-plugin/plugin.json')).agents).toBe('agents');
  writeFileSync(join(root, '.zcode-plugin/plugin.json'), JSON.stringify({ name: 'reviewers', agents: './elsewhere' }));
  expect(() => project(root)).toThrow('cannot preserve native manifest field: agents');
}));

test('ZCode native frontmatter preserves quote and backslash scalars without JSON escape corruption', () => fixture(root => {
  const description = 'Review "security" changes in C:\\src';
  const model = 'provider/model"quoted\\path';
  writeFileSync(join(root, 'agents/reviewer.md'), `---\nname: reviewer\ndescription: ${JSON.stringify(description)}\nmodels:\n  zcode-cli: ${JSON.stringify(model)}\n---\nKeep prose.\n`);
  const tree = project(root).payload;
  expect(content(tree, 'agents/reviewer.md').includes(`description: '${description}'`)).toBe(true);
  expect(content(tree, 'agents/reviewer.md').includes(`model: '${model}'`)).toBe(true);
  expect(metadata(tree, 'reviewer').description).toBe(description);
  expect(metadata(tree, 'reviewer').model).toBe(model);
}));

test('ZCode encodes actual description newlines with its native newline convention', () => fixture(root => {
  writeFileSync(join(root, 'agents/reviewer.md'), '---\nname: reviewer\ndescription: "Review code\\nThen explain"\n---\nKeep prose.\n');
  expect(content(project(root).payload, 'agents/reviewer.md').includes("description: 'Review code\\nThen explain'")).toBe(true);
}));

for (const description of ['Read literal \\n carefully', 'Both \'single\' and "double": quoted # text', 'surrounding space ', 'carriage\rreturn']) {
  test(`ZCode refuses description that cannot survive native scalar parsing: ${JSON.stringify(description)}`, () => fixture(root => {
    writeFileSync(join(root, 'agents/reviewer.md'), `---\nname: reviewer\ndescription: ${JSON.stringify(description)}\n---\nKeep prose.\n`);
    expect(() => project(root)).toThrow('ZCode portable agent description');
  }));
}

test('ZCode does not turn model control characters into a different model identifier', () => fixture((root, agent) => {
  agent('reviewer', 'models:\n  zcode-cli: "provider/model\\nother"\n');
  expect(() => project(root)).toThrow('model must be single-line');
}));
