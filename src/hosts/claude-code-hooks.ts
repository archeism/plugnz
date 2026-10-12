import { commandHookAdapter } from './command-hooks';
import { prepareCommandHookManifest } from './command-hook-manifest';

/** Claude official command hooks: context envelope; Stop continuation uses block + reason. */
const adapter = commandHookAdapter({
  id: 'claude-code',
  baselineVersion: '2.1.285',
  nativeEvents: {
    'session.start': ['SessionStart'],
    'tool.before': ['PreToolUse'],
    'tool.after': ['PostToolUse', 'PostToolUseFailure'],
    'turn.stop': ['Stop'],
  },
  contextDelivery: 'native additionalContext; post success and executed failure',
  stopOutputSource: "{ decision: 'block', reason: result.context }",
});

export function prepareHookPlugin(stagingRoot: string): void {
  prepareCommandHookManifest(stagingRoot, '.claude-plugin/plugin.json', false);
}

export const hookAdapter = { ...adapter, prepare: prepareHookPlugin };
