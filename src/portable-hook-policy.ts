/** Admission for compiled portable hooks; it grants no support to native hook JSON. */
import { createCapabilityEvidenceProfile, type CapabilityEvidenceProfile, type CapabilityRoute, type CapabilityStatus } from './capability-evidence';
import { HOOK_EVENTS, type HookAdapter } from './hooks';
import { PACKAGE_SEMANTICS, type CapabilityOperation, type PackageSemantic } from './semantic-inventory';

export function portableHookProfile(
  adapter: Pick<HookAdapter, 'id' | 'baselineVersion'>,
  route: CapabilityRoute,
  operations: readonly CapabilityOperation[],
): CapabilityEvidenceProfile {
  const supported = new Set<PackageSemantic>([
    'hooks', 'resources', 'auto-update-control', 'readback', 'rollback',
    'activation-reload', 'retirement', 'retention-safety',
    ...(operations.includes('disable') ? ['reversible-disable' as const] : []),
  ]);
  return createCapabilityEvidenceProfile({
    host: adapter.id,
    detectedVersion: adapter.baselineVersion,
    packageFormat: 'portable-hooks',
    sourceTypes: ['local', 'git'],
    operations,
    route,
    operationStatus: 'supported',
    semantics: Object.fromEntries(PACKAGE_SEMANTICS.map(semantic => [
      semantic, supported.has(semantic) ? 'supported' : 'unsupported',
    ])) as Record<PackageSemantic, CapabilityStatus>,
    hookPolicy: {
      manifestPrecedence: ['plugin.json', '.plugin/plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.zcode-plugin/plugin.json'],
      supportedForms: ['portable-hooks'],
      supportedEvents: HOOK_EVENTS,
      supportedHandlerTypes: ['command'],
      matcherlessEvents: ['session.start', 'turn.stop'],
      supportedMatcherKinds: ['all', 'literal-set'],
      unsupportedHandlerFacets: ['async-enabled', 'async-non-boolean', 'argv-invalid', 'timeout-invalid', 'status-message-invalid'],
    },
    evidence: ['docs/hooks.md', 'docs/hooks-native-evidence.json'],
  });
}
