import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { admitPackageSemanticsFromProfiles } from '../src/capability-evidence';
import { claudeReflectionHookProfile, claudeReflectionPermissionsSupported } from '../src/hosts/claude-code-writer';

test('qualified Claude hook package admits its complete skill and native-agent lifecycle only at the proven version', () => {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-reflection-'));
  try {
    writeFileSync(join(root, 'plugin.json'), JSON.stringify({ name: 'reflection', version: '1.0.0' }));
    mkdirSync(join(root, 'skills/reflect'), { recursive: true });
    writeFileSync(join(root, 'skills/reflect/SKILL.md'), '---\nname: reflect\ndescription: Reflect.\n---\nDelegate the prepared batch.\n');
    mkdirSync(join(root, 'agents'));
    writeFileSync(join(root, 'agents/memory-updater.md'), '---\nname: memory-updater\ndescription: Propose memory.\nmodel: inherit\ntools: Read, Write\n---\nRead the batch and write candidates.\n');
    writeFileSync(join(root, 'plugnz.hooks.json'), JSON.stringify({ version: 2, hooks: {
      'session.start': [{ command: ['node', '${PLUGIN_ROOT}/reflect.mjs'], requires: { context: true } }],
      'turn.stop': [{ command: ['node', '${PLUGIN_ROOT}/reflect.mjs'], requires: { context: true, continue: true } }],
    } }));
    const inventory = inventoryPackageSemantics({ name: 'reflection', dir: root });
    const request = { host: 'claude-code', detectedVersion: '2.1.285', sourceType: 'local' as const, route: 'managed' as const, operation: 'install' as const, inventory };
    const profiles = [claudeReflectionHookProfile()];
    const admitted = admitPackageSemanticsFromProfiles(request, profiles);
    expect(admitted.status).toBe('admitted');
    expect(admitted.requirements).toContain('hooks');
    expect(admitted.requirements).toContain('ordinary-skills');
    expect(admitted.requirements).toContain('agents');
    expect(claudeReflectionPermissionsSupported(inventory, root)).toBe(true);
    const agentFile = join(root, 'agents/memory-updater.md');
    writeFileSync(agentFile, '---\nname: memory-updater\ndescription: Propose memory.\nmodel: inherit\ntools: Bash\n---\nUnqualified grant.\n');
    expect(claudeReflectionPermissionsSupported(inventory, root)).toBe(false);
    expect(admitPackageSemanticsFromProfiles({ ...request, detectedVersion: '2.1.284' }, profiles).status).toBe('refused');
    writeFileSync(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { extra: { command: 'unproven' } } }));
    expect(admitPackageSemanticsFromProfiles({ ...request, inventory: inventoryPackageSemantics({ name: 'reflection', dir: root }) }, profiles).status).toBe('refused');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
