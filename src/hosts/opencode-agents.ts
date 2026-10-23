/**
 * OpenCode portable agents project into the owned plugin store: the generated
 * plugin's `config(cfg)` hook registers `<plugin>:<agent>` roles with the exact
 * authored prompt, the resolved model (or no model), and native default tools.
 * Verified against OpenCode 1.19.0 (config hooks run before Agent.state).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createCapabilityEvidenceProfile, type CapabilityEvidenceProfile } from '../capability-evidence';
import { readHookOwner } from '../native-hook-store';
import type { NativeHookAgentProjection } from '../native-hook-writer';
import { planPortableAgents, PORTABLE_AGENTS_FILE, type PortableAgent } from '../portable-agents';
import type { PluginSource, ResolvedSource } from '../source';
import { opencodeHookStore, opencodeRoot } from './opencode';

/** OpenCode's built-in agent identities in 1.19.0; never overwritten by a projection. */
const BUILTIN_AGENTS = ['build', 'compaction', 'explore', 'general', 'plan', 'summary', 'title'];
const MANIFESTS = ['plugin.json', '.plugin/plugin.json', '.claude-plugin/plugin.json'];
/** Execution-semantics manifest fields this route cannot project; inert author
 * metadata (author, license, homepage, repository, keywords, $schema) ships verbatim. */
const MANIFEST_SEMANTICS = ['hooks', 'mcpServers', 'agents', 'agent', 'executables', 'extensions', 'commands', 'skills'];

