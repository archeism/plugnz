import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotTree, withLifecycleCliHarness, type LifecycleCliHarness, type CliRunResult } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

const agent = (name: string, metadata = '', body = 'Keep the explanation and reasoning intact.\n') =>
  `---\nname: ${name}\ndescription: Review the change\n${metadata}---\n${body}`;
const fixture = {
  'plugin.json': '{"name":"portable-review","version":"1.0.0"}\n',
  'plugnz.agents.json': JSON.stringify({ version: 1, modelAliases: { smart: { omp: 'context-probe/pkg-alias', 'claude-code': 'sonnet' } } }),
  'agents/reviewer.md': agent('reviewer', 'modelAlias: smart\n'),
  'agents/explicit.md': agent('explicit', 'modelAlias: smart\nmodels:\n  omp: context-probe/explicit\n'),
  'agents/unspecified.md': agent('unspecified'),
};
const reviewerBytes = (body: string) => `---\nname: "portable-review:reviewer"\ndescription: "Review the change"\nmodel: "context-probe/pkg-alias"\n---\n${body}`;

/** The single @plgnz managed package directory OMP's enabled node_modules link points at. */
function packageRoot(h: LifecycleCliHarness): string {
  const managed = join(h.storePath('omp'), 'plugins', 'plgnz');
  const matches = readdirSync(managed);
  expect(matches.length).toBe(1);
  return join(managed, matches[0]!);
}
function file(root: string, path: string): string {
  return readFileSync(join(root, path), 'utf8');
}
function packageName(root: string): string {
  return JSON.parse(file(root, 'package.json')).name as string;
}
function lock(h: LifecycleCliHarness): { plugins: Record<string, { version?: string; enabled?: boolean }>; settings: unknown } {
  return JSON.parse(file(h.storePath('omp'), 'plugins/omp-plugins.lock.json'));
}
function liveFiles(result: CliRunResult): Record<string, number[]> {
  return Object.fromEntries(Object.entries(result.stores.omp.after.files).filter(([path]) => !path.startsWith('.plgnz-lifecycle/')));
}
function success(result: CliRunResult): void {
  const report = parseLifecycleReport(JSON.parse(result.stdout));
  expect(report.summary.reason).toBe(null);
  expect(report.outcomes.map(outcome => outcome.reason)).toEqual(report.outcomes.map(() => null));
  expect(result.exitCode).toBe(0);
}
function prepare(h: LifecycleCliHarness, version = '18.8.7') {
  return { OPEN_PLUGIN_OMP_BIN: h.fakeNative('omp', Array.from({ length: 100 }, () => ({ args: ['--version'], stdout: `omp/${version}\n` }))).path };
}

test('OMP 18.8.7 public install projects namespaced native agents with resolved models and exact prose', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', fixture);
    const preview = h.run(['install', source, '--target', 'omp', '--dry-run', '--json'], { env });
    success(preview);
    expect(preview.stores.omp.after).toEqual(preview.stores.omp.before);
    success(h.run(['install', source, '--target', 'omp', '--json'], { env }));
    const root = packageRoot(h);
    expect(file(root, 'agents/reviewer.md')).toBe(reviewerBytes('Keep the explanation and reasoning intact.\n'));
    expect(file(root, 'agents/explicit.md')).toBe('---\nname: "portable-review:explicit"\ndescription: "Review the change"\nmodel: "context-probe/explicit"\n---\nKeep the explanation and reasoning intact.\n');
    expect(file(root, 'agents/unspecified.md')).toBe('---\nname: "portable-review:unspecified"\ndescription: "Review the change"\n---\nKeep the explanation and reasoning intact.\n');
    expect(JSON.parse(file(root, 'package.json'))).toEqual({ name: packageName(root), version: '1.0.0', omp: {} });
    // The portable sidecar never ships; the private source snapshot keeps authored bytes.
    expect(file(root, '.plgnz/source/plugnz.agents.json')).toBe(fixture['plugnz.agents.json']!);
    expect(file(root, '.plgnz/source/agents/reviewer.md')).toBe(fixture['agents/reviewer.md']!);
    expect(() => file(root, 'plugnz.agents.json')).toThrow();
    expect(lock(h).plugins[packageName(root)]?.enabled).toBe(true);
  });
}, 30_000);

