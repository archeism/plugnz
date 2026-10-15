import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { codex } from '../src/hosts/codex';
import { codexWriter } from '../src/hosts/codex-writer';
import type { PluginSource, ResolvedSource } from '../src/source';
import { withHostEnvAsync, writeFiles } from './util';

function source(files: Record<string, string>): { plugin: PluginSource; resolved: ResolvedSource } {
  const dir = mkdtempSync(join(tmpdir(), 'plgnz-codex-enabled-comment-'));
  writeFiles(dir, { 'plugin.json': '{"name":"demo-plugin","version":"1.2.0"}', ...files });
  const plugin: PluginSource = {
    dir,
    name: 'demo-plugin',
    marketplace: 'demo-market',
    contentFingerprint: JSON.stringify(files),
  };
  return { plugin, resolved: { sourceUri: dir, sha: 'ignored-for-codex-version', isGit: false, plugins: [plugin] } };
}

describe('codex enabled assignment comments', () => {
  test('re-enables an unchanged install when enabled = false has a trailing comment', async () => {
    await withHostEnvAsync('codex', async home => {
      const incoming = source({ 'resources/value.txt': 'safe\n' });
      await codexWriter.add(incoming.plugin, incoming.resolved);
      expect(await codexWriter.add(incoming.plugin, incoming.resolved)).toBe('unchanged');
      const configPath = join(home, '.codex/config.toml');
      const lines = ['enabled = false # note', 'enabled = false   # note', 'enabled=false#note'];
      for (const line of lines) {
        writeFileSync(configPath, `[plugins."demo-plugin@demo-market"]\n${line}\n`);
        const result = await codexWriter.add(incoming.plugin, incoming.resolved);
        const config = readFileSync(configPath, 'utf8');
        expect(result).toBeUndefined();
        expect(config).toContain(line.replace('false', 'true'));
        expect(config.match(/enabled\s*=/gu) ?? []).toHaveLength(1);
        expect(codex.listInstalled().find(plugin => plugin.id === 'demo-plugin@demo-market')?.enabled).toBe(true);
      }
      writeFileSync(configPath, '[plugins."demo-plugin@demo-market"]\nenabled = true # note\n');
      expect(await codexWriter.add(incoming.plugin, incoming.resolved)).toBe('unchanged');
      expect(readFileSync(configPath, 'utf8')).toBe('[plugins."demo-plugin@demo-market"]\nenabled = true # note\n');
    });
  });

  test('remove drops a commented enabled line instead of leaving the comment behind', async () => {
    await withHostEnvAsync('codex', async home => {
      const configPath = join(home, '.codex/config.toml');
      writeFileSync(configPath, '[plugins."demo-plugin@demo-market"]\nenabled = false # note\n\n[plugins."other@market"]\nenabled = false # leave\n');
      await codexWriter.remove('demo-plugin@demo-market');
      const removed = readFileSync(configPath, 'utf8');
      expect(removed.includes('[plugins."demo-plugin@demo-market"]')).toBe(false);
      expect(removed.includes('# note')).toBe(false);
      expect(removed).toContain('[plugins."other@market"]');
      expect(removed).toContain('enabled = false # leave');

      writeFileSync(configPath, '[plugins."demo-plugin@demo-market"]\nenabled = true   # note\nuser_option = "keep"\n\n[plugins."other@market"]\nenabled=false#leave\n');
      await codexWriter.remove('demo-plugin@demo-market');
      const kept = readFileSync(configPath, 'utf8');
      const demo = kept.slice(0, kept.indexOf('[plugins."other@market"]'));
      expect(demo).toContain('[plugins."demo-plugin@demo-market"]');
      expect(demo).toContain('user_option = "keep"');
      expect(demo).toContain('enabled = false');
      expect(demo.includes('# note')).toBe(false);
      expect(demo.includes('enabled = true')).toBe(false);
      expect(demo.match(/enabled\s*=/gu) ?? []).toHaveLength(1);
      expect(kept).toContain('enabled=false#leave');
    });
  });
});
