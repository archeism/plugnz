import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fingerprintSourceTree } from '../src/fingerprint';
import { hookIdentityKey } from '../src/native-hook-store';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { snapshotTree, withLifecycleCliHarness, type CliRunResult, type LifecycleCliHarness, type TreeSnapshot } from './lifecycle-cli-harness';

/** Exact prose proves config(cfg) keeps bytes instead of passing through a file parser. */
const BODY = '\nPreserve  spacing\n  and indentation.\n\n';
function agentFile(name: string, extra = ''): string {
  return `---\nname: ${name}\ndescription: ${name} description\n${extra}---\n${BODY}`;
}
function fixture(): Record<string, string> {
  return {
    'plugin.json': '{"name":"demo","version":"1.0.0","description":"Portable agent fixture"}\n',
    'plugnz.agents.json': JSON.stringify({ version: 1, modelAliases: {
      smart: { opencode: 'boundary/probe-smart' }, local: { opencode: 'boundary/probe-package' },
    } }),
    'agents/explicit.md': agentFile('explicit', 'modelAlias: smart\nmodels:\n  opencode: boundary/probe-explicit\n'),
    'agents/user-alias.md': agentFile('user-alias', 'modelAlias: smart\n'),
    'agents/package-alias.md': agentFile('package-alias', 'modelAlias: local\n'),
    'agents/omitted.md': agentFile('omitted'),
    'resources/persona.md': 'persona\n',
  };
}
function prepare(h: LifecycleCliHarness): Record<string, string> {
  const native = h.fakeNative('opencode', Array.from({ length: 40 }, () => ({ args: ['--version'], stdout: '1.19.0\n' })));
  return { OPEN_PLUGIN_OPENCODE_BIN: native.path };
}
function success(result: CliRunResult): void {
  const report = parseLifecycleReport(JSON.parse(result.stdout));
  expect(result.exitCode).toBe(0);
  expect(report.summary.reason).toBe(null);
  expect(report.outcomes.map(outcome => outcome.reason)).toEqual(report.outcomes.map(() => null));
}
function failure(result: CliRunResult): string {
  expect(result.exitCode).toBe(1);
  const report = parseLifecycleReport(JSON.parse(result.stdout));
  return report.outcomes.map(outcome => outcome.reason?.diagnostic ?? '').join('\n');
}
function packagePath(h: LifecycleCliHarness, id = 'demo@local'): string {
  return join(h.storePath('opencode'), '.plgnz', 'hook-packages', hookIdentityKey(id));
}
function loaderPath(h: LifecycleCliHarness, id = 'demo@local'): string {
  return join(h.storePath('opencode'), 'plugins', 'plugnz-' + hookIdentityKey(id) + '.js');
}
function marker(h: LifecycleCliHarness, id = 'demo@local'): Record<string, unknown> {
  return JSON.parse(readFileSync(join(packagePath(h, id), '.plgnz-install.json'), 'utf8')) as Record<string, unknown>;
}
/** The generated plugin path exists only after installation, so a static import cannot work. */
async function loadPlugin(h: LifecycleCliHarness, id = 'demo@local'): Promise<{ default: () => { config(cfg: { agent?: Record<string, unknown> }): void } }> {
  const entry = join(packagePath(h, id), 'plugin.mjs');
  return await import(pathToFileURL(entry).href + '?test=' + Math.random().toString(16).slice(2)) as {
    default: () => { config(cfg: { agent?: Record<string, unknown> }): void };
  };
}
interface RoleEntry { description: string; prompt: string; mode: string; model?: string }
async function register(h: LifecycleCliHarness, cfg: { agent?: Record<string, unknown> }): Promise<void> {
  const plugin = await loadPlugin(h);
  plugin.default().config(cfg);
}
function roles(h: LifecycleCliHarness): string[] {
  return marker(h)['agents'] as string[];
}
function liveStore(snapshot: TreeSnapshot): Record<string, number[]> {
  return Object.fromEntries(Object.entries(snapshot.files).filter(([path]) => path.startsWith('.plgnz/hook-packages/')));
}

