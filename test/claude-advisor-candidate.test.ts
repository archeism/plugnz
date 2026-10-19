import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { admitPackageSemanticsFromProfiles } from '../src/capability-evidence';
import { claudeAdvisorCandidateHookProfile } from '../src/hosts/claude-code-writer';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

test('Claude advisor candidate profile admits native hook lifecycle only at 2.1.285', () => {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-advisor-'));
  try {
    writeFileSync(join(root, 'plugin.json'), JSON.stringify({
      name: 'trajectories-advisor',
      version: '0.1.0',
      description: 'Opt-in advisor.',
      extensions: {
        'io.github.archeism.trajectories-advisor': {
          runtime: './io.github.archeism.trajectories-advisor/advisor.mjs',
          hooks: './io.github.archeism.trajectories-advisor/hooks.json',
        },
      },
    }));
    mkdirSync(join(root, '.claude-plugin'), { recursive: true });
    writeFileSync(join(root, '.claude-plugin/plugin.json'), JSON.stringify({
      name: 'trajectories-advisor',
      version: '0.1.0',
      hooks: './io.github.archeism.trajectories-advisor/hooks.json',
    }));
    mkdirSync(join(root, 'io.github.archeism.trajectories-advisor'), { recursive: true });
    writeFileSync(join(root, 'io.github.archeism.trajectories-advisor/hooks.json'), JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
        PostToolUseFailure: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
      },
    }));
    writeFileSync(join(root, 'io.github.archeism.trajectories-advisor/advisor.mjs'), 'console.log("{}");\n');

    const inventory = inventoryPackageSemantics({ name: 'trajectories-advisor', dir: root });
    const request = {
      host: 'claude-code',
      detectedVersion: '2.1.285',
      sourceType: 'local' as const,
      route: 'managed' as const,
      operation: 'install' as const,
      inventory,
    };
    const profiles = [claudeAdvisorCandidateHookProfile()];
    const admitted = admitPackageSemanticsFromProfiles(request, profiles);
    expect(admitted.status).toBe('admitted');
    expect(admitted.requirements).toEqual(['hooks', 'auto-update-control', 'readback', 'rollback', 'activation-reload']);

    // Refuses neighboring version
    expect(admitPackageSemanticsFromProfiles({ ...request, detectedVersion: '2.1.284' }, profiles).status).toBe('refused');

    // Refuses unadmitted events
    const badEventsDir = mkdtempSync(join(tmpdir(), 'plugnz-advisor-bad-'));
    try {
      mkdirSync(join(badEventsDir, '.claude-plugin'), { recursive: true });
      writeFileSync(join(badEventsDir, '.claude-plugin/plugin.json'), JSON.stringify({
        name: 'bad-advisor',
        version: '0.1.0',
        hooks: './hooks.json',
      }));
      writeFileSync(join(badEventsDir, 'hooks.json'), JSON.stringify({
        hooks: {
          PreToolUse: [{ hooks: [{ type: 'command', command: 'node test.js' }] }],
        },
      }));
      const badInv = inventoryPackageSemantics({ name: 'bad-advisor', dir: badEventsDir });
      const badResult = admitPackageSemanticsFromProfiles({ ...request, inventory: badInv }, profiles);
      expect(badResult.status).toBe('refused');
      expect(badResult.gaps[0]?.diagnostic).toContain("event 'PreToolUse' is unsupported");
    } finally {
      rmSync(badEventsDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('public lifecycle harness verifies candidate install, update and retirement', async () => {
  await withLifecycleCliHarness(async harness => {
    harness.fakeNative('claude', Array.from({ length: 20 }, () => ({ args: ['--version'], stdout: '2.1.285 (Claude Code)\n' })));
    const source = harness.source('trajectories-advisor', {
      'plugin.json': JSON.stringify({
        name: 'trajectories-advisor',
        version: '0.1.0',
        extensions: {
          'io.github.archeism.trajectories-advisor': {
            runtime: './io.github.archeism.trajectories-advisor/advisor.mjs',
            hooks: './io.github.archeism.trajectories-advisor/hooks.json',
          },
        },
      }),
      '.claude-plugin/plugin.json': JSON.stringify({
        name: 'trajectories-advisor',
        version: '0.1.0',
        hooks: './io.github.archeism.trajectories-advisor/hooks.json',
      }),
      'io.github.archeism.trajectories-advisor/hooks.json': JSON.stringify({
        hooks: {
          UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
          PostToolUse: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
          PostToolUseFailure: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
          Stop: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
        },
      }),
      'io.github.archeism.trajectories-advisor/advisor.mjs': 'console.log("{}");\n',
    });

    const installResult = harness.run(['install', source, '--target', 'claude-code', '--json']);
    const installReport = parseLifecycleReport(JSON.parse(installResult.stdout));
    expect(installResult.exitCode).toBe(0);
    expect(installReport.summary.result).toBe('converged');
    const op = installReport.verification?.operations[0];
    expect(op?.compatibility).toBe('admitted');
    expect(op?.registration).toBe('verified');
    expect(op?.executionApproval).toBe('not-checked');
    expect(op?.delivery).toBe('not-observed');

    writeFileSync(join(source, 'io.github.archeism.trajectories-advisor/advisor.mjs'), 'console.log("updated");\n');
    const updateResult = harness.run(['update', 'trajectories-advisor@local', '--json']);
    const updateReport = parseLifecycleReport(JSON.parse(updateResult.stdout));
    expect(updateResult.exitCode).toBe(0);
    expect(updateReport.summary.result).toBe('converged');
    const installedRuntime = join(harness.storePath('claude-code'), 'plugins/cache/local/trajectories-advisor/0.1.0/io.github.archeism.trajectories-advisor/advisor.mjs');
    expect(readFileSync(installedRuntime, 'utf8')).toBe('console.log("updated");\n');

    const removeResult = harness.run(['remove', 'trajectories-advisor@local', '--json']);
    const removeReport = parseLifecycleReport(JSON.parse(removeResult.stdout));
    expect(removeResult.exitCode).toBe(0);
    expect(removeReport.summary.result).toBe('converged');
  });
});

test('advisor lifecycle preserves reflection bytes, unrelated settings and one registration', async () => {
  await withLifecycleCliHarness(async harness => {
    harness.fakeNative('claude', Array.from({ length: 30 }, () => ({ args: ['--version'], stdout: '2.1.285 (Claude Code)\n' })));
    const advisorSource = harness.source('trajectories-advisor', {
      'plugin.json': JSON.stringify({
        name: 'trajectories-advisor',
        version: '0.1.0',
        extensions: {
          'io.github.archeism.trajectories-advisor': {
            runtime: './io.github.archeism.trajectories-advisor/advisor.mjs',
            hooks: './io.github.archeism.trajectories-advisor/hooks.json',
          },
        },
      }),
      '.claude-plugin/plugin.json': JSON.stringify({
        name: 'trajectories-advisor',
        version: '0.1.0',
        hooks: './io.github.archeism.trajectories-advisor/hooks.json',
      }),
      'io.github.archeism.trajectories-advisor/hooks.json': JSON.stringify({
        hooks: {
          UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
          PostToolUse: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
          PostToolUseFailure: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
          Stop: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/io.github.archeism.trajectories-advisor/advisor.mjs"' }] }],
        },
      }),
      'io.github.archeism.trajectories-advisor/advisor.mjs': 'console.log("{}");\n',
    });

    const reflectionSource = harness.source('trajectories-reflection', {
      'plugin.json': JSON.stringify({
        name: 'trajectories-reflection',
        version: '0.1.0',
      }),
      '.plugin/plugin.json': JSON.stringify({
        name: 'trajectories-reflection',
        version: '0.1.0',
      }),
      'plugnz.hooks.json': JSON.stringify({
        version: 2,
        hooks: {
          'session.start': [{
            command: ['node', '${PLUGIN_ROOT}/reflect.mjs'],
            requires: { context: true },
          }],
          'turn.stop': [{
            command: ['node', '${PLUGIN_ROOT}/reflect.mjs'],
            requires: { context: true, continue: true },
          }],
        },
      }),
      'skills/reflect/SKILL.md': '---\nname: reflect\ndescription: demo\n---\n',
      'agents/memory-updater.md': '---\nname: memory-updater\ndescription: demo\nmodel: inherit\ntools: Read, Write\n---\n',
      'reflect.mjs': 'console.log("{}");\n',
    });

    harness.writeHome({ '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Read'] }, env: { KEEP_ME: 'present' } }) });
    // Install reflection first
    const installRefl = harness.run(['install', reflectionSource, '--target', 'claude-code', '--json']);
    expect(installRefl.exitCode).toBe(0);

    const reflectionFile = join(harness.storePath('claude-code'), 'plugins/cache/local/trajectories-reflection/0.1.0/reflect.mjs');
    const reflectionBytes = readFileSync(reflectionFile, 'utf8');
    // Install advisor
    const installAdv = harness.run(['install', advisorSource, '--target', 'claude-code', '--json']);
    expect(installAdv.exitCode).toBe(0);

    // Reinstall/update advisor - should not duplicate or stack hooks
    const updateAdv = harness.run(['update', 'trajectories-advisor@local', '--json']);
    expect(updateAdv.exitCode).toBe(0);

    const registry = JSON.parse(readFileSync(join(harness.storePath('claude-code'), 'plugins/installed_plugins.json'), 'utf8'));
    expect(registry.plugins['trajectories-advisor@local']).toHaveLength(1);
    expect(readFileSync(reflectionFile, 'utf8')).toBe(reflectionBytes);
    // Remove advisor - reflection should remain intact
    const removeAdv = harness.run(['remove', 'trajectories-advisor@local', '--json']);
    expect(removeAdv.exitCode).toBe(0);

    expect(readFileSync(reflectionFile, 'utf8')).toBe(reflectionBytes);
    const settings = JSON.parse(readFileSync(join(harness.storePath('claude-code'), 'settings.json'), 'utf8'));
    expect(settings.permissions).toEqual({ allow: ['Read'] });
    expect(settings.env).toEqual({ KEEP_ME: 'present' });
    expect(settings.enabledPlugins['trajectories-reflection@local']).toBe(true);
    expect(settings.enabledPlugins['trajectories-advisor@local']).toBe(false);
    // Verify reflection is still present in listing
    const listResult = harness.run(['list', '--target', 'claude-code', '--json']);
    expect(listResult.exitCode).toBe(0);
    const list = JSON.parse(listResult.stdout);
    const plugins = list.flatMap((host: any) => host.plugins || []);
    expect(plugins.some((p: any) => p.name === 'trajectories-reflection')).toBe(true);
    expect(plugins.some((p: any) => p.name === 'trajectories-advisor')).toBe(false);
  });
});
