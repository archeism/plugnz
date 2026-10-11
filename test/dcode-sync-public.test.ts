import { expect, test } from 'bun:test';
import { spawn as spawnChild, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot, writeFiles } from './util';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';

const cliExecutable = process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] || process.execPath;
const cliPath = join(repoRoot, process.env['OPEN_PLUGIN_TEST_PACKED_NODE'] ? 'dist/plugnz.mjs' : 'bin/plugnz.mjs');

declare module 'node:fs' {
  export function watch(path: string, listener: (event: string, filename: string | null) => void): { close(): void };
}

test('offline dcode pin publishes an immutable slot and preserves source provenance through sync and update', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-pin-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(native, { recursive: true });
    const authored = { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\none\n', '.mcp.json': '{"mcpServers":{"demo":{"command":"node","args":[]}}}' };
    writeFiles(source, authored);
    const binary = join(root, 'dcode');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const run = (...args: string[]) => spawnSync(cliExecutable, [cliPath, ...args, '--json'], { env, cwd: root, encoding: 'utf8' });
    expect(run('sync', source, '--target', 'dcode').status).toBe(0);
    const registry = join(native, '.state/installed_plugins.json');
    const slot = () => JSON.parse(readFileSync(registry, 'utf8')).plugins['demo@local'][0].installPath;
    const ledgerPath = join(home, 'state.json');
    const ledger = () => JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const before = ledger().activations[0];
    const previousSlot = slot();
    const originalBytes = readFileSync(join(previousSlot, '.mcp.json'), 'utf8');
    const ledgerBytes = readFileSync(ledgerPath, 'utf8');
    expect(run('pin', '--target', 'dcode', '--dry-run').status).toBe(0);
    expect(readFileSync(ledgerPath, 'utf8')).toBe(ledgerBytes);
    expect(readFileSync(join(previousSlot, '.mcp.json'), 'utf8')).toBe(originalBytes);
    rmSync(source, { recursive: true });
    const pinned = run('pin', '--target', 'dcode');
    expect({ status: pinned.status, diagnostic: pinned.status === 0 ? pinned.stderr : pinned.stdout }).toEqual({ status: 0, diagnostic: '' });
    expect(slot() === previousSlot).toBe(false);
    expect(existsSync(previousSlot)).toBe(false);
    expect(JSON.parse(readFileSync(join(slot(), '.mcp.json'), 'utf8')).mcpServers.demo.command.startsWith('/')).toBe(true);
    const activation = ledger().activations[0];
    expect(activation.sourceRevision).toBe(before.sourceRevision);
    expect(activation.fingerprints.source).toBe(before.fingerprints.source);
    expect(activation.fingerprints.projected).toBe(activation.fingerprints.installed);
    expect(activation.pins).toEqual(['demo']);
    expect(activation.pending).toBeUndefined();
    expect(ledger().attempts.at(-1).journal[0].state).toBe('completed');
    writeFiles(source, authored);
    const synced = run('sync', source, '--target', 'dcode');
    expect(synced.status).toBe(0);
    expect(JSON.parse(synced.stdout).outcomes[0].action).toBe('unchanged');
    writeFileSync(join(source, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: demo\n---\ntwo\n');
    expect(run('update', 'demo', '--target', 'dcode').status).toBe(0);
    expect(JSON.parse(readFileSync(join(slot(), '.mcp.json'), 'utf8')).mcpServers.demo.command.startsWith('/')).toBe(true);
    expect(readFileSync(join(slot(), 'skills/demo/SKILL.md'), 'utf8')).toContain('two');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dcode pin retains recoverable prior bytes and data when rollback readback remains unavailable', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-pin-recovery-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', '.mcp.json': '{"mcpServers":{"demo":{"command":"node"}}}' });
    const binary = join(root, 'dcode'), faultBinary = join(root, 'dcode-fault');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    writeFileSync(faultBinary, '#!/bin/sh\nif find "$OPEN_PLUGIN_DCODE_ROOT/plugins/cache/plgnz-operations" -name stage -type d | read stage; then touch "$OPEN_PLUGIN_DCODE_ROOT/.state/.plgnz-dcode-readback-fault"; fi\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(faultBinary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const run = (args: string[], selected = binary) => spawnSync(cliExecutable, [cliPath, ...args, '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: selected }, cwd: root, encoding: 'utf8' });
    expect(run(['sync', source, '--target', 'dcode']).status).toBe(0);
    const registry = join(native, '.state/installed_plugins.json');
    const priorRegistry = readFileSync(registry, 'utf8');
    const prior = JSON.parse(priorRegistry).plugins['demo@local'][0].installPath;
    const bytes = readFileSync(join(prior, '.mcp.json'), 'utf8');
    const data = join(native, 'plugins/data/demo/keep.txt');
    writeFiles(join(native, 'plugins/data/demo'), { 'keep.txt': 'valuable data' });
    const result = run(['pin', '--target', 'dcode'], faultBinary);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('recovery remains pending');
    expect(readFileSync(registry, 'utf8')).toBe(priorRegistry);
    expect(readFileSync(join(prior, '.mcp.json'), 'utf8')).toBe(bytes);
    expect(readFileSync(data, 'utf8')).toBe('valuable data');
    const ledger = JSON.parse(readFileSync(join(home, 'state.json'), 'utf8'));
    expect(ledger.activations[0].pending.phase).toBe('rollback');
    expect(ledger.attempts.at(-1).phase).toBe('recovery-required');
    expect(existsSync(join(native, 'plugins/cache/plgnz-operations'))).toBe(true);
    const operationDir = join(native, 'plugins/cache/plgnz-operations', readdirSync(join(native, 'plugins/cache/plgnz-operations'))[0]!);
    expect(readFileSync(join(operationDir, 'rollback/content-0/.mcp.json'), 'utf8')).toBe(bytes);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dcode pin cannot fabricate ownership for an unrecorded native install', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-pin-unmanaged-'));
  const home = join(root, 'home'), native = join(home, '.deepagents'), slot = join(native, 'plugins/cache/native/demo/1');
  try {
    const bytes = '{"mcpServers":{"demo":{"command":"node"}}}';
    writeFiles(slot, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', '.mcp.json': bytes });
    const registry = JSON.stringify({ version: 2, plugins: { 'demo@local': [{ installPath: slot, version: '1.0.0' }] } });
    writeFiles(native, { '.state/installed_plugins.json': registry, '.state/plugin_state.json': '{"version":1,"enabledPlugins":{"demo@local":true}}' });
    const binary = join(root, 'dcode'); writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    const result = spawnSync(cliExecutable, [cliPath, 'pin', '--target', 'dcode', '--json'], { env: { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) }, cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('recorded owned activation');
    expect(readFileSync(join(slot, '.mcp.json'), 'utf8')).toBe(bytes);
    expect(readFileSync(join(native, '.state/installed_plugins.json'), 'utf8')).toBe(registry);
    expect(existsSync(join(home, 'state.json'))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dcode pin stage failure clears zero-mutation intent and permits a clean retry', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-pin-stage-'));
  const home = join(root, 'home'), native = join(home, '.deepagents'), source = join(root, 'source');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', '.mcp.json': '{"mcpServers":{"demo":{"command":"node"}}}' });
    const binary = join(root, 'dcode'); writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const run = (...args: string[]) => spawnSync(cliExecutable, [cliPath, ...args, '--json'], { env, cwd: root, encoding: 'utf8' });
    expect(run('sync', source, '--target', 'dcode').status).toBe(0);
    const registryFile = join(native, '.state/installed_plugins.json'), registry = readFileSync(registryFile, 'utf8');
    const priorSlot = JSON.parse(registry).plugins['demo@local'][0].installPath;
    const bytes = readFileSync(join(priorSlot, '.mcp.json'), 'utf8');
    const operationsRoot = join(native, 'plugins/cache/plgnz-operations');
    rmSync(operationsRoot, { recursive: true }); writeFileSync(operationsRoot, 'deliberate stage obstruction');
    const failed = run('pin', '--target', 'dcode');
    expect(failed.status).toBe(1);
    expect(readFileSync(registryFile, 'utf8')).toBe(registry);
    expect(readFileSync(join(priorSlot, '.mcp.json'), 'utf8')).toBe(bytes);
    const ledger = JSON.parse(readFileSync(join(home, 'state.json'), 'utf8'));
    expect(ledger.activations[0].pending).toBeUndefined();
    expect(ledger.attempts.at(-1).phase).toBe('failed');
    expect(ledger.attempts.at(-1).mutationStarted).toBe(false);
    rmSync(operationsRoot);
    expect(run('pin', '--target', 'dcode').status).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dcode pin keeps accurate recovery pending when verified rollback cleanup fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-pin-cleanup-'));
  const home = join(root, 'home'), native = join(home, '.deepagents'), source = join(root, 'source');
  const operationsRoot = join(native, 'plugins/cache/plgnz-operations');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', '.mcp.json': '{"mcpServers":{"demo":{"command":"node"}}}' });
    const binary = join(root, 'dcode'), denied = join(root, 'dcode-denied');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    writeFileSync(denied, '#!/bin/sh\nif find "$OPEN_PLUGIN_DCODE_ROOT/plugins/cache/plgnz-operations" -name stage -type d | read stage; then find "$OPEN_PLUGIN_DCODE_ROOT/plugins/cache/plgnz-operations" -type d -exec chmod a-w {} +; fi\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(denied, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const run = (args: string[], selected = binary) => spawnSync(cliExecutable, [cliPath, ...args, '--json'], { env: { ...env, OPEN_PLUGIN_DCODE_BIN: selected }, cwd: root, encoding: 'utf8' });
    expect(run(['sync', source, '--target', 'dcode']).status).toBe(0);
    const registryFile = join(native, '.state/installed_plugins.json'), priorRegistry = readFileSync(registryFile, 'utf8');
    const priorSlot = JSON.parse(priorRegistry).plugins['demo@local'][0].installPath;
    const bytes = readFileSync(join(priorSlot, '.mcp.json'), 'utf8');
    const result = run(['pin', '--target', 'dcode'], denied);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('recovery remains pending');
    expect(readFileSync(registryFile, 'utf8')).toBe(priorRegistry);
    expect(readFileSync(join(priorSlot, '.mcp.json'), 'utf8')).toBe(bytes);
    const ledger = JSON.parse(readFileSync(join(home, 'state.json'), 'utf8'));
    expect(ledger.activations[0].pending.phase).toBe('rollback');
    expect(ledger.attempts.at(-1).phase).toBe('recovery-required');
    expect(ledger.attempts.at(-1).journal[0].state).toBe('rollback');
  } finally {
    if (existsSync(operationsRoot)) spawnSync('chmod', ['-R', 'u+w', operationsRoot]);
    rmSync(root, { recursive: true, force: true });
  }
});

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

