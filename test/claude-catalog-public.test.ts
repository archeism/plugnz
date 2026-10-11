import { expect, test } from 'bun:test';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotTree, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

function plugin(name: string, body = 'first'): Record<string, string> {
  return {
    'plugin.json': JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name, version: '1.0.0' }),
    'skills/ordinary/SKILL.md': `---\nname: ordinary\ndescription: ordinary discovery\n---\n${body}\n`,
    '.claude/commands/check.md': '---\ndescription: Check native command\n---\nCheck $ARGUMENTS.\n',
  };
}

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
    expect(manifest.plugins).toContainEqual({ name: 'demo', source: './plugins/demo' });
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
    harness.writeHome({ '.claude/plugins/known_marketplaces.json': JSON.stringify({ local: { source: { source: 'directory', path: foreign }, installLocation: foreign } }) });
    const source = harness.source('desired', plugin('demo'));
    const before = snapshotTree(foreign);
    const result = harness.run(['add', source, '--target', 'claude-code', '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stores['claude-code'].after).toEqual(result.stores['claude-code'].before);
    expect(result.state.after).toEqual(result.state.before);
    expect(snapshotTree(foreign)).toEqual(before);
  });
});
