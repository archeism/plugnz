/** Pure byte projection shared by staging and historical precondition proof. */
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tomlCommandMarkdown } from '../conversion';
import { yamlParse } from '../yaml';
import { PORTABLE_AGENTS_FILE, planPortableAgents, type PortableAgent } from '../portable-agents';

declare const TextEncoder: { new (): { encode(value: string): Uint8Array } };
declare const TextDecoder: { new (): { decode(value: Uint8Array): string } };
export type ZcodeProjectionEntry = { kind: 'directory'; mode: number } | { kind: 'file'; mode: number; bytes: Uint8Array };
export type ZcodeProjectionTree = Map<string, ZcodeProjectionEntry>;
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

export function readZcodeProjectionTree(root: string): ZcodeProjectionTree {
  const tree: ZcodeProjectionTree = new Map();
  const walk = (path: string, prefix: string): void => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`ZCode projection contains symlink: ${path}`);
    if (!stat.isDirectory()) throw new Error(`ZCode projection root is not a directory: ${path}`);
    for (const name of readdirSync(path).sort()) {
      const file = join(path, name), key = prefix === '' ? name : `${prefix}/${name}`, child = lstatSync(file);
      if (child.isSymbolicLink()) throw new Error(`ZCode projection contains symlink: ${file}`);
      if (child.isDirectory()) { tree.set(key, { kind: 'directory', mode: child.mode & 0o777 }); walk(file, key); }
      else if (child.isFile()) tree.set(key, { kind: 'file', mode: child.mode & 0o777, bytes: (readFileSync as unknown as (file: string) => Uint8Array)(file) });
      else throw new Error(`ZCode projection contains special file: ${file}`);
    }
  };
  walk(root, ''); return tree;
}

