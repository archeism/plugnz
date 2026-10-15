import { test, expect, describe } from 'bun:test';
import { withHostEnvAsync } from './util';
import { main } from '../src/cli';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './util';

describe('targets', () => {
  test('lists detected targets', async () => {
    await withHostEnvAsync('claude-code', async (home) => {
      const origLog = console.log;
      const logs: string[] = [];
      console.log = (...args: any[]) => logs.push(args.join(' '));
      
      const code = await main(['targets']);
      
      console.log = origLog;
      expect(code).toBe(0);
      expect(logs).toContain('claude-code');
    });
  });
  
  test('json output', async () => {
    await withHostEnvAsync('claude-code', async (home) => {
      const origLog = console.log;
      let output = '';
      console.log = (msg: string) => output = msg;
      
      const code = await main(['targets', '--json']);
      
      console.log = origLog;
      expect(code).toBe(0);
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toContain('claude-code');
    });
  });

  test('does not treat a Cursor settings directory as an installed host', async () => {
    await withHostEnvAsync('cursor', async () => {
      const originalLog = console.log;
      let output = '';
      console.log = (message: string) => { output = message; };
      try { expect(await main(['targets', '--json'])).toBe(0); }
      finally { console.log = originalLog; }
      expect((JSON.parse(output) as string[]).includes('cursor')).toBe(false);
    });
  });

  test('reports a real cursor-agent executable even when its version is unknown', async () => {
    await withHostEnvAsync('cursor', async (home) => {
      const bin = join(home, 'bin');
      mkdirSync(bin, { recursive: true });
      const cursor = join(bin, 'cursor-agent');
      writeFileSync(cursor, '#!/bin/sh\nprintf "unknown Cursor build\\n"\n');
      chmodSync(cursor, 0o755);
      const originalLog = console.log;
      let output = '';
      console.log = (message: string) => { output = message; };
      try { expect(await main(['targets', '--json'])).toBe(0); }
      finally { console.log = originalLog; }
      expect(JSON.parse(output)).toContain('cursor');
    });
  });

  test('list json filters to the requested detected target', async () => {
    await withHostEnvAsync('claude-code', async () => {
      const originalLog = console.log;
      let output = '';
      console.log = (msg: string) => output = msg;
      try {
        expect(await main(['list', '--target', 'claude-code', '--json'])).toBe(0);
      } finally {
        console.log = originalLog;
      }
      const rows = JSON.parse(output) as Array<{ host: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.host).toBe('claude-code');
    });
  });

  test('actual CLI exposes all frozen profiles only when requested', () => {
    const result = spawnSync('bun', [join(repoRoot, 'bin', 'plugnz.mjs'), 'targets', '--all'], { cwd: repoRoot, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('grokbot');
  });

  test('targets --all --json retains profile evidence while default JSON stays ids', async () => {
    await withHostEnvAsync('claude-code', async () => {
      const originalLog = console.log;
      let output = '';
      console.log = (message: string) => { output = message; };
      try { expect(await main(['targets', '--all', '--json'])).toBe(0); }
      finally { console.log = originalLog; }
      const profiles = JSON.parse(output) as Array<{ id: string; scope: string; version: string; evidence: string; capabilityEvidenceIds: string[]; capabilities: Record<string, string> }>;
      expect(profiles).toHaveLength(16);
      expect(profiles.find((profile) => profile.id === 'grokbot')?.scope).toBe('excluded-standalone');
      for (const id of ['pi', 'opencode']) {
        const profile = profiles.find((profile) => profile.id === id);
        expect(profile?.scope).toBe('native-plugin');
        expect(profile?.capabilities).toEqual({ install: 'supported', update: 'supported' });
        expect(profile?.evidence).toBe('docs/hooks.md');
      }
      expect(profiles.find((profile) => profile.id === 'gemini-cli')?.scope).toBe('native-plugin');
      expect(profiles.find((profile) => profile.id === 'cursor')?.evidence).toBe('docs/hosts/cursor.md');
      expect(Object.keys(profiles.find((profile) => profile.id === 'codex')?.capabilities ?? {}).sort()).toEqual(['install', 'update']);
      const dcode = profiles.find((profile) => profile.id === 'dcode');
      expect(dcode?.version).toBe('0.1.83');
      expect(dcode?.capabilities).toEqual({ install: 'supported', update: 'supported' });
      expect(dcode?.capabilityEvidenceIds).toHaveLength(1);
      expect(dcode?.capabilityEvidenceIds[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
  });

  test('actual CLI reports its package version as JSON', () => {
    const result = spawnSync('bun', [join(repoRoot, 'bin', 'plugnz.mjs'), '--version', '--json'], { cwd: repoRoot, encoding: 'utf8' });
    expect(result.status).toBe(0);
    const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(JSON.parse(result.stdout)).toEqual({ name: 'plugnz', version });
  });
});
