import { resolve } from 'node:path';
import { readLifecycleState, type PersistedSourceBinding } from './state';

export interface LegacyMarkerCandidate {
  readonly source: string;
  readonly pluginId: string;
  readonly fingerprint: string;
  readonly scopeId?: string;
}

/**
 * Resolve the recorded deployment scope for a legacy v1 ownership marker that
 * lacks `scopeId`, only when an imported v2 legacy claim (`prior: 'plgnz'`) in
 * `state.json` proves the same target, package/native identity, source
 * locator, source fingerprint, and unmodified installed fingerprint.
 */
export function resolveLegacyV1MarkerScopeId(input: {
  readonly target: { readonly kind: string; readonly instance: string };
  readonly nativeId: string;
  readonly marker: LegacyMarkerCandidate | null | undefined;
  readonly installedFingerprint: string | null;
  readonly matchesPluginId?: (markerPluginId: string, nativeId: string) => boolean;
}): string | undefined {
  const { target, nativeId, marker, installedFingerprint } = input;
  if (marker === null || marker === undefined) return undefined;
  if (marker.scopeId !== undefined) return undefined;
  const matches = input.matchesPluginId ?? ((markerId, expectedId) => markerId === expectedId);
  if (!matches(marker.pluginId, nativeId)) return undefined;
  if (installedFingerprint === null || installedFingerprint.length === 0) return undefined;
  let loaded: ReturnType<typeof readLifecycleState>;
  try {
    loaded = readLifecycleState();
  } catch {
    return undefined;
  }
  const candidates = loaded.state.activations.filter((activation) => {
    if (activation.ownership.kind !== 'legacy-claim' || activation.ownership.prior !== 'plgnz' || activation.route.kind !== 'legacy-unverified') {
      return false;
    }
    if (activation.nativeId !== nativeId && activation.nativeId !== marker.pluginId) {
      return false;
    }
    if (activation.fingerprints.source === undefined || activation.fingerprints.source !== marker.fingerprint) {
      return false;
    }
    if (activation.fingerprints.installed === undefined || activation.fingerprints.installed !== installedFingerprint) {
      return false;
    }
    const scope = loaded.state.scopes.find((row) => row.id === activation.scopeId);
    if (scope === undefined || scope.target.kind !== target.kind || scope.target.instance !== target.instance) {
      return false;
    }
    return matchesLegacyMarkerSource(scope.source, marker.source, activation.sourceRevision);
  });
  if (candidates.length !== 1) return undefined;
  return candidates[0]!.scopeId;
}

export function legacyV1MarkerMatchesScope(input: {
  readonly target: { readonly kind: string; readonly instance: string };
  readonly scopeId: string;
  readonly nativeId: string;
  readonly marker: LegacyMarkerCandidate | null | undefined;
  readonly installedFingerprint: string | null;
  readonly matchesPluginId?: (markerPluginId: string, nativeId: string) => boolean;
}): boolean {
  return resolveLegacyV1MarkerScopeId(input) === input.scopeId;
}

function matchesLegacyMarkerSource(
  source: PersistedSourceBinding,
  markerSource: string,
  sourceRevision: string | undefined,
): boolean {
  if (source.kind === 'local') {
    if (!markerSource.startsWith('/')) return false;
    return resolve(markerSource) === resolve(source.locator);
  }
  return markerSource === source.locator
    || (source.ref !== 'HEAD' && markerSource === `${source.locator}#${source.ref}`)
    || (sourceRevision !== undefined && markerSource === sourceRevision);
}
