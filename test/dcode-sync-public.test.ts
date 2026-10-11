import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot, writeFiles } from './util';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';

const cliExecutable = process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] || process.execPath;
const cliPath = join(repoRoot, process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] ? 'dist/plugnz.mjs' : 'bin/plugnz.mjs');

test('dcode authoritative sync installs, updates and retires without losing writable data', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-sync-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\none\n' });
    const binary = join(root, 'dcode');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const run = (...args: string[]) => spawnSync(cliExecutable, [cliPath, ...args, '--json'], { env, cwd: root, encoding: 'utf8' });
    const installed = run('sync', source, '--target', 'dcode');
    expect(installed.stderr).toBe('');
    expect({ status: installed.status, error: installed.stderr, result: JSON.parse(installed.stdout).summary.result }).toEqual({ status: 0, error: '', result: 'converged' });
    const registry = join(native, '.state/installed_plugins.json');
    const row = () => JSON.parse(readFileSync(registry, 'utf8')).plugins['demo@local'][0];
    expect(row().version ?? null).toBe(null); // Native updater must skip this managed install.
    const data = join(native, 'plugins/data/demo-local');
    writeFiles(data, { 'keep.txt': 'user data' });
    writeFileSync(join(source, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: demo\n---\ntwo\n');
    const updated = run('sync', source, '--target', 'dcode');
    expect(JSON.parse(updated.stdout).summary.reason).toBe(null);
    expect(updated.status).toBe(0);
    expect(readFileSync(join(row().installPath, 'skills/demo/SKILL.md'), 'utf8')).toContain('two');
    const scopeId = JSON.parse(installed.stdout).outcomes[0].scope.id;
    const retired = run('retire-source', scopeId, '--target', 'dcode');
    expect(JSON.parse(retired.stdout).outcomes.map((outcome: any) => outcome.reason)).toEqual([null]);
    expect({ status: retired.status, error: retired.stderr }).toEqual({ status: 0, error: '' });
    expect(JSON.parse(readFileSync(registry, 'utf8')).plugins['demo@local']).toBeUndefined();
    expect(existsSync(join(data, 'keep.txt'))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a mismatched final dcode adoption stops the entire batch before any earlier host writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-adoption-preflight-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(join(home, '.cursor'), { recursive: true });
    const manifest = '{"name":"demo","version":"1.0.0"}';
    writeFiles(source, { 'plugin.json': manifest, 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nexpected\n' });
    const hashed = join(native, 'plugins/cache/local-aaa/demo-bbb/1-0-0-ccc');
    writeFiles(hashed, { 'plugin.json': manifest, 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nforeign bytes\n' });
    const registryBytes = JSON.stringify({ version: 2, plugins: { 'demo@local': [{ installPath: hashed, version: '1.0.0' }] } });
    writeFiles(native, { '.state/installed_plugins.json': registryBytes, '.state/plugin_state.json': '{"version":1,"enabledPlugins":{"demo@local":true}}' });
    const binary = join(root, 'dcode'), cursor = join(root, 'cursor');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    writeFileSync(cursor, '#!/bin/sh\nprintf "2.4.0\\n"\n'); chmodSync(cursor, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_CURSOR_BIN: cursor, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const result = spawnSync(cliExecutable, [cliPath, 'add', source, '--target', 'cursor', '--target', 'dcode', '--adopt-existing', '--json'], { env, cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).summary.reason.diagnostic).toContain('content differs');
    expect(readFileSync(join(native, '.state/installed_plugins.json'), 'utf8')).toBe(registryBytes);
    expect(existsSync(join(home, 'state.json'))).toBe(false);
    expect(existsSync(join(home, '.cursor/plugins/local'))).toBe(false);
    expect(existsSync(join(native, 'plugins/cache/plgnz-operations'))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('native state changed before locked capture is preserved without stale rollback', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-concurrent-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\none\n' });
    const binary = join(root, 'dcode'), concurrent = join(root, 'concurrent-python');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const run = (interpreter = env.OPEN_PLUGIN_DCODE_PYTHON_BIN) => spawnSync(cliExecutable, [cliPath, 'sync', source, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_PYTHON_BIN: interpreter }, cwd: root, encoding: 'utf8' });
    expect(run().status).toBe(0);
    const registry = readFileSync(join(native, '.state/installed_plugins.json'), 'utf8');
    const flags = '{"version":1,"enabledPlugins":{"demo@local":false,"foreign@local":true}}';
    writeFileSync(concurrent, `#!/bin/sh\nif [ "$#" = 3 ]; then printf '%s' '${flags}' > "$OPEN_PLUGIN_DCODE_ROOT/.state/plugin_state.json"; fi\nprintf "DCODE_LOCK_0.1.83\\n"\ncat >/dev/null\n`); chmodSync(concurrent, 0o755);
    writeFileSync(join(source, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: demo\n---\ntwo\n');
    const refused = run(concurrent);
    expect(refused.status).toBe(1);
    expect(JSON.parse(refused.stdout).outcomes[0].reason.diagnostic).toContain('before locked preparation');
    expect(readFileSync(join(native, '.state/plugin_state.json'), 'utf8')).toBe(flags);
    expect(readFileSync(join(native, '.state/installed_plugins.json'), 'utf8')).toBe(registry);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dcode refuses unverified native lock runtime before active writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-lock-refusal-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\none\n' });
    const binary = join(root, 'dcode');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: '' };
    const result = spawnSync(cliExecutable, [cliPath, 'sync', source, '--target', 'dcode', '--json'], { env, cwd: root, encoding: 'utf8' });
    const report = JSON.parse(result.stdout);
    expect(result.status).toBe(1);
    expect(report.summary.failureCategory).toBe('internal');
    expect(report.summary.reason.diagnostic).toContain('Python interpreter is unverified');
    expect(existsSync(join(native, '.state/installed_plugins.json'))).toBe(false);
    expect(existsSync(join(native, '.state/plugin_state.json'))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dcode changed-byte sync rolls back divergent readback and a fresh retry converges', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-rollback-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\none\n' });
    const binary = join(root, 'dcode'), badBinary = join(root, 'dcode-bad');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    writeFileSync(badBinary, '#!/bin/sh\nif [ -d "$OPEN_PLUGIN_DCODE_ROOT/plugins/cache/plgnz-operations" ]; then find "$OPEN_PLUGIN_DCODE_ROOT/plugins/cache/plgnz-operations" -path "*/stage/skills/demo/SKILL.md" -exec sh -c \'printf "corrupt" > "$1"\' sh {} \\; ; fi\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(badBinary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const run = (activeBinary = binary) => spawnSync(cliExecutable, [cliPath, 'sync', source, '--target', 'dcode', '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: activeBinary }, cwd: root, encoding: 'utf8' });
    const installed = run(); expect(installed.status).toBe(0);
    const registry = join(native, '.state/installed_plugins.json');
    const installedPath = JSON.parse(readFileSync(registry, 'utf8')).plugins['demo@local'][0].installPath;
    const before = readFileSync(join(installedPath, 'skills/demo/SKILL.md'), 'utf8');
    writeFileSync(join(source, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: demo\n---\ntwo\n');
    const failed = run(badBinary); expect(failed.status).toBe(1);
    expect(readFileSync(join(installedPath, 'skills/demo/SKILL.md'), 'utf8')).toBe(before);
    const retry = run(); expect(retry.status).toBe(0);
    const newPath = JSON.parse(readFileSync(registry, 'utf8')).plugins['demo@local'][0].installPath;
    expect(newPath === installedPath).toBe(false);
    expect(readFileSync(join(newPath, 'skills/demo/SKILL.md'), 'utf8')).toContain('two');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
