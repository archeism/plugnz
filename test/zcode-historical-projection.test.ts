import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { projectZcodePayload } from '../src/hosts/zcode-cli-projection';
import { projectZcodePlugin } from '../src/hosts/zcode-cli-writer';
import { snapshotTree } from './lifecycle-cli-harness';

test('pure historical payload matches staging including empty command directories, without Source writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-zcode-projection-'));
  try {
    const source = join(root, 'source'); mkdirSync(join(source, 'commands/empty'), { recursive: true });
    writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"1.0.0"}');
    const before = snapshotTree(root), expected = projectZcodePayload(source, '/captured/resources', '1.0.0');
    expect(snapshotTree(root)).toEqual(before);
    let sameRootRefusal = '';
    try { projectZcodePlugin(source, source, join(root, 'equal-resources'), '/captured/resources', 'demo', 'demo', '1.0.0', 'a'.repeat(64), 'b'.repeat(64)); }
    catch (error) { sameRootRefusal = String(error); }
    expect(sameRootRefusal).toContain('must not be inside the source');
    expect(snapshotTree(root)).toEqual(before);
    const destination = join(root, 'stage'), resources = join(root, 'resources');
    mkdirSync(resources);
    projectZcodePlugin(source, destination, resources, '/captured/resources', 'demo@catalog', 'demo@catalog', '1.0.0', 'a'.repeat(64), 'b'.repeat(64));
    const actual = snapshotTree(destination);
    delete actual.files['.plgnz-install.json'];
    expect([...expected.payload].filter(([, entry]) => entry.kind === 'directory').map(([path]) => path).sort()).toEqual(actual.directories.sort());
    expect(Object.fromEntries([...expected.payload].filter(([, entry]) => entry.kind === 'file').map(([path, entry]) => [path, entry.kind === 'file' ? Array.from(entry.bytes) : []]))).toEqual(actual.files);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('projection refuses a redirected output before writing any foreign byte', () => {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-zcode-projection-'));
  try {
    const source = join(root, 'source'), foreign = join(root, 'foreign'); mkdirSync(source); mkdirSync(foreign);
    writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"1.0.0"}');
    writeFileSync(join(foreign, 'sentinel'), 'foreign body');
    const destination = join(root, 'stage'); symlinkSync(foreign, destination);
    const before = snapshotTree(root); let refused = '';
    try { projectZcodePlugin(source, destination, join(root, 'resources'), '/captured/resources', 'demo', 'demo', '1.0.0', 'a'.repeat(64), 'b'.repeat(64)); }
    catch (error) { refused = String(error); }
    expect(refused).toContain('symlink'); expect(snapshotTree(root)).toEqual(before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const commands of [false, true]) test(`pure user-only skill/resource projection matches staging, commands=${commands}`, () => {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-zcode-projection-'));
  try {
    const source = join(root, 'source'); mkdirSync(join(source, 'skills/demo/sub'), { recursive: true });
    writeFileSync(join(source, 'plugin.json'), '{"name":"demo","version":"1.0.0","description":"Hello"}');
    writeFileSync(join(source, 'skills/demo/SKILL.md'), '---\nname: hidden\ndescription: Hello\ndisable-model-invocation: true\nargument-hint: [one, two]\n---\nSee [notes](sub/notes.txt). `![example](none)`\n');
    writeFileSync(join(source, 'skills/demo/sub/notes.txt'), 'resource body\n');
    if (commands) {
      mkdirSync(join(source, 'commands/sub'), { recursive: true });
      writeFileSync(join(source, 'commands/sub/test.toml'), 'description = "Hello"\nprompt = "Run it"\n');
    }
    const before = snapshotTree(root), expected = projectZcodePayload(source, '/captured/resources', '1.0.0');
    expect(snapshotTree(root)).toEqual(before);
    const destination = join(root, 'stage'), resources = join(root, 'resources'); mkdirSync(resources);
    projectZcodePlugin(source, destination, resources, '/captured/resources', 'demo@catalog', 'demo@catalog', '1.0.0', 'a'.repeat(64), 'b'.repeat(64));
    const actual = snapshotTree(destination); delete actual.files['.plgnz-install.json'];
    for (const [tree, observed] of [[expected.payload, actual], [expected.resources, snapshotTree(resources)]] as const) {
      expect([...tree].filter(([, entry]) => entry.kind === 'directory').map(([path]) => path).sort()).toEqual(observed.directories.sort());
      expect(Object.fromEntries([...tree].filter(([, entry]) => entry.kind === 'file').map(([path, entry]) => [path, entry.kind === 'file' ? Array.from(entry.bytes) : []]))).toEqual(observed.files);
    }
    const command = expected.payload.get('commands/demo/hidden.md');
    expect(command?.kind === 'file' && new TextDecoder().decode(command.bytes)).toBe('---\ndescription: "Hello"\nargument-hint: [one two]\n---\nSee [notes](/captured/resources/skills/demo/sub/notes.txt). `![example](none)`\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
