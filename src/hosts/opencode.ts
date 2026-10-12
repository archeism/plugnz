/** Read-only owned standalone-package catalog for OpenCode. */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { HostReader, InstalledPlugin, McpServerEntry } from '../host';
import { pathToFileURL } from 'node:url';
import { hookIdentityKey, listNativeHookPackages, type NativeHookStore } from '../native-hook-store';

const MARKER = '.plgnz-install.json';

export function opencodeRoot(): string {
  const explicit = process.env['OPEN_PLUGIN_OPENCODE_ROOT'];
  if (explicit) return resolve(explicit);
  if (process.env['OPEN_PLUGIN_HOME']) return join(process.env['OPEN_PLUGIN_HOME'], '.config', 'opencode');
  if (process.env['XDG_CONFIG_HOME']) return join(process.env['XDG_CONFIG_HOME'], 'opencode');
  return join(process.env['HOME'] || '.', '.config', 'opencode');
}
export function opencodePackagesDir(): string { return join(opencodeRoot(), '.plgnz', 'packages'); }
export function opencodeSkillsDir(): string { return join(opencodeRoot(), 'skills'); }
export function opencodeCommandsDir(): string { return join(opencodeRoot(), 'commands'); }

export const opencodeHookStore: NativeHookStore = {
  id: 'opencode', root: opencodeRoot,
  packages: () => join(opencodeRoot(), '.plgnz', 'hook-packages'),
  entryFile: 'plugin.mjs',
  registration: (id, entry) => ({
    kind: 'module', path: join(opencodeRoot(), 'plugins', 'plugnz-' + hookIdentityKey(id) + '.js'),
    content: 'export { default } from ' + JSON.stringify(pathToFileURL(entry).href) + ';\n',
  }),
};

export const opencode: HostReader = {
  id: 'opencode', gui: false,
  detect: () => existsSync(opencodeRoot()),
  stores: () => [opencodeHookStore.packages(), opencodePackagesDir(), opencodeSkillsDir(), opencodeCommandsDir()],
  listInstalled(): InstalledPlugin[] {
    const root = opencodePackagesDir();
    const hooks = listNativeHookPackages(opencodeHookStore);
    if (!existsSync(root)) return hooks;
    return [...hooks, ...readdirSync(root).flatMap(name => {
      const path = join(root, name);
      if (!lstatSync(path).isDirectory()) return [];
      const marker = join(path, MARKER);
      if (!existsSync(marker)) return [];
      let value: unknown;
      try { value = JSON.parse(readFileSync(marker, 'utf8')); } catch { throw new Error(`invalid OpenCode ownership marker: ${marker}`); }
      if (!isRecord(value) || typeof value.pluginId !== 'string') throw new Error(`invalid OpenCode ownership marker: ${marker}`);
      const at = value.pluginId.indexOf('@'); const plugin = at < 0 ? value.pluginId : value.pluginId.slice(0, at);
      return [{ id: value.pluginId, name: plugin, ...(at < 0 ? {} : { marketplace: value.pluginId.slice(at + 1) }), path, contentRoots: { package: path, skills: join(opencodeSkillsDir(), name), commands: join(opencodeCommandsDir(), plugin) }, enabled: true }];
    })];
  },
  mcpEntries: (): McpServerEntry[] => [],
};
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
