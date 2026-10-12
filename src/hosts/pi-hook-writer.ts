import { createNativeHookWriter, probeHookHostVersion } from '../native-hook-writer';
import { pi, piHookStore } from './pi';
import { piWriter } from './pi-writer';
import { hookAdapter } from './pi-hooks';

export const piHookWriter = createNativeHookWriter({
  reader: pi, store: piHookStore, adapter: hookAdapter,
  probeVersion: () => probeHookHostVersion('pi', 'OPEN_PLUGIN_PI_BIN'),
  legacyRemove: (id, options) => piWriter.remove(id, options),
});
