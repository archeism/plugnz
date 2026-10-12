import { createNativeHookWriter, probeHookHostVersion } from '../native-hook-writer';
import { opencode, opencodeHookStore } from './opencode';
import { opencodeWriter } from './opencode-writer';
import { hookAdapter } from './opencode-hooks';

export const opencodeHookWriter = createNativeHookWriter({
  reader: opencode, store: opencodeHookStore, adapter: hookAdapter,
  probeVersion: () => probeHookHostVersion('opencode', 'OPEN_PLUGIN_OPENCODE_BIN'),
  legacyRemove: (id, options) => opencodeWriter.remove(id, options),
});
