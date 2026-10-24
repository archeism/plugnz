import { describe, expect, test } from 'bun:test';
import { admitPackageSemanticsFromProfiles } from '../src/capability-evidence';
import { claudeEvidenceProfiles } from '../src/hosts/claude-code-writer';
import { codexEvidenceProfiles } from '../src/hosts/codex-writer';
import { ompManagedProfiles } from '../src/hosts/omp-writer';
import type { CapabilityEvidenceProfile } from '../src/capability-evidence';
import type { PackageSemantic } from '../src/semantic-inventory';
import { emptyInventory } from './lifecycle-fixtures';

const artifactSemantics = ['ordinary-skills', 'mcp', 'resources'] as const satisfies readonly PackageSemantic[];
const installRequirements = [
  'ordinary-skills',
  'mcp',
  'auto-update-control',
  'resources',
  'readback',
  'rollback',
  'activation-reload',
];

const hosts: Array<{ host: string; version: string; neighboringVersion: string; profiles: readonly CapabilityEvidenceProfile[] }> = [
  { host: 'claude-code', version: '2.1.285', neighboringVersion: '2.1.284', profiles: claudeEvidenceProfiles('2.1.285', []) },
  { host: 'codex', version: '0.161.0', neighboringVersion: '0.161.1', profiles: codexEvidenceProfiles },
  { host: 'omp', version: '18.8.7', neighboringVersion: '18.8.8', profiles: ompManagedProfiles },
];

describe('oh-my-ai exact native host compatibility', () => {
  for (const host of hosts) {
    test(`${host.host} ${host.version} admits only the proven lifecycle envelope`, () => {
      const admit = (version: string, operation: 'install' | 'update' | 'retire', requiredSemantics: readonly PackageSemantic[]) =>
        admitPackageSemanticsFromProfiles({
          host: host.host,
          detectedVersion: version,
          sourceType: 'local',
          route: 'managed',
          operation,
          inventory: { ...emptyInventory, requiredSemantics: [...requiredSemantics] },
        }, host.profiles);

      const admitted = admit(host.version, 'install', artifactSemantics);
      expect(admitted.status).toBe('admitted');
      expect(admitted.requirements).toEqual(installRequirements);

      for (const semantic of ['commands', 'model-invocation-control'] as const) {
        const result = admit(host.version, 'install', [...artifactSemantics, semantic]);
        // Codex 0.161.0 and OMP 18.8.7 gained separate native loader evidence after this baseline.
        const admittedBySeparateEvidence = host.host === 'codex' || host.host === 'omp';
        expect(result.status).toBe(admittedBySeparateEvidence ? 'admitted' : 'refused');
        if (!admittedBySeparateEvidence) expect(result.gaps.map((gap) => gap.capabilityId)).toContain(semantic);
      }

      expect(admit(host.version, 'update', artifactSemantics).status).toBe('admitted');
      const retired = admit(host.version, 'retire', artifactSemantics);
      expect(retired.status).toBe('admitted');
      expect(retired.requirements).toEqual(['retirement', 'retention-safety', 'readback', 'rollback', 'activation-reload']);
      expect(admit(host.neighboringVersion, 'install', artifactSemantics).status).toBe('refused');
    });
  }
});
