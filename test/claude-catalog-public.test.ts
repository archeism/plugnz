import { expect, test as bunTest } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotTree, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

// Each case launches multiple public CLI subprocesses. The packed workflow measured
// 5.411s with unchanged assertions under load; use a bounded 20s transport budget.
const test = (name: string, run: () => Promise<void>): void => bunTest(name, run, 20_000);

function plugin(name: string, body = 'first'): Record<string, string> {
  return {
    'plugin.json': JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name, version: '1.0.0' }),
    'skills/ordinary/SKILL.md': `---\nname: ordinary\ndescription: ordinary discovery\n---\n${body}\n`,
    '.claude/commands/check.md': '---\ndescription: Check native command\n---\nCheck $ARGUMENTS.\n',
  };
}

test('public Claude rejects malformed foreign marketplace timestamps before any batch mutation', async () => {
  await withLifecycleCliHarness(harness => {
    harness.fakeNative('claude', Array.from({ length: 80 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const cursor = harness.fakeNative('cursor', Array.from({ length: 40 }, () => ({ args: ['--version'], stdout: '2.4.0\n' })));
    const foreign = harness.source('timestamp-foreign', { '.claude-plugin/marketplace.json': '{"name":"foreign","owner":{"name":"foreign"},"plugins":[]}' });
    const alpha = harness.source('timestamp-first', { 'plugin.json': plugin('alpha')['plugin.json']!, 'skills/ordinary/SKILL.md': plugin('alpha')['skills/ordinary/SKILL.md']! });
    const beta = harness.source('timestamp-last', plugin('beta'));
    const manifest = join(harness.source('timestamp-batch', {}), 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [{ locator: alpha, kind: 'cursor' }, { locator: alpha, kind: 'claude-code' }, { locator: beta, kind: 'claude-code' }].map(({ locator, kind }) => ({ operation: 'sync', source: { kind: 'local', locator }, target: { kind, instance: 'default' } })) }));
    for (const lastUpdated of [undefined, 17, null]) {
      harness.writeHome({ '.claude/plugins/known_marketplaces.json': JSON.stringify({ foreign: { source: { source: 'directory', path: foreign }, installLocation: foreign, ...(lastUpdated === undefined ? {} : { lastUpdated }) } }) });
      const before = snapshotTree(foreign);
      const result = harness.run(['sync', '--manifest', manifest, '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: cursor.path } });
      expect(result.exitCode).toBe(1);
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(report.summary.mutationStarted).toBe(false);
      expect(JSON.stringify(report)).toContain('foreign.lastUpdated');
      expect(result.stores['claude-code'].after).toEqual(result.stores['claude-code'].before);
      expect(result.stores['cursor'].after).toEqual(result.stores['cursor'].before);
      expect(result.state.after).toEqual(result.state.before);
      expect(snapshotTree(foreign)).toEqual(before);
    }
  });
});

test('public Claude Managed lifecycle registers a native-loadable owned catalog and repairs missing registration', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.claude/.keep': '' });
    harness.fakeNative('claude', Array.from({ length: 60 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const source = harness.source('claude-source', plugin('demo'));
    const installed = harness.run(['add', source, '--target', 'claude-code', '--json']);
    expect(installed.exitCode).toBe(0);
    const root = join(harness.home, '.claude/plugins');
    const known = join(root, 'known_marketplaces.json');
    expect(existsSync(known)).toBe(true);
    const registration = JSON.parse(readFileSync(known, 'utf8')).local;
    const catalog = registration.installLocation;
    expect(registration.source).toEqual({ source: 'directory', path: catalog });
    const manifest = JSON.parse(readFileSync(join(catalog, '.claude-plugin/marketplace.json'), 'utf8'));
    expect(manifest.name).toBe('local');
    expect(manifest.plugins).toEqual([{ name: 'demo', source: './plugins/demo' }]);
    const native = JSON.parse(readFileSync(join(catalog, 'plugins/demo/.claude-plugin/plugin.json'), 'utf8'));
    expect(native.skills).toBe('./skills/');
    expect(native.commands).toContain('./.claude/commands/check.md');
    const snapshot = snapshotTree(source);
    rmSync(known);
    rmSync(catalog, { recursive: true });
    const repaired = harness.run(['sync', source, '--target', 'claude-code', '--json']);
    expect(repaired.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(repaired.stdout)).outcomes[0]?.action).toBe('update');
    expect(existsSync(known)).toBe(true);
    expect(existsSync(join(catalog, 'plugins/demo/.claude-plugin/plugin.json'))).toBe(true);
    writeFileSync(join(catalog, 'plugins/demo/skills/ordinary/SKILL.md'), 'tampered owned catalog bytes\n');
    const refreshed = harness.run(['sync', source, '--target', 'claude-code', '--json']);
    expect(refreshed.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(refreshed.stdout)).outcomes[0]?.action).toBe('update');
    expect(readFileSync(join(catalog, 'plugins/demo/skills/ordinary/SKILL.md'), 'utf8')).toContain('first');
    expect(snapshotTree(source)).toEqual(snapshot);
  });
});

test('public Claude catalog refresh and source-free retirement preserve a sibling and foreign metadata', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.claude/settings.json': '{"env":{"FOREIGN":"preserved"}}\n' });
    harness.fakeNative('claude', Array.from({ length: 80 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const alpha = harness.source('alpha-source', plugin('alpha'));
    const beta = harness.source('beta-source', plugin('beta'));
    const installed = harness.run(['add', alpha, '--target', 'claude-code', '--json']);
    expect(installed.exitCode).toBe(0);
    expect(harness.run(['add', beta, '--target', 'claude-code', '--json']).exitCode).toBe(0);
    const root = join(harness.home, '.claude/plugins');
    const known = join(root, 'known_marketplaces.json');
    expect(existsSync(known)).toBe(true);
    const catalog = JSON.parse(readFileSync(known, 'utf8')).local.installLocation;
    const sibling = snapshotTree(join(catalog, 'plugins/beta'));
    writeFileSync(join(alpha, 'skills/ordinary/SKILL.md'), plugin('alpha', 'second')['skills/ordinary/SKILL.md']!);
    expect(harness.run(['sync', alpha, '--target', 'claude-code', '--json']).exitCode).toBe(0);
    expect(readFileSync(join(catalog, 'plugins/alpha/skills/ordinary/SKILL.md'), 'utf8')).toContain('second');
    expect(snapshotTree(join(catalog, 'plugins/beta'))).toEqual(sibling);
    renameSync(alpha, `${alpha}-retained-offline`);
    const scope = parseLifecycleReport(JSON.parse(installed.stdout)).outcomes[0]!.scope.id;
    expect(harness.run(['retire-source', scope, '--target', 'claude-code', '--json']).exitCode).toBe(0);
    expect(existsSync(join(catalog, 'plugins/alpha'))).toBe(false);
    expect(snapshotTree(join(catalog, 'plugins/beta'))).toEqual(sibling);
    expect(JSON.parse(readFileSync(join(catalog, '.claude-plugin/marketplace.json'), 'utf8')).plugins).toEqual([{ name: 'beta', source: './plugins/beta' }]);
    expect(JSON.parse(readFileSync(join(harness.home, '.claude/settings.json'), 'utf8')).env.FOREIGN).toBe('preserved');
  });
});

test('public Claude refuses a foreign marketplace registration before native or ledger writes', async () => {
  await withLifecycleCliHarness(harness => {
    harness.fakeNative('claude', Array.from({ length: 30 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const foreign = harness.source('foreign-catalog', { '.claude-plugin/marketplace.json': '{"name":"local","owner":{"name":"foreign"},"plugins":[]}' });
    harness.writeHome({ '.claude/plugins/known_marketplaces.json': JSON.stringify({ local: { source: { source: 'directory', path: foreign }, installLocation: foreign, lastUpdated: '' } }) });
    const source = harness.source('desired', plugin('demo'));
    const before = snapshotTree(foreign);
    const result = harness.run(['add', source, '--target', 'claude-code', '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stores['claude-code'].after).toEqual(result.stores['claude-code'].before);
    expect(result.state.after).toEqual(result.state.before);
    expect(snapshotTree(foreign)).toEqual(before);
  });
});

test('last-pair Claude catalog collision blocks the entire public manifest before any native or ledger writes', async () => {
  await withLifecycleCliHarness(harness => {
    harness.fakeNative('claude', Array.from({ length: 30 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const foreign = harness.source('foreign-last-catalog', { '.claude-plugin/marketplace.json': '{"name":"local","plugins":[]}' });
    harness.writeHome({ '.claude/plugins/known_marketplaces.json': JSON.stringify({ local: { source: { source: 'directory', path: foreign }, installLocation: foreign, lastUpdated: '' } }) });
    const alpha = harness.source('first-safe', {
      '.claude-plugin/marketplace.json': '{"name":"safe","owner":{"name":"test"},"plugins":[{"name":"alpha","source":"./plugins/alpha"}]}',
      'plugins/alpha/plugin.json': plugin('alpha')['plugin.json']!,
    });
    const beta = harness.source('last-conflict', plugin('beta'));
    const manifest = join(harness.source('catalog-batch', {}), 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [alpha, beta].map(locator => ({ operation: 'sync', source: { kind: 'local', locator }, target: { kind: 'claude-code', instance: 'default' } })) }));
    const result = harness.run(['sync', '--manifest', manifest, '--json']);
    expect(result.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(result.stdout)).summary.mutationStarted).toBe(false);
    expect(result.stores['claude-code'].after).toEqual(result.stores['claude-code'].before);
    expect(result.state.after).toEqual(result.state.before);
  });
});

test('public Claude failed same-version refresh rolls back the selected catalog copy without changing its sibling', async () => {
  await withLifecycleCliHarness(harness => {
    const steps = Array.from({ length: 80 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' }));
    const good = harness.fakeNative('claude-good', steps);
    const bad = harness.fakeNative('claude-bad', steps.map(step => ({ ...step, divergeStagedReadback: 'injected staged drift\n' })));
    const alpha = harness.source('rollback-alpha', plugin('alpha'));
    const beta = harness.source('rollback-beta', plugin('beta'));
    const env = { OPEN_PLUGIN_CLAUDE_CODE_BIN: good.path };
    expect(harness.run(['add', alpha, '--target', 'claude-code', '--json'], { env }).exitCode).toBe(0);
    expect(harness.run(['add', beta, '--target', 'claude-code', '--json'], { env }).exitCode).toBe(0);
    const catalog = join(harness.home, '.claude/plugins/marketplaces/.plgnz-local');
    const old = snapshotTree(join(catalog, 'plugins/alpha'));
    const sibling = snapshotTree(join(catalog, 'plugins/beta'));
    writeFileSync(join(alpha, 'skills/ordinary/SKILL.md'), plugin('alpha', 'changed')['skills/ordinary/SKILL.md']!);
    const failed = harness.run(['sync', alpha, '--target', 'claude-code', '--json'], { env: { OPEN_PLUGIN_CLAUDE_CODE_BIN: bad.path } });
    expect(failed.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(failed.stdout)).summary.mutationStarted).toBe(true);
    expect(snapshotTree(join(catalog, 'plugins/alpha'))).toEqual(old);
    expect(snapshotTree(join(catalog, 'plugins/beta'))).toEqual(sibling);
    expect(harness.run(['sync', alpha, '--target', 'claude-code', '--json'], { env }).exitCode).toBe(0);
    expect(readFileSync(join(catalog, 'plugins/alpha/skills/ordinary/SKILL.md'), 'utf8')).toContain('changed');
  });
});

test('source-free retirement of the last owned Claude member retains an appeared foreign catalog member', async () => {
  await withLifecycleCliHarness(harness => {
    harness.fakeNative('claude', Array.from({ length: 40 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const source = harness.source('retire-last-owned', plugin('demo'));
    const installed = harness.run(['add', source, '--target', 'claude-code', '--json']);
    expect(installed.exitCode).toBe(0);
    const catalog = join(harness.home, '.claude/plugins/marketplaces/.plgnz-local');
    const foreign = join(catalog, 'plugins/foreign');
    mkdirSync(foreign); writeFileSync(join(foreign, 'keep.txt'), 'foreign bytes\n');
    const file = join(catalog, '.claude-plugin/marketplace.json');
    const document = JSON.parse(readFileSync(file, 'utf8'));
    document.plugins.push({ name: 'foreign', source: './plugins/foreign' });
    writeFileSync(file, JSON.stringify(document));
    const before = snapshotTree(foreign);
    renameSync(source, `${source}-offline`);
    const scope = parseLifecycleReport(JSON.parse(installed.stdout)).outcomes[0]!.scope.id;
    expect(harness.run(['retire-source', scope, '--target', 'claude-code', '--json']).exitCode).toBe(0);
    expect(snapshotTree(foreign)).toEqual(before);
    expect(JSON.parse(readFileSync(file, 'utf8')).plugins).toEqual([{ name: 'foreign', source: './plugins/foreign' }]);
    expect(JSON.parse(readFileSync(join(harness.home, '.claude/plugins/known_marketplaces.json'), 'utf8')).local.installLocation).toBe(catalog);
  });
});

test('public Claude preserves a byte-identical native catalog only when its directory binds the canonical Source scope', async () => {
  await withLifecycleCliHarness(harness => {
    harness.fakeNative('claude', Array.from({ length: 60 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const files = plugin('demo');
    const source = harness.source('already-native-catalog', {
      '.claude-plugin/marketplace.json': '{"name":"native","owner":{"name":"foreign"},"plugins":[{"name":"demo","source":"./plugins/demo","strict":false,"defaultEnabled":false,"description":"Retained display metadata","metadata":{"foreign":true}}]}',
      ...Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`plugins/demo/${path}`, bytes])),
      'plugins/demo/.claude-plugin/plugin.json': '{"name":"demo","version":"1.0.0","skills":"./skills/","commands":["./.claude/commands/check.md"]}',
    });
    harness.writeHome({ '.claude/plugins/known_marketplaces.json': JSON.stringify({ native: { source: { source: 'directory', path: source }, installLocation: source, lastUpdated: '', metadata: { opaque: true } } }) });
    const before = snapshotTree(source);
    const installed = harness.run(['add', source, '--target', 'claude-code', '--json']);
    expect(installed.exitCode).toBe(0);
    expect(snapshotTree(source)).toEqual(before);
    const sync = harness.run(['sync', source, '--target', 'claude-code', '--json']);
    expect(sync.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(sync.stdout)).outcomes[0]?.action).toBe('unchanged');
    const scope = parseLifecycleReport(JSON.parse(installed.stdout)).outcomes[0]!.scope.id;
    expect(harness.run(['retire-source', scope, '--target', 'claude-code', '--json']).exitCode).toBe(0);
    expect(snapshotTree(source)).toEqual(before);
    expect(JSON.parse(readFileSync(join(harness.home, '.claude/plugins/known_marketplaces.json'), 'utf8')).native.installLocation).toBe(source);
  });
});

test('public Claude last-member retirement retains foreign container files and metadata', async () => {
  await withLifecycleCliHarness(harness => {
    harness.fakeNative('claude', Array.from({ length: 30 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const source = harness.source('foreign-container-retirement', plugin('demo'));
    const installed = harness.run(['add', source, '--target', 'claude-code', '--json']);
    expect(installed.exitCode).toBe(0);
    const catalog = join(harness.home, '.claude/plugins/marketplaces/.plgnz-local');
    writeFileSync(join(catalog, 'foreign.txt'), 'foreign container file\n');
    writeFileSync(join(catalog, '.claude-plugin/foreign.json'), '{"unowned":true}\n');
    const scope = parseLifecycleReport(JSON.parse(installed.stdout)).outcomes[0]!.scope.id;
    expect(harness.run(['retire-source', scope, '--target', 'claude-code', '--json']).exitCode).toBe(0);
    expect(readFileSync(join(catalog, 'foreign.txt'), 'utf8')).toBe('foreign container file\n');
    expect(readFileSync(join(catalog, '.claude-plugin/foreign.json'), 'utf8')).toBe('{"unowned":true}\n');
    expect(JSON.parse(readFileSync(join(harness.home, '.claude/plugins/known_marketplaces.json'), 'utf8')).local.installLocation).toBe(catalog);
  });
});

test('public Claude selected catalog entry conflicts are repaired and reported without altering foreign entry metadata', async () => {
  await withLifecycleCliHarness(harness => {
    harness.fakeNative('claude', Array.from({ length: 70 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const source = harness.source('catalog-entry-policy', plugin('demo'));
    expect(harness.run(['add', source, '--target', 'claude-code', '--json']).exitCode).toBe(0);
    const catalog = join(harness.home, '.claude/plugins/marketplaces/.plgnz-local');
    const file = join(catalog, '.claude-plugin/marketplace.json');
    const document = JSON.parse(readFileSync(file, 'utf8'));
    const foreign = { name: 'foreign', source: './plugins/foreign', strict: false, skills: ['./foreign-skills'], metadata: { untouched: true } };
    mkdirSync(join(catalog, 'plugins/foreign')); writeFileSync(join(catalog, 'plugins/foreign/keep.txt'), 'foreign\n');
    document.plugins.push(foreign);
    document.plugins[0].strict = false;
    document.plugins[0].skills = ['./skills/'];
    writeFileSync(file, JSON.stringify(document));
    const result = harness.run(['sync', source, '--target', 'claude-code', '--json']);
    expect(result.exitCode).toBe(0);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(report.outcomes[0]?.action).toBe('update');
    expect(report.outcomes[0]?.changed).toBe(true);
    expect(report.summary.changed).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).plugins).toEqual([foreign, { name: 'demo', source: './plugins/demo' }]);
  });
});

test('public Claude catalog-only byte and registration repairs report changed with identical native cache bytes', async () => {
  await withLifecycleCliHarness(harness => {
    harness.fakeNative('claude', Array.from({ length: 60 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
    const source = harness.source('catalog-only-change', plugin('demo'));
    expect(harness.run(['add', source, '--target', 'claude-code', '--json']).exitCode).toBe(0);
    const root = join(harness.home, '.claude/plugins');
    const cache = snapshotTree(join(root, 'cache/local/demo/1.0.0'));
    writeFileSync(join(root, 'marketplaces/.plgnz-local/plugins/demo/skills/ordinary/SKILL.md'), 'stale native catalog\n');
    for (const step of ['bytes', 'registration']) {
      if (step === 'registration') rmSync(join(root, 'known_marketplaces.json'));
      const result = harness.run(['sync', source, '--target', 'claude-code', '--json']);
      expect(result.exitCode).toBe(0);
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(report.outcomes[0]?.action).toBe('update');
      expect(report.outcomes[0]?.changed).toBe(true);
      expect(report.summary.changed).toBe(true);
      expect(snapshotTree(join(root, 'cache/local/demo/1.0.0'))).toEqual(cache);
    }
  });
});

for (const divergence of ['missing-commands', 'entry-conflict'] as const) {
  test(`public Claude refuses an actual foreign catalog ${divergence} without synthesizing native delivery proof`, async () => {
    await withLifecycleCliHarness(harness => {
      harness.fakeNative('claude', Array.from({ length: 30 }, () => ({ args: ['--version'], stdout: '2.1.295 (Claude Code)\n' })));
      const source = harness.source(`foreign-${divergence}`, {
        '.claude-plugin/marketplace.json': JSON.stringify({ name: 'native', owner: { name: 'foreign' }, plugins: [{ name: 'demo', source: './plugins/demo', ...(divergence === 'entry-conflict' ? { strict: false, skills: ['./skills/'] } : {}) }] }),
        ...Object.fromEntries(Object.entries(plugin('demo')).map(([path, bytes]) => [`plugins/demo/${path}`, bytes])),
        'plugins/demo/.claude-plugin/plugin.json': JSON.stringify({ name: 'demo', version: '1.0.0', skills: './skills/', ...(divergence === 'missing-commands' ? {} : { commands: ['./.claude/commands/check.md'] }) }),
      });
      harness.writeHome({ '.claude/plugins/known_marketplaces.json': JSON.stringify({ native: { source: { source: 'directory', path: source }, installLocation: source, lastUpdated: '' } }) });
      const before = snapshotTree(source);
      const result = harness.run(['add', source, '--target', 'claude-code', '--json']);
      expect(result.exitCode).toBe(1);
      expect(parseLifecycleReport(JSON.parse(result.stdout)).summary.mutationStarted).toBe(false);
      expect(result.stores['claude-code'].after).toEqual(result.stores['claude-code'].before);
      expect(result.state.after).toEqual(result.state.before);
      expect(snapshotTree(source)).toEqual(before);
    });
  });
}
