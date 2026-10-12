import type { HookAdapter } from '../hooks';

// Native return shapes: oh-my-pi 18.8.7, src/extensibility/shared-events.ts.
// Keep these translations here; the portable runtime owns command execution.
export const hookAdapter: HookAdapter = {
  id: 'omp',
  baselineVersion: '18.8.7',
  capabilities: {
    'session.start': { nativeEvent: 'session_start', context: true, continue: false, delivery: 'user message before the next prompt' },
    'tool.before': { nativeEvent: 'tool_call', context: true, continue: false, delivery: 'native additional context after the tool batch' },
    'tool.after': { nativeEvent: 'tool_result', context: true, continue: false, delivery: 'native additional context after the tool batch' },
    'turn.stop': { nativeEvent: 'session_stop', context: true, continue: true, delivery: 'user message in one native session_stop continuation' },
  },
  emit(config) {
    return {
      'extension.mjs': `import { fileURLToPath } from 'node:url';
import { runHooks } from './hook-runtime.mjs';

const config = ${JSON.stringify(config)};
const pluginRoot = fileURLToPath(new URL('.', import.meta.url));

export default function (pi) {
  const input = (event, ctx, extra = {}) => ({
    version: 1, event, harness: 'omp', cwd: ctx.cwd,
    sessionId: ctx.sessionManager.getSessionId(), ...extra,
  });

  if (config.hooks['session.start']?.length) {
    pi.on('session_start', async (event, ctx) => {
      const result = await runHooks(config, input('session.start', ctx, {
        reason: event.reason,
      }), pluginRoot);
      if (result.context) {
        pi.sendMessage({
          customType: 'plugnz:session.start', content: result.context, display: false,
        }, { deliverAs: 'nextTurn', triggerTurn: false });
      }
    });
  }

  if (config.hooks['tool.before']?.length) {
    pi.on('tool_call', async (event, ctx) => {
      const result = await runHooks(config, input('tool.before', ctx, {
        tool: { name: event.toolName, id: event.toolCallId, input: event.input },
      }), pluginRoot);
      if (result.context) return { additionalContext: result.context };
    });
  }

  if (config.hooks['tool.after']?.length) {
    pi.on('tool_result', async (event, ctx) => {
      const result = await runHooks(config, input('tool.after', ctx, {
        tool: {
          name: event.toolName, id: event.toolCallId, input: event.input,
          output: { content: event.content, details: event.details },
          isError: event.isError,
        },
      }), pluginRoot);
      if (result.context) return { additionalContext: result.context };
    });
  }

  if (config.hooks['turn.stop']?.length) {
    pi.on('session_stop', async (event, ctx) => {
      const result = await runHooks(config, input('turn.stop', ctx, {
        stop: { active: event.stop_hook_active === true },
      }), pluginRoot);
      if (result.continue && result.context) {
        return { continue: true, additionalContext: result.context };
      }
    });
  }
}
`,
    };
  },
};
