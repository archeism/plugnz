import { expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { proveZcodeHistoricalIdentity } from '../src/hosts/zcode-cli-historical-identity';
import { resolveSource } from '../src/source';
import { snapshotTree, withLifecycleCliHarness } from './lifecycle-cli-harness';
import { historicalCli, nativeFixture } from './fixtures/historical-plugnz-75d/runtime';

function refusal(run: () => unknown): string { try { run(); } catch (error) { return String(error); } return 'unexpected acceptance'; }

for (const executableCommand of [false, true]) test(`authentic 75d completed modern activation has a read-only two-ID prerequisite, executableCommand=${executableCommand}`, async () => {
  await withLifecycleCliHarness(h => {
    h.writeHome({ '.zcode/cli/.keep': '' });
    const source = h.source('catalog', {
      '.claude-plugin/marketplace.json': '{"name":"catalog","plugins":[{"name":"demo","source":"./plugins/demo"}]}',
      'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0"}',
      'plugins/demo/skills/demo/SKILL.md': '---\nname: demo\ndescription: Demo\ndisable-model-invocation: true\n---\nSee [notes](notes.txt).\n',
      'plugins/demo/skills/demo/notes.txt': 'authentic old resource\n',
      'plugins/demo/commands/test.toml': 'description = "Historical TOML"\nprompt = "Historical command body"\n',
    });
    if (executableCommand) {
      const command = join(source, 'plugins/demo/commands/run.md');
      writeFileSync(command, '---\ndescription: Executable authored command\n---\nHistorical command body\n'); chmodSync(command, 0o755);
    }
    const old = h.run(['sync', source, '--target', 'zcode-cli', '--json'], { env: { OPEN_PLUGIN_ZCODE_CLI_BIN: nativeFixture(h.home) }, cliArtifact: historicalCli(h.home) });
    if (old.exitCode !== 0) throw new Error(old.stderr || old.stdout);
    expect(old.exitCode).toBe(0);
    const state = JSON.parse(new TextDecoder().decode(new Uint8Array(old.state.after!)));
    const previousHome = process.env.OPEN_PLUGIN_HOME, previousStorage = process.env.ZCODE_STORAGE_DIR;
    process.env.OPEN_PLUGIN_HOME = h.home; delete process.env.ZCODE_STORAGE_DIR;
    try {
      const frozen = resolveSource(source), request = { state, scopeId: state.scopes[0].id, packageName: 'demo', source: frozen };
      const before = snapshotTree(h.home), proof = proveZcodeHistoricalIdentity(request);
      expect(proof.oldNativeId).toBe('demo@catalog'); expect(proof.newNativeId).toBe('demo@plgnz-3c708994a71afe18');
      expect(proof.origin).toBe('verified-activation'); expect(proof.mutationAuthority).toBe(false);
      expect(proof.roots.map(root => root.presence)).toEqual(['present', 'present', 'present', 'absent', 'absent', 'absent']);
      expect(snapshotTree(h.home)).toEqual(before);
      const configPath = join(h.home, '.zcode/cli/config.json'), originalConfig = readFileSync(configPath, 'utf8');
      for (const change of ['flag', 'options']) {
        const config = JSON.parse(originalConfig);
        if (change === 'flag') config.plugins.enabledPlugins[proof.newNativeId] = false;
        else config.plugins.options[proof.newNativeId] = { foreign: 'must remain' };
        writeFileSync(configPath, JSON.stringify(config)); const changedConfig = snapshotTree(h.home);
        expect(refusal(() => proveZcodeHistoricalIdentity(request))).toContain(change === 'flag' ? 'old/canonical enablement differs' : 'canonical options already exist');
        expect(snapshotTree(h.home)).toEqual(changedConfig); writeFileSync(configPath, originalConfig);
      }
      const registryPath = join(h.home, '.zcode/cli/plugins/installed_plugins.json'), originalRegistry = readFileSync(registryPath, 'utf8');
      for (const alias of [proof.oldNativeId, proof.newNativeId]) {
        const registry = JSON.parse(originalRegistry); registry.plugins.push({ ...registry.plugins[0], id: alias });
        writeFileSync(registryPath, JSON.stringify(registry)); const changedRegistry = snapshotTree(h.home);
        expect(refusal(() => proveZcodeHistoricalIdentity(request))).toContain('old/canonical registry identity is ambiguous or occupied');
        expect(snapshotTree(h.home)).toEqual(changedRegistry); writeFileSync(registryPath, originalRegistry);
      }
      const legacyClaim = JSON.parse(JSON.stringify(state)); legacyClaim.activations[0].ownership = { kind: 'legacy-claim', prior: 'plgnz' };
      expect(refusal(() => proveZcodeHistoricalIdentity({ ...request, state: legacyClaim }))).toContain('legacy ownership cannot use a verified route');
      const wrongPath = JSON.parse(JSON.stringify(state)); wrongPath.activations[0].sourceRelativeDir = 'plugins/another';
      expect(refusal(() => proveZcodeHistoricalIdentity({ ...request, state: wrongPath }))).toContain('exact historical modern activation differs');
      // The precondition must not activate the missing transaction or reopen the
      // original completed modern journal as legacy recovery.
      for (const preview of [true, false]) {
        const current = h.run(['sync', source, '--target', 'zcode-cli', ...(preview ? ['--dry-run'] : []), '--json'], { env: { OPEN_PLUGIN_ZCODE_CLI_BIN: join(h.home, 'zcode-native-fixture') } });
        expect(current.exitCode).toBe(1);
        expect(JSON.parse(current.stdout).summary.reason.code).toBe('internal.invariant');
        expect(current.state.after).toEqual(current.state.before);
        expect(current.stores['zcode-cli'].after).toEqual(current.stores['zcode-cli'].before);
      }
      const markerRoot = proof.roots.find(root => root.nativeId === proof.oldNativeId && root.role === 'cache')!.physicalPath;
      const markerPath = join(markerRoot, '.plgnz-install.json'), marker = readFileSync(markerPath, 'utf8');
      writeFileSync(markerPath, JSON.stringify({ ...JSON.parse(marker), inventedScope: state.scopes[0].id }));
      const changed = snapshotTree(h.home);
      expect(refusal(() => proveZcodeHistoricalIdentity(request))).toContain('unrecognized or mismatching historical marker');
      expect(snapshotTree(h.home)).toEqual(changed);
      writeFileSync(markerPath, marker);
      const resourceRoot = proof.roots.find(root => root.nativeId === proof.oldNativeId && root.role === 'resources')!.physicalPath;
      writeFileSync(join(resourceRoot, 'unknown-extra'), 'foreign resource body');
      const extra = snapshotTree(h.home);
      expect(refusal(() => proveZcodeHistoricalIdentity(request))).toContain('historical payload/resources differ');
      expect(snapshotTree(h.home)).toEqual(extra);
      rmSync(join(resourceRoot, 'unknown-extra'));
      for (const root of proof.roots.filter(root => root.presence === 'absent')) {
        mkdirSync(root.physicalPath, { recursive: true });
        writeFileSync(join(root.physicalPath, 'foreign'), 'foreign root body');
        const occupiedRoot = snapshotTree(h.home);
        expect(refusal(() => proveZcodeHistoricalIdentity(request))).toContain('canonical physical root already exists');
        expect(snapshotTree(h.home)).toEqual(occupiedRoot);
        rmSync(root.physicalPath, { recursive: true });
      }
      const newData = join(h.home, '.zcode/cli/plugins/data', proof.newNativeId); mkdirSync(newData, { recursive: true });
      writeFileSync(join(newData, 'foreign'), 'must remain');
      const occupied = snapshotTree(h.home);
      expect(refusal(() => proveZcodeHistoricalIdentity(request))).toContain('canonical data already exists');
      expect(snapshotTree(h.home)).toEqual(occupied);
    } finally {
      if (previousHome === undefined) delete process.env.OPEN_PLUGIN_HOME; else process.env.OPEN_PLUGIN_HOME = previousHome;
      if (previousStorage === undefined) delete process.env.ZCODE_STORAGE_DIR; else process.env.ZCODE_STORAGE_DIR = previousStorage;
    }
  });
}, 30_000);
