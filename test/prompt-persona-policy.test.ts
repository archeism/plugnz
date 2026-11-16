import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admitPackageSemanticsFromProfiles, createCapabilityEvidenceProfile } from '../src/capability-evidence';
import { inventoryPackageSemantics, PACKAGE_SEMANTICS, type PackageSemantic } from '../src/semantic-inventory';
import { writeFiles } from './util';

test('generated persona commands have an explicit strict policy without weakening authored prompt resources', () => {
  const root = mkdtempSync(join(tmpdir(), 'plgnz-persona-policy-'));
  try {
    writeFiles(root, {
      'plugin.json': '{"name":"fixture","version":"1.0.0"}',
      'agents/reviewer.md': '---\nname: reviewer\ndescription: Review code\n---\nComplete persona body\n',
    });
    const inventory = () => inventoryPackageSemantics({ dir: root, name: 'fixture', version: '1.0.0' });
    const profile = (agentPolicy: 'prompt-commands' | 'prompt-resources') => createCapabilityEvidenceProfile({
      host: 'hermes', detectedVersion: 'fixture', sourceTypes: ['local'], operations: ['install'], route: 'managed',
      operationStatus: 'supported', agentPolicy,
      semantics: Object.fromEntries(PACKAGE_SEMANTICS.map(semantic => [semantic, 'supported'])) as Record<PackageSemantic, 'supported'>,
      evidence: ['docs/hosts/hermes.md'],
    });
    const request = { host: 'hermes', detectedVersion: 'fixture', sourceType: 'local' as const, operation: 'install' as const, route: 'managed' as const };
    expect(admitPackageSemanticsFromProfiles({ ...request, inventory: inventory() }, [profile('prompt-resources')]).status).toBe('refused');
    expect(admitPackageSemanticsFromProfiles({ ...request, inventory: inventory() }, [profile('prompt-commands')]).status).toBe('admitted');
    expect(admitPackageSemanticsFromProfiles({ ...request, inventory: { ...inventory(), portableAgents: true } }, [profile('prompt-commands')]).status).toBe('refused');
    writeFiles(root, { 'agents/reviewer.md': '---\nname: reviewer\ndescription: Review code\nmodel: guessed-alias\n---\nbody\n' });
    const rejected = admitPackageSemanticsFromProfiles({ ...request, inventory: inventory() }, [profile('prompt-commands')]);
    expect(rejected.status).toBe('refused');
    expect(rejected.gaps[0]?.diagnostic).toContain("metadata 'model'");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
