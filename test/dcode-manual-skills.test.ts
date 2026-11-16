import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFiles } from './util';
import { dcodeManualSkillsEnabled, dcodeManualSkillsProfiles, projectDcodeManualSkills } from '../src/hosts/dcode-manual-skills';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { admitPackageSemanticsFromProfiles, capabilityEvidenceProfiles } from '../src/capability-evidence';

test('manual projection preserves authored files and extension entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'dcode-manual-skills-'));
  const skill = '---\nname: manual\ndescription: manual\ndisable_model_invocation: true\n---\nbody\n';
  try {
    writeFiles(root, { 'plugin.json': JSON.stringify({ name: 'test', version: '1.0.0', extensions: { 'com.langchain.deepagents.code': { pythonExtensions: ['./authored.py'] } } }), 'authored.py': 'original', 'skills/manual/SKILL.md': skill });
    projectDcodeManualSkills(root, 'test', true);
    expect(readFileSync(join(root, 'skills/manual/SKILL.md'), 'utf8')).toBe(skill);
    expect(JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8')).extensions['com.langchain.deepagents.code'].pythonExtensions).toEqual(['./authored.py', './.plgnz-manual-skills.py']);
    expect(() => projectDcodeManualSkills(root, 'test', true)).toThrow('overwrite');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('manual projection and profile fail closed without effective native feature', () => {
  const root = mkdtempSync(join(tmpdir(), 'dcode-manual-disabled-'));
  try {
    writeFiles(root, { 'plugin.json': '{"name":"test","version":"1.0.0"}', 'skills/a/SKILL.md': '---\nname: a\ndescription: a\ndisable-model-invocation: true\n---\na\n' });
    expect(() => projectDcodeManualSkills(root, 'test', false)).toThrow('verified experimental');
    expect(dcodeManualSkillsProfiles(capabilityEvidenceProfiles, false)[0]?.semantics['model-invocation-control']).toBe('unsupported');
    expect(dcodeManualSkillsProfiles(capabilityEvidenceProfiles, true)[0]?.semantics['model-invocation-control']).toBe('supported');
    expect(dcodeManualSkillsProfiles(capabilityEvidenceProfiles, true)[0]?.semantics['user-invocation-control']).toBe('unsupported');
    expect(dcodeManualSkillsEnabled('/missing/unverified-python')).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('bare personas become manual user skills while original bytes remain intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'dcode-persona-skills-'));
  const persona = '---\nname: reviewer\ndescription: Review changes\n---\n\nKeep this complete persona body.\n';
  try {
    writeFiles(root, { 'plugin.json': '{"name":"test","version":"1.0.0"}', 'agents/reviewer.md': persona });
    projectDcodeManualSkills(root, 'test', true);
    expect(readFileSync(join(root, 'agents/reviewer.md'), 'utf8')).toBe(persona);
    expect(readFileSync(join(root, 'skills/persona-reviewer/SKILL.md'), 'utf8')).toContain('disable-model-invocation: true');
    expect(readFileSync(join(root, 'skills/persona-reviewer/SKILL.md'), 'utf8')).toContain('Keep this complete persona body.');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const metadata of ['model: fast', 'tools: [read_file]', 'permissionMode: bypassPermissions', 'modelAlias: fast']) {
  test(`persona projection rejects native metadata: ${metadata}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'dcode-persona-metadata-'));
    try {
      writeFiles(root, { 'plugin.json': '{"name":"test","version":"1.0.0"}', 'agents/reviewer.md': `---\nname: reviewer\ndescription: Review changes\n${metadata}\n---\nbody\n` });
      expect(() => projectDcodeManualSkills(root, 'test', true)).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('persona wrappers refuse collisions with authored skills', () => {
  const root = mkdtempSync(join(tmpdir(), 'dcode-persona-collision-'));
  try {
    writeFiles(root, { 'plugin.json': '{"name":"test","version":"1.0.0"}', 'agents/reviewer.md': '---\nname: reviewer\ndescription: Review changes\n---\nbody\n', 'skills/persona-reviewer/SKILL.md': 'authored bytes' });
    expect(() => projectDcodeManualSkills(root, 'test', true)).toThrow('collision');
    expect(readFileSync(join(root, 'skills/persona-reviewer/SKILL.md'), 'utf8')).toBe('authored bytes');
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('persona admission needs no authored commands and still refuses authored commands', () => {
  const root = mkdtempSync(join(tmpdir(), 'dcode-persona-admission-'));
  try {
    writeFiles(root, { 'plugin.json': '{"name":"test","version":"1.0.0"}', 'agents/reviewer.md': '---\nname: reviewer\ndescription: Review changes\n---\nbody\n' });
    const request = () => ({ host: 'dcode', detectedVersion: '0.1.83', sourceType: 'local' as const, operation: 'install' as const, route: 'managed' as const, inventory: inventoryPackageSemantics({ name: 'test', dir: root }) });
    const profiles = dcodeManualSkillsProfiles(capabilityEvidenceProfiles, true);
    expect(admitPackageSemanticsFromProfiles(request(), profiles).status).toBe('admitted');
    writeFiles(root, { 'commands/run.md': '---\ndescription: Run\n---\nrun\n' });
    const result = admitPackageSemanticsFromProfiles(request(), profiles);
    expect(result.status).toBe('refused');
    expect(result.gaps.some((gap) => gap.capabilityId === 'commands')).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
