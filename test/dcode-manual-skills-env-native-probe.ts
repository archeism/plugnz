/** Run explicitly with Bun and the real Dcode Python interpreter as argv[2]. */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dcodeManualSkillsEnabled } from '../src/hosts/dcode-manual-skills';
import { writeFiles } from './util';

const python = process.argv[2];
if (!python) throw new Error('pass the real Dcode Python interpreter');
const root = mkdtempSync(join(tmpdir(), 'dcode-manual-env-native-'));
const ambient = join(root, 'ambient'), target = join(root, 'target'), isolated = join(root, 'isolated');
const keys = ['HOME', 'DEEPAGENTS_HOME', 'OPEN_PLUGIN_HOME', 'OPEN_PLUGIN_DCODE_ROOT', 'DEEPAGENTS_CODE_EXPERIMENTAL'] as const;
const saved = new Map(keys.map((key) => [key, process.env[key]]));
try {
  process.env.HOME = ambient;
  delete process.env.DEEPAGENTS_HOME;
  delete process.env.OPEN_PLUGIN_HOME;
  process.env.OPEN_PLUGIN_DCODE_ROOT = target;
  process.env.DEEPAGENTS_CODE_EXPERIMENTAL = '1';
  writeFiles(join(ambient, '.deepagents'), { 'config.toml': '[extensions]\nenabled = true\n' });
  writeFiles(target, { 'config.toml': '[extensions]\nenabled = false\n' });
  const native = spawnSync(python, ['-c', "from deepagents_code.extensions.settings import load_extension_settings; print(load_extension_settings().enabled)"], { env: { ...process.env }, encoding: 'utf8' });
  if (native.status !== 0 || native.stdout.trim() !== 'True') throw new Error(`ambient native control failed: ${native.stderr}`);
  if (dcodeManualSkillsEnabled(python)) throw new Error('disabled target incorrectly inherited enabled ambient configuration');
  writeFiles(join(ambient, '.deepagents'), { 'config.toml': '[extensions]\nenabled = false\n' });
  writeFiles(target, { 'config.toml': '[extensions]\nenabled = true\n' });
  if (!dcodeManualSkillsEnabled(python)) throw new Error('enabled target incorrectly inherited disabled ambient configuration');
  process.env.OPEN_PLUGIN_HOME = isolated;
  writeFiles(target, { 'config.toml': '[extensions]\nenabled = false\n' });
  writeFiles(join(isolated, '.deepagents'), { 'config.toml': '[extensions]\nenabled = true\n' });
  if (dcodeManualSkillsEnabled(python)) throw new Error('explicit target must override isolated-home native config');
  console.log(JSON.stringify({ nativeVersion: '0.1.83', ambientEnabledControl: true, disabledTargetRefused: true, enabledTargetAdmittedWithoutIsolatedHome: true, explicitTargetOverridesIsolatedHome: true }));
} finally {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
}
