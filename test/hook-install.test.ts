import { afterEach, beforeEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { hookAdapters } from '../src/hook-build';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { admitPackageSemanticsFromProfiles } from '../src/capability-evidence';
import { portableHookProfile } from '../src/portable-hook-policy';
import { fingerprintTree } from '../src/fingerprint';
import { repoRoot, isolatedHostEnv, writeFiles } from './util';

let root: string, home: string, source: string;
let env: Record<string, string | undefined>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'plugnz-hook-install-test-'));
  home = join(root, 'home'); source = join(root, 'source');
  mkdirSync(home); mkdirSync(source);
  env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith('OPEN_PLUGIN_')) delete env[name];
  Object.assign(env, isolatedHostEnv(home), { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), OPEN_PLUGIN_PI_BIN: join(home, 'missing-pi'), OPEN_PLUGIN_OPENCODE_BIN: join(home, 'missing-opencode') });
  writeFiles(source, {
    'plugin.json': JSON.stringify({ name: 'automatic-hooks', version: '1.0.0', description: 'automatic hook fixture' }),
    'plugnz.hooks.json': JSON.stringify({ version: 1, hooks: { 'session.start': [{ command: [process.execPath, '$' + '{PLUGIN_ROOT}/context.mjs'] }] } }),
    'context.mjs': 'console.log(JSON.stringify({context:"first-context"}));\n',
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function target(id: string, version?: string): string {
  const roots: Record<string, string> = {
    'claude-code': join(home, '.claude'), codex: join(home, '.codex'), omp: join(home, '.omp'),
    pi: join(home, '.pi', 'agent'), opencode: join(home, '.config', 'opencode'),
  };
  const path = roots[id]!;
  mkdirSync(path, { recursive: true });
  if (id === 'claude-code' || id === 'omp') mkdirSync(join(path, 'plugins'));
  const binary = join(home, id + '-version');
  const adapter = hookAdapters.find(item => item.id === id)!;
  const value = version ?? adapter.baselineVersion;
  const text = id === 'codex' ? 'codex-cli ' + value : id === 'claude-code' ? value + ' (Claude Code)' : value;
  writeFileSync(binary, "#!/bin/sh\nprintf '%s\\n' '" + text + "'\n"); chmodSync(binary, 0o755);
  const keys: Record<string, string> = { 'claude-code': 'CLAUDE_CODE', codex: 'CODEX', omp: 'OMP', pi: 'PI', opencode: 'OPENCODE' };
  env['OPEN_PLUGIN_' + keys[id] + '_BIN'] = binary;
  return path;
}
function cli(args: string[], cwd = source) {
  return spawnSync(process.execPath, [join(repoRoot, 'bin', 'plugnz.mjs'), ...args, '--json'], { cwd, env, encoding: 'utf8', timeout: 30_000 });
}
function success(args: string[]) {
  const result = cli(args);
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}
function installedRoot(native: string): string {
  const matches: string[] = [];
  const visit = (path: string): void => {
    for (const name of readdirSync(path)) {
      const child = join(path, name), stat = lstatSync(child);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(child);
      else if (name === 'hook-runtime.mjs') matches.push(path);
    }
  };
  visit(native);
  const path = matches[0];
  if (path === undefined) throw new Error('No installed generated runtime under ' + native);
  return path;
}

for (const id of ['claude-code', 'codex', 'omp', 'pi', 'opencode']) {
  test('install compiles into the native ' + id + ' store and retains authored provenance', () => {
    const native = target(id), before = fingerprintTree(source);
    const first = success(['install', source, '--target', id]);
    expect(first.summary.result).toBe('converged');
    const path = installedRoot(native);
    expect(existsSync(join(path, 'plugnz.hooks.json'))).toBe(false);
    expect(readFileSync(join(path, 'context.mjs'), 'utf8')).toContain('first-context');
    expect(fingerprintTree(source)).toBe(before);
    expect(readFileSync(join(home, 'state.json'), 'utf8')).toContain(source);
    const second = success(['install', source, '--target', id]);
    expect(second.summary.changed).toBe(false);
    if (id === 'codex') {
      expect(existsSync(join(path, 'plugin.json'))).toBe(false);
      expect(existsSync(join(path, '.codex-plugin', 'plugin.json'))).toBe(true);
    }
    if (id === 'omp') expect(JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).omp.extensions).toEqual(['./extension.mjs']);
  }, 30_000);
}

for (const id of ['pi', 'opencode']) {
  test(id + ' update and remove preserve unrelated native registration', () => {
    const native = target(id);
    const settings = id === 'pi' ? join(native, 'settings.json') : join(native, 'opencode.jsonc');
    const existing = id === 'pi'
      ? JSON.stringify({ theme: 'dark', extensions: ['/unrelated/extension.mjs'] })
      : '{ // user comment\n "plugin": ["unrelated-package"], "model": "fixture"\n}\n';
    writeFileSync(settings, existing);
    success(['install', source, '--target', id]);
    const path = installedRoot(native);
    const config = id === 'pi' ? JSON.parse(readFileSync(settings, 'utf8')) : null;
    if (config) {
      expect(config.theme).toBe('dark');
      expect(config.extensions).toEqual(['/unrelated/extension.mjs', join(path, 'extension.mjs')]);
    } else expect(readFileSync(settings, 'utf8')).toBe(existing);
    writeFileSync(join(source, 'context.mjs'), 'console.log(JSON.stringify({context:"updated-context"}));\n');
    success(['update', 'automatic-hooks', '--target', id]);
    expect(readFileSync(join(path, 'context.mjs'), 'utf8')).toContain('updated-context');
    success(['remove', 'automatic-hooks', '--target', id]);
    expect(existsSync(path)).toBe(false);
    if (id === 'pi') expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual({ theme: 'dark', extensions: ['/unrelated/extension.mjs'] });
    else {
      expect(readFileSync(settings, 'utf8')).toBe(existing);
      expect(readdirSync(join(native, 'plugins')).filter(name => name.startsWith('plugnz-'))).toEqual([]);
    }
  }, 30_000);
}

test('install defaults to the current package; add still requires an explicit source', () => {
  target('pi');
  expect(cli(['add', '--target', 'pi']).status).toBe(2);
  expect(success(['install', '--target', 'pi']).summary.result).toBe('converged');
});

test('unsupported versions and unrelated standalone content fail before install intent', () => {
  target('pi', '9.9.9');
  expect(cli(['install', source, '--target', 'pi']).status).toBe(1);
  expect(existsSync(join(home, 'state.json'))).toBe(false);
  target('pi', '1.1.0');
  writeFiles(source, { 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nbody\n' });
  expect(cli(['install', source, '--target', 'pi']).status).toBe(1);
  expect(existsSync(join(home, 'state.json'))).toBe(false);
});

test('authored compiler collisions and redirected host paths do not publish an install', () => {
  const native = target('pi');
  writeFileSync(join(source, 'extension.mjs'), 'authored extension\n');
  expect(cli(['install', source, '--target', 'pi']).status).toBe(1);
  expect(existsSync(join(home, 'state.json'))).toBe(false);
  rmSync(join(source, 'extension.mjs'));
  symlinkSync(join(root, 'missing-foreign-root'), join(native, '.plgnz'));
  expect(cli(['install', source, '--target', 'pi']).status).toBe(1);
  expect(existsSync(join(root, 'missing-foreign-root'))).toBe(false);
});

test('portable profiles do not admit native hooks or unrelated semantics at the same version', () => {
  const inventory = inventoryPackageSemantics({ dir: source, name: 'automatic-hooks' });
  for (const adapter of hookAdapters) {
    const profile = portableHookProfile(adapter, 'managed', ['install', 'update']);
    const request = { host: adapter.id, detectedVersion: adapter.baselineVersion, route: 'managed' as const, sourceType: 'local' as const, operation: 'install' as const, inventory };
    expect(admitPackageSemanticsFromProfiles(request, [profile]).status).toBe('admitted');
    const native = { ...inventory, hookDeclarations: inventory.hookDeclarations.map(declaration => ({ ...declaration, form: 'default-file' as const, events: ['SessionStart'] })) };
    expect(admitPackageSemanticsFromProfiles({ ...request, inventory: native }, [profile]).status).toBe('refused');
    const mixed = { ...inventory, requiredSemantics: [...inventory.requiredSemantics, 'mcp' as const] };
    expect(admitPackageSemanticsFromProfiles({ ...request, inventory: mixed }, [profile]).status).toBe('refused');
  }
});
