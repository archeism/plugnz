import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { HookConfig, HookInput } from '../src/hooks';
import { hookAdapter } from '../src/hosts/omp-hooks';

type Context = { cwd: string; sessionManager: { getSessionId(): string } };
type Handler = (event: Record<string, unknown>, ctx: Context) => unknown | Promise<unknown>;

test('OMP generated callbacks use native context effects without changing tool input or output', async () => {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-omp-hooks-'));
  try {
    const command = [process.execPath, '${PLUGIN_ROOT}/handler.mjs', '${PLUGIN_ROOT}/inputs.jsonl'];
    const config: HookConfig = { version: 1, hooks: {
      'session.start': [{ command }],
      'tool.before': [{ command, tools: ['read'] }],
      'tool.after': [{ command, tools: ['read'] }],
      'turn.stop': [{ command }],
    } };
    writeFileSync(join(root, 'handler.mjs'), `import { readFileSync, appendFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
appendFileSync(process.argv[2], JSON.stringify(input) + '\\n');
const result = input.event === 'turn.stop'
  ? (input.stop.active ? {} : {context: 'STOP_CONTEXT', continue: true})
  : {context: input.event + '_CONTEXT'};
process.stdout.write(JSON.stringify(result));
`);
    writeFileSync(join(root, 'hook-runtime.mjs'),
      'export { runHooks } from ' + JSON.stringify(pathToFileURL(join(import.meta.dir, '../src/hooks.ts')).href) + ';\n');
    writeFileSync(join(root, 'extension.mjs'), hookAdapter.emit(config)['extension.mjs']!);
    const handlers = new Map<string, Handler>();
    const messages: { message: unknown; options: unknown }[] = [];
    const extension = await import(pathToFileURL(join(root, 'extension.mjs')).href);
    extension.default({
      on: (event: string, handler: Handler) => handlers.set(event, handler),
      sendMessage: (message: unknown, options: unknown) => messages.push({ message, options }),
    });
    const ctx: Context = { cwd: root, sessionManager: { getSessionId: () => 'session-omp' } };
    await handlers.get('session_start')!({}, ctx);
    expect(messages).toEqual([{
      message: { customType: 'plugnz:session.start', content: 'session.start_CONTEXT', display: false },
      options: { deliverAs: 'nextTurn', triggerTurn: false },
    }]);

    const input = Object.freeze({ path: 'readme.txt' });
    const content = Object.freeze([{ type: 'text', text: 'ORIGINAL' }]);
    const details = Object.freeze({ path: 'readme.txt' });
    expect(await handlers.get('tool_call')!({ toolName: 'write', toolCallId: 'skip', input }, ctx)).toBeUndefined();
    expect(await handlers.get('tool_call')!({ toolName: 'read', toolCallId: 'call-1', input }, ctx)).toEqual({
      additionalContext: 'tool.before_CONTEXT',
    });
    expect(await handlers.get('tool_result')!({
      toolName: 'read', toolCallId: 'call-1', input, content, details, isError: false,
    }, ctx)).toEqual({ additionalContext: 'tool.after_CONTEXT' });
    expect(content).toEqual([{ type: 'text', text: 'ORIGINAL' }]);
    expect(input).toEqual({ path: 'readme.txt' });
    expect(await handlers.get('session_stop')!({ stop_hook_active: false }, ctx)).toEqual({
      continue: true, additionalContext: 'STOP_CONTEXT',
    });
    expect(await handlers.get('session_stop')!({ stop_hook_active: true }, ctx)).toBeUndefined();
    const inputs = readFileSync(join(root, 'inputs.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as HookInput);
    expect(inputs.map(item => item.event)).toEqual(['session.start', 'tool.before', 'tool.after', 'turn.stop', 'turn.stop']);
    expect(inputs.every(item => item.harness === 'omp' && item.cwd === root && item.sessionId === 'session-omp')).toBe(true);
    expect(inputs[2]!.tool).toEqual({
      name: 'read', id: 'call-1', input, output: { content, details }, isError: false,
    });
    expect(inputs.slice(3).map(item => item.stop?.active)).toEqual([false, true]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
