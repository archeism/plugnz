import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runHooks, validateHookConfig, type HookInput } from '../src/hooks';
import { buildHooks, hookAdapters } from '../src/hook-build';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { admitPackageSemanticsFromProfiles, createCapabilityEvidenceProfile } from '../src/capability-evidence';
import { portableHookProfile } from '../src/portable-hook-policy';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'plugnz-effects-')); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
function input(event: HookInput['event'] = 'session.start'): HookInput {
  return { version: 1, harness: 'fixture', event, cwd: root,
    ...(event === 'turn.stop' ? { stop: { active: false } } : {}) };
}
function config(event: string, requires: unknown, result: unknown = {}, version = 2) {
  return { version, hooks: { [event]: [{ command: [process.execPath, '-e', 'console.log(' + JSON.stringify(JSON.stringify(result)) + ')'], requires }] } };
}
function source(value: unknown): string {
  const path = join(root, 'package'); mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'plugin.json'), JSON.stringify({ name: 'effect-fixture', version: '1.0.0' }));
  writeFileSync(join(path, 'plugnz.hooks.json'), JSON.stringify(value));
  return path;
}
async function failure(fn: () => unknown | Promise<unknown>): Promise<string> {
  try { await fn(); return 'NO ERROR'; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

describe('versioned hook requirements', () => {
  test('v1 remains strict and v2 preserves declarations', () => {
    expect(() => validateHookConfig(config('session.start', { context: true }, {}, 1))).toThrow('unsupported field');
    expect(validateHookConfig(config('session.start', { context: true })).version).toBe(2);
    expect(validateHookConfig(config('session.start', { context: true })).hooks['session.start']![0]!.requires).toEqual({ context: true });
    expect(() => validateHookConfig({ version: 3, hooks: {} })).toThrow('version');
  });
  test('rejects unknown effects, nonbooleans and impossible event combinations', () => {
    for (const requires of [null, [], 'context', { deny: true }, { context: 1 }]) {
      expect(() => validateHookConfig(config('session.start', requires))).toThrow();
    }
    expect(() => validateHookConfig(config('session.start', { context: true, continue: true }))).toThrow('turn.stop');
    expect(() => validateHookConfig(config('turn.stop', { continue: true }))).toThrow('context');
    expect(() => validateHookConfig(config('turn.stop', { context: true }))).toThrow('continue');
  });
  test('requirements describe capability, not a demand to return context every time', async () => {
    expect(await runHooks(config('session.start', { context: true }), input(), root)).toEqual({});
    expect(await runHooks(config('session.start', { context: true }, { context: 'context' }), input(), root)).toEqual({ context: 'context' });
    expect(await runHooks(config('turn.stop', { context: true, continue: true }, { context: 'again', continue: true }), input('turn.stop'), root)).toEqual({ context: 'again', continue: true });
  });
  test('undeclared effects cannot leak through the runtime', async () => {
    expect(await failure(() => runHooks(config('session.start', {}, { context: 'undeclared' }), input(), root))).toContain('undeclared context');
    expect(await failure(() => runHooks(config('turn.stop', {}, { context: 'again', continue: true }), input('turn.stop'), root))).toContain('undeclared');
    expect(await runHooks(config('turn.stop', {}, { continue: false }), input('turn.stop'), root)).toEqual({ continue: false });
    expect(await runHooks({ version: 1, hooks: { 'session.start': [{ command: [process.execPath, '-e', 'console.log(JSON.stringify({context:"legacy"}))'] }] } }, input(), root)).toEqual({ context: 'legacy' });
  });
  test('declarations are checked per handler, not borrowed from a sibling', async () => {
    const first = config('session.start', { context: true }, { context: 'first' }).hooks['session.start']![0]!;
    const second = config('session.start', {}, { context: 'second' }).hooks['session.start']![0]!;
    expect(await failure(() => runHooks({ version: 2, hooks: { 'session.start': [first, second] } }, input(), root))).toContain('session.start[1]: undeclared context');
  });
  test('admission uses the native effect map, including missing evidence', () => {
    const dir = source(config('turn.stop', { context: true, continue: true }));
    const inventory = inventoryPackageSemantics({ name: 'effect-fixture', dir });
    for (const adapter of hookAdapters) {
      const profile = portableHookProfile(adapter, 'managed', ['install', 'update']);
      const request = { host: adapter.id, detectedVersion: adapter.baselineVersion, sourceType: 'local' as const, route: 'managed' as const, operation: 'install' as const, inventory };
      const result = admitPackageSemanticsFromProfiles(request, [profile]);
      expect(result.status).toBe(adapter.id === 'opencode' ? 'refused' : 'admitted');
      if (adapter.id === 'opencode') expect(result.gaps[0]!.code).toBe('capability.unsupported');
      const { supportedEffects: _effects, ...oldPolicy } = profile.hookPolicy!;
      const noEvidence = createCapabilityEvidenceProfile({ ...profile, hookPolicy: oldPolicy });
      const unknown = admitPackageSemanticsFromProfiles(request, [noEvidence]);
      expect(unknown.status).toBe('refused');
      expect(unknown.gaps[0]!.code).toBe('capability.unverified');
    }
  });
  test('explicit compiler refuses an impossible requirement without publishing any target', () => {
    const dir = source(config('turn.stop', { context: true, continue: true }));
    const out = join(root, 'compiled');
    expect(() => buildHooks(dir, ['pi', 'opencode'], out)).toThrow('context');
    expect(existsSync(out)).toBe(false);
  });
  test('all six can build v2 startup context; checks-only stop works in OpenCode', () => {
    const dir = source(config('session.start', { context: true }));
    expect(buildHooks(dir, hookAdapters.map(a => a.id), join(root, 'compiled')).targets).toHaveLength(6);
    source(config('turn.stop', {}));
    expect(buildHooks(dir, ['opencode'], join(root, 'checks')).targets).toHaveLength(1);
  });
});
