import { expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprintTree } from '../src/fingerprint';
import { projectLegacyRecordProofs } from '../src/legacy-adoption-proof';
import { createFrozenPackageSnapshot } from '../src/lifecycle-runtime';
import { inventoryPackageSemantics } from '../src/semantic-inventory';
import { readLifecycleState, readState } from '../src/state';
import { proveCursorLegacyAdoption } from '../src/hosts/cursor-adoption';
import type { CursorLegacyAdoptionProofRequest } from '../src/hosts/cursor-adoption';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';

test('Cursor read-only adoption proof matches public command/pin projection and refuses foreign native or Source evidence', async () => {
  for (const collectionPath of ['.claude-plugin/marketplace.json', '.omp-plugin/marketplace.json', 'marketplace.json']) {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '', '.cursor/plugins/retained/demo/data/sentinel.txt': 'keep data\n', '.cursor/plugins/retained/demo/metadata/sentinel.txt': 'keep metadata\n' });
    const launcher = join(harness.source('runtime', { cursor: '#!/bin/sh\nprintf "2.4.0\\n"\n' }), 'cursor');
    chmodSync(launcher, 0o755);
    const source = harness.source('catalog', {
      [collectionPath]: JSON.stringify({ name: 'personal', plugins: [{ source: './plugins/demo' }] }),
      'plugins/demo/plugin.json': '{"name":"demo","version":"1.0.0"}\n',
      'plugins/demo/resources/a/z.txt': 'nested\n',
      'plugins/demo/resources/a.json': '{}\n',
      'plugins/demo/bin/run': '#!/bin/sh\nexit 0\n',
      'plugins/demo/.claude/commands/launch.md': '---\ndescription: launch\n---\nlaunch body\n',
      'plugins/demo/commands/ignored.md': '---\ndescription: ignored\n---\nignored body\n',
      'plugins/demo/.mcp.json': '{"mcpServers":{"server":{"command":"true","args":[]}}}\n',
    });
    const packageRoot = join(source, 'plugins/demo');
    mkdirSync(join(packageRoot, 'resources/empty'));
    chmodSync(join(packageRoot, 'bin/run'), 0o755);
    const installed = harness.run(['add', source, '--target', 'cursor', '--plugin', 'demo', '--json'], { env: { OPEN_PLUGIN_CURSOR_BIN: launcher } });
    if (installed.exitCode !== 0) throw new Error(installed.stdout + installed.stderr);
    expect(installed.exitCode).toBe(0);
    const pinned = harness.run(['pin', '--target', 'cursor', '--json']);
    expect(pinned.exitCode).toBe(0);
    const row = readState(join(harness.home, 'state.json')).find(row => row.host === 'cursor')!;
    const root = join(harness.storePath('cursor'), 'plugins/local/demo');
    writeFileSync(join(root, '.plgnz-install.json'), JSON.stringify({ source, pluginId: 'demo', fingerprint: row.fingerprint }));
    writeFileSync(join(harness.home, 'state.json'), JSON.stringify({ version: 1, installs: [{ ...row, id: 'demo@personal', pending: 'install' }] }));
    const before = harness.run(['scopes', '--target', 'cursor', '--json']);
    const state = readLifecycleState(join(harness.home, 'state.json')).state;
    const legacy = projectLegacyRecordProofs(state, state.scopes[0]!)[0]!;
    const packageFingerprint = fingerprintTree(packageRoot);
    const sourceFingerprint = fingerprintTree(source);
    const snapshot = createFrozenPackageSnapshot({
      attemptId: 'proof-only-attempt', operationId: 'proof-only-operation', action: 'install',
      scopeId: legacy.original.scope.id, target: state.scopes[0]!.target,
      sourceType: 'local', immutableRevision: sourceFingerprint, snapshotRoot: source,
      packageRoot, relativePackagePath: 'plugins/demo', snapshotFingerprint: sourceFingerprint,
      packageFingerprint, packageName: 'demo', nativeId: 'demo', collectionName: 'personal',
      inventory: inventoryPackageSemantics({ name: 'demo', dir: packageRoot, contentFingerprint: packageFingerprint }),
    });
    const saved = process.env['OPEN_PLUGIN_CURSOR_ROOT'];
    process.env['OPEN_PLUGIN_CURSOR_ROOT'] = harness.storePath('cursor');
    try {
      const request: CursorLegacyAdoptionProofRequest = { legacy, snapshot, source: {
        binding: state.scopes[0]!.source, revision: sourceFingerprint, fingerprint: sourceFingerprint,
      }, pins: [{ server: 'server', executable: '/usr/bin/true' }], version: { kind: 'detected', version: '2.4.0', probeId: 'public-fixture-launcher' },
      evidenceId: `sha256:${'e'.repeat(64)}` };
      const proof = proveCursorLegacyAdoption(request);
      expect(proof.oldLedgerNativeId).toBe('demo@personal');
      expect(proof.oldPhysicalNativeId).toBe('demo');
      expect(proof.newNativeId).toBe('demo');
      expect(proof.retention.pluginData).toEqual({ state: 'present', fingerprint: fingerprintTree(join(harness.storePath('cursor'), 'plugins/retained/demo/data')) });
      expect(proof.retention.inactiveMetadata.state).toBe('present');
      expect(proof.roots[0]!.fullFingerprint).toBe(`sha256:${fingerprintTree(root)}`);
      expect(proof.roots[0]!.payloadFingerprint).toBe(proof.projectedPayloadFingerprint);
      expect(readFileSync(join(root, '.cursor-plugin/plugin.json'), 'utf8')).toBe('{"name":"demo","version":"1.0.0"}\n');
      expect(readFileSync(join(root, 'skills/launch/SKILL.md'), 'utf8')).toBe('---\nname: "launch"\ndescription: "launch"\n---\nlaunch body\n');
      const noWriteRefusal = (candidate: CursorLegacyAdoptionProofRequest, diagnostic: string): void => {
        const nativeBefore = fingerprintTree(root), sourceBefore = fingerprintTree(source), stateBefore = readFileSync(join(harness.home, 'state.json'), 'utf8');
        expect(refusal(candidate)).toContain(diagnostic);
        expect(fingerprintTree(root)).toBe(nativeBefore);
        expect(fingerprintTree(source)).toBe(sourceBefore);
        expect(readFileSync(join(harness.home, 'state.json'), 'utf8')).toBe(stateBefore);
      };
      noWriteRefusal({ ...request, source: { ...request.source, binding: { kind: 'local', locator: harness.root } } }, 'Source or target');
      noWriteRefusal({ ...request, pins: [] }, 'resolved pins');
      noWriteRefusal({ ...request, pins: [{ server: 'server', executable: '/bin/false' }] }, 'native payload');
      noWriteRefusal({ ...request, snapshot: createFrozenPackageSnapshot({ ...snapshot, collectionName: 'foreign' }) }, 'legacy alias');
      const markerPath = join(root, '.plgnz-install.json'), markerBytes = readFileSync(markerPath, 'utf8');
      const marker = JSON.parse(markerBytes) as { source: string; pluginId: string; fingerprint: string };
      for (const changed of [{ ...marker, source: harness.root }, { ...marker, pluginId: 'demo@foreign' }, { ...marker, fingerprint: 'foreign' }, { ...marker, extra: true }]) {
        writeFileSync(markerPath, JSON.stringify(changed));
        noWriteRefusal(request, 'legacy marker');
      }
      writeFileSync(markerPath, markerBytes);
      writeFileSync(join(root, 'resources/a/z.txt'), 'foreign bytes\n');
      noWriteRefusal(request, 'native payload');
      writeFileSync(join(root, 'resources/a/z.txt'), 'nested\n');
      chmodSync(join(root, 'bin/run'), 0o644);
      noWriteRefusal(request, 'native payload');
      chmodSync(join(root, 'bin/run'), 0o755);
      mkdirSync(join(root, 'foreign-empty'));
      noWriteRefusal(request, 'native payload');
      rmSync(join(root, 'foreign-empty'), { recursive: true });
      rmSync(join(root, 'resources/empty'), { recursive: true });
      noWriteRefusal(request, 'native payload');
      mkdirSync(join(root, 'resources/empty'));
      const alias = join(harness.storePath('cursor'), 'plugins/local/demo@personal');
      mkdirSync(alias);
      noWriteRefusal(request, 'physical alias');
      rmSync(alias, { recursive: true });
      const metadataPath = join(source, collectionPath);
      const metadata = readFileSync(metadataPath, 'utf8');
      writeFileSync(metadataPath, JSON.stringify({ name: 'foreign', plugins: [{ name: 'demo', source: './plugins/demo' }] }));
      const changedSourceFingerprint = fingerprintTree(source);
      noWriteRefusal({ ...request, snapshot: createFrozenPackageSnapshot({ ...snapshot,
        snapshotFingerprint: changedSourceFingerprint, immutableRevision: changedSourceFingerprint }),
      source: { ...request.source, fingerprint: changedSourceFingerprint, revision: changedSourceFingerprint } }, 'collection identity');
      writeFileSync(metadataPath, metadata);
      symlinkSync(join(packageRoot, 'plugin.json'), join(root, 'foreign-link'));
      expect(refusal(request)).toContain('symlink');
      rmSync(join(root, 'foreign-link'));
      const retained = join(harness.storePath('cursor'), 'plugins/retained/demo');
      renameSync(retained, `${retained}-aside`);
      symlinkSync(join(harness.root, 'missing-retention'), retained);
      expect(refusal(request)).toContain('unsafe directory');
      rmSync(retained);
      renameSync(`${retained}-aside`, retained);
    } finally {
      if (saved === undefined) delete process.env['OPEN_PLUGIN_CURSOR_ROOT']; else process.env['OPEN_PLUGIN_CURSOR_ROOT'] = saved;
    }
    const after = harness.run(['scopes', '--target', 'cursor', '--json']);
    expect(after.state.after).toEqual(before.state.after);
    expect(after.stores.cursor.after).toEqual(before.stores.cursor.after);
    expect(after.stdout).toBe(before.stdout);
  });
  }
}, 20000);

function refusal(request: CursorLegacyAdoptionProofRequest): string { try { proveCursorLegacyAdoption(request); return 'accepted'; } catch (error) { return (error as Error).message; } }