function fail(message: string): never {
  throw new Error('Invalid OpenCode portable agents: ' + message);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Manifests keep identity and inert metadata; execution semantics must refuse. */
function validateManifests(root: string): void {
  for (const path of MANIFESTS) {
    const absolute = join(root, path);
    if (!existsSync(absolute)) continue;
    let value: unknown;
    try { value = JSON.parse(readFileSync(absolute, 'utf8')); }
    catch { fail('malformed manifest ' + path); }
    if (!record(value)) fail('manifest must be an object: ' + path);
    for (const field of Object.keys(value)) {
      if (MANIFEST_SEMANTICS.includes(field)) fail('manifest field ' + field + ' has execution semantics the agent route does not project (' + path + ')');
    }
  }
}

/** OpenCode parses `<provider>/<model>`; empty segments fail at execution time. */
function validateModels(agents: readonly PortableAgent[]): void {
  for (const agent of agents) {
    const model = agent.model;
    if (model === undefined) continue;
    if (/[\u0000-\u001f\u007f]/u.test(model) || model !== model.trim()) fail(agent.path + ' model must be a single line without surrounding whitespace');
    const slash = model.indexOf('/');
    if (slash <= 0 || slash === model.length - 1) fail(agent.path + ' model must be <provider>/<model>: ' + model);
    const provider = model.slice(0, slash), id = model.slice(slash + 1);
    if (provider.trim() !== provider || id.trim() !== id) fail(agent.path + ' model segments must not have surrounding whitespace: ' + model);
  }
}

/** Strip JSONC comments and trailing commas; strings are tracked byte-for-byte. */
function stripJsonc(raw: string): string {
  const uncomments: string[] = [];
  let index = 0;
  while (index < raw.length) {
    const char = raw[index]!;
    if (char === '"') {
      let end = index + 1;
      while (end < raw.length) {
        if (raw[end] === '\\') { end += 2; continue; }
        if (raw[end] === '"') { end += 1; break; }
        end += 1;
      }
      uncomments.push(raw.slice(index, end));
      index = end;
      continue;
    }
    if (char === '/' && raw[index + 1] === '/') {
      while (index < raw.length && raw[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && raw[index + 1] === '*') {
      index += 2;
      while (index < raw.length && !(raw[index] === '*' && raw[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    uncomments.push(char);
    index += 1;
  }
  const text = uncomments.join('');
  const result: string[] = [];
  for (let position = 0; position < text.length; position += 1) {
    const char = text[position]!;
    if (char === '"') {
      let end = position + 1;
      while (end < text.length) {
        if (text[end] === '\\') { end += 2; continue; }
        if (text[end] === '"') { end += 1; break; }
        end += 1;
      }
      result.push(text.slice(position, end));
      position = end - 1;
      continue;
    }
    if (char === ',') {
      let next = position + 1;
      while (next < text.length && /\s/u.test(text[next]!)) next += 1;
      if (text[next] === ']' || text[next] === '}') continue;
    }
    result.push(char);
  }
  return result.join('');
}

/** Parse a user config we do not own; unprovable collisions refuse installation. */
function userConfig(path: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(stripJsonc(readFileSync(path, 'utf8'))); }
  catch { fail('cannot parse user config to prove role names are free: ' + path); }
  if (!record(value)) fail('user config must be a JSON object: ' + path);
  return value;
}

/** The name OpenCode derives for a Markdown agent/mode file in a config directory. */
function markdownEntryNames(root: string, directory: string, recursive: boolean): string[] {
  const names: string[] = [];
  const visit = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current)) {
      const absolute = join(current, entry);
      const relativePath = prefix === '' ? entry : prefix + '/' + entry;
      const stat = statSync(absolute);
      if (stat.isDirectory()) { if (recursive) visit(absolute, relativePath); continue; }
      if (!stat.isFile() || !entry.endsWith('.md')) continue;
      names.push(relativePath.slice(0, -3));
      const raw = readFileSync(absolute, 'utf8');
      const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
      if (match === null) continue;
      const declared = /^\s*name\s*:\s*(?:"([^"\n]+)"|'([^'\n]+)'|([^#\n]+?))\s*$/mu.exec(match[1]!);
      if (declared !== null) {
        const value = (declared[1] ?? declared[2] ?? declared[3] ?? '').trim();
        if (value !== '') names.push(value);
      }
    }
  };
  const directoryPath = join(root, directory);
  if (isDirectory(directoryPath)) visit(directoryPath, '');
  return names;
}

/** Fail before mutation when a planned role would overwrite user or other-package state. */
function preflightCollisions(plugin: PluginSource, agents: readonly PortableAgent[]): void {
  const planned = agents.map(agent => plugin.name + ':' + agent.name);
  const root = opencodeRoot();
  for (const file of ['config.json', 'opencode.json', 'opencode.jsonc']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const value = userConfig(path);
    for (const field of ['agent', 'mode']) {
      const table = value[field];
      if (table === undefined) continue;
      if (!record(table)) fail('user config ' + field + ' must be an object: ' + path);
      for (const role of planned) {
        if (Object.hasOwn(table, role)) fail('user OpenCode config already defines ' + role + ': ' + path);
      }
    }
  }
  const names = [
    ...markdownEntryNames(root, 'agent', true),
    ...markdownEntryNames(root, 'agents', true),
    ...markdownEntryNames(root, 'mode', false),
    ...markdownEntryNames(root, 'modes', false),
  ];
  for (const role of planned) {
    if (names.includes(role)) fail('a user OpenCode agent or mode file already claims ' + role + ': ' + root);
  }
  const packages = opencodeHookStore.packages();
  if (!existsSync(packages)) return;
  for (const name of readdirSync(packages)) {
    if (!/^[0-9a-f]{32}$/u.test(name)) continue;
    const path = join(packages, name);
    if (!lstatSync(path).isDirectory()) continue;
    const owner = readHookOwner(path);
    if (owner === null || owner.pluginId === plugin.name + '@' + (plugin.marketplace ?? 'local')) continue;
    if (owner.pluginId.slice(0, owner.pluginId.indexOf('@')) === plugin.name) {
      fail('plugin namespace ' + plugin.name + ' is already installed by ' + owner.pluginId + '; two packages cannot claim the same native role namespace');
    }
    for (const role of owner.agents ?? []) {
      if (planned.includes(role)) fail('native role ' + role + ' is already installed by ' + owner.pluginId);
    }
  }
}

/** Copy authored bytes once; the source sidecar and Git metadata never ship. */
function copyAuthored(root: string, destination: string, top = true): void {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(root).sort()) {
    if (name === '.git' || (top && name === PORTABLE_AGENTS_FILE)) continue;
    const from = join(root, name), to = join(destination, name);
    const stat = lstatSync(from);
    if (stat.isSymbolicLink()) fail('source symlinks are unsupported: ' + from);
    if (stat.isDirectory()) copyAuthored(from, to, false);
    else if (stat.isFile()) cpSync(from, to);
    else fail('source contains a non-file resource: ' + from);
  }
}

/** Portable metadata is stripped from shipped Markdown; the model lives in the plugin. */
function renderAgent(agent: PortableAgent): string {
  return '---\nname: ' + JSON.stringify(agent.name) + '\ndescription: ' + JSON.stringify(agent.description) + '\n---\n' + agent.body;
}

/**
 * Validate all planned roles before writing any, so one foreign name cannot
 * partially register the package. Duplicate loads of our own identical entries
 * are idempotent; anything else refuses without mutating cfg.
 */
function pluginSource(agents: readonly PortableAgent[], namespace: string): string {
  const roles = agents.map(agent => ({
    name: namespace + ':' + agent.name,
    description: agent.description,
    prompt: agent.body,
    ...(agent.model === undefined ? {} : { model: agent.model }),
  }));
  return `const ROLES = ${JSON.stringify(roles)};
const BUILTIN = ${JSON.stringify(Object.fromEntries(BUILTIN_AGENTS.map(name => [name, true])))};
const entry = (role) => ({
  description: role.description,
  prompt: role.prompt,
  mode: 'subagent',
  ...(role.model === undefined ? {} : { model: role.model }),
});
export default function plugnzAgents() {
  return {
    config(cfg) {
      const agent = cfg.agent ?? (cfg.agent = {});
      const pending = [];
      for (const role of ROLES) {
        if (Object.hasOwn(BUILTIN, role.name)) {
          throw new Error('plugnz opencode agent collision: ' + role.name + ' is a built-in agent');
        }
        const value = entry(role);
        if (Object.hasOwn(agent, role.name)) {
          if (JSON.stringify(agent[role.name]) === JSON.stringify(value)) continue;
          throw new Error('plugnz opencode agent collision: ' + role.name + ' already exists; refusing to overwrite it');
        }
        pending.push([role.name, value]);
      }
      for (const [name, value] of pending) agent[name] = value;
    },
  };
}
`;
}

function compileAgents(plugin: PluginSource, agents: readonly PortableAgent[], output: string): string {
  const source = resolve(plugin.dir), root = resolve(output);
  const inside = relative(source, root);
  if (root === source || (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside))) fail('compiled output must be outside the plugin source');
  if (existsSync(root)) fail('compiled output must be absent: ' + root);
  if (!isDirectory(source)) fail('source must be a directory: ' + source);
  copyAuthored(realpathSync(source), root);
  for (const agent of agents) writeFileSync(join(root, agent.path), renderAgent(agent));
  if (existsSync(join(root, opencodeHookStore.entryFile))) fail('source reserves ' + opencodeHookStore.entryFile + ' for the generated plugin');
  writeFileSync(join(root, opencodeHookStore.entryFile), pluginSource(agents, plugin.name));
  return root;
}

