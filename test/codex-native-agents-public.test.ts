import { expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { withLifecycleCliHarness, type LifecycleCliHarness, type CliRunResult } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

const agent = (name: string, metadata = '') => `---\nname: ${name}\ndescription: Review the change\n${metadata}---\nKeep the explanation and reasoning intact.\n`;
const fixture = {
  'plugin.json': '{"name":"portable-review","version":"1.0.0"}\n',
  'plugnz.agents.json': JSON.stringify({ version: 1, modelAliases: { smart: { codex: 'gpt-smart', 'claude-code': 'sonnet' } } }),
  'agents/reviewer.md': agent('reviewer', 'modelAlias: smart\n'),
  'agents/explicit.md': agent('explicit', 'modelAlias: smart\nmodels:\n  codex: gpt-explicit\n'),
  'agents/unspecified.md': agent('unspecified'),
};
const unrelated = '# Personal settings\nmodel = "personal-model"\n\n[agents.personal]\nconfig_file = "/my/personal.toml" # keep this\n';
function config(h: LifecycleCliHarness): string { return readFileSync(join(h.storePath('codex'), 'config.toml'), 'utf8'); }
function refs(h: LifecycleCliHarness): Record<string, { config_file: string }> {
  return (parse(config(h)).agents ?? {}) as Record<string, { config_file: string }>;
}
function role(h: LifecycleCliHarness, name: string): Record<string, unknown> { return parse(readFileSync(refs(h)[name]!.config_file, 'utf8')); }
function liveFiles(snapshot: CliRunResult['stores']['codex']['after']): Record<string, number[]> {
  return Object.fromEntries(Object.entries(snapshot.files).filter(([path]) => !path.startsWith('.plgnz-')));
}
function success(result: CliRunResult): void {
  const report = parseLifecycleReport(JSON.parse(result.stdout));
  expect(report.summary.reason).toBe(null);
  expect(report.outcomes.map(outcome => outcome.reason)).toEqual(report.outcomes.map(() => null));
  expect(result.exitCode).toBe(0);
}
function prepare(h: LifecycleCliHarness, version = '0.162.0') {
  h.writeHome({ '.codex/config.toml': unrelated });
  const native = h.fakeNative('codex', Array.from({ length: 100 }, () => ({ args: ['--version'], stdout: `codex-cli ${version}\n` })));
  return { OPEN_PLUGIN_CODEX_BIN: native.path };
}

for (const version of ['0.161.0', '0.162.0']) test(`Codex ${version} public native roles project mappings, update aliases/version, and retire only owned refs`, async () => {
  await withLifecycleCliHarness(h => {
    const env = prepare(h, version);
    const source = h.source('portable-review', fixture);
    const preview = h.run(['install', source, '--target', 'codex', '--dry-run', '--json'], { env });
    success(preview);
    expect(preview.stores.codex.after).toEqual(preview.stores.codex.before);
    const installed = h.run(['install', source, '--target', 'codex', '--json'], { env });
    success(installed);
    expect(Object.keys(refs(h)).sort()).toEqual(['personal', 'portable-review:explicit', 'portable-review:reviewer', 'portable-review:unspecified']);
    expect(role(h, 'portable-review:reviewer')).toEqual({ name: 'portable-review:reviewer', description: 'Review the change', developer_instructions: 'Keep the explanation and reasoning intact.\n', model: 'gpt-smart' });
    expect(role(h, 'portable-review:explicit').model).toBe('gpt-explicit');
    expect(Object.hasOwn(role(h, 'portable-review:unspecified'), 'model')).toBe(false);
    expect(config(h)).toContain(unrelated);
    const beforePath = refs(h)['portable-review:reviewer']!.config_file;
    h.writeHome({ 'model-aliases.json': JSON.stringify({ version: 1, modelAliases: { smart: { codex: 'gpt-local-alias' } } }) });
    const aliasUpdated = h.run(['update', 'portable-review', '--target', 'codex', '--json'], { env });
    success(aliasUpdated);
    expect(parseLifecycleReport(JSON.parse(aliasUpdated.stdout)).outcomes[0]!.action).toBe('update');
    expect(role(h, 'portable-review:reviewer').model).toBe('gpt-local-alias');
    expect(role(h, 'portable-review:explicit').model).toBe('gpt-explicit');
    writeFileSync(join(source, 'plugin.json'), '{"name":"portable-review","version":"2.0.0"}\n');
    success(h.run(['update', 'portable-review', '--target', 'codex', '--json'], { env }));
    expect(refs(h)['portable-review:reviewer']!.config_file === beforePath).toBe(false);
    expect(refs(h)['portable-review:reviewer']!.config_file).toContain('/2.0.0/');
    expect(role(h, 'portable-review:reviewer').model).toBe('gpt-local-alias');
    const removed = h.run(['remove', 'portable-review', '--target', 'codex', '--json'], { env });
    success(removed);
    expect(refs(h)).toEqual({ personal: { config_file: '/my/personal.toml' } });
    expect(config(h)).toContain(unrelated);
  });
}, 30_000);

test('plain Addy-style agents become native Codex roles without portable metadata or commands', async () => {
  await withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('addy', {
      'plugin.json': '{"name":"addy","version":"1.0.0"}\n',
      'agents/code-reviewer.md': agent('code-reviewer'),
      'agents/security-auditor.md': agent('security-auditor'),
    });
    success(h.run(['install', source, '--target', 'codex', '--json'], { env }));
    for (const name of ['code-reviewer', 'security-auditor']) {
      expect(refs(h)[`addy:${name}`]!.config_file.endsWith(`/agents/${name}.toml`)).toBe(true);
      expect(role(h, `addy:${name}`).name).toBe(`addy:${name}`);
      expect(Object.hasOwn(role(h, `addy:${name}`), 'model')).toBe(false);
      expect(Object.hasOwn(role(h, `addy:${name}`), 'tools')).toBe(false);
    }
  });
}, 20_000);

