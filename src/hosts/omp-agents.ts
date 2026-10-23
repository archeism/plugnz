/** OMP native task agents: project portable agents into the extension package. */
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { planPortableAgents, renderPortableAgentMarkdown, PORTABLE_AGENTS_FILE } from '../portable-agents';
import { yamlParse } from '../yaml';

function invalid(message: string): never {
  throw new Error(`Invalid OMP agents: ${message}`);
}

/**
 * OMP discovers `agents/*.md` directly from every enabled extension root and
 * deduplicates first-wins across roots, so bare portable names could silently
 * shadow user or bundled agents. Every generated agent therefore carries the
 * public plugin namespace in its native `name` (`<plugin>:<agent>`); OMP's
 * parser accepts the colon form and matches agents by that exact string.
 * Portable metadata stays out of the generated package: the rendered Markdown
 * holds name, description and the resolved model only, and the sidecar is
 * removed. Returns false when the package has no portable agents, leaving
 * native `agents/*.md` semantics untouched.
 */
export function projectOmpAgents(source: string, stage: string, namespace: string): boolean {
  const agents = planPortableAgents(source, 'omp');
  if (agents === null) return false;
  if (resolve(source) === resolve(stage)) invalid('source and stage must be distinct');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(namespace)) invalid('namespace must be a plugin identifier');
  const agentsDirectory = join(stage, 'agents');
  if (!existsSync(agentsDirectory) || !statSync(agentsDirectory).isDirectory()) invalid('staged agents must be a regular directory');
  for (const agent of agents) {
    writeFileSync(join(stage, agent.path), renderPortableAgentMarkdown({ ...agent, name: `${namespace}:${agent.name}` }));
  }
  rmSync(join(stage, PORTABLE_AGENTS_FILE), { force: true });
  return true;
}

export interface OmpAgentIdentityRoots {
  /** Native user-scope agents directory, `~/.omp/agent/agents`. */
  userAgents: string;
  /** Enabled extension package roots discovered through the node_modules plugin farm. */
  packageRoots: readonly string[];
  /** Persisted user `extensions:` directories, which outrank installed packages. */
  configuredExtensions: readonly string[];
  /** This plugin's managed package directory; its own agents are excluded. */
  ownedRoot: string;
}

function canonicalPath(path: string): string {
  try { return realpathSync(path); }
  catch { return resolve(path); }
}

function agentNames(directory: string): Array<{ name: string; path: string }> {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
  const names: Array<{ name: string; path: string }> = [];
  for (const entry of readdirSync(directory).sort()) {
    if (!entry.endsWith('.md')) continue;
    const path = join(directory, entry);
    let raw: string;
    try { raw = readFileSync(path, 'utf8'); } catch { continue; }
    const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
    if (match === null) continue;
    let name: unknown;
    try {
      const parsed: unknown = yamlParse(match[1]!);
      name = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>)['name'] : undefined;
    } catch {
      name = /^name:\s*(\S+)\s*$/m.exec(match[1]!)?.[1];
    }
    if (typeof name === 'string' && name.trim()) names.push({ name: name.trim(), path });
  }
  return names;
}

/**
 * OMP discovery merges every enabled extension root and keeps the first agent
 * for a name, so a namespace alone cannot prevent shadowing. Refuse to install
 * when another user-scope or enabled-package agent already owns an identity
 * this package would generate, including the same plugin name from a different
 * marketplace. Project-scope `.omp/agents` is session-relative and not
 * install-time observable, so it is outside this guard.
 */
export function assertOmpAgentIdentitiesAvailable(source: string, namespace: string, roots: OmpAgentIdentityRoots): void {
  const agents = planPortableAgents(source, 'omp');
  if (agents === null) return;
  const wanted = new Set(agents.map(agent => `${namespace}:${agent.name}`));
  const collisions: string[] = [];
  const inspect = (directory: string, label: string): void => {
    for (const entry of agentNames(directory)) {
      if (wanted.has(entry.name)) collisions.push(`${entry.name} from ${label} (${entry.path})`);
    }
  };
  inspect(roots.userAgents, 'user agents');
  const owned = canonicalPath(roots.ownedRoot);
  const foreign = (root: string): boolean => canonicalPath(root) !== owned;
  for (const root of roots.configuredExtensions) {
    if (foreign(root)) inspect(join(root, 'agents'), 'configured extension');
  }
  for (const root of roots.packageRoots) {
    if (foreign(root)) inspect(join(root, 'agents'), 'enabled package');
  }
  if (collisions.length > 0) {
    throw new Error(`OMP agent identity collision (native discovery is first-wins); refusing to shadow: ${collisions.join(', ')}`);
  }
}
