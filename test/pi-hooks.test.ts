import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { HookConfig, HookInput } from '../src/hooks';
import { hookAdapter } from '../src/hosts/pi-hooks';

type Handler = (event: Record<string, unknown>, ctx: typeof context) => unknown | Promise<unknown>;
const context = { cwd: '/fixture/project', sessionManager: { getSessionId: () => 'session-pi' } };

test('Pi generated callbacks deliver context, preserve result metadata, and continue once per prompt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-pi-hooks-'));
  const ctx = { ...context, cwd: root };
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
    await handlers.get('session_start')!({ reason: 'startup' }, ctx);
    expect(messages[0]).toEqual({
      message: { customType: 'plugnz:session.start', content: 'session.start_CONTEXT', display: false },
      options: { deliverAs: 'nextTurn', triggerTurn: false },
    });

    const input = Object.freeze({ path: 'readme.txt' });
    await handlers.get('tool_call')!({ toolName: 'write', toolCallId: 'skip', input }, ctx);
    expect(messages.length).toBe(1);
    await handlers.get('tool_call')!({ toolName: 'read', toolCallId: 'call-1', input }, ctx);
    expect(messages[1]).toEqual({
      message: { customType: 'plugnz:tool.before', content: 'tool.before_CONTEXT', display: false },
      options: { triggerTurn: false },
    });

    const content = Object.freeze([{ type: 'text', text: 'ORIGINAL' }, { type: 'image', data: 'image', mimeType: 'image/png' }]);
    const details = Object.freeze({ source: 'readme.txt' });
    const structuredContent = Object.freeze({ original: [1, 2] });
    const result = await handlers.get('tool_result')!({
      toolName: 'read', toolCallId: 'call-1', input, content, details, structuredContent, isError: true,
      usage: { input: 4, output: 2 },
    }, ctx) as { content: unknown[]; structuredContent: unknown; details?: unknown; isError?: unknown };
    expect(result.content).toEqual([...content, { type: 'text', text: 'tool.after_CONTEXT' }]);
    expect(result.structuredContent).toBe(structuredContent);
    expect(result.details).toBeUndefined();
    expect(result.isError).toBeUndefined();
    expect(content.length).toBe(2);

    const priorEntries = Object.freeze([{ type: 'custom', customType: 'other-extension', data: 'keep' }]);
    await handlers.get('before_agent_start')!({}, ctx);
    const stop = await handlers.get('agent_before_settle')!({ entries: priorEntries, continue: false }, ctx);
    expect(stop).toEqual({
      entries: [...priorEntries, { type: 'custom_message', customType: 'plugnz:turn.stop', content: 'STOP_CONTEXT', display: false }],
      continue: true,
    });
    expect(await handlers.get('agent_before_settle')!({ entries: priorEntries, continue: true }, ctx)).toBeUndefined();
    await handlers.get('before_agent_start')!({}, ctx);
    expect(await handlers.get('agent_before_settle')!({ entries: [], continue: false }, ctx)).toEqual({
      entries: [{ type: 'custom_message', customType: 'plugnz:turn.stop', content: 'STOP_CONTEXT', display: false }],
      continue: true,
    });

    const inputs = readFileSync(join(root, 'inputs.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as HookInput);
    expect(inputs.map(item => item.event)).toEqual(['session.start', 'tool.before', 'tool.after', 'turn.stop', 'turn.stop', 'turn.stop']);
    expect(inputs.every(item => item.harness === 'pi' && item.cwd === root && item.sessionId === 'session-pi')).toBe(true);
    expect(inputs[2]!.tool).toEqual({
      name: 'read', id: 'call-1', input,
      output: { content, details, structuredContent, usage: { input: 4, output: 2 } }, isError: true,
    });
    expect(inputs.slice(3).map(item => item.stop?.active)).toEqual([false, true, false]);
    expect(handlers.has('agent_end')).toBe(false);
    expect(handlers.has('agent_settled')).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
