/** Portable agent authoring is opt-in; native packages keep their existing semantics. */
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { yamlParse } from './yaml';

export const PORTABLE_AGENTS_FILE = 'plugnz.agents.json';
export type ModelAliases = Record<string, Record<string, string>>;
export interface PortableAgent {
  /** Package-relative source path, also used for the generated Markdown file. */
  path: string;
  name: string;
  description: string;
  /** Exact bytes after the closing frontmatter delimiter, decoded as UTF-8. */
  body: string;
  /** Absent means the destination's model field must be absent. */
  model?: string;
}
export interface PortableAgentOverrides {
  /** Each supplied target mapping replaces the package's mapping for that alias. */
  modelAliases?: ModelAliases;
}

function invalid(label: string, message: string): never {
  throw new Error(`Invalid portable agents: ${label}: ${message}`);
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(label, 'must be an object');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(label, `unsupported field "${key}"`);
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) invalid(label, 'must be a nonblank string without NUL');
  return value;
}
function identifier(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result)) invalid(label, 'must be an identifier');
  return result;
}
function models(value: unknown, label: string): Record<string, string> {
  return Object.fromEntries(Object.entries(object(value, label)).map(([key, value]) => [
    identifier(key, `${label} target`), text(value, `${label}.${key}`),
  ]));
}
function aliases(value: unknown, label: string): ModelAliases {
  return Object.fromEntries(Object.entries(object(value, label)).map(([key, value]) => [
    identifier(key, `${label} alias`), models(value, `${label}.${key}`),
  ]));
}
function own<T>(value: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(value, key) ? value[key] : undefined;
}
function stat(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path); }
  catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
}
function readFile(path: string, label: string): string {
  if (!stat(path)?.isFile()) invalid(label, 'must be a regular file (symlinks are not supported)');
  return readFileSync(path, 'utf8');
}
function parseYaml(raw: string, label: string): Record<string, unknown> {
  try { return object(yamlParse(raw), label); }
  catch (error) { invalid(label, error instanceof Error ? error.message : String(error)); }
}

export interface PortableAgentConfig { version: 1; modelAliases: ModelAliases }

/** Strict JSON authoring configuration, shared with immutable source snapshots. */
export function parsePortableAgentConfig(raw: string, label = PORTABLE_AGENTS_FILE): PortableAgentConfig {
  try { JSON.parse(raw); }
  catch (error) { invalid(label, error instanceof Error ? error.message : String(error)); }
  const config = parseYaml(raw, label);
  fields(config, ['version', 'modelAliases'], label);
  if (config['version'] !== 1) invalid(label, 'version must be 1');
  return { version: 1, modelAliases: config['modelAliases'] === undefined ? {} : aliases(config['modelAliases'], `${label}.modelAliases`) };
}

function rejectNestedDefinitions(directory: string, relative: string): void {
  for (const file of readdirSync(directory)) {
    const child = join(directory, file);
    const label = `${relative}/${file}`;
    const entry = stat(child);
    if (entry?.isDirectory()) rejectNestedDefinitions(child, label);
    else if (file.endsWith('.md')) invalid(label, 'portable agent definitions must be immediate agents/*.md files');
    else if (entry?.isSymbolicLink()) invalid(label, 'symlinked agent resources are not supported');
  }
}

/**
 * Read and validate the authored package without mutating it. No sidecar means
 * native semantics, represented by null. Direct model > alias mapping > omission.
 * This resolves model strings only; adapters own native registration and rendering.
 */
export function planPortableAgents(root: string, target: string, overrides: PortableAgentOverrides = {}): PortableAgent[] | null {
  const configPath = join(root, PORTABLE_AGENTS_FILE);
  if (stat(configPath) === undefined) return null;
  identifier(target, 'target');
  const config = parsePortableAgentConfig(readFile(configPath, PORTABLE_AGENTS_FILE));
  const packageAliases = config.modelAliases;
  const overrideObject = object(overrides, 'overrides');
  fields(overrideObject, ['modelAliases'], 'overrides');
  const overrideAliases = overrideObject['modelAliases'] === undefined ? {} : aliases(overrideObject['modelAliases'], 'overrides.modelAliases');
  const directory = join(root, 'agents');
  if (!stat(directory)?.isDirectory()) invalid('agents', 'must be a directory (symlinks are not supported)');
  // Native hidden agent roots would otherwise bypass this projection entirely.
  for (const entry of readdirSync(root)) {
    const rootEntry = stat(join(root, entry));
    if (entry.startsWith('.') && (rootEntry?.isDirectory() || rootEntry?.isSymbolicLink()) && stat(join(root, entry, 'agents')) !== undefined) {
      invalid(`${entry}/agents`, 'cannot coexist with portable agents; use canonical agents/*.md');
    }
  }
  for (const entry of readdirSync(directory)) {
    const agentEntry = stat(join(directory, entry));
    if (agentEntry?.isDirectory()) rejectNestedDefinitions(join(directory, entry), `agents/${entry}`);
    else if (agentEntry?.isSymbolicLink() && !entry.endsWith('.md')) invalid(`agents/${entry}`, 'symlinked agent resources are not supported');
  }
  const paths = readdirSync(directory).filter(path => path.endsWith('.md')).sort();
  if (paths.length === 0) invalid('agents', 'must contain at least one Markdown agent');
  const names = new Set<string>();
  return paths.map(file => {
    const path = `agents/${file}`;
    const raw = readFile(join(directory, file), path);
    const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
    if (match === null) invalid(path, 'requires YAML frontmatter');
    const metadata = parseYaml(match[1]!, path);
    fields(metadata, ['name', 'description', 'modelAlias', 'models'], path);
    const name = text(metadata['name'], `${path}.name`);
    if (!/^[a-z][a-z0-9-]*$/.test(name)) invalid(`${path}.name`, 'must start with a lowercase letter and contain only lowercase letters, digits, or hyphens');
    if (file !== `${name}.md`) invalid(`${path}.name`, 'must match the Markdown filename');
    if (names.has(name)) invalid(path, `duplicate agent name "${name}"`);
    names.add(name);
    const description = text(metadata['description'], `${path}.description`);
    const body = text(raw.slice(match[0].length), `${path} instructions`);
    const alias = metadata['modelAlias'] === undefined ? undefined : identifier(metadata['modelAlias'], `${path}.modelAlias`);
    const direct = metadata['models'] === undefined ? {} : models(metadata['models'], `${path}.models`);
    const defaults = alias === undefined ? {} : own(packageAliases, alias) ?? {};
    const replacements = alias === undefined ? {} : own(overrideAliases, alias) ?? {};
    const model = own(direct, target) ?? own(replacements, target) ?? own(defaults, target);
    return { path, name, description, body, ...(model === undefined ? {} : { model }) };
  });
}

/** The common native Markdown shape; no portable metadata leaks into the host. */
export function renderPortableAgentMarkdown(agent: PortableAgent): string {
  const fields = [`name: ${JSON.stringify(agent.name)}`, `description: ${JSON.stringify(agent.description)}`];
  if (agent.model !== undefined) fields.push(`model: ${JSON.stringify(agent.model)}`);
  return `---\n${fields.join('\n')}\n---\n${agent.body}`;
}