test('foreign native role collisions refuse installation without changing config or cache', async () => {
  await withLifecycleCliHarness(h => {
    const env = prepare(h);
    const foreign = unrelated + '\n[agents."portable-review:reviewer"]\nconfig_file = "/my/reviewer.toml"\n';
    h.writeHome({ '.codex/config.toml': foreign });
    const source = h.source('portable-review', fixture);
    const result = h.run(['install', source, '--target', 'codex', '--json'], { env });
    expect(result.exitCode).toBe(1);
    expect(config(h)).toBe(foreign);
    expect(liveFiles(result.stores.codex.after)).toEqual(liveFiles(result.stores.codex.before));
  });
}, 20_000);

for (const operation of ['update', 'remove']) test(`edited owned native role refuses ${operation} without overwriting the user's config`, async () => {
  await withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'codex', '--json'], { env }));
    const edited = config(h).replace(refs(h)['portable-review:reviewer']!.config_file, '/user/edited.toml');
    h.writeHome({ '.codex/config.toml': edited });
    writeFileSync(join(source, 'agents/reviewer.md'), agent('reviewer', 'models:\n  codex: gpt-new\n'));
    const result = h.run([operation, 'portable-review', '--target', 'codex', '--json'], { env });
    expect(result.exitCode).toBe(1);
    expect(config(h)).toBe(edited);
    expect(liveFiles(result.stores.codex.after)).toEqual(liveFiles(result.stores.codex.before));
  });
}, 20_000);

test('updating unchanged source repairs a missing native role registration', async () => {
  await withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'codex', '--json'], { env }));
    const ref = refs(h)['portable-review:reviewer']!;
    const block = `[agents."portable-review:reviewer"]\nconfig_file = ${JSON.stringify(ref.config_file)}\n`;
    expect(config(h)).toContain(block);
    h.writeHome({ '.codex/config.toml': config(h).replace(block, '') });
    const result = h.run(['update', 'portable-review', '--target', 'codex', '--json'], { env });
    success(result);
    expect(refs(h)['portable-review:reviewer']).toEqual(ref);
    expect(config(h)).toContain(unrelated);
  });
}, 20_000);

