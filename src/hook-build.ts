import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOOK_CONFIG_FILE, readHookConfig, validateHookConfig, type HookAdapter, type HookConfig } from './hooks';
import { hookAdapter as claudeCode } from './hosts/claude-code-hooks';
import { hookAdapter as codex } from './hosts/codex-hooks';
import { hookAdapter as omp } from './hosts/omp-hooks';
import { hookAdapter as pi } from './hosts/pi-hooks';
import { hookAdapter as opencode } from './hosts/opencode-hooks';
import { hookAdapter as zcodeCli } from './hosts/zcode-cli-hooks';

export const hookAdapters: readonly HookAdapter[] = [claudeCode, codex, omp, pi, opencode, zcodeCli];
const RUNTIME_FILE = 'hook-runtime.mjs';
let developmentRuntime: string | undefined;

export interface HookBuildTarget {
  id: string;
  path: string;
  files: string[];
}
export interface HookBuildResult {
  version: 1;
  outputDir: string;
  targets: HookBuildTarget[];
}

/** The same core source is bundled in development and in the published distribution. */
export function hookRuntimeSource(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const source = join(moduleDir, 'hooks.ts');
  if (existsSync(source) && process.versions['bun']) {
    if (developmentRuntime !== undefined) return developmentRuntime;
    const built = spawnSync(process.execPath, ['build', source, '--target=node', '--format=esm'], {
      encoding: 'buffer', timeout: 60_000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024,
    });
    const output = new TextDecoder().decode(built.stdout);
    if (built.status !== 0 || !output.trim()) {
      throw new Error('Cannot bundle hook runtime: ' + new TextDecoder().decode(built.stderr).trim());
    }
    developmentRuntime = output;
    return output;
  }
  for (const path of [join(moduleDir, RUNTIME_FILE), join(moduleDir, '..', 'dist', RUNTIME_FILE)]) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  throw new Error('Hook runtime is missing from the distribution; rebuild with bun run build');
}

function entryExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return false;
    throw error;
  }
}

function artifactPath(root: string, path: string): string {
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new Error('Unsafe generated hook artifact path: ' + path);
  }
  const file = join(root, path);
  let current = root;
  for (const part of path.split('/').slice(0, -1)) {
    current = join(current, part);
    if (entryExists(current) && (lstatSync(current).isSymbolicLink() || !lstatSync(current).isDirectory())) {
      throw new Error('Generated hook artifact parent is not an owned directory: ' + current);
    }
  }
  return file;
}

/**
 * Add native hook files to a caller-owned stage. The host prepares native metadata;
 * every generated-file collision is checked before writing generated artifacts.
 */
export function emitHooksToDirectory(adapter: HookAdapter, configValue: HookConfig, stagingRoot: string): string[] {
  const config = validateHookConfig(configValue);
  const root = resolve(stagingRoot);
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error('Hook staging root must be a directory');
  adapter.prepare?.(root);
  const artifacts = adapter.emit(config);
  if (Object.prototype.hasOwnProperty.call(artifacts, RUNTIME_FILE)) throw new Error('Adapter cannot replace the shared hook runtime');
  artifacts[RUNTIME_FILE] = hookRuntimeSource();
  const paths = Object.keys(artifacts).sort();
  for (const path of paths) {
    if (typeof artifacts[path] !== 'string') throw new Error('Generated hook artifact must be text: ' + path);
    const file = artifactPath(root, path);
    if (entryExists(file)) throw new Error('Refusing to overwrite authored hook artifact: ' + file);
    if (paths.some(other => other !== path && other.startsWith(path + '/'))) throw new Error('Generated hook file conflicts with a directory: ' + path);
  }
  for (const path of paths) {
    const file = artifactPath(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, artifacts[path]!);
  }
  return paths;
}

function copyAuthoredTree(source: string, destination: string, top = true): void {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source).sort()) {
    if (name === '.git' || (top && name === HOOK_CONFIG_FILE)) continue;
    const from = join(source, name);
    const to = join(destination, name);
    const stat = lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error('Hook source symlinks are unsupported: ' + from);
    if (stat.isDirectory()) copyAuthoredTree(from, to, false);
    else if (stat.isFile()) cpSync(from, to);
    else throw new Error('Hook source contains a non-file resource: ' + from);
  }
}

/** Resolve through existing ancestors so a symlinked output parent cannot recurse into source. */
function prospectivePath(path: string): string {
  const suffix: string[] = [];
  let parent = resolve(path);
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent) throw new Error('Cannot resolve output ancestor: ' + path);
    suffix.unshift(relative(next, parent));
    parent = next;
  }
  return join(realpathSync(parent), ...suffix);
}

/** Compile a source once per selected native adapter; publish only a complete output tree. */
export function buildHooks(pluginDir: string, targets: readonly string[], outputDir: string): HookBuildResult {
  const requestedSource = resolve(pluginDir);
  if (!existsSync(requestedSource) || lstatSync(requestedSource).isSymbolicLink() || !lstatSync(requestedSource).isDirectory()) {
    throw new Error('Hook source must be a directory: ' + requestedSource);
  }
  const source = realpathSync(requestedSource);
  const config = readHookConfig(source);
  if (config === undefined) throw new Error('Hook source requires ' + HOOK_CONFIG_FILE);
  if (targets.length === 0) throw new Error('hooks build requires at least one --target');
  if (new Set(targets).size !== targets.length) throw new Error('Duplicate hook target');
  const adapters = targets.map(id => {
    const adapter = hookAdapters.find(item => item.id === id);
    if (adapter === undefined) throw new Error('Unknown hook target: ' + id);
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(adapter.id)) throw new Error('Unsafe hook target id');
    return adapter;
  });
  const output = resolve(outputDir);
  const physicalOutput = prospectivePath(output);
  if (physicalOutput === source || physicalOutput.startsWith(source + '/')) throw new Error('Hook output must be outside the plugin source');
  if (entryExists(output) && (lstatSync(output).isSymbolicLink() || !lstatSync(output).isDirectory() || readdirSync(output).length !== 0)) {
    throw new Error('Hook output must be absent or an empty directory: ' + output);
  }
  mkdirSync(dirname(output), { recursive: true });
  const stage = mkdtempSync(join(dirname(output), '.plugnz-hooks-build-'));
  try {
    const built: HookBuildTarget[] = [];
    for (const adapter of adapters) {
      const target = join(stage, adapter.id);
      copyAuthoredTree(source, target);
      const files = emitHooksToDirectory(adapter, config, target);
      built.push({ id: adapter.id, path: join(output, adapter.id), files });
    }
    renameSync(stage, output);
    return { version: 1, outputDir: output, targets: built };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
