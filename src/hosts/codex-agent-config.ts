import { parse } from 'smol-toml';

export interface CodexAgentConfigRef {
  name: string;
  configFile: string;
}

/**
 * Plan native role registration without taking ownership of any other config.
 * Prior refs are ownership evidence, not permission to overwrite edited tables.
 * Missing owned refs can be repaired. A newly claimed name always conflicts with
 * an existing entry, even if its value happens to match the requested path.
 * Only our canonical two-line table representation can be edited or removed.
 * Call with next/prior reversed to roll back an applied edit while preserving
 * unrelated edits; the caller must separately recognize an unapplied operation.
 */
export function planCodexAgentConfig(
  configText: string,
  priorRefs: readonly CodexAgentConfigRef[],
  nextRefs: readonly CodexAgentConfigRef[],
): string {
  const before = parse(configText) as Record<string, unknown>;
  const prior = references(priorRefs);
  const next = references(nextRefs);
  const names = new Set([...prior.keys(), ...next.keys()]);
  if (names.size === 0) return configText;
  const agents = table(before.agents);
  if (Object.hasOwn(before, 'agents') && !agents) throw new Error('Codex agents config must be a table');
  const lines = scanLines(configText);
  const removed = new Set<number>();
  const additions: CodexAgentConfigRef[] = [];

  for (const name of names) {
    const previous = prior.get(name);
    const desired = next.get(name);
    const present = agents !== null && Object.hasOwn(agents, name);
    if (present) {
      if (!previous) throw new Error(`Codex agent ${name} already exists outside plugnz ownership`);
      const current = table(agents[name]);
      if (!current || Object.keys(current).length !== 1 || current.config_file !== previous.configFile) {
        throw new Error(`Codex agent ${name} was modified; refusing to overwrite its config`);
      }
      const ownedLines = canonicalTableLines(lines, previous);
      if (desired?.configFile === previous.configFile) continue;
      for (const index of ownedLines) removed.add(index);
    }
    if (desired) additions.push(desired);
  }

  let result = lines.filter((_, index) => !removed.has(index)).map((line) => line.raw).join('');
  const newline = configText.includes('\r\n') ? '\r\n' : '\n';
  for (const ref of additions) {
    if (result.length > 0 && !result.endsWith('\n')) result += newline;
    if (result.length > 0 && !result.endsWith(newline + newline)) result += newline;
    result += `[agents.${JSON.stringify(ref.name)}]${newline}config_file = ${JSON.stringify(ref.configFile)}${newline}`;
  }

  // The lexer only identifies safe byte spans; the TOML parser proves the edit.
  const expected = parse(configText) as Record<string, unknown>;
  const expectedAgents: Record<string, unknown> = table(expected.agents) ?? {};
  for (const name of prior.keys()) delete expectedAgents[name];
  for (const ref of next.values()) Object.defineProperty(expectedAgents, ref.name, {
    value: { config_file: ref.configFile }, enumerable: true, configurable: true, writable: true,
  });
  expected.agents = expectedAgents;
  const actual = parse(result) as Record<string, unknown>;
  if (!sameValue(normalizeEmptyAgents(expected), normalizeEmptyAgents(actual))) {
    throw new Error('Codex agent config edit would change unrelated settings');
  }
  return result;
}

function references(refs: readonly CodexAgentConfigRef[]): Map<string, CodexAgentConfigRef> {
  const result = new Map<string, CodexAgentConfigRef>();
  for (const ref of refs) {
    if (!ref.name.trim() || !ref.configFile.trim() || /[\u0000-\u001f\u007f]/u.test(ref.name + ref.configFile)) {
      throw new Error('Codex agent refs require nonblank names and paths without control characters');
    }
    if (result.has(ref.name)) throw new Error(`Duplicate Codex agent ref: ${ref.name}`);
    result.set(ref.name, ref);
  }
  return result;
}

function table(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

interface Line { raw: string; text: string; header: boolean; }

/** Track strings and value nesting so transcript text cannot masquerade as TOML tables. */
function scanLines(text: string): Line[] {
  const lines: Line[] = [];
  let multiline: '"' | "'" | null = null;
  let depth = 0;
  for (const raw of text.match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
    const line = raw.replace(/\r?\n$/u, '');
    const header = multiline === null && depth === 0 && line.trimStart().startsWith('[');
    lines.push({ raw, text: line, header });
    if (header) continue;
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (multiline) {
        if (multiline === '"' && ch === '\\') { i++; continue; }
        if (line.slice(i, i + 3) === multiline.repeat(3)) {
          const closing = multiline;
          multiline = null;
          i += 2;
          // TOML permits one or two quotes before the three closing quotes.
          while (line[i + 1] === closing) i++;
        }
        continue;
      }
      if (quote) {
        if (quote === '"' && ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '#') break;
      if (ch === '"' || ch === "'") {
        if (line.slice(i, i + 3) === ch.repeat(3)) { multiline = ch; i += 2; }
        else quote = ch;
      } else if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
    }
  }
  return lines;
}

function canonicalTableLines(lines: Line[], ref: CodexAgentConfigRef): number[] {
  const header = `[agents.${JSON.stringify(ref.name)}]`;
  const starts = lines.flatMap((line, index) => line.header && line.text === header ? [index] : []);
  if (starts.length !== 1) throw new Error(`Codex agent ${ref.name} has noncanonical config; refusing to edit`);
  const start = starts[0]!;
  let end = start + 1;
  while (end < lines.length && !lines[end]!.header) end++;
  const content: number[] = [];
  for (let index = start + 1; index < end; index++) {
    const text = lines[index]!.text.trim();
    if (text && !text.startsWith('#')) content.push(index);
  }
  if (content.length !== 1 || lines[content[0]!]!.text !== `config_file = ${JSON.stringify(ref.configFile)}`) {
    throw new Error(`Codex agent ${ref.name} has noncanonical config; refusing to edit`);
  }
  return [start, content[0]!];
}

function normalizeEmptyAgents(config: Record<string, unknown>): Record<string, unknown> {
  const agents = table(config.agents);
  if (agents && Object.keys(agents).length === 0) delete config.agents;
  return config;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.toISOString() === right.toISOString();
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  const a = table(left);
  const b = table(right);
  return a !== null && b !== null && Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}
