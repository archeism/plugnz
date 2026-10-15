import { expect, test } from 'bun:test';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hermesNativeBootstrap7dbbb0f } from '../src/hosts/hermes-launcher-templates';
import { hermesLifecycle } from '../src/hosts/hermes-writer';
import { fingerprintTree } from '../src/fingerprint';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { createFrozenPackageSnapshot, createLifecyclePlanCoverage, createResolvedLifecyclePins } from '../src/lifecycle-runtime';
import { hermesPluginDataNamespace } from '../src/hermes-identity';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';

const sourceRoot = process.env.HERMES_7DB_SOURCE_ROOT;
const python = process.env.HERMES_7DB_PYTHON;
const installedBin = process.env.HERMES_7DB_INSTALLED_BIN;
const conditionalTest = test as typeof test & { if(condition: boolean): typeof test };

conditionalTest.if(Boolean(sourceRoot && python && installedBin))('Hermes 7dbbb0f native public lifecycle, command queue and MCP round trip', async () => {
  await withLifecycleCliHarness(async harness => {
    const home = harness.storePath('hermes');
    harness.writeHome({ '.hermes/config.yaml': 'model: preserved\n' });
    // No inherited provider secrets; existing dependencies are read-only and -B forbids bytecode writes.
    const env = { HOME: harness.home, HERMES_HOME: home, PATH: '/usr/bin:/bin',
      XDG_CONFIG_HOME: harness.home, XDG_DATA_HOME: harness.home, XDG_CACHE_HOME: harness.home,
      XDG_STATE_HOME: harness.home, XDG_RUNTIME_DIR: harness.home, PYTHONDONTWRITEBYTECODE: '1' };
    const runPython = (code: string): string => {
      const result = spawnSync(python!, ['-I', '-B', '-c', `import sys\nsys.path.insert(0, ${JSON.stringify(sourceRoot)})\n${code}`],
        { cwd: harness.root, env, encoding: 'utf8', timeout: 30_000 });
      if (result.status !== 0) throw new Error(`Isolated Hermes probe failed: ${result.stderr}`);
      return result.stdout.trim();
    };
    const generated = runPython(`from pathlib import Path\nfrom hermes_cli._launchers import _launcher_script\nprint(_launcher_script('hermes', Path('/__PLUGNZ_HERMES_ROOT__'), None), end='')`);
    expect(generated).toBe(hermesNativeBootstrap7dbbb0f.trim());
    const server = (version: string) => `import json, sys
for line in sys.stdin:
    message = json.loads(line)
    if 'id' not in message: continue
    method = message['method']
    if method == 'initialize':
        result = {'protocolVersion': message['params']['protocolVersion'], 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'native-proof', 'version': '${version}'}}
    elif method == 'tools/list':
        result = {'tools': [{'name': 'echo', 'description': 'Local native proof', 'inputSchema': {'type': 'object', 'properties': {'text': {'type': 'string'}}, 'required': ['text']}}]}
    elif method == 'tools/call':
        result = {'content': [{'type': 'text', 'text': '${version}:' + message['params']['arguments']['text']}]}
    else: result = {}
    print(json.dumps({'jsonrpc': '2.0', 'id': message['id'], 'result': result}), flush=True)
`;
    const source = harness.source('native-proof', {
      'plugin.json': '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"native-proof","version":"1.0.0","description":"Isolated native lifecycle proof"}',
      'skills/ordinary/SKILL.md': '---\nname: ordinary\ndescription: Ordinary discovery proof\n---\nbody v1\n',
      'skills/manual/SKILL.md': '---\nname: manual\ndescription: User-only proof\ndisable-model-invocation: true\n---\nmanual body\n',
      'skills/manual/agents/openai.yaml': 'policy:\n  allow_implicit_invocation: false\n',
      'commands/run.toml': 'description = "Run proof"\nprompt = "queued $ARGUMENTS first=$1 second=${2}"\n',
      'mcp.json': JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { 'native-proof': { type: 'stdio', command: 'python3', args: ['-I', '-B', '${PLUGIN_ROOT}/server.py'] } } }),
      'server.py': server('1.0.0'),
    });
    const lifecycle = (args: string[]) => {
      const result = harness.run([...args, '--target', 'hermes', '--json'], { env: { OPEN_PLUGIN_HERMES_BIN: installedBin! }, timeoutMs: 30_000 });
      const report = parseLifecycleReport(JSON.parse(result.stdout));
      expect({ code: result.exitCode, reason: report.outcomes[0]?.reason }).toEqual({ code: 0, reason: null });
      return report;
    };
    const probe = (active: boolean) => JSON.parse(runPython(`
import asyncio, json, queue
import hermes_cli.plugins
from hermes_cli.plugins import PluginManager
assert hermes_cli.plugins.__file__.startswith(${JSON.stringify(sourceRoot + '/')})
class CLI:
    def __init__(self):
        self._agent_running = False
        self._pending_input = queue.SimpleQueue()
        self._interrupt_queue = queue.SimpleQueue()
manager = PluginManager(${JSON.stringify(home)})
manager._cli_ref = CLI()
manager.discover_and_load()
evidence = {'skills': sorted(manager._plugin_skills), 'commands': sorted(manager._plugin_commands), 'sections': sorted(manager._system_prompt_sections), 'servers': manager.get_portable_mcp_servers(), 'loader': hermes_cli.plugins.__file__}
if ${active ? 'True' : 'False'}:
    evidence['result'] = manager._plugin_commands['native-proof:run']['handler']('"alpha beta" "literal $1"')
    evidence['queued'] = manager._cli_ref._pending_input.get_nowait()
    evidence['manual_result'] = manager._plugin_commands['native-proof:manual']['handler']('manual args')
    evidence['manual_queued'] = manager._cli_ref._pending_input.get_nowait()
    from tools import mcp_tool
    assert mcp_tool._ensure_mcp_sdk()
    async def invoke():
        connection = mcp_tool.MCPServerTask('native-proof')
        try:
            await asyncio.wait_for(connection.start(evidence['servers']['native-proof']), 15)
            tools = await connection.session.list_tools()
            result = await connection.session.call_tool('echo', {'text': 'native-round-trip'})
            return {'version': connection.initialize_result.server_info.version, 'tools': [tool.name for tool in tools.tools], 'text': result.content[0].text}
        finally:
            await connection.shutdown()
    evidence['mcp'] = asyncio.run(invoke())
print(json.dumps(evidence))
`));
    const installed = lifecycle(['add', source]);
    const first = probe(true);
    expect(first.skills.some((name: string) => name.endsWith(':ordinary'))).toBe(true);
    expect(first.skills.some((name: string) => name.endsWith(':manual'))).toBe(false);
    expect(first.result).toBe(null);
    expect(first.queued).toContain('queued "alpha beta" "literal $1" first=alpha beta second=literal $1');
    expect(first.manual_result).toBe(null);
    expect(first.manual_queued).toContain('.plgnz-user-skills/manual/SKILL.md');
    expect(first.sections).toContain('native-proof.plgnz-commands.skills');
    expect(first.mcp).toEqual({ version: '1.0.0', tools: ['echo'], text: '1.0.0:native-round-trip' });
    writeFileSync(join(source, 'plugin.json'), '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"native-proof","version":"1.0.1","description":"Updated proof"}');
    writeFileSync(join(source, 'server.py'), server('1.0.1'));
    writeFileSync(join(source, 'skills/ordinary/SKILL.md'), '---\nname: ordinary\ndescription: Ordinary discovery proof\n---\nbody v2\n');
    const updated = lifecycle(['update', 'native-proof']);
    const second = probe(true);
    expect(second.mcp).toEqual({ version: '1.0.1', tools: ['echo'], text: '1.0.1:native-round-trip' });
    expect(readFileSync(join(home, 'plugins/native-proof/skills/ordinary/SKILL.md'), 'utf8')).toContain('body v2');
    const unchanged = lifecycle(['update', 'native-proof']);
    expect(unchanged.outcomes[0]?.changed).toBe(false);
    const dataDir = join(home, 'plugin-data', hermesPluginDataNamespace('native-proof'));
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, 'state.json'), '{"operator":"preserved"}');
    // Exercise the same managed transaction primitive used by the CLI and then
    // inspect it through the real host. The public ledger stays at version 1.0.1.
    const marker = JSON.parse(readFileSync(join(home, 'plugins/native-proof/.plgnz-install.json'), 'utf8'));
    const target = { kind: 'hermes', instance: 'default', context: { root: home, configPath: join(home, 'config.yaml') } };
    const snapshotRoot = join(harness.root, 'rollback-snapshot');
    const packageRoot = join(snapshotRoot, 'packages/native-proof');
    cpSync(source, packageRoot, { recursive: true });
    writeFileSync(join(packageRoot, 'server.py'), server('rollback-candidate'));
    const packageFingerprint = fingerprintTree(packageRoot);
    const snapshot = createFrozenPackageSnapshot({ operationId: 'native-rollback', attemptId: 'native-rollback',
      scopeId: marker.scopeId, target, action: 'update', packageName: 'native-proof', nativeId: marker.pluginId,
      sourceType: 'local', immutableRevision: 'rollback-candidate', snapshotRoot, packageRoot,
      relativePackagePath: 'packages/native-proof', snapshotFingerprint: fingerprintTree(snapshotRoot), packageFingerprint,
      inventory: { ...inventoryPackageSemantics({ dir: packageRoot, name: 'native-proof', version: '1.0.1' }),
        package: { name: 'native-proof', version: '1.0.1', fingerprint: packageFingerprint } } });
    const pins = createResolvedLifecyclePins([]);
    const previousBin = process.env.OPEN_PLUGIN_HERMES_BIN;
    process.env.OPEN_PLUGIN_HERMES_BIN = installedBin;
    let rolledBack;
    try {
      const version = await hermesLifecycle.probeVersion(target);
      const observed = await hermesLifecycle.observeTarget(target);
      const nativeScope = await hermesLifecycle.observeNativeMutationScope({ targetObservation: observed,
        operation: 'update', packageName: 'native-proof', nativeId: marker.pluginId, sourceType: 'local' });
      const nativeProjection = await hermesLifecycle.observeNativeProjection({ targetObservation: observed, operation: 'update', snapshot, pins });
      const selection = hermesLifecycle.decideRoute({ target, operationId: 'native-rollback', attemptId: 'native-rollback',
        scopeId: marker.scopeId, packageName: 'native-proof', nativeId: marker.pluginId, version, sourceType: 'local',
        targetObservation: observed, nativeScope, nativeProjection, operation: 'update', snapshot, pins,
        planCoverage: createLifecyclePlanCoverage(observed, [{ nativeId: marker.pluginId, operationId: 'native-rollback',
          operation: 'update', mutationGroupId: 'native-rollback', authorization: 'observed-owned' }]) });
      if (selection.kind !== 'selected') throw new Error('Native rollback route was not selected');
      const staged = await hermesLifecycle.stageActivation({ selection, snapshot, pins });
      const directed = await hermesLifecycle.applyLifecycleDirectives(staged);
      const prepared = await hermesLifecycle.sealActivation(await hermesLifecycle.applyPins(directed));
      await hermesLifecycle.apply(prepared);
      expect(hermesLifecycle.verify(prepared.handle, await hermesLifecycle.readback(prepared.handle)).phase).toBe('verified');
      expect(probe(true).mcp.text).toBe('rollback-candidate:native-round-trip');
      await hermesLifecycle.rollback(prepared.handle);
      expect(hermesLifecycle.verifyRollback(prepared.handle, await hermesLifecycle.readback(prepared.handle)).phase).toBe('rollback-verified');
      rolledBack = probe(true);
      expect(rolledBack.mcp.text).toBe('1.0.1:native-round-trip');
      expect(readFileSync(join(dataDir, 'state.json'), 'utf8')).toBe('{"operator":"preserved"}');
      await hermesLifecycle.cleanup(prepared.handle, 'verified-rollback');
    } finally {
      if (previousBin === undefined) delete process.env.OPEN_PLUGIN_HERMES_BIN;
      else process.env.OPEN_PLUGIN_HERMES_BIN = previousBin;
    }
    const removed = lifecycle(['remove', 'native-proof']);
    const retired = probe(false);
    expect(retired.skills.some((name: string) => name.includes('native-proof'))).toBe(false);
    expect(retired.commands.some((name: string) => name.startsWith('native-proof:'))).toBe(false);
    expect(retired.servers).toEqual({});
    expect(readFileSync(join(dataDir, 'state.json'), 'utf8')).toBe('{"operator":"preserved"}');
    expect(existsSync(join(home, 'plugins/native-proof'))).toBe(false);
    expect(existsSync(join(home, 'plugins/native-proof.plgnz-commands'))).toBe(false);
    expect(readFileSync(join(home, 'config.yaml'), 'utf8')).toContain('model: preserved');
    if (process.env.HERMES_7DB_EVIDENCE) writeFileSync(process.env.HERMES_7DB_EVIDENCE,
      JSON.stringify({ installed, first, updated, second, unchanged, rolledBack, removed, retired }, null, 2));
  });
}, 120_000);