test('public install registers exact-prose native roles with explicit > user alias > package alias > omission', async () => withLifecycleCliHarness(async h => {
  const env = prepare(h);
  h.writeHome({
    'model-aliases.json': JSON.stringify({ version: 1, modelAliases: { smart: { opencode: 'boundary/probe-user' } } }),
    '.config/opencode/opencode.jsonc': '{ // keep this user comment\n "plugin": ["unrelated-package"], "model": "fixture"\n}\n',
    '.config/opencode/plugins/unrelated.js': 'export default function unrelated() { return {}; }\n',
  });
  const source = h.source('demo', fixture());
  success(h.run(['install', source, '--target', 'opencode', '--json'], { env }));

  const installed = packagePath(h);
  expect(existsSync(join(installed, 'plugnz.agents.json'))).toBe(false);
  expect(existsSync(join(installed, 'plugin.mjs'))).toBe(true);
  expect(existsSync(join(installed, 'resources/persona.md'))).toBe(true);
  const rendered = readFileSync(join(installed, 'agents/explicit.md'), 'utf8');
  expect(rendered).toBe(`---\nname: "explicit"\ndescription: "explicit description"\n---\n${BODY}`);
  expect(rendered.includes('modelAlias')).toBe(false);
  expect(readFileSync(loaderPath(h), 'utf8')).toBe('export { default } from ' + JSON.stringify(pathToFileURL(join(installed, 'plugin.mjs')).href) + ';\n');
  const stored = marker(h);
  expect(stored['kind']).toBe('portable-agents');
  expect(stored['payloadFingerprint']).toBe(fingerprintSourceTree(installed, ['.plgnz-install.json']));
  expect(roles(h)).toEqual(['demo:explicit', 'demo:omitted', 'demo:package-alias', 'demo:user-alias']);

  const cfg: { agent?: Record<string, unknown> } = {};
  await register(h, cfg);
  const agent = cfg.agent as Record<string, RoleEntry>;
  expect(agent['demo:explicit']!.model).toBe('boundary/probe-explicit');
  expect(agent['demo:user-alias']!.model).toBe('boundary/probe-user');
  expect(agent['demo:package-alias']!.model).toBe('boundary/probe-package');
  expect(Object.hasOwn(agent['demo:omitted']!, 'model')).toBe(false);
  for (const value of Object.values(agent)) {
    expect(value.mode).toBe('subagent');
    expect(value.prompt).toBe(BODY);
    expect(Object.hasOwn(value, 'tools')).toBe(false);
    expect(Object.hasOwn(value, 'permission')).toBe(false);
  }
  // Re-applying the same config (a duplicate plugin load) stays idempotent.
  await register(h, cfg);
  expect(Object.keys(cfg.agent!)).toHaveLength(4);
}), 30_000);

test('the runtime guard is atomic per package and refuses foreign or built-in names', async () => withLifecycleCliHarness(async h => {
  const env = prepare(h);
  const source = h.source('demo', fixture());
  success(h.run(['install', source, '--target', 'opencode', '--json'], { env }));
  const foreign = { 'demo:omitted': { description: 'user agent', prompt: 'user', mode: 'subagent' } };
  const cfg: { agent?: Record<string, unknown> } = { agent: { ...foreign } };
  let rejected: unknown;
  try { await register(h, cfg); } catch (error) { rejected = error; }
  expect(rejected instanceof Error ? rejected.message : String(rejected)).toContain('demo:omitted already exists');
  expect(cfg.agent).toEqual(foreign);
  const empty: { agent?: Record<string, unknown> } = { agent: {} };
  const plugin = await loadPlugin(h);
  plugin.default().config(empty);
  expect(Object.keys(empty.agent!)).toEqual(['demo:explicit', 'demo:omitted', 'demo:package-alias', 'demo:user-alias']);
}), 30_000);

test('public unchanged re-add writes nothing and a same-version body update replaces the payload', async () => withLifecycleCliHarness(h => {
  const env = prepare(h);
  const source = h.source('demo', fixture());
  const first = h.run(['install', source, '--target', 'opencode', '--json'], { env });
  success(first);
  const repeated = h.run(['install', source, '--target', 'opencode', '--json'], { env });
  success(repeated);
  expect(liveStore(repeated.stores.opencode.after)).toEqual(liveStore(repeated.stores.opencode.before));
  writeFileSync(join(source, 'agents/user-alias.md'), agentFile('user-alias', 'modelAlias: smart\n').replace('Preserve  spacing', 'Updated  prose'));
  const updated = h.run(['update', 'demo', '--target', 'opencode', '--json'], { env });
  success(updated);
  expect(readFileSync(join(packagePath(h), 'agents/user-alias.md'), 'utf8')).toContain('Updated  prose');
}), 30_000);

