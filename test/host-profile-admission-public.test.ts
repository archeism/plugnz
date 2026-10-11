import { expect, test } from 'bun:test';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';

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
      expect(report.outcomes[0]?.reason).toBeNull();
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
