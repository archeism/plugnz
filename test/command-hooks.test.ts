import { afterAll, describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hookAdapter as claude } from '../src/hosts/claude-code-hooks';
import { hookAdapter as codex } from '../src/hosts/codex-hooks';
import { hookAdapter as zcode } from '../src/hosts/zcode-cli-hooks';
import type { HookAdapter, HookConfig, HookEvent } from '../src/hooks';

const temporary = mkdtempSync(join(tmpdir(), 'plugnz-command-hook-'));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));
const runtime = join(temporary, 'runtime.mjs');
const built = spawnSync(process.execPath, ['build', join(import.meta.dir, '../src/hooks.ts'), '--target=node', '--format=esm', '--outfile=' + runtime], { encoding: 'utf8' });
if (built.status !== 0) throw new Error('Cannot bundle test hook runtime: ' + built.stderr);

function run(adapter: HookAdapter, event: HookEvent, native: Record<string, unknown>, resultExpression: string) {
  const root = mkdtempSync(join(temporary, adapter.id + '-'));
  const handler = `let raw='';for await(const chunk of process.stdin)raw+=chunk;const input=JSON.parse(raw);process.stdout.write(JSON.stringify(${resultExpression}));`;
  const config: HookConfig = { version: 1, hooks: { [event]: [{ command: ['node', '--input-type=module', '-e', handler], timeoutMs: 2_000 }] } };
  const files = adapter.emit(config);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  // Copy the real shared runner; no native harness or user state is needed.
  copyFileSync(runtime, join(root, 'hook-runtime.mjs'));
  const processResult = spawnSync('node', [join(root, `hooks/plugnz-${adapter.id}.mjs`)], { input: JSON.stringify({ cwd: root, ...native }), encoding: 'utf8', timeout: 5_000 });
  return { processResult, output: processResult.stdout ? JSON.parse(processResult.stdout) : undefined, files };
}

for (const adapter of [claude, codex, zcode]) describe(adapter.id + ' command hook adapter', () => {
  test('session context and normalized identity reach native envelope', () => {
    const receipt = run(adapter, 'session.start', { hook_event_name: 'SessionStart', session_id: 'fixture-session', source: 'resume' }, "{context:input.harness+':'+input.sessionId+':'+input.reason}");
    expect(receipt.processResult.status).toBe(0);
    expect(receipt.output).toEqual({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: adapter.id + ':fixture-session:resume' } });
    const native = JSON.parse(receipt.files['hooks/hooks.json']!);
    expect(native.hooks.SessionStart[0].hooks[0].async).toBe(false);
    expect(native.hooks.SessionStart[0].hooks[0].command).toBe(`node "\${CLAUDE_PLUGIN_ROOT}/hooks/plugnz-${adapter.id}.mjs"`);
  });
  test('pre context does not acquire allow, deny, or replacement fields', () => {
    const receipt = run(adapter, 'tool.before', { hookEventName: 'PreToolUse', toolName: 'Read', toolCallId: 'call-1', toolInput: { path: 'fixture' } }, "{context:input.tool.name+':'+input.tool.id+':'+input.tool.input.path}");
    expect(receipt.processResult.status).toBe(0);
    expect(receipt.output).toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'Read:call-1:fixture' } });
  });
  test('post context preserves tool observation without rewriting output', () => {
    const receipt = run(adapter, 'tool.after', { hook_event_name: 'PostToolUse', tool_name: 'Read', tool_use_id: 'call-1', tool_response: { text: 'original' } }, "{context:input.tool.output.text+':'+input.tool.isError}");
    expect(receipt.processResult.status).toBe(0);
    expect(receipt.output).toEqual({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'original:false' } });
  });
  test('explicit continuation uses exact native result shape', () => {
    const receipt = run(adapter, 'turn.stop', { hook_event_name: 'Stop', stop_hook_active: false }, "{continue:true,context:'continue-nonce'}");
    expect(receipt.processResult.status).toBe(0);
    expect(receipt.output).toEqual(adapter.id === 'zcode-cli'
      ? { continue: true, hookSpecificOutput: { hookEventName: 'Stop', additionalContext: 'continue-nonce' } }
      : { decision: 'block', reason: 'continue-nonce' });
  });
  test('active Stop rejects repeated continuation visibly', () => {
    const receipt = run(adapter, 'turn.stop', { hookEventName: 'Stop', stopHookActive: true }, "{continue:true,context:'repeat'}");
    expect(receipt.processResult.status).toBe(1);
    expect(receipt.processResult.stdout).toBe('');
    expect(receipt.processResult.stderr).toContain('plugnz hook:');
  });
  test('Stop context without continuation is rejected', () => {
    const receipt = run(adapter, 'turn.stop', { hook_event_name: 'Stop', stop_hook_active: false }, "{context:'do-not-silently-drop'}");
    expect(receipt.processResult.status).toBe(1);
    expect(receipt.processResult.stdout).toBe('');
  });
  test('checks-only Stop has no continuation', () => {
    const receipt = run(adapter, 'turn.stop', { hook_event_name: 'Stop', stop_hook_active: false }, '{}');
    expect(receipt.processResult.status).toBe(0);
    expect(receipt.output).toEqual({});
  });
});

