/** Read-only Pi standalone-skill catalog (Pi 0.80.10; docs/hosts/pi.md). */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { listNativeHookPackages, type NativeHookStore } from '../native-hook-store';

const MARKER = '.plgnz-install.json';

export function skillsDir(): string { return join(piRoot(), 'skills'); }

/** Pi root: host override, isolated open-plugin home, then the user's home. */
export function piRoot(): string {
  const explicit = process.env['OPEN_PLUGIN_PI_ROOT'];
  if (explicit && explicit.length > 0) return resolve(explicit);
  const native = process.env['PI_CODING_AGENT_DIR'];
  if (!process.env['OPEN_PLUGIN_HOME'] && native) return resolve(native);
  const home = process.env['OPEN_PLUGIN_HOME'] || process.env['HOME'] || '.';
  return join(home, '.pi', 'agent');
}

function owner(dir: string): { pluginId: string } | null {
  const file = join(dir, MARKER);
  if (!existsSync(file)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`invalid Pi ownership marker: ${file}`);
    const pluginId = (value as Record<string, unknown>).pluginId;
    if (typeof pluginId !== 'string') throw new Error(`invalid Pi ownership marker: ${file}`);
    return { pluginId };
  } catch (error) { if (error instanceof Error && error.message.startsWith('invalid Pi ownership marker:')) throw error; throw new Error(`invalid Pi ownership marker: ${file}`); }
}

export const piHookStore: NativeHookStore = {
  id: 'pi', root: piRoot,
  packages: () => join(piRoot(), '.plgnz', 'hook-packages'),
  entryFile: 'extension.mjs',
  registration: (_id, entry) => ({ kind: 'json-array', path: join(piRoot(), 'settings.json'), field: 'extensions', entry }),
};

export const pi: HostReader = {
  id: 'pi', gui: false,
  detect: () => existsSync(piRoot()),
  stores: () => [piHookStore.packages(), skillsDir()],
  listInstalled(): InstalledPlugin[] {
    const result: InstalledPlugin[] = listNativeHookPackages(piHookStore);
    if (!existsSync(skillsDir())) return result;
    for (const entry of readdirSync(skillsDir())) {
      const dir = join(skillsDir(), entry);
      if (!lstatSync(dir).isDirectory()) continue;
      const marker = owner(dir);
      if (marker === null) continue; // User-owned standalone skills are never claimed.
      const at = marker.pluginId.indexOf('@');
      result.push({ id: marker.pluginId, name: at === -1 ? marker.pluginId : marker.pluginId.slice(0, at), ...(at === -1 ? {} : { marketplace: marker.pluginId.slice(at + 1) }), path: dir, enabled: true });
    }
    return result;
  },
  mcpEntries: (): McpServerEntry[] => [],
};