test('killing the public CLI at cache rename leaves only a complete candidate or the complete prior registration', async () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-dcode-crash-rename-'));
  const home = join(root, 'home'), source = join(root, 'source'), native = join(home, '.deepagents');
  try {
    mkdirSync(native, { recursive: true });
    writeFiles(source, { 'plugin.json': '{"name":"demo","version":"1.0.0"}', 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\none\n', 'large-resource.txt': 'payload'.repeat(500_000) });
    const binary = join(root, 'dcode');
    writeFileSync(binary, '#!/bin/sh\nprintf "deepagents-code 0.1.83\\n"\n'); chmodSync(binary, 0o755);
    const env = { ...process.env, HOME: home, OPEN_PLUGIN_HOME: home, OPEN_PLUGIN_DCODE_ROOT: native, OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(root) };
    const args = [cliPath, 'sync', source, '--target', 'dcode', '--json'];
    expect(spawnSync(cliExecutable, args, { env, cwd: root, encoding: 'utf8' }).status).toBe(0);
    const registry = join(native, '.state/installed_plugins.json');
    const priorPath = JSON.parse(readFileSync(registry, 'utf8')).plugins['demo@local'][0].installPath;
    const priorSkill = readFileSync(join(priorPath, 'skills/demo/SKILL.md'), 'utf8');
    const nextSkill = '---\nname: demo\ndescription: demo\n---\ntwo\n';
    writeFileSync(join(source, 'skills/demo/SKILL.md'), nextSkill);
    let candidate: string | undefined, observationError: unknown, stopped = false;
    let child: { kill(signal: string): void; on(event: 'exit', callback: () => void): void; on(event: 'error', callback: (error: Error) => void): void };
    const watcher = watch(join(native, 'plugins/cache/plgnz'), (event, name) => {
      if (event !== 'rename' || !name || candidate !== undefined) return;
      const path = join(native, 'plugins/cache/plgnz', name);
      if (path === priorPath || !existsSync(join(path, 'plugin.json'))) return;
      candidate = path;
      child.kill('SIGSTOP'); stopped = true;
      try {
        expect(readFileSync(join(path, 'skills/demo/SKILL.md'), 'utf8')).toBe(nextSkill);
        expect(readFileSync(join(path, 'large-resource.txt'), 'utf8')).toBe('payload'.repeat(500_000));
        const active = JSON.parse(readFileSync(registry, 'utf8')).plugins['demo@local'][0].installPath;
        expect(active === priorPath || active === path).toBe(true);
        expect(readFileSync(join(priorPath, 'skills/demo/SKILL.md'), 'utf8')).toBe(priorSkill);
      } catch (error) { observationError = error; }
      child.kill('SIGKILL');
    });
    try {
      child = spawnChild(cliExecutable, args, { env, cwd: root, stdio: 'ignore' }) as unknown as typeof child;
      await new Promise<void>((resolveExit, rejectExit) => { child.on('exit', () => resolveExit()); child.on('error', rejectExit); });
      if (observationError !== undefined) throw observationError;
      expect(stopped).toBe(true);
      expect(candidate === undefined).toBe(false);
    } finally { watcher.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