function put(tree: ZcodeProjectionTree, path: string, entry: ZcodeProjectionEntry): void {
  const parts = path.split('/');
  for (let count = 1; count < parts.length; count++) {
    const parent = parts.slice(0, count).join('/');
    if (tree.get(parent)?.kind === 'file') throw new Error(`ZCode projection parent is a file: ${parent}`);
    if (!tree.has(parent)) tree.set(parent, { kind: 'directory', mode: 0o755 });
  }
  if (tree.get(path)?.kind === 'directory' && entry.kind === 'file') throw new Error(`ZCode projection replaces directory: ${path}`);
  tree.set(path, entry);
}
function text(tree: ZcodeProjectionTree, path: string): string {
  const entry = tree.get(path); if (entry?.kind !== 'file') throw new Error(`ZCode projection requires file: ${path}`);
  return decode(entry.bytes);
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function frontmatter(raw: string, label: string): { values: Record<string, unknown>; end: number } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
  if (match === null) throw new Error(`ZCode command or user-only skill needs YAML frontmatter: ${label}`);
  const values: unknown = yamlParse(match[1] ?? '');
  if (!object(values)) throw new Error(`ZCode YAML frontmatter must be a mapping: ${label}`);
  return { values, end: match[0].length };
}
function validateCommand(raw: string, label: string): void {
  const fm = frontmatter(raw, label);
  for (const key of Object.keys(fm.values)) if (!['description', 'argument-hint', 'disable-noninteractive', 'model', 'skills'].includes(key)) throw new Error(`ZCode unsupported command metadata ${key}: ${label}`);
  if (/(?:^|\n)\s*!|!`/u.test(raw.slice(fm.end))) throw new Error(`ZCode shell command expansion is unsupported: ${label}`);
}

/** ZCode's runtime parser strips quotes but does not decode YAML/JSON escapes. */
function nativeAgentScalar(value: string, field: string): string {
  const candidates = [JSON.stringify(value), `'${value}'`, value];
  for (const candidate of candidates) {
    if (/[\r\n]/u.test(candidate)) continue;
    try {
      const parsed = yamlParse(`value: ${candidate}`) as Record<string, unknown>;
      if (parsed.value !== value) continue;
    } catch { continue; }
    let raw = candidate.trim(), quote: string | undefined;
    for (let index = 0; index < raw.length; index++) {
      const char = raw[index];
      if ((char === '"' || char === "'") && raw[index - 1] !== '\\') {
        quote = quote === char ? undefined : (quote ?? char);
      }
      if (!quote && char === '#' && /\s/u.test(raw[index - 1] ?? '')) {
        raw = raw.slice(0, index).trimEnd(); break;
      }
    }
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
    if (raw === value) return candidate;
  }
  throw new Error(`ZCode portable agent ${field} cannot be represented losslessly by its native frontmatter parser`);
}

function renderZcodeAgent(agent: PortableAgent): string {
  const description = agent.description.replace(/\n/gu, '\\n');
  if (agent.description.includes('\\n') || agent.description.includes('\r') || description.trim() !== description) {
    throw new Error('ZCode portable agent description cannot preserve literal \\n, carriage returns, or surrounding whitespace');
  }
  const fields = [`name: ${nativeAgentScalar(agent.name, 'name')}`, `description: ${nativeAgentScalar(description, 'description')}`];
  if (agent.model !== undefined) {
    if (/[\r\n]/u.test(agent.model)) throw new Error('ZCode portable agent model must be single-line');
    fields.push(`model: ${nativeAgentScalar(agent.model, 'model')}`);
  }
  return `---\n${fields.join('\n')}\n---\n${agent.body}`;
}

/** ZCode silently inherits for malformed model strings; fail before installation instead. */
function validateAgentModel(model: string | undefined): void {
  if (model === undefined) return;
  const value = model.trim();
  let provider: string, name: string;
  if (value.startsWith('custom:')) {
    const body = value.slice('custom:'.length);
    const separator = body.startsWith('builtin:') ? body.indexOf(':', 'builtin:'.length) : body.indexOf(':');
    provider = separator < 0 ? '' : body.slice(0, separator);
    name = separator < 0 ? '' : body.slice(separator + 1);
    const decode = (part: string): string => { try { return decodeURIComponent(part); } catch { return part; } };
    provider = decode(provider); name = decode(name);
  } else {
    const separator = value.indexOf('/');
    provider = separator < 0 ? '' : value.slice(0, separator);
    name = separator < 0 ? '' : value.slice(separator + 1);
    // Native picker syntax treats an interior $ as a reasoning-level suffix.
    // Validate the model before that suffix; whitespace there otherwise causes
    // ZCode to discard the entire selection and silently inherit the parent.
    const reasoningSeparator = name.indexOf('$');
    if (reasoningSeparator > 0 && reasoningSeparator < name.length - 1) {
      name = name.slice(0, reasoningSeparator);
    }
  }
  if (!provider.trim() || !name.trim()) {
    throw new Error('ZCode portable agent model must be a native provider/model or custom: encoded selection; omit the mapping to inherit');
  }
}

export function projectZcodePayload(source: string, resourceLinks: string, nativeVersion: string): { payload: ZcodeProjectionTree; resources: ZcodeProjectionTree } {
  const payload = readZcodeProjectionTree(source), resources: ZcodeProjectionTree = new Map();
  const agents = planPortableAgents(source, 'zcode-cli');
  if (agents === null && (payload.has('agents') || payload.has('.claude/agents'))) {
    throw new Error('ZCode agents require the portable plugnz.agents.json contract');
  }
  if (agents !== null) payload.delete(PORTABLE_AGENTS_FILE);
  for (const agent of agents ?? []) {
    validateAgentModel(agent.model);
    put(payload, agent.path, { kind: 'file', mode: 0o644, bytes: encode(renderZcodeAgent(agent)) });
  }
  if (payload.has('.plgnz-install.json')) throw new Error('ZCode Source contains a reserved ownership marker');
  const manifest: unknown = JSON.parse(text(payload, 'plugin.json'));
  if (!object(manifest) || typeof manifest.name !== 'string') throw new Error('ZCode projection requires plugin.json name');
  const name = manifest.name;
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(name)) throw new Error(`ZCode unsafe plugin name: ${name}`);
  for (const key of ['hooks', 'mcpServers', 'agents', 'agent', 'executables']) if (Object.hasOwn(manifest, key)) throw new Error(`ZCode root plugin semantic is unsupported: ${key}`);
  // The projected manifest is regenerated. Never silently drop host declarations
  // while admitting a standard-file hook package (spec §8 client extensions).
  if (payload.has('.zcode-plugin/plugin.json')) {
    const native: unknown = JSON.parse(text(payload, '.zcode-plugin/plugin.json'));
    if (!object(native) || native.name !== name) throw new Error('ZCode native manifest identity differs from plugin.json');
    const metadata = new Set(['name', 'version', 'description', 'author', 'license', 'homepage', 'repository', 'keywords']);
    const conventional: Record<string, string> = { skills: 'skills', commands: 'commands', hooks: 'hooks/hooks.json', ...(agents === null ? {} : { agents: 'agents' }) };
    for (const [key, value] of Object.entries(native)) {
      if (metadata.has(key)) continue;
      const path = conventional[key];
      if (path !== undefined && (value === path || value === `./${path}`) && payload.has(path)) continue;
      throw new Error(`ZCode projection cannot preserve native manifest field: ${key}`);
    }
  }

  if (payload.has('hooks/hooks.json')) {
    const document: unknown = JSON.parse(text(payload, 'hooks/hooks.json'));
    if (!object(document) || !object(document.hooks)) throw new Error('ZCode hook document must contain hooks');
    for (const groups of Object.values(document.hooks)) {
      if (!Array.isArray(groups)) throw new Error('ZCode hook groups must be an array');
      for (const group of groups) {
        if (!object(group) || !Array.isArray(group.hooks)) throw new Error('ZCode hook group must contain hooks');
        for (const handler of group.hooks) {
          if (!object(handler) || handler.type !== 'command' || typeof handler.command !== 'string' || !handler.command.trim()) {
            throw new Error('ZCode projection requires command hooks');
          }
          // Qualified synchronous command envelope only. ZCode rejects or ignores
          // other option shapes; generic native-hook inventory is not its schema.
          for (const key of Object.keys(handler)) {
            if (!['type', 'command', 'timeout', 'async'].includes(key)) throw new Error(`ZCode hook option is unqualified: ${key}`);
          }
          if (handler.async !== undefined && handler.async !== false) throw new Error('ZCode asynchronous hook is unqualified');
          if (handler.timeout !== undefined && (typeof handler.timeout !== 'number' || !Number.isFinite(handler.timeout) || handler.timeout <= 0)) {
            throw new Error('ZCode command timeout must be positive seconds');
          }
        }
      }
    }
  }
  if (payload.has('commands')) {
    if (payload.get('commands')?.kind !== 'directory') throw new Error('ZCode commands path is not a directory');
    const commandTree = [...payload].filter(([path]) => path.startsWith('commands/'));
    payload.delete('commands');
    for (const [path] of commandTree) payload.delete(path);
    for (const [path, entry] of commandTree) {
      if (entry.kind === 'directory') continue;
      const siblingsHaveMarkdown = commandTree.some(([sibling, candidate]) => candidate.kind === 'file' && dirname(sibling) === dirname(path) && sibling.endsWith('.md'));
      if (path.endsWith('.toml') && siblingsHaveMarkdown) continue;
      // The historical writer wrote command text into a fresh regular file;
      // executable Source command permissions are not native command semantics.
      let projectedPath = path.slice('commands/'.length), bytes = entry.bytes, mode = 0o644;
      if (path.endsWith('.toml')) { const projected = tomlCommandMarkdown(join(source, path)); projectedPath = `${projectedPath.slice(0, -5)}.md`; bytes = encode(projected.text); mode = 0o644; }
      if (!projectedPath.endsWith('.md')) throw new Error(`ZCode command source must be Markdown: ${path}`);
      validateCommand(decode(bytes), path);
      put(payload, `commands/${name}/${projectedPath}`, { kind: 'file', bytes, mode });
    }
  }
  if (payload.has('skills')) {
    if (payload.get('skills')?.kind !== 'directory') throw new Error('ZCode skills path is not a directory');
    for (const [skillRoot, entry] of [...payload]) {
      if (!/^skills\/[^/]+$/u.test(skillRoot)) continue;
      if (entry.kind !== 'directory') throw new Error(`ZCode skill is not a directory: ${skillRoot}`);
      const skill = `${skillRoot}/SKILL.md`; if (!payload.has(skill)) continue;
      const raw = text(payload, skill), fm = frontmatter(raw, skill);
      const hidden = fm.values['disable-model-invocation'] ?? fm.values['disable_model_invocation'];
      const invocable = fm.values['user-invocable'] ?? fm.values['user_invocable'];
      if (hidden !== undefined && typeof hidden !== 'boolean') throw new Error(`ZCode disable-model-invocation must be boolean: ${skill}`);
      if (invocable !== undefined && typeof invocable !== 'boolean') throw new Error(`ZCode user-invocable must be boolean: ${skill}`);
      if (hidden !== true) continue;
      if (invocable === false) throw new Error(`ZCode cannot represent user-invocable: false as a command: ${skill}`);
      const commandName = typeof fm.values.name === 'string' ? fm.values.name : skillRoot.slice(7);
      if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(commandName)) throw new Error(`ZCode unsafe user-only skill name: ${commandName}`);
      const command = `commands/${name}/${commandName}.md`;
      if (payload.has(command)) throw new Error(`ZCode command collision for user-only skill ${commandName}`);
      for (const key of Object.keys(fm.values)) if (!['name', 'description', 'disable-model-invocation', 'disable_model_invocation', 'user-invocable', 'user_invocable', 'argument-hint', 'allowed-tools', 'disable-noninteractive', 'model', 'skills'].includes(key)) throw new Error(`ZCode unsupported user-only skill metadata ${key}: ${skill}`);
      put(resources, skillRoot, { kind: 'directory', mode: 0o755 });
      for (const [path, child] of [...payload]) if (path.startsWith(`${skillRoot}/`) && path !== skill) put(resources, path, child);
      const metadata = [`description: ${JSON.stringify(typeof fm.values.description === 'string' ? fm.values.description : commandName)}`];
      for (const key of ['argument-hint', 'allowed-tools', 'disable-noninteractive', 'model', 'skills']) {
        const value = fm.values[key]; if (value === undefined) continue;
        let formatted = JSON.stringify(value);
        if (key === 'argument-hint' && typeof value !== 'string') {
          if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error(`ZCode argument-hint must be text or text list: ${skill}`);
          formatted = `[${value.join(' ')}]`;
        }
        metadata.push(`${key}: ${formatted}`);
      }
      let body = raw.slice(fm.end); validateCommand(`---\n${metadata.join('\n')}\n---\n${body}`, skill);
      if (/\]\s*\[[^\]]+\]/u.test(body)) throw new Error(`ZCode unsupported reference-style Markdown link: ${skill}`);
      const spans: string[] = [];
      body = body.replace(/(`+)([\s\S]*?)\1/gu, all => { spans.push(all); return `\u0000${spans.length - 1}\u0000`; });
      body = body.replace(/(!?\[[^\]]*\])\(([^)\s]+)(\s+[^)]*)?\)/gu, (all, label: string, target: string, suffix: string | undefined) => {
        if (/^(?:https?:|mailto:|#)/iu.test(target)) return all;
        if (target.startsWith('/') || target.includes('\\')) throw new Error(`ZCode unsupported absolute resource reference: ${skill}`);
        const rel = relative(resolve(source, skillRoot), resolve(source, skillRoot, target));
        if (rel === '' || rel.startsWith('..') || resources.get(`${skillRoot}/${rel}`)?.kind !== 'file') throw new Error(`ZCode resource reference escapes or is missing: ${skill} (${target})`);
        return `${label}(${join(resourceLinks, skillRoot, rel)}${suffix ?? ''})`;
      }).replace(/\u0000(\d+)\u0000/gu, (_, index: string) => spans[Number(index)] ?? '');
      put(payload, command, { kind: 'file', mode: 0o644, bytes: encode(`---\n${metadata.join('\n')}\n---\n${body}`) });
      for (const path of payload.keys()) if (path === skillRoot || path.startsWith(`${skillRoot}/`)) payload.delete(path);
    }
  }
  const nativeManifest: Record<string, unknown> = { name, version: nativeVersion };
  if (agents !== null) nativeManifest.agents = 'agents';
  for (const key of ['description', 'author', 'license']) if (typeof manifest[key] === 'string') nativeManifest[key] = manifest[key];
  if ([...payload.keys()].some(path => /^skills\/[^/]+\/SKILL.md$/u.test(path))) nativeManifest.skills = 'skills';
  if ([...payload.keys()].some(path => path.startsWith('commands/') && path.endsWith('.md'))) nativeManifest.commands = 'commands';
  put(payload, '.zcode-plugin/plugin.json', { kind: 'file', mode: 0o644, bytes: encode(`${JSON.stringify(nativeManifest, null, 2)}\n`) });
  return { payload, resources };
}
