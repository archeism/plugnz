import { expect, test } from 'bun:test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { fakeDcodeLockInterpreter } from './dcode-fake-lock';
import captured from './fixtures/prior-git-source/dcode-pin-88d89c5.json';

test('offline pin repairs a genuine historical Git marker without fetching its Source', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome(Object.fromEntries(Object.entries(captured.files).map(([path, bytes]) => [path, bytes.replaceAll('{{HOME}}', harness.home)])));
    const before = JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8'));
    // The fixture's MCP server runs bare `node`; the harness PATH is hermetic
    // (fake-bin:/usr/bin:/bin), so install the running node as a PATH shim.
    const nodeShim = harness.fakeBinPath('node');
    writeFileSync(nodeShim, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} "$@"\n`); chmodSync(nodeShim, 0o755);
    const binary = join(harness.home, 'dcode-version');
    const noGit = join(harness.home, 'no-git');
    writeFileSync(binary, '#!/bin/sh\necho "deepagents-code 0.1.83"\n'); chmodSync(binary, 0o755);
    writeFileSync(noGit, '#!/bin/sh\necho "unexpected Source fetch" >&2\nexit 73\n'); chmodSync(noGit, 0o755);
    const env = { OPEN_PLUGIN_DCODE_BIN: binary, OPEN_PLUGIN_DCODE_PYTHON_BIN: fakeDcodeLockInterpreter(harness.root), OPEN_PLUGIN_GIT_BIN: noGit };
    const preview = harness.run(['pin', '--target', 'dcode', '--dry-run', '--json'], { env });
    if (preview.exitCode !== 0) throw new Error(`pin --dry-run failed (${preview.exitCode}): ${preview.stdout}${preview.stderr}`);
    expect(preview.exitCode).toBe(0);
    expect(preview.state.after).toEqual(preview.state.before);
    expect(preview.stores.dcode.after).toEqual(preview.stores.dcode.before);
    const pinned = harness.run(['pin', '--target', 'dcode', '--json'], { env });
    if (pinned.exitCode !== 0) throw new Error(pinned.stdout + pinned.stderr);
    expect(pinned.exitCode).toBe(0);
    const row = JSON.parse(readFileSync(join(harness.home, '.deepagents/.state/installed_plugins.json'), 'utf8')).plugins['demo@local'][0];
    const marker = JSON.parse(readFileSync(join(row.installPath, '.plgnz-install.json'), 'utf8'));
    expect(marker.source).toBe(captured.sourceLocator);
    expect(marker.sourceRevision).toBe(before.activations[0].sourceRevision);
    expect(JSON.parse(readFileSync(join(row.installPath, '.mcp.json'), 'utf8')).mcpServers.demo.command.startsWith('/')).toBe(true);
    const after = JSON.parse(readFileSync(join(harness.home, 'state.json'), 'utf8'));
    expect(after.scopes).toEqual(before.scopes);
    expect(after.activations[0].fingerprints.source).toBe(before.activations[0].fingerprints.source);
    expect(after.activations[0].pending).toBeUndefined();
  });
}, 20_000);
