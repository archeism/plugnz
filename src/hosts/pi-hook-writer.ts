import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readHookConfig } from '../hooks';
import { PORTABLE_AGENTS_FILE, planPortableAgents } from '../portable-agents';
import type { PluginSource } from '../source';
import { createNativeHookWriter, probeHookHostVersion } from '../native-hook-writer';
import { pi, piHookStore } from './pi';
import { piWriter } from './pi-writer';
import { hookAdapter } from './pi-hooks';

const AGENTS = 'agents';

/**
 * Pi has no qualified native portable-agent projection (docs/research/
 * portable-agent-parity-20261022/extensions.md). The owner's scope decision is
 * to ignore the authored agent component loudly instead of failing: a mixed
 * package still installs its portable hooks, and an agents-only package is
 * reported as skipped with no native write. The authored contract is still
 * validated by planPortableAgents, so malformed definitions keep failing.
 */
export const piHookWriter = createNativeHookWriter({
  reader: pi, store: piHookStore, adapter: hookAdapter,
  probeVersion: () => probeHookHostVersion('pi', 'OPEN_PLUGIN_PI_BIN'),
  legacyRemove: (id, options) => piWriter.remove(id, options),
  ignoredComponents(plugin: PluginSource) {
    if (planPortableAgents(plugin.dir, 'pi') === null) return [];
    const id = `${plugin.name}@${plugin.marketplace ?? 'local'}`;
    const mixed = readHookConfig(plugin.dir) !== undefined;
    return [{
      component: AGENTS,
      warning: mixed
        ? `WARNING (pi): portable agent definitions in '${id}' are NOT installed on this target — Pi has no qualified native portable-agent projection. Portable agents are excluded; only the portable hooks are eligible for installation. plugnz does not write agent files or native agent registrations.`
        : `WARNING (pi): portable agent definitions in '${id}' are NOT installed on this target — Pi has no qualified native portable-agent projection. Portable agents are excluded and no other deliverable component is present, so plugnz treats this package as skipped (not failed). plugnz does not write agent files, native agent registrations, extensions, or dependencies.`,
    }];
  },
  pruneIgnored(compiled, ignored) {
    if (!ignored.some(item => item.component === AGENTS)) return;
    rmSync(join(compiled, 'agents'), { recursive: true, force: true });
    rmSync(join(compiled, PORTABLE_AGENTS_FILE), { force: true });
  },
});
