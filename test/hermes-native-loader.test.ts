import { expect, test } from 'bun:test';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { hermesWriter } from '../src/hosts/hermes-writer';
import type { PluginSource, ResolvedSource } from '../src/source';
import { writeFiles } from './util';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { CryptoHasher } from '../src/runtime';

function sourceDigest(root: string): string {
  const hash = new CryptoHasher('sha256');
  const walk = (path: string): void => {
    hash.update(path);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) hash.update(readlinkSync(path));
    else if (stat.isDirectory()) for (const entry of readdirSync(path).sort()) walk(join(path, entry));
    else if (stat.isFile()) hash.update((readFileSync as unknown as (path: string) => Uint8Array)(path));
  };
  walk(root);
  return hash.digest('hex');
}

const hermesSource = process.env.HERMES_SOURCE_ROOT;
const conditionalTest = test as typeof test & { if(condition: boolean): typeof test };

conditionalTest.if(hermesSource !== undefined)('current Hermes loader registers ordinary discovery and queues a prompt command into CLI input', async () => {
  const sourceRoot = hermesSource!;
  const python = join(sourceRoot, '.venv', 'bin', 'python');
  expect(existsSync(python)).toBe(true);
  const root = mkdtempSync(join(tmpdir(), 'plgnz-hermes-native-'));
  const source = join(root, 'source'); const home = join(root, 'hermes-home'); const processHome = join(root, 'user-home'); const cwd = join(root, 'cwd'); const config = join(root, 'profile', 'config.yaml');
  writeFiles(source, {
    'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"native-proof","version":"1.0.0","description":"proof"}',
    'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: Ordinary discovery proof\n---\nbody\n',
    'skills/manual/SKILL.md': '---\nname: manual\ndescription: User-only proof\ndisable-model-invocation: true\n---\nmanual body\n',
    'skills/manual/agents/openai.yaml': 'policy:\n  allow_implicit_invocation: false\n',
    'commands/run.toml': 'description = "Run proof"\nargument_hint = "<text>"\nprompt = "queued $ARGUMENTS first=$1 second=${2}"\n',
  });
  writeFiles(root, { 'profile/config.yaml': '' });
  writeFiles(home, { '.keep': '' });
  writeFiles(processHome, { '.keep': '' });
  writeFiles(cwd, { '.keep': '' });
  symlinkSync(config, join(home, 'config.yaml'));
  const plugin: PluginSource = { dir: source, name: 'native-proof', contentFingerprint: 'proof' };
  const resolved: ResolvedSource = { sourceUri: source, sha: 'proof', isGit: false, plugins: [plugin] };
  const savedRoot = process.env.OPEN_PLUGIN_HERMES_ROOT; const savedConfig = process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH;
  process.env.OPEN_PLUGIN_HERMES_ROOT = home; process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH = join(home, 'config.yaml');
  try {
    await hermesWriter.add(plugin, resolved);
    const probe = `
import json, queue, sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(sourceRoot)})
from hermes_cli.plugins import PluginManager

class CLI:
    def __init__(self):
        self._agent_running = False
        self._pending_input = queue.SimpleQueue()
        self._interrupt_queue = queue.SimpleQueue()

manager = PluginManager(${JSON.stringify(home)})
manager._cli_ref = CLI()
manager.discover_and_load()
entry = manager._plugin_commands["native-proof:run"]
result = entry["handler"]('"alpha beta" "literal $1"')
queued = manager._cli_ref._pending_input.get_nowait()
manual_result = manager._plugin_commands["native-proof:manual"]["handler"]("manual args")
manual_queued = manager._cli_ref._pending_input.get_nowait()
print(json.dumps({
    "result": result,
    "queued": queued,
    "manual_result": manual_result,
    "manual_queued": manual_queued,
    "commands": sorted(manager._plugin_commands),
    "skills": sorted(manager._plugin_skills),
    "sections": sorted(manager._system_prompt_sections),
}))
`;
    const nativeEnv: Record<string, string | undefined> = { ...process.env, HOME: processHome, HERMES_HOME: home, PYTHONPATH: sourceRoot };
    for (const key of ['HERMES_CONFIG_PATH', 'HERMES_PROFILE', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR']) delete nativeEnv[key];
    const result = spawnSync(python, ['-c', probe], {
      cwd,
      env: nativeEnv,
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(`Hermes native probe failed: ${result.stderr}`);
    const evidence = JSON.parse(result.stdout.trim()) as { result: unknown; queued: string; manual_result: unknown; manual_queued: string; commands: string[]; skills: string[]; sections: string[] };
    const evidencePath = process.env.HERMES_PROBE_EVIDENCE_PATH;
    if (evidencePath !== undefined) writeFileSync(evidencePath, JSON.stringify({ stdout: result.stdout, stderr: result.stderr, status: result.status }, null, 2));
    expect(evidence.result).toBe(null);
    expect(evidence.queued).toContain('queued "alpha beta" "literal $1" first=alpha beta second=literal $1');
    expect(evidence.skills.some(name => name.endsWith(':ordinary'))).toBe(true);
    expect(evidence.skills.some(name => name.endsWith(':manual'))).toBe(false);
    expect(evidence.commands).toContain('native-proof:manual');
    expect(evidence.manual_result).toBe(null);
    expect(evidence.manual_queued).toContain('.plgnz-user-skills/manual/SKILL.md');
    expect(evidence.manual_queued).toContain('manual args');
    expect(evidence.sections).toContain('native-proof.plgnz-commands.skills');
  } finally {
    if (savedRoot === undefined) delete process.env.OPEN_PLUGIN_HERMES_ROOT; else process.env.OPEN_PLUGIN_HERMES_ROOT = savedRoot;
    if (savedConfig === undefined) delete process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH; else process.env.OPEN_PLUGIN_HERMES_CONFIG_PATH = savedConfig;
    rmSync(root, { recursive: true, force: true });
  }
});

conditionalTest.if(hermesSource !== undefined)('public CLI admits official editable and native forwarder launchers without source or venv writes', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
    const source = harness.source('hermes-real-admission', {
      'plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nDemo.\n',
    });
    const generated = spawnSync(join(hermesSource!, '.venv', 'bin', 'python'), ['-I', '-B', '-c',
      `import sys\nfrom pathlib import Path\nsys.path.insert(0, ${JSON.stringify(hermesSource!)})\nfrom hermes_cli._launchers import _launcher_script\nprint(_launcher_script('hermes', Path(${JSON.stringify(hermesSource!)}), None), end='')`,
    ], { encoding: 'utf8', env: { ...process.env, HOME: harness.home, HERMES_HOME: harness.home,
      XDG_CONFIG_HOME: harness.home, XDG_DATA_HOME: harness.home, XDG_CACHE_HOME: harness.home,
      XDG_STATE_HOME: harness.home, XDG_RUNTIME_DIR: harness.home, PYTHONDONTWRITEBYTECODE: '1' } });
    if (generated.status !== 0) throw new Error(`Official isolated launcher generation failed: ${generated.stderr}`);
    const native = join(source, 'official-native-hermes');
    writeFileSync(native, `#!/bin/sh\nexec /usr/bin/python3 -I -c '${generated.stdout.replace(/'/gu, `'"'"'`)}' "$@"\n`);
    chmodSync(native, 0o755);
    const forwarder = join(source, 'hermes-forwarder');
    writeFileSync(forwarder, `#!/bin/sh\nexec ${JSON.stringify(native)} "$@"\n`);
    chmodSync(forwarder, 0o755);
    for (const executable of [join(hermesSource!, '.venv', 'bin', 'hermes'), forwarder]) {
      const before = sourceDigest(hermesSource!);
      const result = harness.run(['add', source, '--target', 'hermes', '--dry-run', '--json'], {
        env: { OPEN_PLUGIN_HERMES_BIN: executable },
      });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect({ code: result.exitCode, reason: report.outcomes[0]?.reason }).toEqual({ code: 0, reason: null });
      expect(sourceDigest(hermesSource!)).toBe(before);
      expect(result.stores.hermes.after).toEqual(result.stores.hermes.before);
      expect(result.state.after).toEqual(result.state.before);
    }
  });
}, 30_000);