test('alias-only update re-resolves models without touching explicit or package mappings', async () => withLifecycleCliHarness(async h => {
  const env = prepare(h);
  h.writeHome({ 'model-aliases.json': JSON.stringify({ version: 1, modelAliases: { smart: { opencode: 'boundary/probe-user' } } }) });
  const source = h.source('demo', fixture());
  success(h.run(['install', source, '--target', 'opencode', '--json'], { env }));
  h.writeHome({ 'model-aliases.json': JSON.stringify({ version: 1, modelAliases: { smart: { opencode: 'boundary/probe-user-2' } } }) });
  success(h.run(['update', 'demo', '--target', 'opencode', '--json'], { env }));
  const cfg: { agent?: Record<string, unknown> } = {};
  await register(h, cfg);
  const agent = cfg.agent as Record<string, RoleEntry>;
  expect(agent['demo:user-alias']!.model).toBe('boundary/probe-user-2');
  expect(agent['demo:explicit']!.model).toBe('boundary/probe-explicit');
  expect(agent['demo:package-alias']!.model).toBe('boundary/probe-package');
}), 30_000);

test('rename and removal retire stale roles, the loader, and leave unrelated plugins/user files intact', async () => withLifecycleCliHarness(h => {
  const env = prepare(h);
  const config = '{ // user comment\n "plugin": ["unrelated-package"]\n}\n';
  h.writeHome({
    '.config/opencode/opencode.jsonc': config,
    '.config/opencode/plugins/unrelated.js': 'export default function unrelated() { return {}; }\n',
    '.config/opencode/agents/user-agent.md': '---\ndescription: user agent\n---\nuser\n',
  });
  const source = h.source('demo', fixture());
  success(h.run(['install', source, '--target', 'opencode', '--json'], { env }));
  rmSync(join(source, 'agents/package-alias.md'));
  writeFileSync(join(source, 'agents/auditor.md'), agentFile('auditor'));
  success(h.run(['update', 'demo', '--target', 'opencode', '--json'], { env }));
  expect(roles(h)).toEqual(['demo:auditor', 'demo:explicit', 'demo:omitted', 'demo:user-alias']);
  expect(existsSync(join(packagePath(h), 'agents/package-alias.md'))).toBe(false);
  const removed = h.run(['remove', 'demo', '--target', 'opencode', '--json'], { env });
  success(removed);
  expect(existsSync(packagePath(h))).toBe(false);
  expect(existsSync(loaderPath(h))).toBe(false);
  expect(readFileSync(join(h.storePath('opencode'), 'opencode.jsonc'), 'utf8')).toBe(config);
  expect(readFileSync(join(h.storePath('opencode'), 'plugins/unrelated.js'), 'utf8')).toContain('unrelated');
  expect(existsSync(join(h.storePath('opencode'), 'agents/user-agent.md'))).toBe(true);
}), 30_000);

test('foreign user agent names and namespaces refuse installation without touching the store', async () => withLifecycleCliHarness(h => {
  const env = prepare(h);
  const first = h.source('first', fixture());
  success(h.run(['install', first, '--target', 'opencode', '--json'], { env }));
  const before = liveStore(snapshotTree(h.storePath('opencode')));
  const conflictingUser = h.source('second', { ...fixture(), 'plugin.json': '{"name":"second","version":"1.0.0"}\n',
    'agents/explicit.md': agentFile('explicit') });
  writeFileSync(join(h.storePath('opencode'), 'opencode.json'), JSON.stringify({ agent: { 'second:explicit': { description: 'user', prompt: 'user' } } }));
  const refused = h.run(['install', conflictingUser, '--target', 'opencode', '--json'], { env });
  expect(failure(refused)).toContain('already defines second:explicit');
  expect(liveStore(snapshotTree(h.storePath('opencode')))).toEqual(before);
  rmSync(join(h.storePath('opencode'), 'opencode.json'));
  mkdirSync(join(h.storePath('opencode'), 'agents'), { recursive: true });
  writeFileSync(join(h.storePath('opencode'), 'agents/explicit.md'), '---\nname: second:explicit\ndescription: user\n---\nuser\n');
  const markdown = h.run(['install', conflictingUser, '--target', 'opencode', '--json'], { env });
  expect(failure(markdown)).toContain('already claims second:explicit');
  rmSync(join(h.storePath('opencode'), 'agents/explicit.md'));
  const secondMarket = h.source('market-two', {
    'marketplace.json': JSON.stringify({ name: 'market-two', plugins: [{ source: './plugins/demo' }] }),
    'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0"}\n',
    'plugins/demo/plugnz.agents.json': JSON.stringify({ version: 1 }),
    'plugins/demo/agents/auditor.md': agentFile('auditor'),
  });
  const namespace = h.run(['install', secondMarket, '--target', 'opencode', '--json'], { env });
  expect(failure(namespace)).toContain('namespace demo is already installed');
}), 30_000);

