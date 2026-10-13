import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_HOOK_OUTPUT_BYTES, runHooks, validateHookConfig, validateHookInput, type HookConfig, type HookEvent, type HookInput } from '../src/hooks';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'plugnz-hooks-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function input(event: HookEvent = 'session.start'): HookInput {
  return {
    version: 1, event, harness: 'test', cwd: root,
    ...(event === 'turn.stop' ? { stop: { active: false } } : {}),
    ...(event === 'tool.before' || event === 'tool.after' ? { tool: { name: 'Read', id: 'call-1', input: { path: 'example' } } } : {}),
  };
}
function program(name: string, expression: string): string[] {
  const path = join(root, name + '.mjs');
  writeFileSync(path, [
    "let raw = '';",
    'for await (const chunk of process.stdin) raw += chunk;',
    'const event = JSON.parse(raw);',
    'const result = ' + expression + ';',
    'if (result !== undefined) console.log(JSON.stringify(result));',
  ].join('\n'));
  return [process.execPath, '$' + '{PLUGIN_ROOT}/' + name + '.mjs'];
}
function config(event: HookEvent, command: string[]): HookConfig {
  return { version: 1, hooks: { [event]: [{ command }] } };
}
async function failure(run: () => unknown | Promise<unknown>): Promise<string> {
  try { await run(); return 'NO ERROR'; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
}

describe('portable hook contract', () => {
  test('rejects unsupported events, fields and non-argv commands', async () => {
    expect(await failure(() => validateHookConfig({ version: 1, hooks: { SessionStart: [] } }))).toContain('unsupported field');
    expect(await failure(() => validateHookConfig({ version: 1, hooks: { 'session.start': [{ command: 'echo context' }] } }))).toContain('argv array');
    expect(await failure(() => validateHookConfig({ version: 1, hooks: { 'session.start': [{ command: ['true'], deny: true }] } }))).toContain('unsupported field');
    expect(await failure(() => validateHookConfig({ version: 1, hooks: { 'tool.after': [{ command: ['true'], timeoutMs: 0 }] } }))).toContain('timeoutMs');
    expect(await failure(() => validateHookConfig({ version: 1, hooks: { 'session.start': [{ command: ['true'], tools: ['Read'] }] } }))).toContain('only valid for tool events');
  });

  test('requires receiving-boundary data for tool and stop events', async () => {
    expect(await failure(() => validateHookInput({ version: 1, event: 'tool.before', harness: 'pi', cwd: root }))).toContain('requires tool.name');
    expect(await failure(() => validateHookInput({ version: 1, event: 'turn.stop', harness: 'pi', cwd: root }))).toContain('requires stop.active');
    expect(await failure(() => validateHookInput({ ...input(), cwd: 'relative' }))).toContain('must be absolute');
  });

  test('runs sequentially, feeds normalized input and aggregates context', async () => {
    const first = program('first', "({ context: event.harness + ':' + event.event })");
    const second = program('second', "({ context: 'next:' + event.cwd })");
    const result = await runHooks({ version: 1, hooks: { 'session.start': [{ command: first }, { command: second }] } }, input(), root);
    expect(result).toEqual({ context: 'test:session.start\n\nnext:' + root });
  });

  test('substitutes plugin root literally without invoking a shell and uses event cwd', async () => {
    const workspace = join(root, 'workspace');
    mkdirSync(workspace);
    const argv = program('args', "({ context: JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), tool: event.tool }) })");
    argv.push('$' + '{PLUGIN_ROOT}/a file', '$(touch should-not-exist)', '; echo NOT_A_SHELL');
    const current = { ...input('tool.before'), cwd: workspace };
    const result = await runHooks(config('tool.before', argv), current, root);
    expect(JSON.parse(result.context!)).toEqual({
      // macOS exposes /var through the /private/var symlink to child processes.
      cwd: realpathSync(workspace),
      args: [root + '/a file', '$(touch should-not-exist)', '; echo NOT_A_SHELL'],
      tool: current.tool,
    });
  });

  test('filters exact native tool names and leaves unmatched handlers unexecuted', async () => {
    const command = program('filter', "({ context: 'matched' })");
    const hookConfig: HookConfig = { version: 1, hooks: { 'tool.before': [{ command, tools: ['Read'] }] } };
    expect(await runHooks(hookConfig, input('tool.before'), root)).toEqual({ context: 'matched' });
    expect(await runHooks(hookConfig, { ...input('tool.before'), tool: { name: 'read' } }, root)).toEqual({});
    expect(await runHooks({ version: 1, hooks: { 'tool.before': [{ command: ['missing-handler'], tools: [] }] } }, input('tool.before'), root)).toEqual({});
  });

  test('accepts checks with no stdout, and rejects non-JSON or unsupported result powers', async () => {
    expect(await runHooks(config('session.start', program('silent', 'undefined')), input(), root)).toEqual({});
    const invalid = [process.execPath, '-e', 'console.log("not json")'];
    expect(await failure(() => runHooks(config('session.start', invalid), input(), root))).toContain('one JSON result');
    for (const field of ['updatedInput', 'deny', 'toolResult', 'allow']) {
      const command = program('power', '({ ' + field + ': true })');
      expect(await failure(() => runHooks(config('session.start', command), input(), root))).toContain('unsupported field');
    }
  });

  test('requires explicit Stop continuation with context and rejects recursion', async () => {
    const continuation = program('continue', "({ context: 'Run one further check', continue: true })");
    expect(await runHooks(config('turn.stop', continuation), input('turn.stop'), root)).toEqual({ context: 'Run one further check', continue: true });
    expect(await failure(() => runHooks(config('turn.stop', continuation), { ...input('turn.stop'), stop: { active: true } }, root))).toContain('stop.active is true');
    expect(await failure(() => runHooks(config('session.start', continuation), input(), root))).toContain('only valid for turn.stop');
    expect(await failure(() => runHooks(config('turn.stop', program('passive', "({ context: 'undeliverable' })")), input('turn.stop'), root))).toContain('context requires continue:true');
    expect(await failure(() => runHooks(config('turn.stop', program('empty', '({ continue: true })')), input('turn.stop'), root))).toContain('requires nonblank context');
    expect(await runHooks(config('turn.stop', program('done', '({})')), { ...input('turn.stop'), stop: { active: true } }, root)).toEqual({});
  });

  test('reports nonzero exits and missing executables', async () => {
    const exit = [process.execPath, '-e', 'console.error("check failed"); process.exit(3)'];
    expect(await failure(() => runHooks(config('session.start', exit), input(), root))).toContain('handler exited 3: check failed');
    expect(await failure(() => runHooks(config('session.start', [join(root, 'missing')]), input(), root))).toContain('session.start[0]');
  });

  test('bounds time and output of real handler subprocesses', async () => {
    const started = performance.now();
    const slow: HookConfig = { version: 1, hooks: { 'session.start': [{ command: [process.execPath, '-e', 'setInterval(() => {}, 1000)'], timeoutMs: 40 }] } };
    expect(await failure(() => runHooks(slow, input(), root))).toContain('timed out after 40ms');
    expect(performance.now() - started).toBeLessThan(3000);
    const loud = [process.execPath, '-e', 'process.stdout.write("x".repeat(' + (MAX_HOOK_OUTPUT_BYTES + 1000) + '))'];
    expect(await failure(() => runHooks(config('session.start', loud), input(), root))).toContain('output exceeded');
  });

  test('stops after a failed handler instead of running later commands', async () => {
    const marker = join(root, 'late');
    const late = [process.execPath, '-e', 'require("node:fs").writeFileSync(' + JSON.stringify(marker) + ', "bad")'];
    const hookConfig: HookConfig = { version: 1, hooks: { 'session.start': [{ command: [process.execPath, '-e', 'process.exit(4)'] }, { command: late }] } };
    expect(await failure(() => runHooks(hookConfig, input(), root))).toContain('handler exited 4');
    expect(await failure(() => readFileSync(marker, 'utf8'))).toContain('ENOENT');
  });
});
