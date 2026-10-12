import type { HookAdapter } from '../hooks';

// Pi v1.1.0 (abe508e1b89912adde45528136c3221eb69acdd7).
// agent_before_settle is actionable; agent_end/agent_settled are notifications.
export const hookAdapter: HookAdapter = {
  id: 'pi',
  baselineVersion: '1.1.0',
  capabilities: {
    'session.start': { nativeEvent: 'session_start', context: true, continue: false, delivery: 'user message before the next prompt' },
    'tool.before': { nativeEvent: 'tool_call', context: true, continue: false, delivery: 'user message after the tool batch' },
    'tool.after': { nativeEvent: 'tool_result', context: true, continue: false, delivery: 'text appended to the native tool result' },
    'turn.stop': { nativeEvent: 'agent_before_settle', context: true, continue: true, delivery: 'user message in one native agent_before_settle continuation' },
  },
  emit(config) {
    return {
      'extension.mjs': `import { fileURLToPath } from 'node:url';
import { runHooks } from './hook-runtime.mjs';

const config = ${JSON.stringify(config)};
const pluginRoot = fileURLToPath(new URL('.', import.meta.url));

export default function (pi) {
  let stopActive = false;
  const input = (event, ctx, extra = {}) => ({
    version: 1, event, harness: 'pi', cwd: ctx.cwd,
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
      if (result.context) {
        // Context-only messages flush after all results, preserving tool-call/result pairing.
        pi.sendMessage({
          customType: 'plugnz:tool.before', content: result.context, display: false,
        }, { triggerTurn: false });
      }
    });
  }

  if (config.hooks['tool.after']?.length) {
    pi.on('tool_result', async (event, ctx) => {
      const result = await runHooks(config, input('tool.after', ctx, {
        tool: {
          name: event.toolName, id: event.toolCallId, input: event.input,
          output: {
            content: event.content, details: event.details,
            structuredContent: event.structuredContent, usage: event.usage,
          },
          isError: event.isError,
        },
      }), pluginRoot);
      if (result.context) {
        // Pi clears structuredContent when content is replaced without returning it.
        return {
          content: [...event.content, { type: 'text', text: result.context }],
          structuredContent: event.structuredContent,
        };
      }
    });
  }

  if (config.hooks['turn.stop']?.length) {
    // Native continuations do not rerun before_agent_start. A new user prompt does.
    pi.on('before_agent_start', () => { stopActive = false; });
    pi.on('agent_before_settle', async (event, ctx) => {
      const result = await runHooks(config, input('turn.stop', ctx, {
        stop: { active: stopActive },
      }), pluginRoot);
      if (result.continue && result.context) {
        stopActive = true;
        return {
          entries: [...event.entries, {
            type: 'custom_message', customType: 'plugnz:turn.stop',
            content: result.context, display: false,
          }],
          continue: true,
        };
      }
    });
  }
}
`,
    };
  },
};
