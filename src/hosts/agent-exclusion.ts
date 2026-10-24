/**
 * Owner-approved loud agent exclusion for hosts with no qualified native
 * agent projection (docs/portable-agents.md): the authored agent component is
 * ignored loudly instead of failing the package. Malformed agent declarations
 * still fail inside the semantic inventory, and a package only skips when every
 * remaining install semantic is supported — an unsupported remainder reports as
 * a mixed refusal whose admission names that unrelated semantic instead of
 * hiding it behind the agents gap.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CapabilityEvidenceProfile } from '../capability-evidence';
import { CompatibilityError } from '../compatibility';
import type { AddDisposition, IgnoredAddComponent } from '../host';
import { createLifecycleReason } from '../lifecycle-report';
import { PORTABLE_AGENTS_FILE } from '../portable-agents';
import {
  inventoryPackageSemantics,
  inventoryWithoutIgnoredComponents,
  requiredSemanticsForOperation,
  SemanticInventoryError,
  type PackageSemantic,
} from '../semantic-inventory';
import type { PluginSource } from '../source';

const AGENTS = 'agents';
const AGENT_ROOTS = ['agents', join('.claude', 'agents')] as const;

/** Authored semantics that keep a package mixed: each is still delivered subject to the host's own admission. */
const DELIVERABLE_SEMANTICS: readonly PackageSemantic[] = ['ordinary-skills', 'mcp', 'hooks', 'commands'];

export interface AgentExclusionSurface {
  /** Host id used in warnings and refusals. */
  readonly host: string;
  /** Public native identity used in warnings. */
  readonly nativeId: (plugin: PluginSource) => string;
  /** Fixed install profile consulted when nothing except ignored agents remains. */
  readonly installProfile: CapabilityEvidenceProfile;
  /** Absolute target-native manifest paths this host projects; validated read-only before any skip. */
  readonly nativeManifests?: (plugin: PluginSource) => readonly string[];
  /** Validate native declarations read-only; true means a native-only component remains deliverable. */
  readonly inspectNativeManifest?: (plugin: PluginSource) => boolean;
}

function ignoredAgents(surface: AgentExclusionSurface, plugin: PluginSource, mixed: boolean): IgnoredAddComponent {
  const id = surface.nativeId(plugin);
  return {
    component: AGENTS,
    warning: mixed
      ? `WARNING (${surface.host}): agent definitions in '${id}' are NOT installed on this target — plugnz has no qualified native agent projection for ${surface.host}. Agents are excluded; only the other supported components are eligible for installation. plugnz does not write agent files or native agent registrations.`
      : `WARNING (${surface.host}): agent definitions in '${id}' are NOT installed on this target — plugnz has no qualified native agent projection for ${surface.host}. Agents are excluded and no other deliverable component is present, so plugnz treats this package as skipped (not failed). plugnz does not write agent files, native agent registrations, extensions, or dependencies.`,
  };
}

/**
 * Adapter-owned component disposition (src/host.ts): `undefined` keeps the
 * ordinary admission path. A malformed package throws `SemanticInventoryError`
 * from the inventory, so invalid Source input still fails instead of skipping.
 */
export function agentExclusionDisposition(surface: AgentExclusionSurface, plugin: PluginSource): AddDisposition | undefined {
  const inventory = inventoryPackageSemantics(plugin);
  if (!inventory.requiredSemantics.includes(AGENTS) && inventory.portableAgents !== true) return undefined;
  let hasNativeComponents = false;
  // A skip never stages, so every recognized and target-native manifest is
  // validated read-only here: malformed bytes and native agent declarations
  // fail as invalid Source instead of riding a successful skip.
  try {
    assertNoAgentManifestDeclarations(surface.host, [
      ...inventory.manifestPaths.map((path) => join(plugin.dir, path)),
      ...(surface.nativeManifests?.(plugin) ?? []),
    ]);
    hasNativeComponents = surface.inspectNativeManifest?.(plugin) ?? false;
  } catch (error) {
    const diagnostic = error instanceof Error && error.message.trim() !== '' ? error.message : String(error);
    throw new SemanticInventoryError(createLifecycleReason('usage', 'usage.invalid-argument', diagnostic));
  }
  const stripped = inventoryWithoutIgnoredComponents(inventory, [AGENTS]);
  if (hasNativeComponents || stripped.requiredSemantics.some((semantic) => DELIVERABLE_SEMANTICS.includes(semantic))) {
    return { ignored: [ignoredAgents(surface, plugin, true)], skip: false };
  }
  // Nothing is deliverable, so no native route gates the skip. An unsupported
  // remainder keeps its loud refusal: report as mixed so admission on the
  // stripped inventory names that unrelated semantic as the failure.
  const undeliverable = requiredSemanticsForOperation(stripped, 'install')
    .find((semantic) => surface.installProfile.semantics[semantic] !== 'supported');
  if (undeliverable !== undefined) return { ignored: [ignoredAgents(surface, plugin, true)], skip: false };
  return { ignored: [ignoredAgents(surface, plugin, false)], skip: true };
}

/** `HostWriter.preflightAdd` announcement: warnings surface on stderr before any mutation, in every output mode. */
export async function announceAgentExclusion(surface: AgentExclusionSurface, plugin: PluginSource): Promise<void> {
  for (const item of agentExclusionDisposition(surface, plugin)?.ignored ?? []) console.error(item.warning);
}

/** A direct writer add must not silently drop an agents-only package; the caller-visible skip decision is the lifecycle's. */
export function refuseAgentOnlyPackage(surface: AgentExclusionSurface, plugin: PluginSource): void {
  if (agentExclusionDisposition(surface, plugin)?.skip !== true) return;
  throw new CompatibilityError(
    surface.host,
    AGENTS,
    'unsupported',
    'docs/portable-agents.md',
    `${surface.host} cannot deliver an agents-only package ('${surface.nativeId(plugin)}') without a caller-visible skip decision; no native mutation was attempted`,
  );
}

/** Physically omit canonical agent roots and the portable sidecar from a staged package before fingerprinting. */
export function pruneExcludedAgents(stage: string): void {
  rmSync(join(stage, PORTABLE_AGENTS_FILE), { force: true });
  for (const root of AGENT_ROOTS) rmSync(join(stage, root), { recursive: true, force: true });
}

/** Native agent manifest declarations are ambiguous for a host that projects none; refuse rather than launder them. */
export function assertNoAgentManifestDeclarations(host: string, files: readonly string[]): void {
  for (const file of files) {
    if (!existsSync(file)) continue;
    let value: unknown;
    try { value = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) { throw new Error(`invalid plugin manifest: ${file} (${(error as Error).message})`); }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`invalid plugin manifest: ${file}`);
    for (const key of ['agents', 'agent']) {
      if ((value as Record<string, unknown>)[key] !== undefined) {
        throw new Error(`${host} cannot deliver agent manifest declaration '${key}': ${file}`);
      }
    }
  }
}
