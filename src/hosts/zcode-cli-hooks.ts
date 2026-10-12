import { commandHookAdapter } from './command-hooks';
import { prepareCommandHookManifest } from './command-hook-manifest';

/** ZCode CLI 0.16.9 aac4755: Claude-compatible envelopes; explicit native Stop continuation. */
const adapter = commandHookAdapter({
  id: 'zcode-cli',
  baselineVersion: '0.16.9',
  nativeEvents: {
    'session.start': ['SessionStart'],
    'tool.before': ['PreToolUse'],
    'tool.after': ['PostToolUse', 'PostToolUseFailure'],
    'turn.stop': ['Stop'],
  },
  contextDelivery: 'startup user context; pre/post context appended to native tool result',
  stopOutputSource: "{ continue: true, hookSpecificOutput: { hookEventName: 'Stop', additionalContext: result.context } }",
});

export function prepareHookPlugin(stagingRoot: string): void {
  prepareCommandHookManifest(stagingRoot, '.zcode-plugin/plugin.json', false);
}

export const hookAdapter = { ...adapter, prepare: prepareHookPlugin };
