import { commandHookAdapter } from './command-hooks';
import { prepareCommandHookManifest } from './command-hook-manifest';

/** Released Codex 0.161.0 parser/consumer at 979011409: synchronous trusted command hooks. */
const adapter = commandHookAdapter({
  id: 'codex',
  baselineVersion: '0.161.0',
  nativeEvents: {
    'session.start': ['SessionStart'],
    'tool.before': ['PreToolUse'],
    'tool.after': ['PostToolUse'],
    'turn.stop': ['Stop'],
  },
  contextDelivery: 'developer context; post-success only on qualified native routes',
  stopOutputSource: "{ decision: 'block', reason: result.context }",
});

export function prepareHookPlugin(stagingRoot: string): void {
  prepareCommandHookManifest(stagingRoot, '.codex-plugin/plugin.json', true);
}

export const hookAdapter = { ...adapter, prepare: prepareHookPlugin };
