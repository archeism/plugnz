import { describe, expect, test } from 'bun:test';
import { parse } from 'smol-toml';
import { planCodexAgentConfig, type CodexAgentConfigRef } from '../src/hosts/codex-agent-config.js';

const prior: CodexAgentConfigRef = { name: 'addy:reviewer', configFile: '/cache/addy/v1/agents/reviewer.toml' };
const next: CodexAgentConfigRef = { ...prior, configFile: '/cache/addy/v2/agents/reviewer.toml' };
const entry = (ref: CodexAgentConfigRef) => `[agents.${JSON.stringify(ref.name)}]\nconfig_file = ${JSON.stringify(ref.configFile)}\n`;

describe('native Codex agent config ownership', () => {
  test('adds explicit native refs while preserving unrelated settings and bytes', () => {
    const original = '# My settings\nmodel = "gpt-model"\n\n[agents.user]\nconfig_file = "/my/role.toml" # Keep this\n';
    const result = planCodexAgentConfig(original, [], [prior]);
    expect(result.startsWith(original)).toBe(true);
    expect(parse(result).agents).toEqual({ user: { config_file: '/my/role.toml' }, [prior.name]: { config_file: prior.configFile } });
  });

  test('updates alias-derived paths and preserves comments, other roles, and appended user edits on rollback', () => {
    const unrelated = '# Comment at end\n[agents.user]\nconfig_file="mine"\n';
    const initial = entry(prior) + unrelated;
    const updated = planCodexAgentConfig(initial, [prior], [next]);
    expect(updated).toContain(unrelated);
    expect(updated).toContain(entry(next));
    const userEdit = '\n[history]\nmax_bytes = 2048\n';
    const restored = planCodexAgentConfig(updated + userEdit, [next], [prior]);
    expect(parse(restored)).toEqual(parse(initial + userEdit));
    expect(restored).toContain(userEdit);
  });

  test('removes owned entries without removing comments or unrelated role entries', () => {
    const comment = '# Keep my comment\n\n';
    const foreign = '[agents.mine]\nconfig_file="mine"\n';
    const result = planCodexAgentConfig(entry(prior) + comment + foreign, [prior], []);
    expect(result).toBe(comment + foreign);
  });

  test('missing owned entries are repaired; missing removals are harmless', () => {
    expect(planCodexAgentConfig('', [prior], [next])).toBe(entry(next));
    expect(planCodexAgentConfig('model="m"\n', [prior], [])).toBe('model="m"\n');
  });

  test('unchanged owned registrations are byte-identical', () => {
    const initial = '# original\n' + entry(prior) + '\n# tail\n';
    expect(planCodexAgentConfig(initial, [prior], [prior])).toBe(initial);
  });

  test('refuses adoption even when foreign path matches desired', () => {
    expect(() => planCodexAgentConfig(entry(prior), [], [prior])).toThrow('outside plugnz ownership');
  });

  test('refuses user modifications and extra fields on update or removal', () => {
    for (const text of [entry(prior).replace(prior.configFile, '/user.toml'), entry(prior) + 'description = "mine"\n']) {
      expect(() => planCodexAgentConfig(text, [prior], [next])).toThrow('was modified');
      expect(() => planCodexAgentConfig(text, [prior], [])).toThrow('was modified');
    }
  });

  test('refuses alternate quoting, dotted keys and inline tables even if semantically equal', () => {
    for (const text of [
      `[agents.'${prior.name}']\nconfig_file = ${JSON.stringify(prior.configFile)}\n`,
      `[agents]\n"${prior.name}" = { config_file = ${JSON.stringify(prior.configFile)} }\n`,
      `agents."${prior.name}".config_file = ${JSON.stringify(prior.configFile)}\n`,
      entry(prior).replace('config_file = ', 'config_file='),
    ]) expect(() => planCodexAgentConfig(text, [prior], [])).toThrow('noncanonical');
  });

  test('multiline basic/literal strings containing fake canonical table headers stay intact', () => {
    for (const quote of ['"""', "'''"]) {
      const transcript = `developer_instructions = ${quote}\n${entry(prior)}${quote}\n`;
      const original = transcript + '\n' + entry(prior);
      const result = planCodexAgentConfig(original, [prior], [next]);
      expect(result.startsWith(transcript)).toBe(true);
      expect(parse(result).developer_instructions).toBe(parse(original).developer_instructions);
      expect((parse(result).agents as Record<string, unknown>)[prior.name]).toEqual({ config_file: next.configFile });
    }
  });

  test('fake section headers in array-contained multiline strings stay intact', () => {
    const text = `notes = [\n"""\n${entry(prior)}""",\n["other", "array"]\n]\n`;
    expect(planCodexAgentConfig(text + entry(prior), [prior], [])).toBe(text);
  });

  test('fake owned headers cannot authorize mutation of an inline foreign table', () => {
    const text = `notes = '''\n${entry(prior)}'''\n[agents]\n"${prior.name}" = { config_file = ${JSON.stringify(prior.configFile)} }\n`;
    expect(() => planCodexAgentConfig(text, [prior], [])).toThrow('noncanonical');
  });

  test('preserves CRLF and handles files without terminal newline', () => {
    const text = '# comment\r\nmodel="m"';
    const result = planCodexAgentConfig(text, [], [prior]);
    expect(result).toBe(text + '\r\n\r\n' + entry(prior).replaceAll('\n', '\r\n'));
    expect(planCodexAgentConfig(result, [prior], [])).toBe(text + '\r\n\r\n');
  });

  test('supports safely quoted names and file paths', () => {
    const ref = { name: 'plugin:review"er', configFile: '/cache/role\\".toml' };
    const result = planCodexAgentConfig('', [], [ref]);
    expect((parse(result).agents as Record<string, unknown>)[ref.name]).toEqual({ config_file: ref.configFile });
    expect(planCodexAgentConfig(result, [ref], [])).toBe('');
  });

  test('rejects malformed configs, duplicate refs, non-table agents and control characters', () => {
    expect(() => planCodexAgentConfig('broken = [', [], [prior])).toThrow();
    expect(() => planCodexAgentConfig('', [], [prior, prior])).toThrow('Duplicate');
    expect(() => planCodexAgentConfig('agents = "foreign"', [], [prior])).toThrow('must be a table');
    expect(() => planCodexAgentConfig('', [], [{ ...prior, name: 'bad\nname' }])).toThrow('control characters');
  });
});
