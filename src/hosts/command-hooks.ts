import { DEFAULT_HOOK_TIMEOUT_MS, type HookAdapter, type HookConfig, type HookEvent } from '../hooks';

export interface CommandHookOptions {
  id: string;
  baselineVersion: string;
  nativeEvents: Record<HookEvent, readonly string[]>;
  contextDelivery: string;
  stopOutputSource: string;
  timeoutKey?: string;
}

/** Native command routes share transport; each host supplies its event/effect mapping. */
export function commandHookAdapter(options: CommandHookOptions): HookAdapter {
  return {
    id: options.id,
    baselineVersion: options.baselineVersion,
    capabilities: {
      'session.start': { nativeEvent: options.nativeEvents['session.start'].join(' / '), context: true, continue: false, delivery: options.contextDelivery },
      'tool.before': { nativeEvent: options.nativeEvents['tool.before'].join(' / '), context: true, continue: false, delivery: options.contextDelivery },
      'tool.after': { nativeEvent: options.nativeEvents['tool.after'].join(' / '), context: true, continue: false, delivery: options.contextDelivery },
      'turn.stop': { nativeEvent: options.nativeEvents['turn.stop'].join(' / '), context: true, continue: true, delivery: 'with explicit continuation only' },
    },
    emit(config: HookConfig): Record<string, string> {
      const wrapperPath = `hooks/plugnz-${options.id}.mjs`;
      const native: Record<string, unknown[]> = {};
      const eventMap: Record<string, HookEvent> = {};
      for (const [event, handlers] of Object.entries(config.hooks)) {
        if (!handlers?.length) continue;
        for (const name of options.nativeEvents[event as HookEvent]) {
          eventMap[name] = event as HookEvent;
          // The wrapper awaits sequential handlers; let native timeout cover their budgets.
          const seconds = Math.ceil((handlers.reduce((sum, handler) => sum + (handler.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS), 0) + 1_000) / 1_000);
          native[name] = [{ hooks: [{ type: 'command', command: `node "\${CLAUDE_PLUGIN_ROOT}/${wrapperPath}"`, async: false, [options.timeoutKey ?? 'timeout']: seconds }] }];
        }
      }
      const wrapper = `import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runHooks } from '../hook-runtime.mjs';
const config = ${JSON.stringify(config)};
const events = ${JSON.stringify(eventMap)};
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 1048576) throw new Error('Native hook input exceeds 1 MiB');
  }
  const native = JSON.parse(raw);
  const nativeEvent = native.hook_event_name ?? native.hookEventName;
  const event = events[nativeEvent];
  if (!event) throw new Error('Unsupported native hook event: ' + nativeEvent);
  const isTool = event === 'tool.before' || event === 'tool.after';
  const input = {
    version: 1, event, harness: ${JSON.stringify(options.id)},
    cwd: native.cwd ?? process.cwd(),
    ...(native.session_id ?? native.sessionId ? { sessionId: native.session_id ?? native.sessionId } : {}),
    ...(native.source ?? native.reason ? { reason: native.source ?? native.reason } : {}),
    ...(isTool ? { tool: {
      name: native.tool_name ?? native.toolName,
      ...(native.tool_use_id ?? native.tool_call_id ?? native.toolCallId ? { id: native.tool_use_id ?? native.tool_call_id ?? native.toolCallId } : {}),
      input: native.tool_input ?? native.toolInput,
      ...(event === 'tool.after' ? {
        output: native.tool_response ?? native.toolResponse ?? native.error,
        isError: nativeEvent === 'PostToolUseFailure' || native.is_error === true || native.isError === true,
      } : {}),
    } } : {}),
    ...(event === 'turn.stop' ? { stop: { active: native.stop_hook_active === true || native.stopHookActive === true } } : {}),
  };
  const result = await runHooks(config, input, pluginRoot);
  let output = {};
  if (event === 'turn.stop') {
    if (result.continue === true) output = ${options.stopOutputSource};
  } else if (result.context !== undefined) {
    output = { hookSpecificOutput: { hookEventName: nativeEvent, additionalContext: result.context } };
  }
  process.stdout.write(JSON.stringify(output) + '\\n');
} catch (error) {
  process.stderr.write('plugnz hook: ' + (error instanceof Error ? error.message : String(error)) + '\\n');
  process.exitCode = 1;
}
`;
      return { 'hooks/hooks.json': JSON.stringify({ hooks: native }, null, 2) + '\n', [wrapperPath]: wrapper };
    },
  };
}
