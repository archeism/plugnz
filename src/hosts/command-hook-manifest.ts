import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const IDENTITY_FIELDS = ['name', 'version', 'description'];
function manifest(path: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error('Cannot read hook plugin manifest ' + path + ': ' + (error as Error).message); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Hook plugin manifest must be an object: ' + path);
  const value = parsed as Record<string, unknown>;
  if (typeof value['name'] !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value['name'])) throw new Error('Hook plugin manifest has an invalid native plugin name: ' + path);
  for (const field of ['version', 'description']) {
    if (value[field] !== undefined && (typeof value[field] !== 'string' || (value[field] as string).includes('\0'))) throw new Error('Hook plugin manifest ' + field + ' must be a string: ' + path);
  }
  return value;
}

/** Only translates identity in the generated stage; other root semantics need an explicit native projection. */
export function prepareCommandHookManifest(stagingRoot: string, relativeNativePath: string, removeRoot: boolean): void {
  const rootPath = join(stagingRoot, 'plugin.json');
  const nativePath = join(stagingRoot, relativeNativePath);
  const root = existsSync(rootPath) ? manifest(rootPath) : undefined;
  if (root) {
    const unsupported = Object.keys(root).find(key => !IDENTITY_FIELDS.includes(key));
    if (unsupported) throw new Error('Hook build cannot project root plugin.json field "' + unsupported + '"; use an explicit native plugin manifest');
  }
  const native = existsSync(nativePath) ? manifest(nativePath) : undefined;
  if (!native && !root) throw new Error('Hook build requires a plugin identity in plugin.json or ' + relativeNativePath);
  if (native) {
    for (const key of IDENTITY_FIELDS) {
      if (root?.[key] !== undefined && native[key] !== root[key]) throw new Error('Conflicting hook plugin manifest identity: ' + key);
    }
    if (native['hooks'] !== undefined && native['hooks'] !== './hooks/hooks.json' && native['hooks'] !== 'hooks/hooks.json') {
      throw new Error('Hook build cannot merge a custom native hooks route');
    }
  } else {
    mkdirSync(dirname(nativePath), { recursive: true });
    writeFileSync(nativePath, JSON.stringify(root, null, 2) + '\n');
  }
  // Codex gives root plugin.json precedence; remove only this validated identity projection.
  if (removeRoot && root) rmSync(rootPath);
}
