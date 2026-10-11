import { expect, test } from 'bun:test';
import { snapshotTree, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { hermesPublicRuntime } from './hermes-runtime-fixture';
import { initGitRepo } from './util';

test('an interrupted Hermes checkout is observed without startup recovery or Python bytecode writes', async () => {
  await withLifecycleCliHarness(harness => {
    const runtime = harness.source('interrupted-hermes', {
      '.git/hermes-update-pull': 'pre=0000000000000000000000000000000000000000\n',
      'hermes_cli/__init__.py': '',
      'hermes_cli/main.py': `from pathlib import Path\nroot = Path(__file__).resolve().parents[1]\n# Model the documented startup recovery boundary before argument handling.\n(root / '.git/hermes-update-pull').write_text('recovered')\n(root / 'recovery-sentinel').write_text('startup ran')\ndef main():\n    print('Hermes Agent vfixture (test)')\n    print('Install directory: ' + str(root))\n    return 0\n`,
      '.venv/.keep': '',
    });
    initGitRepo(runtime, { 'tracked-sentinel': 'unchanged\n' });
    const launcher = join(runtime, 'hermes');
    const bootstrap = `import os, re, sys\nsys.path.insert(0, ${JSON.stringify(runtime)})\nfrom hermes_cli.main import main\nsys.exit(main())`;
    writeFileSync(launcher, `#!/bin/sh\nexec /usr/bin/python3 -I -c '${bootstrap}' "$@"\n`);
    chmodSync(launcher, 0o755);
    harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
    const source = harness.source('plugin', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const before = snapshotTree(runtime);
    const result = harness.run(['add', source, '--target', 'hermes', '--json'], {
      env: { OPEN_PLUGIN_HERMES_BIN: launcher },
    });
    expect(result.exitCode).toBe(1);
    expect(parseLifecycleReport(JSON.parse(result.stdout)).outcomes[0]?.reason?.code).toBe('capability.unverified');
    expect(snapshotTree(runtime)).toEqual(before);
    expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
    expect(result.state.after).toEqual(result.state.before);
  });
});

test('an unrecognized Hermes launcher reports its missing proof without executing it', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
    const source = harness.source('plugin', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const hermes = harness.fakeNative('hermes', [{ args: ['--version'], stdout: 'Hermes Agent vfixture\n' }]);
    const result = harness.run(['add', source, '--target', 'hermes', '--json']);
    expect(result.exitCode).toBe(1);
    const reason = parseLifecycleReport(JSON.parse(result.stdout)).outcomes[0]?.reason;
    expect(reason?.code).toBe('capability.unverified');
    expect(reason?.diagnostic).toContain('launcher source binding is unverified');
    expect(hermes.invocations()).toEqual([]);
    expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
    expect(result.state.after).toEqual(result.state.before);
  });
});

test('Hermes admits evidenced clean revisions and refuses unknown or locally modified revisions', async () => {
  for (const [revision, dirty, expectedCode] of [
    ['c0d7294769a38c17ceae51d8f7995e66e1dcae27', '', 0],
    ['dce1e9b37581dd62e480a9064dc04a709c2940d3', '', 0],
    ['0'.repeat(40), '', 1],
    ['dce1e9b37581dd62e480a9064dc04a709c2940d3', ' M hermes_cli/plugins.py\n', 1],
  ] as const) {
    await withLifecycleCliHarness(harness => {
      hermesPublicRuntime(harness, revision, dirty);
      harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
      const source = harness.source('hermes-profile', {
        'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nDemo.\n',
      });
      const result = harness.run(['add', source, '--target', 'hermes', ...(expectedCode === 0 ? ['--dry-run'] : []), '--json']);
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(expectedCode);
      expect(report.outcomes[0]?.reason?.code ?? null).toBe(expectedCode === 0 ? null : 'capability.unverified');
      expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
      expect(result.state.after).toEqual(result.state.before);
    });
  }
});

test('Claude lifecycle keeps both evidenced releases available through the public CLI', async () => {
  for (const version of ['2.1.275', '2.1.295']) {
    await withLifecycleCliHarness(harness => {
      harness.writeHome({ '.claude/.keep': '' });
      const source = harness.source('claude-profile', {
        'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nDemo.\n',
      });
      const claude = harness.fakeNative('claude', Array.from({ length: 4 }, () => ({
        args: ['--version'], stdout: `${version} (Claude Code)\n`,
      })));
      const result = harness.run(['add', source, '--target', 'claude-code', '--dry-run', '--json'], {
        env: { OPEN_PLUGIN_CLAUDE_CODE_BIN: claude.path },
      });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect(result.exitCode).toBe(0);
      expect(report.outcomes[0]?.reason).toBe(null);
    });
  }
});

test('Claude lifecycle refuses a parsed but unevidenced release without native or ledger mutation', async () => {
  for (const version of ['0.0.1', '2.1.276', '99.0.0']) {
    await withLifecycleCliHarness(harness => {
      harness.writeHome({ '.claude/.keep': '' });
      const source = harness.source('claude-profile', {
        'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
        'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nDemo.\n',
      });
      const claude = harness.fakeNative('claude', Array.from({ length: 4 }, () => ({
        args: ['--version'], stdout: `${version} (Claude Code)\n`,
      })));
      const result = harness.run(['add', source, '--target', 'claude-code', '--json'], {
        env: { OPEN_PLUGIN_CLAUDE_CODE_BIN: claude.path },
      });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect({
        code: result.exitCode,
        reason: report.outcomes[0]?.reason?.code,
        storeUnchanged: JSON.stringify(result.stores['claude-code'].before) === JSON.stringify(result.stores['claude-code'].after),
        ledgerUnchanged: JSON.stringify(result.state.before) === JSON.stringify(result.state.after),
      }).toEqual({ code: 1, reason: 'capability.unverified', storeUnchanged: true, ledgerUnchanged: true });
      expect(report.outcomes[0]?.reason?.diagnostic).toContain(version);
    });
  }
});

test('a Hermes config alone cannot claim a runtime profile or mutate native state', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
    const source = harness.source('hermes-profile', {
      'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nDemo.\n',
    });
    const result = harness.run(['add', source, '--target', 'hermes', '--json'], {
      env: { OPEN_PLUGIN_HERMES_BIN: '' },
    });
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect({
      code: result.exitCode,
      reason: report.outcomes[0]?.reason?.code,
      storeUnchanged: JSON.stringify(result.stores.hermes.before) === JSON.stringify(result.stores.hermes.after),
      ledgerUnchanged: JSON.stringify(result.state.before) === JSON.stringify(result.state.after),
    }).toEqual({ code: 1, reason: 'capability.unverified', storeUnchanged: true, ledgerUnchanged: true });
  });
});
