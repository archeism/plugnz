import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot, writeFiles } from './util';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';

test('dcode authoritative sync installs, updates and retires without losing writable data', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-sync-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\none\n' });
    const binary = join(root, 'dcode');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const run = (...args: string[]) => spawnSync(process.execPath, [join(repoRoot, 'bin/plugnz.mjs'), ...args, '--json'], { env, cwd: root, encoding: 'utf8' });
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

test('dcode refuses unverified native lock runtime before active writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-lock-refusal-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\none\n' });
    const binary = join(root, 'dcode');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: '' };
    const result = spawnSync(process.execPath, [join(repoRoot, 'bin/plugnz.mjs'), 'sync', source, '--target', 'dcode', '--json'], { env, cwd: root, encoding: 'utf8' });
    const report = JSON.parse(result.stdout);
    expect(result.status).toBe(1);
    expect(report.summary.failureCategory).toBe('internal');
    expect(report.summary.reason.diagnostic).toContain('Python interpreter is unverified');
    expect(existsSync(join(native, '.state/installed_plugins.json'))).toBe(false);
    expect(existsSync(join(native, '.state/plugin_state.json'))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
