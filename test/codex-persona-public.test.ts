import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToText, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

const persona = '---\nname: reviewer\ndescription: Review changes\n---\nRead the diff and identify bugs.\n';
const files = {
  'plugin.json': '{"name":"personas","version":"1.0.0"}\n',
  'skills/review/SKILL.md': '---\nname: review\ndescription: Review code\n---\nRead ../../agents/reviewer.md.\n',
  'commands/ship.md': '---\ndescription: Ship changes\n---\nUse the reviewer agent for $ARGUMENTS.\n',
  'agents/reviewer.md': persona,
};

for (const version of ['0.161.0', '0.162.0']) test(`public Codex ${version} lifecycle registers native agents and preserves manual command adaptation through update`, async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.codex/.keep': '' });
    const source = h.source('personas', files);
    const codex = h.fakeNative('codex', Array.from({ length: 32 }, () => ({ args: ['--version'], stdout: `codex-cli ${version}\n` })));
    const env = { OPEN_PLUGIN_CODEX_BIN: codex.path };
    const preview = h.run(['sync', source, '--target', 'codex', '--dry-run', '--json'], { env });
    expect(preview.exitCode).toBe(0);
    expect(preview.stores.codex.after.files).toEqual(preview.stores.codex.before.files);
    const installed = h.run(['sync', source, '--target', 'codex', '--json'], { env });
    expect(installed.exitCode).toBe(0);
    const installedFiles = installed.stores.codex.after.files;
    const read = (suffix: string) => bytesToText(installedFiles[Object.keys(installedFiles).find(p => p.endsWith(suffix))!]!);
    expect(read('/agents/reviewer.md')).toBe(persona);
    expect(read('/skills/review/SKILL.md')).toBe(files['skills/review/SKILL.md']);
    expect(read('/skills/ship/SKILL.md')).toContain('Plugin agents are registered as personas:<agent-name>');
    expect(read('/skills/ship/agents/openai.yaml')).toContain('allow_implicit_invocation: false');
    writeFileSync(join(source, 'agents/reviewer.md'), `${persona}Also inspect regressions.\n`);
    const updated = h.run(['sync', source, '--target', 'codex', '--json'], { env });
    expect(updated.exitCode).toBe(0);
    expect(parseLifecycleReport(JSON.parse(updated.stdout)).outcomes[0]!.action).toBe('update');
    expect(Object.entries(updated.stores.codex.after.files).some(([p, b]) => p.endsWith('/agents/reviewer.md') && bytesToText(b).endsWith('Also inspect regressions.\n'))).toBe(true);
  });
}, 20_000);

for (const field of ['model: opus', 'tools: Read', 'memory: project', 'permissionMode: bypassPermissions']) {
  test(`public Codex refuses native persona metadata (${field}) before mutation`, async () => {
    await withLifecycleCliHarness(h => {
      h.writeHome({ '.codex/.keep': '' });
      const source = h.source('restricted-personas', { ...files, 'agents/reviewer.md': persona.replace('description:', `${field}\ndescription:`) });
      const codex = h.fakeNative('codex', Array.from({ length: 8 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.162.0\n' })));
      const result = h.run(['sync', source, '--target', 'codex', '--json'], { env: { OPEN_PLUGIN_CODEX_BIN: codex.path } });
      expect(result.exitCode).toBe(1);
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(report.summary.mutationStarted).toBe(false);
      expect(report.outcomes[0]!.reason!.capabilityId).toBe('agents');
      expect(report.outcomes[0]!.reason!.diagnostic).toContain('agents/reviewer.md');
      expect(result.stores.codex.after.files).toEqual(result.stores.codex.before.files);
    });
  }, 20_000);
}

for (const variant of ['alternate-root']) {
  test(`prompt-resource admission refuses ${variant}`, async () => {
    await withLifecycleCliHarness(h => {
      h.writeHome({ '.codex/.keep': '' });
      const fixture: Record<string, string> = { ...files };
      if (variant === 'alternate-root') {
        delete fixture['agents/reviewer.md'];
        fixture['.claude/agents/reviewer.md'] = persona;
      } else delete fixture['commands/ship.md'];
      const source = h.source(variant, fixture);
      const codex = h.fakeNative('codex', Array.from({ length: 8 }, () => ({ args: ['--version'], stdout: 'codex-cli 0.162.0\n' })));
      const result = h.run(['sync', source, '--target', 'codex', '--json'], { env: { OPEN_PLUGIN_CODEX_BIN: codex.path } });
      expect(result.exitCode).toBe(1);
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(report.outcomes[0]!.reason!.capabilityId).toBe('agents');
      expect(report.summary.mutationStarted).toBe(false);
      expect(result.stores.codex.after.files).toEqual(result.stores.codex.before.files);
    });
  });
}