const profile: CapabilityEvidenceProfile = createCapabilityEvidenceProfile({
  host: 'opencode',
  detectedVersion: '1.19.0',
  packageFormat: 'portable-agents',
  agentPolicy: 'portable-native',
  sourceTypes: ['local', 'git'],
  operations: ['install', 'update'],
  route: 'managed',
  operationStatus: 'supported',
  semantics: {
    'ordinary-skills': 'unsupported',
    mcp: 'unsupported',
    hooks: 'unsupported',
    commands: 'unsupported',
    agents: 'supported',
    'model-invocation-control': 'unsupported',
    'user-invocation-control': 'unsupported',
    'auto-update-control': 'supported',
    resources: 'supported',
    'permissions-preprocessing': 'unsupported',
    retirement: 'supported',
    'retention-safety': 'supported',
    readback: 'supported',
    rollback: 'supported',
    'activation-reload': 'supported',
    'reversible-disable': 'unsupported',
  },
  hookPolicy: null,
  evidence: ['docs/portable-agents.md', 'docs/evidence/opencode-portable-agents-20261022.md'],
});

export const opencodeAgents: NativeHookAgentProjection = {
  profile,
  plan: (plugin: PluginSource) => planPortableAgents(plugin.dir, 'opencode'),
  preflight(plugin: PluginSource, _resolved: ResolvedSource, agents: readonly PortableAgent[]) {
    validateManifests(plugin.dir);
    validateModels(agents);
    preflightCollisions(plugin, agents);
  },
  compile(plugin: PluginSource, _resolved: ResolvedSource, agents: readonly PortableAgent[], output: string) {
    return compileAgents(plugin, agents, output);
  },
};