test('OMP portable agents ride the existing writer: re-add, body update, alias update, rename, retire', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', fixture);
    // An unrelated plugin and shared lock settings must survive every step below.
    h.writeHome({
      '.omp/plugins/omp-plugins.lock.json': JSON.stringify({ plugins: { '@foreign/other': { version: '9.9.9', enabled: true } }, settings: { telemetry: false } }),
      '.omp/plugins/node_modules/@foreign/other/package.json': '{"name":"@foreign/other"}\n',
    });
    success(h.run(['install', source, '--target', 'omp', '--json'], { env }));
    const root = packageRoot(h);
    // Unchanged re-add leaves every installed byte in place.
    success(h.run(['install', source, '--target', 'omp', '--json'], { env }));
    expect(file(root, 'agents/reviewer.md')).toBe(reviewerBytes('Keep the explanation and reasoning intact.\n'));
    // Same-version body update reaches the generated file byte-exactly.
    writeFileSync(join(source, 'agents/reviewer.md'), agent('reviewer', 'modelAlias: smart\n', 'Revised reasoning with $pecial chars and trailing spaces.   \n'));
    success(h.run(['update', 'portable-review', '--target', 'omp', '--json'], { env }));
    expect(file(root, 'agents/reviewer.md')).toBe(reviewerBytes('Revised reasoning with $pecial chars and trailing spaces.   \n'));
    // Alias-only update rewrites just the resolved model.
    h.writeHome({ 'model-aliases.json': JSON.stringify({ version: 1, modelAliases: { smart: { omp: 'context-probe/user-alias' } } }) });
    success(h.run(['update', 'portable-review', '--target', 'omp', '--json'], { env }));
    expect(file(root, 'agents/reviewer.md')).toBe('---\nname: "portable-review:reviewer"\ndescription: "Review the change"\nmodel: "context-probe/user-alias"\n---\nRevised reasoning with $pecial chars and trailing spaces.   \n');
    expect(file(root, 'agents/explicit.md')).toContain('model: "context-probe/explicit"');
    expect(file(root, 'agents/unspecified.md').includes('model:')).toBe(false);
    // Renaming a source agent removes the stale generated file; removal follows the same path.
    rmSync(join(source, 'agents/reviewer.md'));
    writeFileSync(join(source, 'agents/auditor.md'), agent('auditor'));
    success(h.run(['update', 'portable-review', '--target', 'omp', '--json'], { env }));
    expect(file(root, 'agents/auditor.md')).toBe('---\nname: "portable-review:auditor"\ndescription: "Review the change"\n---\nKeep the explanation and reasoning intact.\n');
    expect(() => file(root, 'agents/reviewer.md')).toThrow();
    // Retirement removes only the owned package; the foreign plugin and lock row stay.
    success(h.run(['remove', 'portable-review', '--target', 'omp', '--json'], { env }));
    expect(file(h.storePath('omp'), 'plugins/node_modules/@foreign/other/package.json')).toBe('{"name":"@foreign/other"}\n');
    const final = lock(h);
    expect(final.plugins['@foreign/other']).toEqual({ version: '9.9.9', enabled: true });
    expect(final.settings).toEqual({ telemetry: false });
    expect(() => file(root, 'agents/auditor.md')).toThrow();
  });
}, 60_000);

test('OMP protection refuses a redirected native link without changing the store', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'omp', '--json'], { env }));
    const root = packageRoot(h);
    const before = snapshotTree(root);
    const lockBefore = file(h.storePath('omp'), 'plugins/omp-plugins.lock.json');
    // A redirected node_modules link fails ownership revalidation: refuse, preserve.
    const link = join(h.storePath('omp'), 'plugins', 'node_modules', packageName(root));
    rmSync(link);
    symlinkSync(join(h.root, 'nowhere'), link, 'dir');
    const refused = h.run(['remove', 'portable-review', '--target', 'omp', '--json'], { env });
    expect(refused.exitCode).toBe(1);
    expect(snapshotTree(root)).toEqual(before);
    expect(file(h.storePath('omp'), 'plugins/omp-plugins.lock.json')).toBe(lockBefore);
  });
}, 30_000);

test('OMP protection refuses an unowned managed slot and preserves its bytes', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const slug = '6c6f63616c-706f727461626c652d726576696577';
    h.writeHome({ [`.omp/plugins/plgnz/${slug}/package.json`]: '{"name":"foreign-occupant"}\n' });
    const source = h.source('portable-review', fixture);
    const refused = h.run(['install', source, '--target', 'omp', '--json'], { env });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toContain('slot is unowned');
    expect(file(h.storePath('omp'), `plugins/plgnz/${slug}/package.json`)).toBe('{"name":"foreign-occupant"}\n');
    expect(liveFiles(refused)).toEqual(Object.fromEntries(Object.entries(refused.stores.omp.before.files)
      .filter(([path]) => !path.startsWith('.plgnz-lifecycle/'))));
  });
}, 30_000);

