import { afterEach, beforeEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHooks, emitHooksToDirectory, hookAdapters } from '../src/hook-build';
import { type HookConfig } from '../src/hooks';
import { repoRoot } from './util';

let root: string;
let source: string;
let config: HookConfig;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'plugnz-hook-build-'));
  source = join(root, 'source');
  mkdirSync(source);
  config = { version: 1, hooks: { 'session.start': [{ command: [process.execPath, '$' + '{PLUGIN_ROOT}/context.mjs'] }] } };
  writeFileSync(join(source, 'plugnz.hooks.json'), JSON.stringify(config));
  writeFileSync(join(source, 'plugin.json'), JSON.stringify({ name: 'hook-example', version: '1.0.0', description: 'Hook example' }));
  writeFileSync(join(source, 'context.mjs'), 'console.log(JSON.stringify({context:"context from installed handler"}));');
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function failure(run: () => unknown): string {
  try { run(); return 'NO ERROR'; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
}
function cli(args: string[]) {
  return spawnSync(process.execPath, [join(repoRoot, 'bin', 'plugnz.mjs'), ...args], {
    encoding: 'utf8', cwd: root, env: { ...process.env, OPEN_PLUGIN_HOME: join(root, 'home') },
  });
}

test('builds every target atomically and carries a real standalone runtime', () => {
  const out = join(root, 'built');
  const result = buildHooks(source, hookAdapters.map(adapter => adapter.id), out);
  expect(result.targets.map(target => target.id)).toEqual(hookAdapters.map(adapter => adapter.id));
  for (const target of result.targets) {
    expect(existsSync(join(target.path, 'hook-runtime.mjs'))).toBe(true);
    expect(existsSync(join(target.path, 'context.mjs'))).toBe(true);
    expect(existsSync(join(target.path, 'plugnz.hooks.json'))).toBe(false);
  }
  const target = join(out, 'codex');
  expect(existsSync(join(target, 'plugin.json'))).toBe(false);
  expect(existsSync(join(target, '.codex-plugin', 'plugin.json'))).toBe(true);
  const probe = 'import {runHooks} from ' + JSON.stringify(join(target, 'hook-runtime.mjs')) + ';' +
    'console.log(JSON.stringify(await runHooks(' + JSON.stringify(config) + ',' +
    JSON.stringify({ version: 1, event: 'session.start', harness: 'test', cwd: root }) + ',' +
    JSON.stringify(target) + ')));';
  const executed = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', cwd: root });
  expect(executed.status).toBe(0);
  expect(JSON.parse(executed.stdout)).toEqual({ context: 'context from installed handler' });
  expect(JSON.parse(readFileSync(join(source, 'plugin.json'), 'utf8')).name).toBe('hook-example');
  expect(existsSync(join(source, 'plugnz.hooks.json'))).toBe(true);
});

test('refuses authored native artifact collisions without publishing a partial target', () => {
  writeFileSync(join(source, 'extension.mjs'), 'authored extension');
  const out = join(root, 'built');
  expect(failure(() => buildHooks(source, ['claude-code', 'pi'], out))).toContain('Refusing to overwrite');
  expect(existsSync(out)).toBe(false);
  expect(readFileSync(join(source, 'extension.mjs'), 'utf8')).toBe('authored extension');
  expect(readdirSync(root).some(name => name.startsWith('.plugnz-hooks-build-'))).toBe(false);
});

test('refuses output recursion, existing content and source symlinks', () => {
  expect(failure(() => buildHooks(source, ['pi'], join(source, 'generated')))).toContain('outside the plugin source');
  const out = join(root, 'built');
  mkdirSync(out);
  writeFileSync(join(out, 'keep'), 'owned elsewhere');
  expect(failure(() => buildHooks(source, ['pi'], out))).toContain('absent or an empty directory');
  expect(readFileSync(join(out, 'keep'), 'utf8')).toBe('owned elsewhere');
  symlinkSync(join(root, 'elsewhere'), join(source, 'unsafe'));
  expect(failure(() => buildHooks(source, ['pi'], join(root, 'new-output')))).toContain('symlinks are unsupported');
});

test('rejects generated path traversal before writing any runtime', () => {
  const stage = join(root, 'stage');
  mkdirSync(stage);
  const unsafe = { ...hookAdapters[0]!, prepare: undefined, emit: () => ({ '../escape': 'bad' }) };
  expect(failure(() => emitHooksToDirectory(unsafe, config, stage))).toContain('Unsafe generated');
  expect(readdirSync(stage)).toEqual([]);
  expect(existsSync(join(root, 'escape'))).toBe(false);
});

test('CLI exposes versioned native capabilities and builds through the public entry point', () => {
  const targets = cli(['hooks', 'targets', '--json']);
  expect(targets.status).toBe(0);
  const inventory = JSON.parse(targets.stdout) as { version: number; targets: { id: string; baselineVersion: string; capabilities: Record<string, { nativeEvent: string }> }[] };
  expect(inventory.version).toBe(1);
  expect(inventory.targets.map(target => target.id)).toEqual(hookAdapters.map(adapter => adapter.id));
  expect(inventory.targets.every(target => target.baselineVersion && target.capabilities['session.start']?.nativeEvent)).toBe(true);
  const out = join(root, 'cli-output');
  const built = cli(['hooks', 'build', source, '--target', 'pi', '--target', 'opencode', '--out', out]);
  expect(built.status).toBe(0);
  expect(JSON.parse(built.stdout).targets.map((target: { id: string }) => target.id)).toEqual(['pi', 'opencode']);
  expect(existsSync(join(out, 'pi', 'hook-runtime.mjs'))).toBe(true);
  const invalid = cli(['hooks', 'build', source, '--target', 'unknown', '--out', join(root, 'invalid')]);
  expect(invalid.status).toBe(2);
  expect(invalid.stderr).toContain('Unknown hook target');
  expect(existsSync(join(root, 'invalid'))).toBe(false);
});


test('refuses a dangling symlink at a reserved generated path', () => {
  const stage = join(root, 'symlink-stage');
  mkdirSync(stage);
  const outside = join(root, 'outside-runtime');
  symlinkSync(outside, join(stage, 'hook-runtime.mjs'));
  const adapter = { ...hookAdapters[0]!, prepare: undefined, emit: () => ({ 'wrapper.mjs': 'owned output' }) };
  expect(failure(() => emitHooksToDirectory(adapter, config, stage))).toContain('Refusing to overwrite');
  expect(existsSync(outside)).toBe(false);
  expect(existsSync(join(stage, 'wrapper.mjs'))).toBe(false);
});


for (const dangling of [false, true]) {
  test('manifest symlink cannot bypass public hooks build (' + String(dangling) + ')', () => {
    const outside = join(root, 'external-hooks.json');
    const manifest = join(source, 'plugnz.hooks.json');
    const original = readFileSync(manifest, 'utf8');
    if (!dangling) writeFileSync(outside, original);
    rmSync(manifest); symlinkSync(outside, manifest);
    const out = join(root, 'refused-output');
    const result = cli(['hooks', 'build', source, '--target', 'claude-code', '--target', 'pi', '--out', out]);
    expect(result.status === 0).toBe(false);
    expect(result.stderr).toContain('symlinks are unsupported');
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(root).some(name => name.startsWith('.plugnz-hooks-build-'))).toBe(false);
    expect(existsSync(outside)).toBe(!dangling);
    if (!dangling) expect(readFileSync(outside, 'utf8')).toBe(original);
  });
}
