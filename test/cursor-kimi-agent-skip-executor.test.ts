import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { executeLifecycle } from '../src/executor';
import { createLifecyclePlannerHosts } from '../src/lifecycle-hosts';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { planLifecycle } from '../src/planner';
import { readLifecycleState } from '../src/state';
import { writeLifecycleState } from '../src/state-write';
import { parseSyncManifest } from '../src/sync-manifest';
import { snapshotTree, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { isolatedHostEnv } from './util';

const now = '2026-10-24T00:00:00.000Z';

for (const target of ['cursor', 'kimi']) {
  for (const drift of ['ledger-generation', 'frozen-source']) {
    test(`${target} all-skip execution refuses ${drift} drift instead of reporting convergence`, async () => {
      await withLifecycleCliHarness(async h => {
        const source = h.source('agent-only', {
          'plugin.json': '{"name":"skipped-review","version":"1.0.0"}',
          'plugnz.agents.json': '{"version":1}',
          'agents/reviewer.md': '---\nname: reviewer\ndescription: Review the change\n---\nReview carefully.\n',
        });
        const env = {
          ...isolatedHostEnv(h.home),
          HOME: h.ambientHome,
          OPEN_PLUGIN_CURSOR_ROOT: h.storePath('cursor'),
          OPEN_PLUGIN_KIMI_ROOT: h.storePath('kimi'),
          OPEN_PLUGIN_CURSOR_BIN: join(h.root, 'missing-cursor'),
        };
        const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
        Object.assign(process.env, env);
        try {
          const hosts = createLifecyclePlannerHosts().filter(host => host.kinds.includes(target));
          const plan = await planLifecycle({
            manifest: parseSyncManifest({ schemaVersion: 1, entries: [{
              operation: 'sync', source: { kind: 'local', locator: source }, target: { kind: target, instance: 'default' },
            }] }),
            dryRun: false,
            validatedAt: now,
            hosts,
          });
          expect(plan.kind).toBe('frozen');
          if (plan.kind !== 'frozen') throw new Error('Expected a frozen all-skip plan');
          expect(plan.operations).toHaveLength(1);
          expect(plan.operations[0]!.operation.action).toBe('skip');
          expect(plan.report.summary.result).toBe('converged');
          if (drift === 'ledger-generation') {
            const state = readLifecycleState().state;
            writeLifecycleState({ ...state, stateGeneration: state.stateGeneration + 1 }, { globalPreflight: 'succeeded' });
          } else {
            const frozen = [...plan.frozenSources.values()][0]!;
            writeFileSync(join(frozen.snapshotDir, 'agents/reviewer.md'), 'tampered frozen agent bytes\n');
          }
          const before = snapshotTree(h.home);
          const ambientBefore = snapshotTree(h.ambientHome);
          const result = await executeLifecycle({ plan, hosts, now });
          const report = parseLifecycleReport(result.report);
          expect(result.exitCode !== 0).toBe(true);
          expect(report.summary.result === 'converged').toBe(false);
          expect(report.summary.mutationStarted).toBe(false);
          expect(report.summary.changed).toBe(false);
          const diagnostics = [report.summary.reason?.diagnostic, ...report.outcomes.map(row => row.reason?.diagnostic)].join('\n');
          expect(diagnostics).toMatch(drift === 'ledger-generation' ? /generation/i : /frozen.*drift/i);
          expect(snapshotTree(h.home)).toEqual(before);
          expect(snapshotTree(h.ambientHome)).toEqual(ambientBefore);
        } finally {
          for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        }
      });
    }, 30_000);
  }
}
