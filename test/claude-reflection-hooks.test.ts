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
    expect(claudeReflectionPermissionsSupported(inventoryPackageSemantics({ name: 'reflection', dir: root }), root)).toBe(false);
    expect(admitPackageSemanticsFromProfiles({ ...request, detectedVersion: '2.1.284' }, profiles).status).toBe('refused');
    writeFileSync(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { extra: { command: 'unproven' } } }));
    expect(admitPackageSemanticsFromProfiles({ ...request, inventory: inventoryPackageSemantics({ name: 'reflection', dir: root }) }, profiles).status).toBe('refused');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

const restrictedAgent = '---\nname: memory-updater\ndescription: Propose memory.\nmodel: inherit\ntools: Read, Write\n---\nRead the batch and write candidates.\n';
const publicCases = [
  { name: 'qualified restricted agent', agent: restrictedAgent, accepted: true },
  { name: 'expanded tools', agent: restrictedAgent.replace('Read, Write', 'Bash'), accepted: false },
  { name: 'omitted tools', agent: restrictedAgent.replace('tools: Read, Write\n', ''), accepted: false },
  { name: 'omitted inherited model', agent: restrictedAgent.replace('model: inherit\n', ''), accepted: false },
  { name: 'frontmatter preprocessing', agent: restrictedAgent.replace('Propose memory.', 'Propose !`echo unqualified`'), accepted: false },
  { name: 'additional unrestricted agent', agent: restrictedAgent, extraAgent: '---\nname: unqualified\ndescription: Unrestricted.\n---\nWork.\n', accepted: false },
  { name: 'skill permissions', agent: restrictedAgent, skillTools: true, accepted: false },
];
for (const item of publicCases) {
  test(`public install admits only the qualified reflection envelope: ${item.name}`, async () => {
    await withLifecycleCliHarness(harness => {
      harness.fakeNative('claude', Array.from({ length: 20 }, () => ({ args: ['--version'], stdout: '2.1.285 (Claude Code)\n' })));
      const source = harness.source('reflection', {
        'plugin.json': JSON.stringify({ name: 'reflection', version: '1.0.0' }),
        'skills/reflect/SKILL.md': `---\nname: reflect\ndescription: Reflect.\n${item.skillTools ? 'allowed-tools: Bash\n' : ''}---\nDelegate the prepared batch.\n`,
        'agents/memory-updater.md': item.agent,
        ...(item.extraAgent === undefined ? {} : { 'agents/unqualified.md': item.extraAgent }),
        'reflect.mjs': 'console.log("{}");\n',
        'plugnz.hooks.json': JSON.stringify({ version: 2, hooks: {
          'session.start': [{ command: ['node', '${PLUGIN_ROOT}/reflect.mjs'], requires: { context: true } }],
          'turn.stop': [{ command: ['node', '${PLUGIN_ROOT}/reflect.mjs'], requires: { context: true, continue: true } }],
        } }),
      });
      const result = harness.run(['install', source, '--target', 'claude-code', '--json']);
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(item.accepted ? 0 : 1);
      expect(report.summary.result).toBe(item.accepted ? 'converged' : 'incomplete');
      if (!item.accepted) {
        expect(report.summary.mutationStarted).toBe(false);
        expect(report.summary.failureCategory).toBe('capability');
      }
    });
  });
}
