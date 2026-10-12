/** Compile only caller-owned stages. The authored Source and its provenance stay intact. */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildHooks, emitHooksToDirectory } from './hook-build';
import { HOOK_CONFIG_FILE, readHookConfig, type HookAdapter } from './hooks';

/** Exercise the actual compiler before semantic admission or native mutation. */
export function preflightPortableHooks(adapter: HookAdapter, source: string): void {
  if (readHookConfig(source) === undefined) return;
  const temporary = mkdtempSync(join(tmpdir(), 'plugnz-hook-preflight-'));
  try { buildHooks(source, [adapter.id], join(temporary, 'compiled')); }
  finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function compilePortableHooksInStage(
  adapter: HookAdapter,
  stage: string,
  options: { nativeManifestPrepared?: boolean; retainCanonicalIdentity?: boolean } = {},
): boolean {
  const config = readHookConfig(stage);
  if (config === undefined) return false;
  // Codex gives a root plugin.json precedence over its native plugin manifest.
  // Retain canonical identity for plugnz's existing readback, then let the adapter
  // remove the competing root manifest from this generated stage only.
  if (options.retainCanonicalIdentity && existsSync(join(stage, 'plugin.json'))) {
    const identity = join(stage, '.plugin', 'plugin.json');
    if (!existsSync(identity)) {
      mkdirSync(join(stage, '.plugin'), { recursive: true });
      cpSync(join(stage, 'plugin.json'), identity);
    }
  }
  emitHooksToDirectory(options.nativeManifestPrepared ? { ...adapter, prepare: undefined } : adapter, config, stage);
  rmSync(join(stage, HOOK_CONFIG_FILE));
  return true;
}

/** The OMP writer owns package metadata; add the generated extension to that projection. */
export function registerProjectedExtension(stage: string, key: string, entry: string): void {
  const file = join(stage, 'package.json');
  const value = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const current = value[key];
  if (current !== undefined && (current === null || typeof current !== 'object' || Array.isArray(current))) {
    throw new Error('Native extension metadata must be an object: ' + key);
  }
  value[key] = { ...(current as Record<string, unknown> | undefined), extensions: [entry] };
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
