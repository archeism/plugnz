import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDeploymentScopeIdentity } from '../src/deployment-scope';
import { main } from '../src/cli';
import { grokWriter } from '../src/hosts/grok-writer';
import { readLifecycleState } from '../src/state';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { withHostEnvAsync, writeFiles, writeLedger } from './util';

async function fixture(run: (home: string, root: string) => Promise<void>): Promise<void> {
  await withHostEnvAsync('codex', async (home) => {
    const root = join(home, '.grok');
    const binary = join(home, 'fake-grok');
    writeFileSync(binary, '#!/bin/sh\nif [ "$*" = "plugin marketplace list --json" ]; then printf \'[]\\n\'; else exit 91; fi\n');
    chmodSync(binary, 0o755);
    const prior = process.env.OPEN_PLUGIN_GROK_BIN;
    process.env.OPEN_PLUGIN_GROK_BIN = binary;
    writeLedger(home, [{ host: 'grok', id: 'jev@personal', source: join(home, 'retired-source'), sourceSha: 'old-revision', pending: 'install' }]);
    try { await run(home, root); }
    finally {
      if (prior === undefined) delete process.env.OPEN_PLUGIN_GROK_BIN;
      else process.env.OPEN_PLUGIN_GROK_BIN = prior;
    }
  });
}

async function remove(extra: string[] = []) {
  const output: string[] = [];
  const original = console.log;
  console.log = (line: string) => output.push(line);
  try {
    const code = await main(['remove', 'jev@personal', '--target', 'grok', '--json', ...extra]);
    return { code, report: parseLifecycleReport(JSON.parse(output.join(''))) };
  } finally { console.log = original; }
}

test('explicit removal settles an absent imported attempt without native mutation or source resolution', async () => {
  await fixture(async (home, root) => {
    writeFiles(root, { 'installed-plugins/registry.json': '{"version":1,"repos":{}}' });
    const before = readLifecycleState().state;
    const result = await remove();
    expect(result.code).toBe(0);
    expect(result.report.outcomes[0]?.resourceState).toBe('absent');
    expect(result.report.outcomes[0]?.activationState).toBe('inactive');
    const state = readLifecycleState();
    expect(state.sourceVersion).toBe(2);
    expect(state.state.activations).toHaveLength(0);
    expect(state.state.attempts).toHaveLength(1);
    expect(state.state.attempts[0]?.id).toBe(before.attempts[0]?.id);
    expect(state.state.attempts[0]?.phase).toBe('completed');
    expect(state.state.attempts[0]?.journal[0]?.operationId).toBe(before.attempts[0]?.journal[0]?.operationId);
    expect(state.state.attempts[0]?.journal[0]?.state).toBe('rolled-back');
    expect(existsSync(join(home, 'retired-source'))).toBe(false);
  });
});

test('dry removal proves absence and leaves the imported ledger byte-identical', async () => {
  await fixture(async (home) => {
    const before = readFileSync(join(home, 'state.json'), 'utf8');
    expect((await remove(['--dry-run'])).code).toBe(0);
    expect(readFileSync(join(home, 'state.json'), 'utf8')).toBe(before);
  });
});

for (const footprint of ['pathless-registry', 'bad-registry', 'native-cache', 'managed-marketplace', 'activation', 'broken-link', 'failed-probe', 'bad-probe'] as const) {
  test(`legacy pending recovery refuses ${footprint} even when listInstalled is empty`, async () => {
    await fixture(async (home, root) => {
      if (footprint === 'pathless-registry') writeFiles(root, { 'installed-plugins/registry.json': '{"version":1,"repos":{"jev":{"plugins":{"jev":{}}}}}' });
      if (footprint === 'bad-registry') writeFiles(root, { 'installed-plugins/registry.json': '{"version":9}' });
      if (footprint === 'native-cache') writeFiles(root, { 'installed-plugins/orphan/content': 'leftover' });
      if (footprint === 'managed-marketplace') writeFiles(root, { 'plgnz-marketplaces/orphan/content': 'leftover' });
      if (footprint === 'activation') writeFiles(root, { 'plugins/jev/content': 'leftover' });
      if (footprint === 'broken-link') { mkdirSync(join(root, 'plugins'), { recursive: true }); symlinkSync('/missing', join(root, 'plugins', 'jev')); }
      if (footprint === 'failed-probe') writeFileSync(join(home, 'fake-grok'), '#!/bin/sh\nexit 1\n');
      if (footprint === 'bad-probe') writeFileSync(join(home, 'fake-grok'), '#!/bin/sh\nprintf \'{}\\n\'\n');
      expect(grokWriter.listInstalled()).toHaveLength(0);
      const before = readFileSync(join(home, 'state.json'), 'utf8');
      const result = await remove();
      expect(result.code).toBe(1);
      expect(result.report.summary.reason?.code).toBe('internal.invariant');
      expect(readFileSync(join(home, 'state.json'), 'utf8')).toBe(before);
    });
  });
}