for (const scenario of ['update', 'remove', 'update-missing-ref']) test(`public ${scenario} rollback restores native roles and retains unrelated config edits after committed mutation`, async () => {
  await withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'codex', '--json'], { env }));
    const operation = scenario === 'remove' ? 'remove' : 'update';
    if (scenario === 'update-missing-ref') {
      const path = refs(h)['portable-review:reviewer']!.config_file;
      h.writeHome({ '.codex/config.toml': config(h).replace(`[agents."portable-review:reviewer"]\nconfig_file = ${JSON.stringify(path)}\n`, '') });
      expect(refs(h)['portable-review:reviewer']).toBeUndefined();
    }
    const beforeRefs = refs(h);
    const beforeRole = role(h, 'portable-review:explicit');
    const beforeConfig = parse(config(h));
    const oldRoot = join(beforeRefs['portable-review:explicit']!.config_file, '..', '..');
    if (operation === 'update') writeFileSync(join(source, 'plugin.json'), '{"name":"portable-review","version":"2.0.0"}\n');
    const faultMarker = join(h.root, 'fault-fired');
    const wrapper = join(h.root, 'fail-after-native-mutation.mjs');
    const concurrentEdit = '\n# User edit while operation was active\n[history]\nmax_bytes = 2048\n';
    writeFileSync(wrapper, [
      "const actual = { ...await import('node:fs') };",
      `const oldRoot = ${JSON.stringify(oldRoot)};`,
      `const configPath = ${JSON.stringify(join(h.storePath('codex'), 'config.toml'))};`,
      `const faultMarker = ${JSON.stringify(faultMarker)};`,
      'let fired = false;',
      'const rmSync = (...args) => {',
      '  const result = actual.rmSync(...args);',
      '  if (!fired && String(args[0]) === oldRoot) {',
      '    fired = true;',
      `    actual.writeFileSync(configPath, actual.readFileSync(configPath, 'utf8') + ${JSON.stringify(concurrentEdit)});`,
      "    actual.writeFileSync(faultMarker, 'after committed config and cache mutation');",
      "    throw new Error('injected failure after committed native mutation');",
      '  }',
      '  return result;',
      '};',
      'if (process.versions.bun) {',
      "  const { mock } = await import('bun:test');",
      "  mock.module('node:fs', () => ({ ...actual, default: { ...actual.default, rmSync }, rmSync }));",
      '} else {',
      '  actual.default.rmSync = rmSync;',
      "  (await import('node:module')).syncBuiltinESMExports();",
      '}',
      `await import(${JSON.stringify(join(import.meta.dir, '..', process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] ? 'dist/plugnz.mjs' : 'bin/plugnz.mjs'))});`,
    ].join('\n'));
    const failed = h.run([operation, 'portable-review', '--target', 'codex', '--json'], {
      env,
      cliArtifact: { executable: process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] || process.execPath, entrypoint: wrapper },
    });
    expect(existsSync(faultMarker)).toBe(true);
    expect(failed.exitCode).toBe(1);
    const report = parseLifecycleReport(JSON.parse(failed.stdout));
    expect(report.summary.mutationStarted).toBe(true);
    expect(report.outcomes[0]!.reason!.diagnostic).toContain('injected failure after committed native mutation');
    const state = JSON.parse(readFileSync(join(h.home, 'state.json'), 'utf8'));
    expect(state.attempts.at(-1).journal[0].state).toBe('rolled-back');
    expect(refs(h)).toEqual(beforeRefs);
    expect(role(h, 'portable-review:explicit')).toEqual(beforeRole);
    expect(config(h)).toContain(unrelated);
    expect(config(h)).toContain(concurrentEdit);
    expect(parse(config(h))).toEqual({ ...beforeConfig, history: { max_bytes: 2048 } });
  });
}, 30_000);

test('renaming then removing every source agent removes stale native roles and preserves unrelated refs', async () => {
  await withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'codex', '--json'], { env }));
    rmSync(join(source, 'agents/reviewer.md'));
    writeFileSync(join(source, 'agents/new-reviewer.md'), agent('new-reviewer', 'modelAlias: smart\n'));
    success(h.run(['update', 'portable-review', '--target', 'codex', '--json'], { env }));
    expect(refs(h)['portable-review:reviewer']).toBeUndefined();
    expect(Object.keys(refs(h)).sort()).toEqual(['personal', 'portable-review:explicit', 'portable-review:new-reviewer', 'portable-review:unspecified']);
    expect(role(h, 'portable-review:new-reviewer').model).toBe('gpt-smart');
    expect(config(h)).toContain(unrelated);
    // Removing the portable-agent sidecar opts this plugin out of agent projection.
    rmSync(join(source, 'agents'), { recursive: true });
    rmSync(join(source, 'plugnz.agents.json'));
    const updated = h.run(['update', 'portable-review', '--target', 'codex', '--json'], { env });
    success(updated);
    expect(refs(h)).toEqual({ personal: { config_file: '/my/personal.toml' } });
    expect(config(h)).toContain(unrelated);
    expect(Object.keys(liveFiles(updated.stores.codex.after)).some(path => path.includes('/agents/') || path.endsWith('/.plgnz-codex-agents.json'))).toBe(false);
  });
}, 20_000);