test('OMP protection refuses edited owned agent payloads on update and remove', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'omp', '--json'], { env }));
    const root = packageRoot(h);
    const edited = '---\nname: "portable-review:reviewer"\ndescription: "user edit"\n---\nEdited by hand.\n';
    writeFileSync(join(root, 'agents/reviewer.md'), edited);
    const before = snapshotTree(root);
    const update = h.run(['update', 'portable-review', '--target', 'omp', '--json'], { env });
    expect(update.exitCode).toBe(1);
    expect(update.stdout).toContain('payload was edited');
    expect(snapshotTree(root)).toEqual(before);
    const remove = h.run(['remove', 'portable-review', '--target', 'omp', '--json'], { env });
    expect(remove.exitCode).toBe(1);
    expect(snapshotTree(root)).toEqual(before);
    expect(file(root, 'agents/reviewer.md')).toBe(edited);
  });
}, 30_000);

test('OMP protection refuses namespace collisions with user-scope agents', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    h.writeHome({ '.omp/agent/agents/shadow.md': '---\nname: portable-review:reviewer\ndescription: user shadow\n---\nshadow\n' });
    const source = h.source('portable-review', fixture);
    const refused = h.run(['install', source, '--target', 'omp', '--json'], { env });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toContain('agent identity collision');
    expect(() => file(h.storePath('omp'), 'plugins/plgnz')).toThrow();
    expect(file(h.storePath('omp'), 'agent/agents/shadow.md')).toContain('user shadow');
  });
}, 30_000);

test('OMP protection refuses a same-named package from another marketplace', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const market = h.source('market-a', {
      '.omp-plugin/marketplace.json': JSON.stringify({ name: 'market-a', plugins: [{ name: 'portable-review', source: './portable-review' }] }),
      'portable-review/plugin.json': '{"name":"portable-review","version":"1.0.0"}\n',
      'portable-review/plugnz.agents.json': JSON.stringify({ version: 1 }),
      'portable-review/agents/reviewer.md': agent('reviewer'),
    });
    success(h.run(['install', market, '--target', 'omp', '--json'], { env }));
    const first = snapshotTree(join(h.storePath('omp'), 'plugins'));
    const local = h.source('portable-review', fixture);
    const refused = h.run(['install', local, '--target', 'omp', '--json'], { env });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toContain('agent identity collision');
    expect(snapshotTree(join(h.storePath('omp'), 'plugins'))).toEqual(first);
  });
}, 30_000);

test('OMP MCP pinning stays an authorized mutation: pin, update, and remove all succeed', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', {
      ...fixture,
      '.mcp.json': JSON.stringify({ mcpServers: { probe: { command: 'sh' } } }),
    });
    success(h.run(['install', source, '--target', 'omp', '--json'], { env }));
    const root = packageRoot(h);
    const beforePreview = snapshotTree(root);
    expect(h.run(['pin', '--target', 'omp', '--dry-run', '--json'], { env }).exitCode).toBe(0);
    expect(snapshotTree(root)).toEqual(beforePreview);
    expect(h.run(['pin', '--target', 'omp', '--json'], { env }).exitCode).toBe(0);
    expect(JSON.parse(file(root, '.mcp.json')).mcpServers.probe.command.startsWith('/')).toBe(true);
    writeFileSync(join(source, 'agents/reviewer.md'), agent('reviewer', 'modelAlias: smart\n', 'Pinned-update body.\n'));
    success(h.run(['update', 'portable-review', '--target', 'omp', '--json'], { env }));
    expect(file(root, 'agents/reviewer.md')).toBe(reviewerBytes('Pinned-update body.\n'));
    success(h.run(['remove', 'portable-review', '--target', 'omp', '--json'], { env }));
  });
}, 30_000);

test('OMP protection refuses namespace collisions with a user-configured extension', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    h.writeHome({
      'ext-a/agents/foreign.md': '---\nname: portable-review:reviewer\ndescription: configured extension\n---\nforeign body\n',
      '.omp/agent/config.yml': `extensions:\n  - ${join(h.home, 'ext-a')}\n`,
    });
    const source = h.source('portable-review', fixture);
    const refused = h.run(['install', source, '--target', 'omp', '--json'], { env });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout).toContain('agent identity collision');
    expect(refused.stdout).toContain('configured extension');
    expect(() => file(h.storePath('omp'), 'plugins/plgnz')).toThrow();
  });
}, 30_000);

