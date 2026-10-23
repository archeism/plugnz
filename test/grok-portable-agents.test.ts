import { spawnSync } from 'node:child_process';
import { expect, test } from 'bun:test';
import { chmodSync, existsSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { grokWriter } from '../src/hosts/grok-writer';
import { resolveSource } from '../src/source';
import { withLifecycleCliHarness, type CliRunResult, type LifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

const agent = (name: string, metadata = '', body = 'Keep the explanation and reasoning intact.\n') =>
  `---\nname: ${name}\ndescription: Review the change\n${metadata}---\n${body}`;
const fixture = {
  '.claude-plugin/marketplace.json': '{"name":"catalog","plugins":[{"name":"demo","source":"./plugins/demo"}]}',
  'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0","description":"Demo"}',
  'plugins/demo/plugnz.agents.json': JSON.stringify({ version: 1, modelAliases: { smart: { grok: 'probe-pkg' } } }),
  'plugins/demo/agents/reviewer.md': agent('reviewer', 'modelAlias: smart\n'),
  'plugins/demo/agents/explicit.md': agent('explicit', 'modelAlias: smart\nmodels:\n  grok: probe-explicit\n'),
  'plugins/demo/agents/unspecified.md': agent('unspecified'),
  'plugins/demo/skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n---\n\nfirst\n',
};

/** Grok's native `agents/*.md` name stays bare; the plugin loader namespaces it as `<plugin>:<agent>`. */
const reviewerBytes = (model: string | null, body = 'Keep the explanation and reasoning intact.\n') =>
  `---\nname: "reviewer"\ndescription: "Review the change"\n${model === null ? '' : `model: "${model}"\n`}---\n${body}`;

function fakeGrok(h: LifecycleCliHarness, version = '1.0.46 (f46e0000)'): { env: Record<string, string> } {
  const path = h.fakeBinPath('grok');
  writeFileSync(path, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(`${path}.mjs`)} "$@"\n`);
  chmodSync(path, 0o755);
  writeFileSync(`${path}.mjs`, String.raw`
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const home = process.env.GROK_HOME ?? join(process.env.HOME ?? '', '.grok');
const state = join(home, 'fake-marketplaces.json');
const registry = join(home, 'installed-plugins', 'registry.json');
const read = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
const write = (path, value) => { mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true }); writeFileSync(path, JSON.stringify(value)); };
const markets = () => read(state, []);
const registryValue = () => read(registry, { version: 1, repos: {} });
const saveRegistry = value => write(registry, value);
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('grok ' + (process.env.GROK_FAKE_VERSION ?? '1.0.46 (f46e0000)')); process.exit(0); }
if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'remove') { const root = args[3]; write(state, markets().filter(row => row.source.path !== root)); const value = registryValue(); for (const [key, repo] of Object.entries(value.repos)) if (repo.marketplace.source_url_or_path === root) delete value.repos[key]; saveRegistry(value); if (process.env.GROK_FAKE_CRASH_REMOVE === '1') process.exit(7); process.exit(0); }
if (args[0] === 'plugin' && args[1] === 'validate') process.exit(0);
if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'list') { console.log(JSON.stringify(markets())); process.exit(0); }
if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') { const root = args[3]; write(state, [...markets(), { name: root.split('/').at(-1), kind: 'local', source: { path: root } }]); process.exit(0); }
const install = name => { const row = markets().find(item => item.name === args[2].split('@local/')[1]); if (!row) process.exit(2); const source = join(row.source.path, 'plugins', name); if (!existsSync(source)) process.exit(3); const target = join(home, 'installed-plugins', name + '-native'); rmSync(target, { recursive: true, force: true }); cpSync(source, target, { recursive: true }); const value = registryValue(); value.repos[name] = { path: target, plugins: { [name]: {} }, kind: { type: 'Local', source_path: source }, marketplace: { source_url_or_path: row.source.path, source_display_name: row.name, plugin_subdir: 'plugins/' + name } }; saveRegistry(value); };
if (args[0] === 'plugin' && args[1] === 'install') { install(args[2].split('@')[0]); process.exit(0); }
if (args[0] === 'plugin' && args[1] === 'update') { if (process.env.GROK_FAKE_FAIL_UPDATE === '1') process.exit(5); if (process.env.GROK_FAKE_NOOP_UPDATE === '1') process.exit(0); const value = registryValue(); const repo = value.repos[args[2]]; if (!repo || !existsSync(repo.kind.source_path)) process.exit(4); rmSync(repo.path, { recursive: true, force: true }); cpSync(repo.kind.source_path, repo.path, { recursive: true }); saveRegistry(value); process.exit(0); }
const config = join(home, 'config.toml');
const readConfig = () => existsSync(config) ? readFileSync(config, 'utf8') : '';
const disabledNames = () => { const section = /\[plugins\][^\[]*/s.exec(readConfig()); const match = section === null ? null : /disabled\s*=\s*\[([^\]]*)\]/s.exec(section[0]); return match === null ? [] : (match[1].match(/"([^"]+)"/g) ?? []).map(value => value.slice(1, -1)); };
const writeDisabled = names => {
  let text = readConfig();
  const array = 'disabled = [' + names.map(name => '"' + name + '"').join(', ') + ']';
  if (/\[plugins\]/.test(text)) {
    const at = text.indexOf('[plugins]');
    const tail = text.slice(at);
    text = /disabled\s*=/.test(tail) ? text.slice(0, at) + tail.replace(/disabled\s*=\s*\[[^\]]*\]/, array) : text.slice(0, at) + tail.replace('[plugins]', '[plugins]\n' + array);
  } else {
    text = (text.length === 0 || text.endsWith('\n') ? text : text + '\n') + '[plugins]\n' + array + '\n';
  }
  mkdirSync(home, { recursive: true });
  writeFileSync(config, text);
};
if (args[0] === 'plugin' && args[1] === 'enable') { writeDisabled(disabledNames().filter(name => name !== args[2])); process.exit(0); }
if (args[0] === 'plugin' && args[1] === 'disable') { const names = disabledNames(); if (!names.includes(args[2])) writeDisabled([...names, args[2]]); process.exit(0); }
if (args[0] === 'plugin' && args[1] === 'uninstall') { const value = registryValue(); const repo = value.repos[args[2]]; if (repo) { rmSync(repo.path, { recursive: true, force: true }); delete value.repos[args[2]]; saveRegistry(value); } process.exit(0); }
if (args[0] === 'inspect' && args[1] === '--json') { const value = registryValue(); const disabled = disabledNames(); console.log(JSON.stringify({ plugins: Object.entries(value.repos).map(([name, repo]) => ({ name, path: repo.path, enabled: !disabled.includes(name) })) })); process.exit(0); }
process.exit(9);
`);
  return { env: { GROK_FAKE_VERSION: version, OPEN_PLUGIN_GROK_BIN: path } };
}

/** The native installed copy the activation link points at. */
function nativePackage(h: LifecycleCliHarness, name = 'demo'): string {
  const link = join(h.storePath('grok'), 'plugins', name);
  if (!existsSync(link)) throw new Error(`activation link missing: ${link}`);
  return readlinkSync(link);
}

function file(root: string, path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function success(result: CliRunResult): void {
  if (result.exitCode !== 0) throw new Error(`command failed: ${result.stdout}\n${result.stderr}`);
  expect(result.exitCode).toBe(0);
}

test('Grok 1.0.46 public install projects bare native agents with resolved models and exact prose', () => {
  return withLifecycleCliHarness(h => {
    const { env } = fakeGrok(h);
    const source = h.source('portable-review', fixture);
    const preview = h.run(['install', source, '--target', 'grok', '--dry-run', '--json'], { env });
    success(preview);
    expect(preview.stores.grok.after).toEqual(preview.stores.grok.before);
    const installed = h.run(['install', source, '--target', 'grok', '--json'], { env });
    success(installed);
    const root = nativePackage(h);
    expect(file(root, 'agents/reviewer.md')).toBe(reviewerBytes('probe-pkg'));
    expect(file(root, 'agents/explicit.md')).toBe(`---\nname: "explicit"\ndescription: "Review the change"\nmodel: "probe-explicit"\n---\nKeep the explanation and reasoning intact.\n`);
    expect(file(root, 'agents/unspecified.md')).toBe(`---\nname: "unspecified"\ndescription: "Review the change"\n---\nKeep the explanation and reasoning intact.\n`);
    expect(existsSync(join(root, 'plugnz.agents.json'))).toBe(false);
    expect(file(root, 'skills/ordinary/SKILL.md')).toContain('first');
    // Authored source bytes stay untouched, sidecar included.
    expect(file(source, 'plugins/demo/agents/reviewer.md')).toBe(fixture['plugins/demo/agents/reviewer.md']!);
    expect(file(source, 'plugins/demo/plugnz.agents.json')).toBe(fixture['plugins/demo/plugnz.agents.json']!);
  });
}, 30_000);

test('Grok portable agents ride the native marketplace transaction: re-add, body update, alias update, rename, rollback', () => {
  return withLifecycleCliHarness(h => {
    const { env } = fakeGrok(h);
    const source = h.source('portable-review', fixture);
    // Unrelated user configuration must survive every step below.
    const foreignConfig = '[memory]\nenabled = false\n';
    h.writeHome({ '.grok/config.toml': foreignConfig });
    success(h.run(['install', source, '--target', 'grok', '--json'], { env }));
    const root = nativePackage(h);
    // Unchanged re-add leaves every installed byte in place.
    const readd = h.run(['install', source, '--target', 'grok', '--json'], { env });
    success(readd);
    expect(file(root, 'agents/reviewer.md')).toBe(reviewerBytes('probe-pkg'));
    // Same-version body update reaches the generated file byte-exactly.
    writeFileSync(join(source, 'plugins/demo/agents/reviewer.md'), agent('reviewer', 'modelAlias: smart\n', 'Revised reasoning with $pecial chars and trailing spaces.   \n'));
    success(h.run(['update', 'demo', '--target', 'grok', '--json'], { env }));
    expect(file(root, 'agents/reviewer.md')).toBe(reviewerBytes('probe-pkg', 'Revised reasoning with $pecial chars and trailing spaces.   \n'));
    // Alias-only update rewrites just the resolved model.
    h.writeHome({ 'model-aliases.json': JSON.stringify({ version: 1, modelAliases: { smart: { grok: 'probe-user' } } }) });
    success(h.run(['update', 'demo', '--target', 'grok', '--json'], { env }));
    expect(file(root, 'agents/reviewer.md')).toBe(reviewerBytes('probe-user', 'Revised reasoning with $pecial chars and trailing spaces.   \n'));
    expect(file(root, 'agents/explicit.md')).toContain('model: "probe-explicit"');
    expect(file(root, 'agents/unspecified.md').includes('model:')).toBe(false);
    // Renaming a source agent removes the stale generated file.
    rmSync(join(source, 'plugins/demo/agents/reviewer.md'));
    writeFileSync(join(source, 'plugins/demo/agents/auditor.md'), agent('auditor'));
    success(h.run(['update', 'demo', '--target', 'grok', '--json'], { env }));
    expect(existsSync(join(root, 'agents/reviewer.md'))).toBe(false);
    expect(file(root, 'agents/auditor.md')).toBe(`---\nname: "auditor"\ndescription: "Review the change"\n---\nKeep the explanation and reasoning intact.\n`);
    // A native update that exits zero without applying staged content fails
    // readback and restores the prior installed bytes.
    writeFileSync(join(source, 'plugins/demo/agents/auditor.md'), agent('auditor', '', 'Broken update body.\n'));
    const failed = h.run(['update', 'demo', '--target', 'grok', '--json'], { env: { ...env, GROK_FAKE_NOOP_UPDATE: '1' } });
    expect(failed.exitCode).toBe(1);
    expect(file(root, 'agents/auditor.md')).toBe(`---\nname: "auditor"\ndescription: "Review the change"\n---\nKeep the explanation and reasoning intact.\n`);
    success(h.run(['update', 'demo', '--target', 'grok', '--json'], { env }));
    expect(file(root, 'agents/auditor.md')).toBe(`---\nname: "auditor"\ndescription: "Review the change"\n---\nBroken update body.\n`);
    // The unrelated config section survives the whole transaction.
    expect(file(h.storePath('grok'), 'config.toml')).toContain('[memory]\nenabled = false');
    // Public remove retires the owned native install: the registry row,
    // marketplace, and activation link disappear while unrelated config stays.
    success(h.run(['remove', 'demo@catalog', '--target', 'grok', '--json'], { env }));
    const registryAfter = JSON.parse(readFileSync(join(h.storePath('grok'), 'installed-plugins', 'registry.json'), 'utf8')) as { repos: Record<string, unknown> };
    expect(Object.keys(registryAfter.repos)).toEqual([]);
    expect(readdirSync(join(h.storePath('grok'), 'plgnz-marketplaces'))).toEqual([]);
    expect(existsSync(join(h.storePath('grok'), 'plugins', 'demo'))).toBe(false);
    expect(file(h.storePath('grok'), 'config.toml')).toContain('[memory]\nenabled = false');
  });
}, 90_000);

test('Grok protection refuses an edited owned native copy without replacing it', () => {
  return withLifecycleCliHarness(h => {
    const { env } = fakeGrok(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'grok', '--json'], { env }));
    const root = nativePackage(h);
    writeFileSync(join(root, 'agents/reviewer.md'), '---\nname: "reviewer"\ndescription: "user edit"\n---\nEdited by hand.\n');
    const update = h.run(['update', 'demo', '--target', 'grok', '--json'], { env });
    expect(update.exitCode).toBe(1);
    expect(file(root, 'agents/reviewer.md')).toBe('---\nname: "reviewer"\ndescription: "user edit"\n---\nEdited by hand.\n');
  });
}, 30_000);

test('an unqualified Grok version cannot claim portable agent support', () => {
  return withLifecycleCliHarness(h => {
    const { env } = fakeGrok(h, '1.0.41 (4220f3b224a6)');
    const source = h.source('portable-review', fixture);
    const refused = h.run(['install', source, '--target', 'grok', '--json'], { env });
    expect(refused.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(refused.stdout)).summary.mutationStarted).toBe(false);
    expect(refused.stores.grok.after).toEqual(refused.stores.grok.before);
  });
}, 30_000);

test('Grok refuses the inherit model sentinel, custom agent paths, and metadata without the sidecar', () => {
  return withLifecycleCliHarness(h => {
    const { env } = fakeGrok(h);
    const sentinel = h.source('sentinel', {
      ...fixture,
      'plugins/demo/plugnz.agents.json': JSON.stringify({ version: 1, modelAliases: { smart: { grok: 'Inherit' } } }),
    });
    const refusedSentinel = h.run(['install', sentinel, '--target', 'grok', '--json'], { env });
    expect(refusedSentinel.exitCode).toBe(1);
    expect(refusedSentinel.stdout).toContain('concrete single-line model identifier');
    const customPath = h.source('custom-path', {
      ...fixture,
      'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0","agents":"./elsewhere"}',
    });
    const refusedPath = h.run(['install', customPath, '--target', 'grok', '--json'], { env });
    expect(refusedPath.exitCode).toBe(1);
    expect(refusedPath.stdout).toContain('custom agent path is unverified');
    const metadata = h.source('metadata', {
      '.claude-plugin/marketplace.json': fixture['.claude-plugin/marketplace.json']!,
      'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
      'plugins/demo/agents/reviewer.md': agent('reviewer', 'modelAlias: smart\n'),
    });
    const refusedMetadata = h.run(['install', metadata, '--target', 'grok', '--json'], { env });
    expect(refusedMetadata.exitCode).toBe(2);
    expect(refusedMetadata.stdout).toContain('modelAlias/models require plugnz.agents.json');
  });
}, 60_000);

test('Grok refuses mixed portable-agent and portable-hook packages', () => {
  return withLifecycleCliHarness(h => {
    const { env } = fakeGrok(h);
    const source = h.source('mixed', {
      ...fixture,
      'plugins/demo/plugnz.hooks.json': JSON.stringify({ version: 1, hooks: { 'turn.stop': [{ command: ['/bin/true'] }] } }),
    });
    const refused = h.run(['install', source, '--target', 'grok', '--json'], { env });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toContain('unverified for hooks');
    expect(parseLifecycleReport(JSON.parse(refused.stdout)).summary.mutationStarted).toBe(false);
  });
}, 30_000);

test('Grok writer removal of a portable-agent package preserves unrelated plugins and user configuration', async () => {
  await withLifecycleCliHarness(async h => {
    const fake = fakeGrok(h);
    const foreignDir = join(h.storePath('grok'), 'installed-plugins', 'foreign-native');
    h.writeHome({
      '.grok/config.toml': '[memory]\nenabled = false\n',
      '.grok/installed-plugins/foreign-native/plugin.json': '{"name":"foreign","version":"2.0.0"}',
      '.grok/installed-plugins/registry.json': JSON.stringify({ version: 1, repos: { foreign: { path: foreignDir, plugins: { foreign: {} }, kind: { type: 'Local', source_path: foreignDir }, marketplace: { source_url_or_path: '/foreign-market', source_display_name: 'foreign', plugin_subdir: 'plugins/foreign' } } } }),
    });
    const source = h.source('portable-review', fixture);
    const previous = { OPEN_PLUGIN_HOME: process.env.OPEN_PLUGIN_HOME, OPEN_PLUGIN_GROK_ROOT: process.env.OPEN_PLUGIN_GROK_ROOT, OPEN_PLUGIN_GROK_BIN: process.env.OPEN_PLUGIN_GROK_BIN };
    process.env.OPEN_PLUGIN_HOME = h.home;
    process.env.OPEN_PLUGIN_GROK_ROOT = h.storePath('grok');
    process.env.OPEN_PLUGIN_GROK_BIN = fake.env['OPEN_PLUGIN_GROK_BIN']!;
    try {
      const resolved = resolveSource(source);
      const plugin = resolved.plugins[0]!;
      await grokWriter.add(plugin, resolved);
      const root = readlinkSync(join(h.storePath('grok'), 'plugins', 'demo'));
      expect(readFileSync(join(root, 'agents/reviewer.md'), 'utf8')).toBe(reviewerBytes('probe-pkg'));
      await grokWriter.remove('demo@catalog');
      // The fake native keeps the installed directory; the real loader drops it
      // with its registry row, which the row assertion below observes.
      expect(existsSync(join(h.storePath('grok'), 'plugins', 'demo'))).toBe(false);
      expect(readFileSync(join(foreignDir, 'plugin.json'), 'utf8')).toBe('{"name":"foreign","version":"2.0.0"}');
      const registry = JSON.parse(readFileSync(join(h.storePath('grok'), 'installed-plugins', 'registry.json'), 'utf8')) as { repos: Record<string, unknown> };
      expect(Object.keys(registry.repos)).toEqual(['foreign']);
      expect(readFileSync(join(h.storePath('grok'), 'config.toml'), 'utf8')).toContain('[memory]\nenabled = false');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}, 60_000);

test('Grok public remove rolls the native install back when retirement crashes mid-removal', () => {
  return withLifecycleCliHarness(h => {
    const { env } = fakeGrok(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'grok', '--json'], { env }));
    const root = nativePackage(h);
    const bytes = file(root, 'agents/reviewer.md');
    const registry = () => JSON.parse(readFileSync(join(h.storePath('grok'), 'installed-plugins', 'registry.json'), 'utf8')) as { repos: Record<string, unknown> };
    // The native marketplace remove deactivates the plugin and then fails;
    // the durable retirement must restore the owned install before failing.
    const crashed = h.run(['remove', 'demo@catalog', '--target', 'grok', '--json'], { env: { ...env, GROK_FAKE_CRASH_REMOVE: '1' } });
    expect(crashed.exitCode).toBe(1);
    expect(file(root, 'agents/reviewer.md')).toBe(bytes);
    expect(Object.keys(registry().repos)).toEqual(['demo']);
    expect(readlinkSync(join(h.storePath('grok'), 'plugins', 'demo'))).toBe(root);
    // The same-verb retry completes the retirement after recovery.
    success(h.run(['remove', 'demo@catalog', '--target', 'grok', '--json'], { env }));
    expect(Object.keys(registry().repos)).toEqual([]);
    expect(existsSync(join(h.storePath('grok'), 'plugins', 'demo'))).toBe(false);
  });
}, 60_000);

test('Grok failed retirement restores a natively disabled plugin still disabled', () => {
  return withLifecycleCliHarness(h => {
    const { env } = fakeGrok(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'grok', '--json'], { env }));
    const root = nativePackage(h);
    const bytes = file(root, 'agents/reviewer.md');
    const registry = () => JSON.parse(readFileSync(join(h.storePath('grok'), 'installed-plugins', 'registry.json'), 'utf8')) as { repos: Record<string, unknown> };
    const nativeDisabled = () => { const result = spawnSync(env['OPEN_PLUGIN_GROK_BIN']!, ['plugin', 'disable', 'demo'], { env: { PATH: '/usr/bin:/bin', HOME: h.home, GROK_HOME: h.storePath('grok') }, encoding: 'utf8' }); if (result.status !== 0) throw new Error(`fake disable failed: ${result.stderr}`); };
    const enabledThroughNativeConfig = () => !file(h.storePath('grok'), 'config.toml').includes('"demo"');
    // A user disables the plugin natively; a crash-mid-removal retirement must
    // restore the owned install with that enablement choice intact.
    nativeDisabled();
    expect(enabledThroughNativeConfig()).toBe(false);
    const crashed = h.run(['remove', 'demo@catalog', '--target', 'grok', '--json'], { env: { ...env, GROK_FAKE_CRASH_REMOVE: '1' } });
    expect(crashed.exitCode).toBe(1);
    expect(file(root, 'agents/reviewer.md')).toBe(bytes);
    expect(Object.keys(registry().repos)).toEqual(['demo']);
    expect(readlinkSync(join(h.storePath('grok'), 'plugins', 'demo'))).toBe(root);
    expect(enabledThroughNativeConfig()).toBe(false);
    // The same-verb retry still completes the retirement from the disabled state.
    const retired = h.run(['remove', 'demo@catalog', '--target', 'grok', '--json'], { env });
    expect(retired.exitCode).toBe(0);
    expect(Object.keys(registry().repos)).toEqual([]);
    expect(existsSync(join(h.storePath('grok'), 'plugins', 'demo'))).toBe(false);
  });
}, 60_000);
