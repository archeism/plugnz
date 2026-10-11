import type { LifecycleHostAdapter } from './lifecycle-host';
import { createLifecycleHostAdapter } from './lifecycle-runtime';
import type { PlannerHost } from './planner';
import type { PluginSource } from './source';
import { createClaudeCodeLifecycleHost, claudeCodeWriter } from './hosts/claude-code-writer';
import { codexLifecycle, codexWriter } from './hosts/codex-writer';
import { dcodeLifecycle, dcodeWriter } from './hosts/dcode-writer';
import { announceCursorDryRun, cursorManagedLifecycle, cursorWriter } from './hosts/cursor-writer';
import { createGrokLifecycleAdapter, grokWriter } from './hosts/grok-writer';
import { hermesLifecycle, hermesWriter } from './hosts/hermes-writer';
import { kimiLifecycle, kimiWriter, samePhysicalKimiNativeIdentity } from './hosts/kimi-writer';
import { ompLifecycle, ompWriter } from './hosts/omp-writer';
import { zcodeCliLifecycle, zcodeCliWriter } from './hosts/zcode-cli-writer';

function plannerHost(
  kind: string,
  adapter: LifecycleHostAdapter,
  plannedNativeId: (plugin: PluginSource) => string,
  announceDryRun?: PlannerHost['announceDryRun'],
): PlannerHost {
  return {
    kinds: [kind],
    adapter,
    plannedNativeId,
    ...(announceDryRun === undefined ? {} : { announceDryRun }),
  };
}

export const lifecyclePlannerHostKinds = [
  'claude-code',
  'codex',
  'dcode',
  'kimi',
  'cursor',
  'omp',
  'hermes',
  'grok',
  'zcode-cli',
] as const;

/** Fresh adapters for one command. Claude snapshots its CLI at construction. */
export function createLifecyclePlannerHosts(): readonly PlannerHost[] {
  return [
    plannerHost('claude-code', createClaudeCodeLifecycleHost(), claudeCodeWriter.plannedNativeId),
    plannerHost('codex', codexLifecycle, codexWriter.plannedNativeId),
    plannerHost('dcode', dcodeLifecycle, dcodeWriter.plannedNativeId),
    { ...plannerHost('kimi', createLifecycleHostAdapter(kimiLifecycle), kimiWriter.plannedNativeId), samePhysicalNativeIdentity: samePhysicalKimiNativeIdentity },
    plannerHost('cursor', cursorManagedLifecycle, cursorWriter.plannedNativeId, announceCursorDryRun),
    plannerHost('omp', ompLifecycle, ompWriter.plannedNativeId),
    plannerHost('hermes', hermesLifecycle, hermesWriter.plannedNativeId),
    plannerHost('grok', createGrokLifecycleAdapter(), grokWriter.plannedNativeId),
    plannerHost('zcode-cli', zcodeCliLifecycle, zcodeCliWriter.plannedNativeId),
  ];
}
