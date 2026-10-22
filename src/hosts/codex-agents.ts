/** Codex's native role configuration is TOML, not plugin agent Markdown. */
import { lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, stringify } from 'smol-toml';
import { planPortableAgents, planPromptResourceAgents, PORTABLE_AGENTS_FILE } from '../portable-agents';

export const CODEX_AGENTS_INDEX = '.plgnz-codex-agents.json';
export interface CodexAgentRegistration {
  name: string;
  /** Relative to the installed plugin root. */
  path: string;
  description: string;
}

function invalid(message: string): never {
  throw new Error(`Invalid Codex agents: ${message}`);
}
function stat(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path); }
  catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
}
function regularFile(path: string): string {
  if (!stat(path)?.isFile()) invalid(`${path} must be a regular file`);
  return readFileSync(path, 'utf8');
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
}

/**
 * Source is immutable; stage is its existing private copy. Keep original Markdown
 * for documentation links and add native TOML roles with deterministic names.
 * Captured alias overrides have already been merged into the frozen sidecar.
 */
export function projectCodexAgents(source: string, stage: string, namespace: string): boolean {
  if (stat(join(source, CODEX_AGENTS_INDEX)) !== undefined) invalid(`${CODEX_AGENTS_INDEX} is reserved for generated registrations`);
  const agents = planPortableAgents(source, 'codex') ?? planPromptResourceAgents(source);
  if (agents === null) return false;
  if (resolve(source) === resolve(stage)) invalid('source and stage must be distinct');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(namespace)) invalid('namespace must be a plugin identifier');
  if (!stat(join(stage, 'agents'))?.isDirectory()) invalid('staged agents must be a regular directory');
  if (stat(join(stage, CODEX_AGENTS_INDEX)) !== undefined) invalid(`${CODEX_AGENTS_INDEX} already exists in stage`);
  // Validate every output before writing any: a collision must not partially project.
  const outputs = agents.map(agent => {
    const registration = { name: `${namespace}:${agent.name}`, path: `agents/${agent.name}.toml`, description: agent.description };
    if (stat(join(source, registration.path)) !== undefined || stat(join(stage, registration.path)) !== undefined) {
      invalid(`${registration.path} collides with a generated agent`);
    }
    const content = stringify({
      name: registration.name,
      description: agent.description,
      developer_instructions: agent.body,
      ...(agent.model === undefined ? {} : { model: agent.model }),
    });
    return { registration, content };
  });
  for (const output of outputs) writeFileSync(join(stage, output.registration.path), output.content);
  writeFileSync(join(stage, CODEX_AGENTS_INDEX), `${JSON.stringify({ version: 1, agents: outputs.map(output => output.registration) }, null, 2)}\n`);
  rmSync(join(stage, PORTABLE_AGENTS_FILE), { force: true });
  return true;
}

/** Read only generated registrations; legacy plugin resources are not native roles. */
export function readCodexAgents(root: string): CodexAgentRegistration[] {
  const indexPath = join(root, CODEX_AGENTS_INDEX);
  if (stat(indexPath) === undefined) return [];
  let index: unknown;
  try { index = JSON.parse(regularFile(indexPath)); }
  catch (error) { invalid(`cannot read ${CODEX_AGENTS_INDEX}: ${error instanceof Error ? error.message : String(error)}`); }
  if (!record(index) || index['version'] !== 1 || !Array.isArray(index['agents']) || index['agents'].length === 0
    || Object.keys(index).some(key => !['version', 'agents'].includes(key))) invalid('invalid registration index');
  if (!stat(join(root, 'agents'))?.isDirectory()) invalid('agents must be a regular directory');
  const names = new Set<string>();
  const paths = new Set<string>();
  return index['agents'].map((entry: unknown) => {
    if (!record(entry) || !text(entry['name']) || !text(entry['path']) || !text(entry['description'])
      || Object.keys(entry).some(key => !['name', 'path', 'description'].includes(key))) invalid('invalid registration entry');
    const match = /^[a-zA-Z0-9][a-zA-Z0-9._-]*:([a-z][a-z0-9-]*)$/.exec(entry['name']);
    if (match === null || entry['path'] !== `agents/${match[1]}.toml`) invalid(`invalid registration path or name: ${entry['name']}`);
    if (names.has(entry['name']) || paths.has(entry['path'])) invalid('duplicate registration');
    names.add(entry['name']); paths.add(entry['path']);
    const native = parse(regularFile(join(root, entry['path'])));
    if (native['name'] !== entry['name'] || native['description'] !== entry['description'] || !text(native['developer_instructions'])
      || (Object.hasOwn(native, 'model') && !text(native['model']))
      || Object.keys(native).some(key => !['name', 'description', 'developer_instructions', 'model'].includes(key))) {
      invalid(`native role does not match registration: ${entry['name']}`);
    }
    return { name: entry['name'], path: entry['path'], description: entry['description'] };
  });
}
