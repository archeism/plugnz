import type { HookAdapter } from '../hooks';

/**
 * OpenCode 1.19.0 plugin API and consumers:
 * https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/plugin/src/index.ts
 * https://github.com/anomalyco/opencode/blob/733b2c627e5aec39cb33cc22373bdce33053ef2c/packages/opencode/src/session/tools.ts
 * session.idle is an asynchronous notification, not an awaited stop gate.
 */
export const hookAdapter: HookAdapter = {
  id: 'opencode',
  baselineVersion: '1.19.0',
  capabilities: {
    'session.start': { nativeEvent: 'experimental.chat.system.transform', context: true, continue: false, delivery: 'Awaited before the first model request; cached per session in the plugin instance and included in its system context.' },
    'turn.stop': { nativeEvent: 'session.idle', context: false, continue: false, delivery: 'session.idle notification: checks only. Feedback and continuation are unsupported.' },
    'tool.before': { nativeEvent: 'tool.execute.before', context: true, continue: false, delivery: 'Handler runs before execution; context reaches the next model request with the tool result, or through system context when execution fails.' },
    'tool.after': { nativeEvent: 'tool.execute.after', context: true, continue: false, delivery: 'Append context to successful native or MCP tool results; preserve existing content and metadata.' },
  },
  emit(config) {
    return {
      'plugin.mjs': `import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHooks } from './hook-runtime.mjs';

const config = ${JSON.stringify(config)};
const pluginRoot = dirname(fileURLToPath(import.meta.url));

export default async function plugnzHooks({ directory }) {
  const starts = new Map();
  const before = new Map();
  const active = new Set();

  const input = (event, sessionId, extra = {}) => ({
    version: 1, event, harness: 'opencode', sessionId, cwd: directory, ...extra,
  });
  const report = (error) => {
    console.error('[plugnz hooks: opencode] ' + (error instanceof Error ? error.message : String(error)));
  };
  const startup = (sessionId) => {
    if (!starts.has(sessionId)) {
      const pending = runHooks(config, input('session.start', sessionId, { reason: 'first-model-request' }), pluginRoot);
      starts.set(sessionId, pending);
      pending.catch(() => { if (starts.get(sessionId) === pending) starts.delete(sessionId); });
    }
    return starts.get(sessionId);
  };
  const pendingFor = (sessionId) => {
    if (!before.has(sessionId)) before.set(sessionId, new Map());
    return before.get(sessionId);
  };

  return {
    'chat.message': async ({ sessionID }) => {
      active.add(sessionID);
    },
    'experimental.chat.system.transform': async ({ sessionID }, output) => {
      // Auxiliary model requests without a session do not start a conversation.
      if (!sessionID) return;
      const result = await startup(sessionID);
      if (result.context) output.system.push(result.context);
      // Failed tools may have no after callback. Deliver their pre-tool context
      // at the next request instead of attaching it to another tool call.
      const pending = before.get(sessionID);
      if (pending?.size) {
        for (const context of pending.values()) output.system.push(context);
        pending.clear();
      }
    },
    'tool.execute.before': async ({ tool, sessionID, callID }, output) => {
      const result = await runHooks(config, input('tool.before', sessionID, {
        tool: { name: tool, id: callID, input: output.args },
      }), pluginRoot);
      if (result.context) pendingFor(sessionID).set(callID, result.context);
    },
    'tool.execute.after': async ({ tool, sessionID, callID, args }, output) => {
      const result = await runHooks(config, input('tool.after', sessionID, {
        tool: {
          name: tool, id: callID, input: args,
          output: typeof output.output === 'string' ? output.output : output.content,
          ...(typeof output.isError === 'boolean' ? { isError: output.isError } : {}),
        },
      }), pluginRoot);
      const pending = before.get(sessionID);
      const context = [pending?.get(callID), result.context].filter(Boolean).join('\\n\\n');
      if (!context) return;
      // Built-in tools and the MCP path pass different native result shapes.
      if (typeof output.output === 'string') output.output += '\\n\\n' + context;
      else if (Array.isArray(output.content)) output.content = [...output.content, { type: 'text', text: context }];
      else throw new Error('plugnz hooks: unsupported OpenCode tool result shape; context was not delivered');
      pending?.delete(callID);
    },
    event: async ({ event }) => {
      const sessionId = event.properties?.sessionID ?? event.properties?.info?.id;
      if (!sessionId) return;
      if (event.type === 'session.deleted') {
        starts.delete(sessionId);
        before.delete(sessionId);
        active.delete(sessionId);
        return;
      }
      if (event.type === 'session.status' && event.properties.status?.type === 'busy') active.add(sessionId);
      if (event.type !== 'session.idle' || !active.delete(sessionId)) return;
      try {
        const result = await runHooks(config, input('turn.stop', sessionId, { stop: { active: false } }), pluginRoot);
        if (result.context || result.continue) {
          throw new Error('OpenCode session.idle cannot deliver stop feedback or continue a turn; return {} from this check');
        }
      } catch (error) {
        // The native event dispatcher does not await this callback.
        // Catch explicitly to report failures without an unhandled rejection.
        report(error);
      }
    },
  };
}
`,
    };
  },
};