for (const adapter of [claude, zcode]) test(adapter.id + ' maps failure envelope to tool.after with error status', () => {
  const receipt = run(adapter, 'tool.after', { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: { message: 'lint findings' } }, "{context:input.tool.output.message+':'+input.tool.isError}");
  expect(receipt.processResult.status).toBe(0);
  expect(receipt.output).toEqual({ hookSpecificOutput: { hookEventName: 'PostToolUseFailure', additionalContext: 'lint findings:true' } });
});

test('Codex does not register an unsupported post-failure event', () => {
  const native = JSON.parse(codex.emit({ version: 1, hooks: { 'tool.after': [{ command: ['true'] }] } })['hooks/hooks.json']!);
  expect(Object.keys(native.hooks)).toEqual(['PostToolUse']);
});

for (const [adapter, manifestPath] of [[claude, '.claude-plugin/plugin.json'], [codex, '.codex-plugin/plugin.json'], [zcode, '.zcode-plugin/plugin.json']] as const) describe(adapter.id + ' native hook identity preparation', () => {
  test('projects simple identity without requiring host-specific authoring', () => {
    const stage = mkdtempSync(join(temporary, 'manifest-'));
    const identity = { name: 'fixture-hook', version: '1.0.0', description: 'Fixture' };
    writeFileSync(join(stage, 'plugin.json'), JSON.stringify(identity));
    adapter.prepare(stage);
    expect(JSON.parse(readFileSync(join(stage, manifestPath), 'utf8'))).toEqual(identity);
    expect(existsSync(join(stage, 'plugin.json'))).toBe(adapter.id !== 'codex');
  });
  test('refuses unprojected root semantics without removing source identity', () => {
    const stage = mkdtempSync(join(temporary, 'manifest-'));
    writeFileSync(join(stage, 'plugin.json'), JSON.stringify({ name: 'fixture-hook', agents: './agents' }));
    expect(() => adapter.prepare(stage)).toThrow('cannot project');
    expect(existsSync(join(stage, 'plugin.json'))).toBe(true);
    expect(existsSync(join(stage, manifestPath))).toBe(false);
  });
  test('preserves existing native semantics and rejects conflicting hooks route', () => {
    const stage = mkdtempSync(join(temporary, 'manifest-'));
    mkdirSync(dirname(join(stage, manifestPath)), { recursive: true });
    const native = { name: 'fixture-hook', skills: './skills' };
    writeFileSync(join(stage, manifestPath), JSON.stringify(native));
    adapter.prepare(stage);
    expect(JSON.parse(readFileSync(join(stage, manifestPath), 'utf8'))).toEqual(native);
    writeFileSync(join(stage, manifestPath), JSON.stringify({ ...native, hooks: './custom/hooks.json' }));
    expect(() => adapter.prepare(stage)).toThrow('custom native hooks route');
  });
});
