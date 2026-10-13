import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hookAdapter } from '../src/hosts/opencode-hooks';
import type { HookConfig, HookEvent } from '../src/hooks';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

for (const version of [1, 2] as const) {
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-opencode-hooks-'));
  roots.push(root);
  const cwd = join(root, 'workspace');
  mkdirSync(cwd);
  const config: HookConfig = { version, hooks: {} };
  for (const event of ['session.start', 'turn.stop', 'tool.before', 'tool.after'] as HookEvent[]) {
    config.hooks[event] = [{ command: [process.execPath, '${PLUGIN_ROOT}/handler.mjs'], ...(version === 2 ? { requires: event === 'turn.stop' ? {} : { context: true } } : {}) }];
  }
  writeFileSync(join(root, 'handler.mjs'),
    "import { appendFileSync } from 'node:fs';\n" +
    "let raw = ''; for await (const part of process.stdin) raw += part;\n" +
    "const event = JSON.parse(raw);\n" +
    "appendFileSync(" + JSON.stringify(join(root, 'events.jsonl')) + ", JSON.stringify(event) + '\\n');\n" +
    "process.stdout.write(JSON.stringify(event.event === 'turn.stop' ? {} : {context: event.event + ':' + event.sessionId}));\n");
  // Use the real core runtime; only native callback dispatch is simulated here.
  writeFileSync(join(root, 'hook-runtime.mjs'), 'export { runHooks } from ' + JSON.stringify(join(import.meta.dir, '../src/hooks.ts')) + ';\n');
  for (const [file, source] of Object.entries(hookAdapter.emit(config))) writeFileSync(join(root, file), source);
  const module = await import(join(root, 'plugin.mjs'));
  const hooks = await module.default({ directory: cwd });
  const events = () => readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  return { root, cwd, hooks, events };
}

test('v' + version + ' OpenCode start is awaited once per session, including concurrent requests and a second warm session', async () => {
  const { hooks, events, cwd } = await fixture();
  const first = { system: ['original'] }, concurrent = { system: ['original'] };
  await Promise.all([
    hooks['experimental.chat.system.transform']({ sessionID: 'one' }, first),
    hooks['experimental.chat.system.transform']({ sessionID: 'one' }, concurrent),
  ]);
  expect(first.system).toEqual(['original', 'session.start:one']);
  expect(concurrent.system).toEqual(first.system);
  const second = { system: ['original'] };
  await hooks['experimental.chat.system.transform']({ sessionID: 'two' }, second);
  expect(second.system).toEqual(['original', 'session.start:two']);
  expect(events().map(event => event.sessionId)).toEqual(['one', 'two']);
  expect(events().every(event => event.cwd === cwd)).toBe(true);
});

test('v' + version + ' OpenCode appends pre/post feedback without changing arguments, original output, or metadata', async () => {
  const { hooks, events } = await fixture();
  const args = { filePath: '/project/file.txt' };
  await hooks['tool.execute.before']({ tool: 'read', sessionID: 'one', callID: 'call1' }, { args });
  const metadata = { path: 'file.txt' }, attachments = [{ url: 'data:image/png;base64,fake' }];
  const result = { title: 'file.txt', output: 'original file contents', metadata, attachments };
  await hooks['tool.execute.after']({ tool: 'read', sessionID: 'one', callID: 'call1', args }, result);
  expect(args).toEqual({ filePath: '/project/file.txt' });
  expect(result.output).toBe('original file contents\n\ntool.before:one\n\ntool.after:one');
  expect(result.metadata).toBe(metadata);
  expect(result.attachments).toBe(attachments);
  expect(events().map(event => event.event)).toEqual(['tool.before', 'tool.after']);
  expect(events()[1].tool.output).toBe('original file contents');
});

test('v' + version + ' OpenCode preserves MCP structured content while appending feedback to its content array', async () => {
  const { hooks } = await fixture();
  const structuredContent = { answer: 42 }, content = [{ type: 'text', text: 'original' }];
  const result = { content, structuredContent, isError: false };
  await hooks['tool.execute.after']({ tool: 'mcp_read', sessionID: 'one', callID: 'mcp1', args: {} }, result);
  expect(result.content).toEqual([...content, { type: 'text', text: 'tool.after:one' }]);
  expect(result.structuredContent).toBe(structuredContent);
  expect(result.isError).toBe(false);
});

test('v' + version + ' OpenCode pre feedback survives a failed tool and stays in the correct session', async () => {
  const { hooks } = await fixture();
  await hooks['tool.execute.before']({ tool: 'read', sessionID: 'one', callID: 'failed' }, { args: {} });
  const unrelated = { system: [] };
  await hooks['experimental.chat.system.transform']({ sessionID: 'two' }, unrelated);
  expect(unrelated.system).toEqual(['session.start:two']);
  const next = { system: [] };
  await hooks['experimental.chat.system.transform']({ sessionID: 'one' }, next);
  expect(next.system).toEqual(['session.start:one', 'tool.before:one']);
  const later = { system: [] };
  await hooks['experimental.chat.system.transform']({ sessionID: 'one' }, later);
  expect(later.system).toEqual(['session.start:one']);
});

test('v' + version + ' OpenCode stop runs a check once per completed activity and exposes its missing continuation capability', async () => {
  const { hooks, events } = await fixture();
  await hooks['chat.message']({ sessionID: 'one' });
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'one' } } });
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'one' } } });
  expect(events().map(event => event.event)).toEqual(['turn.stop']);
  expect(hookAdapter.capabilities['turn.stop'].context).toBe(false);
  expect(hookAdapter.capabilities['turn.stop'].continue).toBe(false);
});

}
