/** Dcode 0.1.83 native Python-extension projection; see native probe evidence. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { yamlParse } from '../yaml';
import { assertPythonBytecodeCache, protectPythonBytecodeCache } from '../python-bytecode-cache';
import { inventoryPackageSemantics } from '../semantic-inventory';
import type { PluginSource } from '../source';
import { spawnSync } from '../runtime';
import { dcodeBinary, dcodeProbeEnv } from './dcode';
declare const TextDecoder: { new(): { decode(input: Uint8Array): string } };
import { createCapabilityEvidenceProfile, type CapabilityEvidenceProfile } from '../capability-evidence';

const ENTRY = '.plgnz-manual-skills.py';
const EXTENSION_KEY = 'com.langchain.deepagents.code';
const EVIDENCE = 'docs/evidence/dcode-manual-skills-20261116.md';
const VERIFIED = `from importlib.metadata import version
from deepagents_code.extensions.api import ExtensionAPI
from deepagents_code.extensions.settings import load_extension_settings
from deepagents_code._env_vars import EXPERIMENTAL, is_env_truthy
assert version('deepagents-code') == '0.1.83'
assert is_env_truthy(EXPERIMENTAL) and load_extension_settings().enabled
assert callable(ExtensionAPI.register_middleware)
print('DCODE_MANUAL_SKILLS_0.1.83')
`;

export function dcodeManualSkillsEnabled(python: string): boolean {
  const requested = process.env['DEEPAGENTS_CODE_EXPERIMENTAL'];
  if (requested !== undefined && requested !== '1') return false;
  try {
    if (requested === undefined) {
      const binary = dcodeBinary();
      if (binary === undefined) return false;
      const launcher = readFileSync(binary, 'utf8');
      const expected = `#!${python}\n# -*- coding: utf-8 -*-\nimport os\nos.environ.setdefault('DEEPAGENTS_CODE_EXPERIMENTAL', '1')\nimport sys\nfrom deepagents_code import cli_main\nif __name__ == "__main__":\n    if sys.argv[0].endswith("-script.pyw"):\n        sys.argv[0] = sys.argv[0][:-11]\n    elif sys.argv[0].endswith(".exe"):\n        sys.argv[0] = sys.argv[0][:-4]\n    sys.exit(cli_main())\n`;
      if (launcher !== expected) return false;
    }
    const probe = spawnSync([python, '-c', VERIFIED], { stdout: 'pipe', stderr: 'pipe', env: { ...dcodeProbeEnv(), DEEPAGENTS_CODE_EXPERIMENTAL: '1' }, timeout: 20_000 });
    return probe.exitCode === 0 && new TextDecoder().decode(probe.stdout).trim() === 'DCODE_MANUAL_SKILLS_0.1.83';
  } catch { return false; }
}

export function dcodeManualSkillsProfiles(profiles: readonly CapabilityEvidenceProfile[], enabled: boolean): CapabilityEvidenceProfile[] {
  return profiles.map((profile) => !enabled || profile.detectedVersion !== '0.1.83' ? profile : createCapabilityEvidenceProfile({
    ...profile, agentPolicy: 'prompt-commands', semantics: { ...profile.semantics, agents: 'supported', 'model-invocation-control': 'supported' }, evidence: [...profile.evidence, EVIDENCE],
  }));
}

/** Only an adapter-owned projection may require this generated extension guard. */
export function assertDcodeManualSkillsCache(root: string): void {
  if (existsSync(join(root, ENTRY))) assertPythonBytecodeCache(root, 'Dcode managed extension');
}

export function projectDcodeManualSkills(stage: string, name: string, enabled: boolean): void {
  const plugin = { name, dir: stage } as PluginSource;
  const inventory = inventoryPackageSemantics(plugin);
  if (inventory.portableAgents) throw new Error('dcode persona skills do not register portable agents');
  const personas = inventory.componentDefinitions.filter((definition) => definition.kind === 'agent');
  const wrappers: Array<{ path: string; content: string }> = [];
  for (const persona of personas) {
    if (persona.root !== 'agents' || persona.dialect !== 'markdown'
      || persona.metadataKeys?.some((key) => key !== 'name' && key !== 'description')) {
      throw new Error(`dcode cannot preserve native agent metadata: ${persona.path}`);
    }
    const raw = readFileSync(join(stage, persona.path), 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
    if (match === null) throw new Error(`dcode persona needs opening metadata: ${persona.path}`);
    const metadata = yamlParse(match[1]!) as { name?: unknown; description?: unknown };
    if (typeof metadata?.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(metadata.name)
      || typeof metadata.description !== 'string' || !metadata.description.trim()) throw new Error(`invalid dcode persona metadata: ${persona.path}`);
    const skillName = `persona-${metadata.name}`;
    const path = `skills/${skillName}/SKILL.md`;
    if (existsSync(join(stage, dirname(path))) || wrappers.some((wrapper) => wrapper.path === path)) throw new Error(`dcode persona skill collision: ${skillName}`);
    wrappers.push({ path, content: `---\nname: ${skillName}\ndescription: ${JSON.stringify(metadata.description)}\ndisable-model-invocation: true\nuser-invocable: true\n---\n${raw.slice(match[0].length)}` });
  }
  const blocked = [...inventory.invocationPolicies.filter((policy) => !policy.modelInvocable).map((policy) => policy.skill), ...wrappers.map((wrapper) => wrapper.path)];
  if (blocked.length === 0) return;
  if (!enabled) throw new Error('dcode manual skills require the verified experimental Python-extension runtime');
  if (existsSync(join(stage, ENTRY))) throw new Error('dcode manual-skill projection would overwrite an authored extension');
  const manifestPath = ['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json'].map((path) => join(stage, path)).find(existsSync)!;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const extensions = manifest.extensions ??= {};
  const settings = extensions[EXTENSION_KEY] ??= {};
  const entries = settings.pythonExtensions ?? [];
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string')) throw new Error('invalid dcode Python-extension entries');
  for (const wrapper of wrappers) {
    mkdirSync(join(stage, dirname(wrapper.path)), { recursive: true });
    writeFileSync(join(stage, wrapper.path), wrapper.content);
  }
  settings.pythonExtensions = [...entries, `./${ENTRY}`];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  protectPythonBytecodeCache(stage, 'Dcode managed extension');
  writeFileSync(join(stage, ENTRY), `from pathlib import Path
from hashlib import sha256
from langchain.agents.middleware import AgentMiddleware

_ROOT = Path(__file__).resolve().parent
_BLOCKED = {str((_ROOT / item).resolve()) for item in ${JSON.stringify(blocked)}}

class ManualSkills(AgentMiddleware):
    name = "plgnz_manual_skills_" + sha256(str(_ROOT).encode()).hexdigest()[:16]

    def before_model(self, state, runtime):
        skills = state.get("skills_metadata")
        if skills is None:
            return None
        visible = [skill for skill in skills if str(Path(skill["path"]).resolve()) not in _BLOCKED]
        return {"skills_metadata": visible} if len(visible) != len(skills) else None

    async def abefore_model(self, state, runtime):
        return self.before_model(state, runtime)

async def extension(api):
    api.register_middleware(ManualSkills())
`);
}