for (const boundary of ['modern-command', 'authoritative-scope', 'unknown-owner', 'other-source', 'duplicate-source', 'unknown-adapter'] as const) {
  test(`recovery preserves ${boundary} restrictions`, async () => {
    await fixture(async (home) => {
      const imported = readLifecycleState().state;
      imported.stateGeneration = 1;
      if (boundary === 'modern-command') imported.attempts[0]!.command = 'add';
      if (boundary === 'authoritative-scope') { imported.scopes[0]!.authority = 'authoritative'; imported.scopes[0]!.selectorMode = 'explicit'; }
      if (boundary === 'unknown-owner') imported.activations[0]!.ownership = { kind: 'legacy-claim', prior: 'unproven' };
      if (boundary === 'other-source') {
        imported.scopes[0]!.target.instance = 'other';
        // Invalid scope identity must be rejected by the strict state reader.
      }
      if (boundary === 'duplicate-source') {
        const identity = createDeploymentScopeIdentity({ kind: 'local', locator: join(home, 'other-source') }, { kind: 'grok', instance: 'default' });
        imported.scopes.push({ ...imported.scopes[0]!, ...identity, lastAttemptId: 'other-attempt' });
        imported.activations.push({ ...imported.activations[0]!, scopeId: identity.id, pending: { ...imported.activations[0]!.pending!, attemptId: 'other-attempt' } });
        imported.attempts.push({ ...imported.attempts[0]!, id: 'other-attempt', scopeIds: [identity.id], journal: [{ ...imported.attempts[0]!.journal[0]!, scopeId: identity.id, operationId: 'other-operation' }] });
      }
      writeFileSync(join(home, 'state.json'), JSON.stringify(imported));
      const prior = grokWriter.observeLegacyInstallAbsence;
      if (boundary === 'unknown-adapter') delete grokWriter.observeLegacyInstallAbsence;
      const before = readFileSync(join(home, 'state.json'), 'utf8');
      try { expect((await remove()).code).toBe(1); }
      finally { grokWriter.observeLegacyInstallAbsence = prior; }
      expect(readFileSync(join(home, 'state.json'), 'utf8')).toBe(before);
    });
  });
}


test('recovery validates unrelated native packages and remote catalog registrations', async () => {
  await fixture(async (home, root) => {
    const cache = join(root, 'installed-plugins', 'other-native');
    const marketplace = join(root, 'plgnz-marketplaces', 'other-market');
    writeFiles(cache, { 'plugin.json': '{"name":"other"}' });
    writeFiles(marketplace, {
      '.plgnz-install.json': JSON.stringify({ pluginId: 'other@personal', source: '/other-source', fingerprint: 'historical' }),
      'plugins/other/plugin.json': '{"name":"other"}',
    });
    writeFiles(root, { 'installed-plugins/registry.json': JSON.stringify({ version: 1, repos: { other: { path: cache, plugins: { other: {} } } } }) });
    mkdirSync(join(root, 'plugins'), { recursive: true });
    symlinkSync(cache, join(root, 'plugins', 'other'));
    const catalogs = [{ kind: 'local', source: { path: marketplace } }, { kind: 'git', source: { url: 'https://github.com/example/catalog.git' } }];
    writeFileSync(join(home, 'fake-grok'), `#!/bin/sh
printf '%s\\n' '${JSON.stringify(catalogs)}'
`);
    const registryBefore = readFileSync(join(root, 'installed-plugins', 'registry.json'), 'utf8');
    expect((await remove()).code).toBe(0);
    expect(readFileSync(join(root, 'installed-plugins', 'registry.json'), 'utf8')).toBe(registryBefore);
    expect(existsSync(join(root, 'plugins', 'other', 'plugin.json'))).toBe(true);
  });
});

test('recovery preserves a v1 install recorded during the second absence observation', async () => {
  await fixture(async (home) => {
    const before = readLifecycleState().state;
    const other = { host: 'grok', id: 'other@personal', source: join(home, 'other-source'), sourceSha: 'other-revision' };
    const ledgerFile = join(home, 'state.json');
    const original = grokWriter.observeLegacyInstallAbsence;
    let calls = 0;
    let concurrentLedger = '';
    grokWriter.observeLegacyInstallAbsence = async () => {
      calls += 1;
      if (calls === 2) {
        const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));
        ledger.installs.push(other);
        concurrentLedger = JSON.stringify(ledger);
        writeFileSync(ledgerFile, concurrentLedger);
      }
      return 'absent';
    };
    try {
      const result = await remove();
      expect(result.code).toBe(1);
      expect(result.report.summary.reason?.code).toBe('internal.invariant');
      expect(result.report.summary.mutationStarted).toBe(false);
    } finally { grokWriter.observeLegacyInstallAbsence = original; }
    expect(calls).toBe(2);
    expect(readFileSync(ledgerFile, 'utf8')).toBe(concurrentLedger);
    const after = readLifecycleState();
    expect(after.sourceVersion).toBe(1);
    expect(after.state.activations.map((activation) => activation.nativeId)).toEqual(['jev@personal', 'other@personal']);
    expect(after.state.attempts).toEqual(before.attempts);
  });
});
