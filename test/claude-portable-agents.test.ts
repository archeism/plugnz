import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

const agent = (name: string, fields = '') => `---\nname: ${name}\ndescription: Review the change\n${fields}---\nKeep the explanation and reasoning intact.\n`;
const fixture = {
  'plugin.json': '{"name":"portable-review","version":"1.0.0"}',
  'plugnz.agents.json': JSON.stringify({ version: 1, modelAliases: { smart: { 'claude-code': 'sonnet', 'zcode-cli': 'test/other' } } }),
  'agents/reviewer.md': agent('reviewer', 'modelAlias: smart\n'),
  'agents/explicit.md': agent('explicit', 'modelAlias: smart\nmodels:\n  claude-code: opus\n'),
  'agents/unspecified.md': agent('unspecified'),
};

for (const version of ['2.1.285', '2.1.296']) test(`Claude ${version} public install/update projects aliases, overrides and omission`, async () => {
  await withLifecycleCliHarness(h => {
    h.fakeNative('claude', Array.from({ length: 60 }, () => ({ args: ['--version'], stdout: `${version} (Claude Code)\n` })));
    const source = h.source('portable-review', fixture);
    const preview = h.run(['install', source, '--target', 'claude-code', '--dry-run', '--json']);
    expect(preview.exitCode).toBe(0);
    expect(preview.stores['claude-code'].before).toEqual(preview.stores['claude-code'].after);
    const installed = h.run(['install', source, '--target', 'claude-code', '--json']);
    expect(installed.exitCode).toBe(0);
    const texts = (result: typeof installed, name: string) => Object.entries(result.stores['claude-code'].after.files)
      .filter(([p]) => p.endsWith(`/agents/${name}.md`)).map(([, bytes]) => bytesToText(bytes));
    expect(texts(installed, 'reviewer').length).toBeGreaterThan(0);
    for (const text of texts(installed, 'reviewer')) expect(text).toBe(agent('reviewer').replace('name: reviewer', 'name: "reviewer"').replace('description: Review the change', 'description: "Review the change"').replace('---\nKeep', 'model: "sonnet"\n---\nKeep'));
    for (const text of texts(installed, 'explicit')) expect(text).toContain('model: "opus"');
    for (const text of texts(installed, 'unspecified')) expect(/\bmodel(?:Alias)?:/.test(text)).toBe(false);
    h.writeHome({ 'model-aliases.json': JSON.stringify({ version: 1, modelAliases: { smart: { 'claude-code': 'haiku' } } }) });
    const updated = h.run(['update', 'portable-review', '--target', 'claude-code', '--json']);
    expect(updated.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(updated.stdout)).outcomes[0]!.action).toBe('update');
    for (const text of texts(updated, 'reviewer')) expect(text).toContain('model: "haiku"');
    for (const text of texts(updated, 'explicit')) expect(text).toContain('model: "opus"');
    expect(texts(updated, 'reviewer').every(text => !text.includes('modelAlias'))).toBe(true);
    writeFileSync(join(source, 'agents/reviewer.md'), agent('reviewer'));
    const removedMapping = h.run(['update', 'portable-review', '--target', 'claude-code', '--json']);
    expect(removedMapping.exitCode).toBe(0);
    for (const text of texts(removedMapping, 'reviewer')) expect(text.includes('model:')).toBe(false);
  });
}, 30_000);

test('an unqualified Codex version cannot claim native agent registration', async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.codex/.keep': '' });
    const source = h.source('portable-review', fixture);
    const binary = h.fakeNative('codex', Array.from({ length: 8 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.160.0\n' })));
    const result = h.run(['install', source, '--target', 'codex', '--json'], { env: { OPEN_PLUGIN_CODEX_BIN: binary.path } });
    expect(result.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(result.stdout)).summary.mutationStarted).toBe(false);
    expect(result.stores.codex.before).toEqual(result.stores.codex.after);
  });
});