test('OMP collision scan skips disabled packages and follows native enablement', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const market = h.source('market-a', {
      '.omp-plugin/marketplace.json': JSON.stringify({ name: 'market-a', plugins: [{ name: 'portable-review', source: './portable-review' }] }),
      'portable-review/plugin.json': '{"name":"portable-review","version":"1.0.0"}\n',
      'portable-review/plugnz.agents.json': JSON.stringify({ version: 1 }),
      'portable-review/agents/reviewer.md': agent('reviewer'),
    });
    success(h.run(['install', market, '--target', 'omp', '--json'], { env }));
    const lockPath = join(h.storePath('omp'), 'plugins/omp-plugins.lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { plugins: Record<string, { enabled?: boolean }> };
    const npm = '@plgnz/6d61726b65742d61-706f727461626c652d726576696577';
    lock.plugins[npm]!.enabled = false;
    writeFileSync(lockPath, JSON.stringify(lock, null, 2));
    const local = h.source('portable-review', fixture);
    success(h.run(['install', local, '--target', 'omp', '--json'], { env }));
    expect(readdirSync(join(h.storePath('omp'), 'plugins/plgnz')).sort().length).toBe(2);
  });
}, 30_000);

test('OMP failed update rolls the installed package back to the prior bytes', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', fixture);
    success(h.run(['install', source, '--target', 'omp', '--json'], { env }));
    const root = packageRoot(h);
    const before = snapshotTree(root);
    const lockBefore = file(h.storePath('omp'), 'plugins/omp-plugins.lock.json');
    writeFileSync(join(source, 'agents/reviewer.md'), agent('reviewer', 'modelAlias: smart\n', 'Broken update body.\n'));
    const failed = h.run(['update', 'portable-review', '--target', 'omp', '--json'], { env: { ...env, OPEN_PLUGIN_TEST_OMP_ACTIVATION_FAILURE: 'after-old-move' } });
    expect(failed.exitCode).toBe(1);
    expect(snapshotTree(root)).toEqual(before);
    expect(file(h.storePath('omp'), 'plugins/omp-plugins.lock.json')).toBe(lockBefore);
  });
}, 30_000);

test('OMP portable agents coexist with ordinary skills in the extension package', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const source = h.source('portable-review', {
      ...fixture,
      'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: ordinary\n---\nordinary body\n',
    });
    success(h.run(['install', source, '--target', 'omp', '--json'], { env }));
    const root = packageRoot(h);
    expect(file(root, 'skills/ordinary/SKILL.md')).toContain('ordinary body');
    expect(file(root, 'agents/reviewer.md')).toContain('name: "portable-review:reviewer"');
    expect(() => file(root, 'plugnz.agents.json')).toThrow();
  });
}, 30_000);

for (const version of ['18.1.4', '18.10.3']) test(`OMP ${version} refuses portable agents explicitly`, () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h, version);
    const source = h.source('portable-review', fixture);
    const result = h.run(['install', source, '--target', 'omp', '--json'], { env });
    expect(result.exitCode).toBe(1);
    expect(result.stderr + result.stdout).toContain('is unsupported for agents');
    expect(liveFiles(result)).toEqual({});
  });
}, 30_000);

test('OMP refuses plain native agents and mixed portable hooks without a qualified projection', () => {
  return withLifecycleCliHarness(h => {
    const env = prepare(h);
    const plain = h.source('plain-agents', {
      'plugin.json': '{"name":"plain-agents","version":"1.0.0"}\n',
      'agents/reviewer.md': agent('reviewer'),
    });
    expect(h.run(['install', plain, '--target', 'omp', '--json'], { env }).exitCode).toBe(1);
    const mixed = h.source('mixed-package', {
      'plugin.json': '{"name":"mixed-package","version":"1.0.0"}\n',
      'plugnz.agents.json': '{"version":1}',
      'agents/reviewer.md': agent('reviewer'),
      'plugnz.hooks.json': JSON.stringify({ version: 1, hooks: { 'session.start': [{ command: ['true'] }] } }),
    });
    const result = h.run(['install', mixed, '--target', 'omp', '--json'], { env });
    expect(result.exitCode).toBe(1);
    expect(result.stderr + result.stdout).toContain('hooks');
    expect(liveFiles(result)).toEqual({});
  });
}, 30_000);
