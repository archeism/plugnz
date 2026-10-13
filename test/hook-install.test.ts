import { afterEach, beforeEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { hookAdapters } from '../src/hook-build';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { admitPackageSemanticsFromProfiles } from '../src/capability-evidence';
import { portableHookProfile } from '../src/portable-hook-policy';
import { fingerprintTree } from '../src/fingerprint';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { repoRoot, isolatedHostEnv, writeFiles } from './util';
import { nativeFixture } from './fixtures/historical-plugnz-75d/runtime';

let root: string, home: string, source: string;
let env: Record<string, string | undefined>;
const binaryKeys: Record<string, string> = { 'claude-code': 'CLAUDE_CODE', codex: 'CODEX', omp: 'OMP', pi: 'PI', opencode: 'OPENCODE' };
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'plugnz-hook-install-test-'));
  home = join(root, 'home'); source = join(root, 'source');
  mkdirSync(home); mkdirSync(source);
  env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith('OPEN_PLUGIN_')) delete env[name];
  Object.assign(env, isolatedHostEnv(home), { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), OPEN_PLUGIN_PI_BIN: join(home, 'missing-pi'), OPEN_PLUGIN_OPENCODE_BIN: join(home, 'missing-opencode') });
  writeFiles(source, {
    'plugin.json': JSON.stringify({ name: 'automatic-hooks', version: '1.0.0', description: 'automatic hook fixture' }),
    'plugnz.hooks.json': JSON.stringify({ version: 1, hooks: { 'session.start': [{ command: [process.execPath, '$' + '{PLUGIN_ROOT}/context.mjs'] }] } }),
    'context.mjs': 'console.log(JSON.stringify({context:"first-context"}));\n',
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function target(id: string, version?: string, initializeProfile = true): string {
  const roots: Record<string, string> = {
    'claude-code': join(home, '.claude'), codex: join(home, '.codex'), omp: join(home, '.omp'),
    pi: join(home, '.pi', 'agent'), opencode: join(home, '.config', 'opencode'),
  };
  const path = roots[id]!;
  if (initializeProfile) {
    mkdirSync(path, { recursive: true });
    if (id === 'claude-code' || id === 'omp') mkdirSync(join(path, 'plugins'));
  }
  const binary = join(home, id + '-version');
  const adapter = hookAdapters.find(item => item.id === id)!;
  const value = version ?? adapter.baselineVersion;
  const text = id === 'codex' ? 'codex-cli ' + value : id === 'claude-code' ? value + ' (Claude Code)' : value;
  writeFileSync(binary, "#!/bin/sh\nprintf '%s\\n' '" + text + "'\n"); chmodSync(binary, 0o755);
  env['OPEN_PLUGIN_' + binaryKeys[id] + '_BIN'] = binary;
  return path;
}
function cli(args: string[], cwd = source) {
  return spawnSync(process.execPath, [join(repoRoot, 'bin', 'plugnz.mjs'), ...args, '--json'], { cwd, env, encoding: 'utf8', timeout: 30_000 });
}
function success(args: string[]) {
  const result = cli(args);
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}
function installedRoot(native: string): string {
  const matches: string[] = [];
  const visit = (path: string): void => {
    for (const name of readdirSync(path)) {
      const child = join(path, name), stat = lstatSync(child);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(child);
      else if (name === 'hook-runtime.mjs') matches.push(path);
    }
  };
  visit(native);
  const path = matches[0];
  if (path === undefined) throw new Error('No installed generated runtime under ' + native);
  return path;
}

for (const id of ['claude-code', 'codex', 'omp', 'pi', 'opencode']) {
  test('install compiles into the native ' + id + ' store and retains authored provenance', () => {
    const native = target(id), before = fingerprintTree(source);
    const first = success(['install', source, '--target', id]);
    expect(first.summary.result).toBe('converged');
    const path = installedRoot(native);
    expect(existsSync(join(path, 'plugnz.hooks.json'))).toBe(false);
    expect(readFileSync(join(path, 'context.mjs'), 'utf8')).toContain('first-context');
    expect(fingerprintTree(source)).toBe(before);
    expect(readFileSync(join(home, 'state.json'), 'utf8')).toContain(source);
    const second = success(['install', source, '--target', id]);
    expect(second.summary.changed).toBe(false);
    if (id === 'codex') {
      expect(existsSync(join(path, 'plugin.json'))).toBe(false);
      expect(existsSync(join(path, '.codex-plugin', 'plugin.json'))).toBe(true);
    }
    if (id === 'omp') expect(JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).omp.extensions).toEqual(['./extension.mjs']);
  }, 30_000);
}

for (const id of ['pi', 'opencode']) {
  test(id + ' update and remove preserve unrelated native registration', () => {
    const native = target(id);
    const settings = id === 'pi' ? join(native, 'settings.json') : join(native, 'opencode.jsonc');
    const existing = id === 'pi'
      ? JSON.stringify({ theme: 'dark', extensions: ['/unrelated/extension.mjs'] })
      : '{ // user comment\n "plugin": ["unrelated-package"], "model": "fixture"\n}\n';
    writeFileSync(settings, existing);
    success(['install', source, '--target', id]);
    const path = installedRoot(native);
    const config = id === 'pi' ? JSON.parse(readFileSync(settings, 'utf8')) : null;
    if (config) {
      expect(config.theme).toBe('dark');
      expect(config.extensions).toEqual(['/unrelated/extension.mjs', join(path, 'extension.mjs')]);
    } else expect(readFileSync(settings, 'utf8')).toBe(existing);
    writeFileSync(join(source, 'context.mjs'), 'console.log(JSON.stringify({context:"updated-context"}));\n');
    success(['update', 'automatic-hooks', '--target', id]);
    expect(readFileSync(join(path, 'context.mjs'), 'utf8')).toContain('updated-context');
    success(['remove', 'automatic-hooks', '--target', id]);
    expect(existsSync(path)).toBe(false);
    if (id === 'pi') expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual({ theme: 'dark', extensions: ['/unrelated/extension.mjs'] });
    else {
      expect(readFileSync(settings, 'utf8')).toBe(existing);
      expect(readdirSync(join(native, 'plugins')).filter(name => name.startsWith('plugnz-'))).toEqual([]);
    }
  }, 30_000);
}

test('install defaults to the current package; add still requires an explicit source', () => {
  target('pi');
  expect(cli(['add', '--target', 'pi']).status).toBe(2);
  expect(success(['install', '--target', 'pi']).summary.result).toBe('converged');
});

test('unsupported versions and unrelated standalone content fail before install intent', () => {
  target('pi', '9.9.9');
  expect(cli(['install', source, '--target', 'pi']).status).toBe(1);
  expect(existsSync(join(home, 'state.json'))).toBe(false);
  target('pi', '1.1.0');
  writeFiles(source, { 'skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\nbody\n' });
  expect(cli(['install', source, '--target', 'pi']).status).toBe(1);
  expect(existsSync(join(home, 'state.json'))).toBe(false);
});

test('authored compiler collisions and redirected host paths do not publish an install', () => {
  const native = target('pi');
  writeFileSync(join(source, 'extension.mjs'), 'authored extension\n');
  expect(cli(['install', source, '--target', 'pi']).status).toBe(1);
  expect(existsSync(join(home, 'state.json'))).toBe(false);
  rmSync(join(source, 'extension.mjs'));
  symlinkSync(join(root, 'missing-foreign-root'), join(native, '.plgnz'));
  expect(cli(['install', source, '--target', 'pi']).status).toBe(1);
  expect(existsSync(join(root, 'missing-foreign-root'))).toBe(false);
});

test('portable profiles do not admit native hooks or unrelated semantics at the same version', () => {
  const inventory = inventoryPackageSemantics({ dir: source, name: 'automatic-hooks' });
  for (const adapter of hookAdapters) {
    const profile = portableHookProfile(adapter, 'managed', ['install', 'update']);
    const request = { host: adapter.id, detectedVersion: adapter.baselineVersion, route: 'managed' as const, sourceType: 'local' as const, operation: 'install' as const, inventory };
    expect(admitPackageSemanticsFromProfiles(request, [profile]).status).toBe('admitted');
    const native = { ...inventory, hookDeclarations: inventory.hookDeclarations.map(declaration => ({ ...declaration, form: 'default-file' as const, events: ['SessionStart'] })) };
    expect(admitPackageSemanticsFromProfiles({ ...request, inventory: native }, [profile]).status).toBe('refused');
    const mixed = { ...inventory, requiredSemantics: [...inventory.requiredSemantics, 'mcp' as const] };
    expect(admitPackageSemanticsFromProfiles({ ...request, inventory: mixed }, [profile]).status).toBe('refused');
  }
});

for (const id of ['pi', 'opencode']) {
  test(id + ' refuses a historical standalone identity before portable install intent', () => {
    const native = target(id);
    const legacy = id === 'pi' ? join(native, 'skills', 'local___automatic-hooks') : join(native, '.plgnz', 'packages', 'local___automatic-hooks');
    writeFiles(legacy, {
      '.plgnz-install.json': JSON.stringify({ pluginId: 'automatic-hooks@local', source, fingerprint: 'historical' }),
      'SKILL.md': 'historical owned skill\n',
    });
    const before = fingerprintTree(native);
    const result = cli(['install', source, '--target', id]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('historical standalone install');
    expect(existsSync(join(home, 'state.json'))).toBe(false);
    expect(fingerprintTree(native)).toBe(before);
  });
  test(id + ' refuses authored auto-update policy without native projection', () => {
    target(id);
    for (const enabled of [true, false]) {
      writeFileSync(join(source, 'plugin.json'), JSON.stringify({ name: 'automatic-hooks', version: '1.0.0', extensions: { 'com.langchain.deepagents.code': { autoUpdate: enabled } } }));
      const result = cli(['install', source, '--target', id]);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('does not project authored native auto-update directives');
      expect(existsSync(join(home, 'state.json'))).toBe(false);
    }
  });
}

function putCliOnPath(id: string): void {
  const tools = join(root, 'native-bin'), key = 'OPEN_PLUGIN_' + binaryKeys[id] + '_BIN';
  mkdirSync(tools);
  symlinkSync(env[key]!, join(tools, id === 'claude-code' ? 'claude' : id));
  env.PATH = tools + delimiter + (env.PATH ?? '');
  delete env[key];
}

for (const id of ['claude-code', 'codex', 'omp', 'pi', 'opencode']) {
  test(id + ' is detected on PATH and installs before its native profile exists', () => {
    const native = target(id, undefined, false), before = fingerprintTree(source);
    putCliOnPath(id);
    expect(existsSync(native)).toBe(false);
    const detected = cli(['targets']);
    expect(detected.status).toBe(0);
    expect(JSON.parse(detected.stdout)).toContain(id);
    expect(existsSync(native)).toBe(false);
    expect(success(['install', '--target', id]).summary.result).toBe('converged');
    const installed = installedRoot(native);
    expect(existsSync(join(installed, 'plugnz.hooks.json'))).toBe(false);
    expect(readFileSync(join(installed, 'context.mjs'), 'utf8')).toContain('first-context');
    expect(readFileSync(join(home, 'state.json'), 'utf8')).toContain(source);
    expect(fingerprintTree(source)).toBe(before);
  });
}

test('Codex detection does not accept a nonexecutable CLI or create its native home', () => {
  const native = target('codex', undefined, false);
  chmodSync(env.OPEN_PLUGIN_CODEX_BIN!, 0o644);
  const detected = cli(['targets']);
  expect(detected.status).toBe(0);
  expect(JSON.parse(detected.stdout).includes('codex')).toBe(false);
  expect(existsSync(native)).toBe(false);
});

for (const id of ['pi', 'opencode']) {
  test(id + ' update reports version refusal before intent and preserves native bytes', () => {
    const native = target(id);
    success(['install', source, '--target', id]);
    const state = readFileSync(join(home, 'state.json'), 'utf8');
    const fingerprint = fingerprintTree(native);
    target(id, '9.9.9');
    const result = cli(['update', 'automatic-hooks', '--target', id]);
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.outcomes[0]?.action).toBe('not-attempted');
    expect(report.outcomes[0]?.route).toBe('none');
    expect(report.outcomes[0]?.reason?.code).toBe('capability.unverified');
    expect(report.summary.mutationStarted).toBe(false);
    expect(readFileSync(join(home, 'state.json'), 'utf8')).toBe(state);
    expect(fingerprintTree(native)).toBe(fingerprint);
  });
}

function zcodeOnPath(): string {
  const tools = join(root, 'bin');
  mkdirSync(tools);
  symlinkSync(nativeFixture(home), join(tools, 'zcode'));
  delete env.OPEN_PLUGIN_ZCODE_CLI_BIN;
  env.PATH = tools + delimiter + (env.PATH ?? '');
  return join(home, '.zcode', 'cli');
}

test('ZCode discovers an official PATH CLI and installs portable hooks before its native home exists', () => {
  const native = zcodeOnPath(), before = fingerprintTree(source);
  const detected = cli(['targets']);
  expect(detected.status).toBe(0);
  expect(JSON.parse(detected.stdout)).toContain('zcode-cli');
  expect(existsSync(native)).toBe(false);
  expect(success(['install', '--target', 'zcode-cli']).summary.result).toBe('converged');
  const registry = JSON.parse(readFileSync(join(native, 'plugins', 'installed_plugins.json'), 'utf8'));
  expect(registry.plugins).toHaveLength(1);
  const installed = registry.plugins[0].installPath;
  expect(existsSync(join(installed, 'hook-runtime.mjs'))).toBe(true);
  expect(existsSync(join(installed, 'hooks', 'hooks.json'))).toBe(true);
  expect(existsSync(join(installed, 'plugnz.hooks.json'))).toBe(false);
  expect(JSON.parse(readFileSync(join(native, 'config.json'), 'utf8')).plugins.enabledPlugins[registry.plugins[0].id]).toBe(true);
  expect(fingerprintTree(source)).toBe(before);
});

for (const form of ['native', 'mixed'] as const) {
  test(`ZCode portable projection does not admit ${form} authored native hooks`, () => {
    const native = zcodeOnPath();
    if (form === 'native') rmSync(join(source, 'plugnz.hooks.json'));
    writeFiles(source, { 'hooks/hooks.json': JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo authored-native' }] }] } }) });
    const result = cli(['install', '--target', 'zcode-cli']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).summary.mutationStarted).toBe(false);
    expect(existsSync(native)).toBe(false);
    expect(existsSync(join(home, 'state.json'))).toBe(false);
  });
}

for (const id of ['omp', 'pi', 'opencode']) {
  test(id + ' cold install preserves an explicit native-root override', () => {
    const defaultNative = target(id, undefined, false), native = join(root, 'selected-native-root');
    env['OPEN_PLUGIN_' + binaryKeys[id] + '_ROOT'] = native;
    expect(success(['install', '--target', id]).summary.result).toBe('converged');
    expect(existsSync(join(installedRoot(native), 'hook-runtime.mjs'))).toBe(true);
    expect(existsSync(defaultNative)).toBe(false);
  });
  for (const kind of ['missing', 'nonexecutable'] as const) {
    test(id + ' cold detection keeps a ' + kind + ' override exclusive over a valid PATH CLI', () => {
      const native = target(id, undefined, false);
      putCliOnPath(id);
      const invalid = join(root, 'invalid-cli');
      if (kind === 'nonexecutable') { writeFileSync(invalid, '#!/bin/sh\nexit 0\n'); chmodSync(invalid, 0o644); }
      env['OPEN_PLUGIN_' + binaryKeys[id] + '_BIN'] = invalid;
      const detected = cli(['targets']);
      expect(detected.status).toBe(0);
      expect(JSON.parse(detected.stdout).includes(id)).toBe(false);
      const refused = cli(['install', '--target', id]);
      expect(refused.status).toBe(2);
      expect(refused.stdout + refused.stderr).toContain('is not present on this machine');
      expect(existsSync(native)).toBe(false);
      expect(existsSync(join(home, 'state.json'))).toBe(false);
    });
  }
  test(id + ' cold CLI detection keeps unsupported-version admission closed', () => {
    const native = target(id, '9.9.9', false);
    const result = cli(['install', '--target', id]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).summary.mutationStarted).toBe(false);
    expect(existsSync(native)).toBe(false);
    expect(existsSync(join(home, 'state.json'))).toBe(false);
  });
}

// Independent target scopes may succeed even when another target refuses.
// Their combined report must describe the actual partial result, not throw.
for (const failingRoute of ['writer', 'planner'] as const) {
  for (const dryRun of [false, true]) {
    for (const verb of ['install', 'add']) {
      test(`${verb} reports a ${failingRoute} refusal alongside another route (${dryRun ? 'dry' : 'applied'})`, () => {
        const piNative = target('pi'), codexNative = target('codex');
        if (failingRoute === 'writer') {
          writeFileSync(join(piNative, 'settings.json'), JSON.stringify({ extensions: 'invalid-array' }));
        } else {
          writeFiles(source, { 'hooks/plugnz-codex.mjs': '// Authored file collides with generated wrapper.\n' });
        }
        const piBefore = fingerprintTree(piNative), codexBefore = fingerprintTree(codexNative);
        const result = cli([verb, source, '--target', 'pi', '--target', 'codex', ...(dryRun ? ['--dry-run'] : [])]);
        expect(result.status).toBe(1);
        if (!result.stdout.trim()) throw new Error('Empty CLI report: ' + result.stderr);
        const report = parseLifecycleReport(JSON.parse(result.stdout));
        expect(report.summary.result).toBe('incomplete');
        expect(report.summary.mutationStarted).toBe(!dryRun);
        expect(report.summary.changed).toBe(!dryRun);
        expect(report.summary.terminalPhase).toBe(dryRun ? 'preflight' : 'apply');
        expect(report.plan).toHaveLength(failingRoute === 'writer' ? 2 : 1);
        const failed = failingRoute === 'writer' ? 'pi' : 'codex';
        const succeeded = failingRoute === 'writer' ? 'codex' : 'pi';
        if (failingRoute === 'writer') expect(report.outcomes.find(row => row.scope.target.kind === failed)?.result).toBe('failed');
        else expect(report.summary.reason?.diagnostic).toContain('authored hook artifact');
        expect(report.outcomes.find(row => row.scope.target.kind === succeeded)?.result).toBe('succeeded');
        expect(report.outcomes.find(row => row.scope.target.kind === succeeded)?.changed).toBe(!dryRun);
        if (dryRun || failed === 'pi') expect(fingerprintTree(piNative)).toBe(piBefore);
        else expect(fingerprintTree(piNative) === piBefore).toBe(false);
        if (dryRun || failed === 'codex') expect(fingerprintTree(codexNative)).toBe(codexBefore);
        else expect(fingerprintTree(codexNative) === codexBefore).toBe(false);
        expect(existsSync(join(home, 'state.json'))).toBe(!dryRun);
      }, 30_000);
    }
  }
}


for (const position of ['first', 'middle'] as const) {
  test('Pi update preserves extension order and exact settings bytes: ' + position, () => {
    const native = target('pi');
    success(['install', source, '--target', 'pi']);
    const installed = installedRoot(native);
    const entry = join(installed, 'extension.mjs');
    const extensions = position === 'first' ? [entry, '/other/after.mjs'] : ['/other/before.mjs', entry, '/other/after.mjs'];
    const settings = join(native, 'settings.json');
    const raw = JSON.stringify({ theme: 'dark', extensions }, null, '\t') + '\n\n';
    writeFileSync(settings, raw);
    writeFileSync(join(source, 'context.mjs'), 'console.log(JSON.stringify({context:"updated-context"}));\n');
    success(['update', 'automatic-hooks', '--target', 'pi']);
    expect(readFileSync(join(installed, 'context.mjs'), 'utf8')).toContain('updated-context');
    expect(JSON.parse(readFileSync(settings, 'utf8')).extensions).toEqual(extensions);
    expect(readFileSync(settings, 'utf8')).toBe(raw);
    success(['remove', 'automatic-hooks', '--target', 'pi']);
    expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual({ theme: 'dark', extensions: extensions.filter(item => item !== entry) });
    expect(existsSync(installed)).toBe(false);
  }, 30_000);
}

function v2(event: string, requires: Record<string, boolean> = {}): void {
  writeFileSync(join(source, 'plugnz.hooks.json'), JSON.stringify({ version: 2, hooks: {
    [event]: [{ command: [process.execPath, '${PLUGIN_ROOT}/context.mjs'], requires }],
  } }));
}

for (const id of ['claude-code', 'codex', 'omp', 'pi', 'opencode', 'zcode-cli']) {
  test(id + ' v2 startup admission and install report keep runtime proof separate', () => {
    const native = id === 'zcode-cli' ? zcodeOnPath() : target(id);
    v2('session.start', { context: true });
    const before = existsSync(native) ? fingerprintTree(native) : null;
    const dry = success(['install', '--target', id, '--dry-run']);
    expect(dry.verification.schemaVersion).toBe(1);
    expect(dry.verification.operations[0]).toEqual({ operationId: dry.outcomes[0].operationId,
      compatibility: 'admitted', registration: 'not-checked', executionApproval: 'not-checked', delivery: 'not-observed' });
    expect(existsSync(native) ? fingerprintTree(native) : null).toBe(before);
    const applied = success(['install', '--target', id]);
    expect(applied.verification.operations[0]).toEqual({ operationId: applied.outcomes[0].operationId,
      compatibility: 'admitted', registration: 'verified', executionApproval: 'not-checked', delivery: 'not-observed' });
    expect(readFileSync(join(installedRoot(native), 'context.mjs'), 'utf8')).toContain('first-context');
  }, 30_000);
}

for (const verb of ['install', 'update']) {
  test(verb + ' refuses required OpenCode stop feedback without changing prior activation', () => {
    const native = target('opencode');
    success(['install', '--target', 'opencode']);
    const previous = fingerprintTree(native), ledger = readFileSync(join(home, 'state.json'), 'utf8');
    v2('turn.stop', { context: true, continue: true });
    const result = cli([verb, ...(verb === 'update' ? ['automatic-hooks'] : []), '--target', 'opencode']);
    expect(result.status).toBe(1);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(report.summary.reason?.code).toBe('capability.unsupported');
    expect(report.summary.reason?.diagnostic).toContain('context');
    expect(report.summary.mutationStarted).toBe(false);
    expect(fingerprintTree(native)).toBe(previous);
    expect(readFileSync(join(home, 'state.json'), 'utf8')).toBe(ledger);
  });
}

test('a required effect refusal remains visible beside a supported native route', () => {
  const oc = target('opencode'), codex = target('codex');
  const before = fingerprintTree(oc);
  v2('turn.stop', { context: true, continue: true });
  const result = cli(['install', '--target', 'codex', '--target', 'opencode']);
  expect(result.status).toBe(1);
  const report = parseLifecycleReport(JSON.parse(result.stdout));
  expect(report.summary.changed).toBe(true);
  expect(report.outcomes.find(row => row.scope.target.kind === 'codex')!.result).toBe('succeeded');
  const refusal = report.outcomes.find(row => row.scope.target.kind === 'opencode')!;
  expect(refusal.reason!.code).toBe('capability.unsupported');
  expect(report.verification!.operations.find(row => row.operationId === refusal.operationId)!.compatibility).toBe('unsupported');
  expect(fingerprintTree(oc)).toBe(before);
  expect(existsSync(join(installedRoot(codex), 'hook-runtime.mjs'))).toBe(true);
});

test('a v2 unknown runtime is unverified, not assumed compatible with the adapter baseline', () => {
  const native = target('pi', '9.9.9');
  const before = fingerprintTree(native);
  v2('session.start', { context: true });
  const result = cli(['install', '--target', 'pi', '--dry-run']);
  expect(result.status).toBe(1);
  const report = parseLifecycleReport(JSON.parse(result.stdout));
  expect(report.verification!.operations[0]!.compatibility).toBe('unverified');
  expect(report.verification!.operations[0]!.registration).toBe('not-checked');
  expect(fingerprintTree(native)).toBe(before);
});

test('v2 checks-only OpenCode stop remains installable and installation never invokes the handler', () => {
  target('opencode');
  v2('turn.stop');
  const marker = join(root, 'unexpected-execution');
  writeFileSync(join(source, 'context.mjs'), 'import {writeFileSync} from "node:fs"; writeFileSync(' + JSON.stringify(marker) + ', "bad");');
  success(['install', '--target', 'opencode']);
  expect(existsSync(marker)).toBe(false);
});

for (const id of ['pi', 'opencode']) {
  test(id + ' bare-name update survives a mixed native install ledger', () => {
    const native = target(id); target('codex');
    v2('session.start', { context: true });
    success(['install', '--target', id, '--target', 'codex']);
    const installed = installedRoot(native);
    expect(JSON.parse(readFileSync(join(home, 'state.json'), 'utf8')).version).toBe(2);
    writeFileSync(join(source, 'context.mjs'), 'console.log(JSON.stringify({context:"mixed-update"}));\n');
    success(['update', 'automatic-hooks', '--target', id]);
    expect(readFileSync(join(installed, 'context.mjs'), 'utf8')).toContain('mixed-update');
    const before = fingerprintTree(native);
    const unrelated = cli(['update', 'unrelated-hooks', '--target', id]);
    expect(unrelated.status).toBe(1);
    expect(fingerprintTree(native)).toBe(before);
  }, 30_000);
}