test('an edited owned loader refuses update and removal without overwriting it', async () => withLifecycleCliHarness(h => {
  const env = prepare(h);
  const source = h.source('demo', fixture());
  success(h.run(['install', source, '--target', 'opencode', '--json'], { env }));
  const loader = loaderPath(h);
  const edited = readFileSync(loader, 'utf8') + '// user edit\n';
  writeFileSync(loader, edited);
  expect(failure(h.run(['update', 'demo', '--target', 'opencode', '--json'], { env }))).toContain('loader is foreign or changed');
  expect(failure(h.run(['remove', 'demo', '--target', 'opencode', '--json'], { env }))).toContain('loader changed');
  expect(readFileSync(loader, 'utf8')).toBe(edited);
  expect(existsSync(packagePath(h))).toBe(true);
}), 30_000);

test('a modified owned payload refuses update and removal instead of silently replacing it', async () => withLifecycleCliHarness(h => {
  const env = prepare(h);
  const source = h.source('demo', fixture());
  success(h.run(['install', source, '--target', 'opencode', '--json'], { env }));
  const loader = loaderPath(h);
  const loaderBytes = readFileSync(loader, 'utf8');
  const payload = join(packagePath(h), 'agents/omitted.md');
  const edited = readFileSync(payload, 'utf8') + 'user appendix\n';
  writeFileSync(payload, edited);
  expect(failure(h.run(['update', 'demo', '--target', 'opencode', '--json'], { env }))).toContain('payload was modified');
  expect(failure(h.run(['remove', 'demo', '--target', 'opencode', '--json'], { env }))).toContain('payload was modified');
  expect(readFileSync(payload, 'utf8')).toBe(edited);
  expect(readFileSync(loader, 'utf8')).toBe(loaderBytes);
}), 30_000);

