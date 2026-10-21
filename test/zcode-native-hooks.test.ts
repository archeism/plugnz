import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { admitPackageSemanticsFromProfiles } from '../src/capability-evidence';
import { zcodeCliEvidenceProfiles } from '../src/hosts/zcode-cli-writer';
import { claudeAdvisorCandidateHookProfile } from '../src/hosts/claude-code-writer';
import { projectZcodePayload } from '../src/hosts/zcode-cli-projection';

const events = ['UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure', 'Stop'];
const command = 'node "${ZCODE_PLUGIN_ROOT}/advisor.mjs"';
function fixture(fn: (root: string, write: (path: string, value: unknown) => void) => void) {
  const root = mkdtempSync(join(tmpdir(), 'plugnz-zcode-hooks-'));
  const write = (path: string, value: unknown) => writeFileSync(join(root, path), JSON.stringify(value));
  try {
    mkdirSync(join(root, 'hooks')); mkdirSync(join(root, '.zcode-plugin'));
    write('plugin.json', { name: 'advisor', version: '1.0.0' });
    write('.zcode-plugin/plugin.json', { name: 'advisor', version: '1.0.0' });
    write('hooks/hooks.json', { hooks: Object.fromEntries(events.map(event => [event, [{ hooks: [{ type: 'command', command, timeout: 300 }] }]])) });
    writeFileSync(join(root, 'advisor.mjs'), 'console.log("{}");\n');
    fn(root, write);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
function admit(root: string, operation: 'install' | 'update' = 'install', detectedVersion = '0.16.9') {
  return admitPackageSemanticsFromProfiles({ host: 'zcode-cli', detectedVersion, sourceType: 'local', route: 'native', operation,
    inventory: inventoryPackageSemantics({ name: 'advisor', dir: root }) }, [...zcodeCliEvidenceProfiles, claudeAdvisorCandidateHookProfile()]);
}
const project = (root: string) => projectZcodePayload(root, '/captured/resources', '1.0.0+plgnz.fixture');

test('native hook abstraction admits ZCode install/update without broadening host/version or claiming delivery', () => fixture(root => {
  for (const operation of ['install', 'update'] as const) {
    const result = admit(root, operation);
    expect(result.status).toBe('admitted');
    expect(result.profile?.packageFormat).toBe('native-hooks');
    expect(result.profile?.host).toBe('zcode-cli');
  }
  expect(admit(root, 'install', '0.16.10').status).toBe('refused');
  const inventory = inventoryPackageSemantics({ name: 'advisor', dir: root });
  expect(admitPackageSemanticsFromProfiles({ host: 'claude-code', detectedVersion: '0.16.9', sourceType: 'local', route: 'native', operation: 'install', inventory }, zcodeCliEvidenceProfiles).status).toBe('refused');
  const entry = project(root).payload.get('hooks/hooks.json');
  expect(entry?.kind).toBe('file');
  if (entry?.kind === 'file') expect(new TextDecoder().decode(entry.bytes)).toBe(readFileSync(join(root, 'hooks/hooks.json'), 'utf8'));
}));

for (const [label, group, event] of [
  ['unknown event', { hooks: [{ type: 'command', command }] }, 'PreToolUse'],
  ['HTTP handler', { hooks: [{ type: 'http', url: 'https://example.invalid' }] }, 'Stop'],
  ['pattern matcher', { matcher: 'Read|Bash', hooks: [{ type: 'command', command }] }, 'PostToolUse'],
  ['async handler', { hooks: [{ type: 'command', command, async: true }] }, 'Stop'],
] as const) {
  test(`native ZCode rejects ${label}`, () => fixture((root, write) => {
    write('hooks/hooks.json', { hooks: { [event]: [group] } });
    expect(admit(root).status).toBe('refused');
  }));
}

test('native manifest hooks cannot disappear behind the standard hook file', () => fixture((root, write) => {
  write('other-hooks.json', { hooks: { Stop: [{ hooks: [{ type: 'command', command }] }] } });
  write('.zcode-plugin/plugin.json', { name: 'advisor', hooks: './other-hooks.json' });
  expect(admit(root).status).toBe('refused');
  expect(() => project(root)).toThrow('cannot preserve native manifest field: hooks');
}));

for (const [field, value] of [['mcpServers', { missing: {} }], ['userConfig', { private: {} }], ['skills', './custom-skills']] as const) {
  test(`projection refuses native ${field} it cannot preserve`, () => fixture((root, write) => {
    write('.zcode-plugin/plugin.json', { name: 'advisor', [field]: value });
    expect(() => project(root)).toThrow(`cannot preserve native manifest field: ${field}`);
  }));
}
for (const [field, value] of [['shell', false], ['enabled', false], ['timeoutMs', -1], ['args', ['lost-argument']]] as const) {
  test(`projection refuses unqualified command option ${field}`, () => fixture((root, write) => {
    write('hooks/hooks.json', { hooks: { Stop: [{ hooks: [{ type: 'command', command, [field]: value }] }] } });
    expect(() => project(root)).toThrow(`hook option is unqualified: ${field}`);
  }));
}

test('conventional manifest hooks and compiled synchronous options survive projection', () => fixture((root, write) => {
  write('.zcode-plugin/plugin.json', { name: 'advisor', hooks: './hooks/hooks.json' });
  write('hooks/hooks.json', { hooks: { Stop: [{ hooks: [{ type: 'command', command, async: false, timeout: 30 }] }] } });
  expect(admit(root).status).toBe('admitted');
  expect(project(root).payload.has('hooks/hooks.json')).toBe(true);
}));