test('a failed update activation restores the prior package and keeps unrelated edits', async () => withLifecycleCliHarness(h => {
  const env = prepare(h);
  const config = '{ // user comment\n "plugin": ["unrelated-package"]\n}\n';
  h.writeHome({ '.config/opencode/opencode.jsonc': config });
  const source = h.source('demo', fixture());
  success(h.run(['install', source, '--target', 'opencode', '--json'], { env }));
  const before = snapshotTree(packagePath(h));
  const loader = readFileSync(loaderPath(h), 'utf8');
  writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"2.0.0","description":"Portable agent fixture"}\n');
  writeFileSync(join(source, 'agents/omitted.md'), agentFile('omitted').replace('Preserve  spacing', 'Version two'));
  const faultMarker = join(h.root, 'fault-fired');
  const userEdit = join(h.storePath('opencode'), 'plugins/user-during-update.js');
  const wrapper = join(h.root, 'fail-before-activation.mjs');
  writeFileSync(wrapper, [
    "const actual = { ...await import('node:fs') };",
    `const faultMarker = ${JSON.stringify(faultMarker)};`,
    `const userEdit = ${JSON.stringify(userEdit)};`,
    `const configPath = ${JSON.stringify(join(h.storePath('opencode'), 'opencode.jsonc'))};`,
    'let fired = false;',
    'const renameSync = (...args) => {',
    "  if (!fired && typeof args[0] === 'string' && String(args[0]).endsWith('/candidate') && String(args[0]).includes('.plugnz-hook-stage-')) {",
    '    fired = true;',
    "    actual.writeFileSync(userEdit, 'export default function user() { return {}; }\\n');",
    "    actual.writeFileSync(configPath, actual.readFileSync(configPath, 'utf8') + '// user edit while active\\n');",
    "    actual.writeFileSync(faultMarker, 'before package activation');",
    "    throw new Error('injected failure before native package activation');",
    '  }',
    '  return actual.renameSync(...args);',
    '};',
    'if (process.versions.bun) {',
    "  const { mock } = await import('bun:test');",
    "  mock.module('node:fs', () => ({ ...actual, default: { ...actual.default, renameSync }, renameSync }));",
    '} else {',
    '  actual.default.renameSync = renameSync;',
    "  (await import('node:module')).syncBuiltinESMExports();",
    '}',
    `await import(${JSON.stringify(join(import.meta.dir, '..', process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] ? 'dist/plugnz.mjs' : 'bin/plugnz.mjs'))});`,
  ].join('\n'));
  const failed = h.run(['update', 'demo', '--target', 'opencode', '--json'], {
    env, cliArtifact: { executable: process.execPath, entrypoint: wrapper },
  });
  expect(existsSync(faultMarker)).toBe(true);
  expect(failed.exitCode).toBe(1);
  const diagnostic = failure(failed);
  expect(diagnostic).toContain('injected failure before native package activation');
  expect(snapshotTree(packagePath(h))).toEqual(before);
  expect(readFileSync(loaderPath(h), 'utf8')).toBe(loader);
  expect(readFileSync(join(h.storePath('opencode'), 'opencode.jsonc'), 'utf8')).toBe(config + '// user edit while active\n');
  expect(existsSync(userEdit)).toBe(true);
  // The retained prior installation still converges normally on the next update.
  success(h.run(['update', 'demo', '--target', 'opencode', '--json'], { env }));
  expect(readFileSync(join(packagePath(h), 'agents/omitted.md'), 'utf8')).toContain('Version two');
}), 30_000);

test('mixed portable hooks and agents refuse; invalid models and unsupported semantics stay explicit failures', async () => withLifecycleCliHarness(h => {
  const env = prepare(h);
  const mixed = h.source('mixed', { ...fixture(), 'plugnz.hooks.json': JSON.stringify({ version: 1, hooks: {} }) });
  expect(failure(h.run(['install', mixed, '--target', 'opencode', '--json'], { env }))).toContain('does not combine portable hooks and portable agents');
  const bare = h.source('bare-model', { 'plugin.json': '{"name":"bare-model","version":"1.0.0"}\n',
    'plugnz.agents.json': JSON.stringify({ version: 1, modelAliases: { fast: { opencode: 'sonnet' } } }),
    'agents/agent.md': agentFile('agent', 'modelAlias: fast\n') });
  expect(failure(h.run(['install', bare, '--target', 'opencode', '--json'], { env }))).toContain('model must be <provider>/<model>');
  const skill = h.source('with-skill', { ...fixture(), 'plugin.json': '{"name":"with-skill","version":"1.0.0"}\n',
    'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n---\nbody\n' });
  expect(failure(h.run(['install', skill, '--target', 'opencode', '--json'], { env }))).toContain('ordinary-skills');
  const manifest = h.source('with-extension', { ...fixture(), 'plugin.json': JSON.stringify({ name: 'with-extension', version: '1.0.0', extensions: { 'com.langchain.deepagents.code': { autoUpdate: true } } }) });
  expect(failure(h.run(['install', manifest, '--target', 'opencode', '--json'], { env }))).toContain('manifest field extensions');
  const metadata = h.source('with-metadata', { ...fixture(), 'plugin.json': JSON.stringify({
    name: 'with-metadata', version: '1.0.0', description: 'Metadata fixture', author: 'House',
    license: 'MIT', homepage: 'https://example.invalid/with-metadata', repository: 'https://example.invalid/repo.git',
    keywords: ['probe', 'agents'], $schema: 'https://opencode.ai/config.json',
  }) });
  success(h.run(['install', metadata, '--target', 'opencode', '--json'], { env }));
  expect(JSON.parse(readFileSync(join(packagePath(h, 'with-metadata@local'), 'plugin.json'), 'utf8')).license).toBe('MIT');
  expect(existsSync(join(h.storePath('opencode'), '.plgnz', 'hook-packages'))).toBe(true);
}), 30_000);
