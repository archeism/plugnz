import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

for (const mode of ['fail', 'wait', 'partial']) test(`preservation controller retains ${mode} without agent interaction`, () => {
  const root = mkdtempSync('/tmp/plugnz-preservation-test-');
  try {
    const cli = join(root, 'cli');
    writeFileSync(cli, `#!${process.execPath}\n${readFileSync(resolve('test/fixtures/preservation-transport.mjs'), 'utf8')}`); chmodSync(cli, 0o755);
    const config = { sandbox: 'plugnz-fixture', project: 'fixture', team: 'fixture', cli,
      experimentUid: 21001, evidenceRoot: '/vercel/sandbox/proof/fixture', output: join(root, 'output'),
      baselineUsedBytes: 1,
      archiveAt: Date.now() + (mode === 'wait' ? 2000 : 5000), expiresAt: Date.now() + 240_000,
      diskGrowthBytes: 256 * 1024 ** 2, diskReserveBytes: 128 * 1024 ** 2, archiveBytes: 1024 ** 2, command: [mode] };
    config.sdkRoot = join(root, 'sdk'); mkdirSync(join(config.sdkRoot, 'dist/auth'), { recursive: true });
    const metadata = () => writeFileSync(join(config.sdkRoot, 'dist/index.js'), `export const Sandbox={get:async()=>({name:'plugnz-fixture',status:'running',expiresAt:new Date(${config.expiresAt})})};`);
    metadata(); writeFileSync(join(config.sdkRoot, 'dist/auth/index.js'), 'export const getAuth=()=>({});');
    const configPath = join(root, 'config.json'); writeFileSync(configPath, JSON.stringify(config));
    const execute = () => spawnSync(process.execPath, [resolve('scripts/sandbox-preservation-controller.mjs'), configPath], {
      env: { ...process.env, OPEN_PLUGIN_PRESERVATION_TRANSPORT_ROOT: root }, encoding: 'utf8', timeout: 10_000 });
    const result = execute(); expect(result.status).toBe(1);
    if (!existsSync(join(config.output, 'receipt.json'))) {
      const failure = join(config.output, 'preservation-failure.json');
      throw new Error(`status=${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}\n${existsSync(failure) ? readFileSync(failure, 'utf8') : 'no preservation failure record'}`);
    }
    const receipt = JSON.parse(readFileSync(join(config.output, 'receipt.json'), 'utf8'));
    expect(receipt.reason).toBe(mode === 'wait' ? 'archive-deadline' : 'supplier-failure');
    expect(receipt.restoredFiles).toBe(1);
    expect(readFileSync(join(config.output, 'restored/trial/sentinel'), 'utf8')).toBe('retained fixture');
    if (mode === 'partial') expect(readFileSync(join(config.output, 'restored/suppliers/0/unknown'), 'utf8')).toBe('unknown partial bytes');
    const original = readFileSync(join(config.output, 'receipt.json'), 'utf8');
    config.archiveAt = Date.now() + 5000; config.expiresAt = Date.now() + 240_000; metadata();
    writeFileSync(configPath, JSON.stringify(config));
    const retry = execute(); expect(retry.status).toBe(1); expect(retry.stderr).toContain('cannot be overwritten');
    expect(readFileSync(join(config.output, 'receipt.json'), 'utf8')).toBe(original);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 15_000);

function withBudgetConfig(overrides, check) {
  const root = mkdtempSync('/tmp/plugnz-preservation-test-');
  try {
    const cli = join(root, 'cli');
    writeFileSync(cli, `#!${process.execPath}\n${readFileSync(resolve('test/fixtures/preservation-transport.mjs'), 'utf8')}`); chmodSync(cli, 0o755);
    const settings = typeof overrides === 'function' ? overrides() : overrides;
    const config = { sandbox: 'plugnz-fixture', project: 'fixture', team: 'fixture', cli,
      experimentUid: 21001, evidenceRoot: '/vercel/sandbox/proof/fixture', output: join(root, 'output'),
      operation: 'acquisition', baselineUsedBytes: 1, archiveAt: Date.now() + 5000, expiresAt: Date.now() + 700_000,
      diskGrowthBytes: 3 * 1024 ** 3, diskReserveBytes: 896 * 1024 ** 2, archiveBytes: 768 * 1024 ** 2, command: ['fail'], ...settings };
    config.sdkRoot = join(root, 'sdk'); mkdirSync(join(config.sdkRoot, 'dist/auth'), { recursive: true });
    writeFileSync(join(config.sdkRoot, 'dist/index.js'), `export const Sandbox={get:async()=>({name:'plugnz-fixture',status:'running',expiresAt:new Date(${config.expiresAt})})};`);
    writeFileSync(join(config.sdkRoot, 'dist/auth/index.js'), 'export const getAuth=()=>({});');
    const configPath = join(root, 'config.json'); writeFileSync(configPath, JSON.stringify(config));
    const result = spawnSync(process.execPath, [resolve('scripts/sandbox-preservation-controller.mjs'), configPath], {
      env: { ...process.env, OPEN_PLUGIN_PRESERVATION_TRANSPORT_ROOT: root }, encoding: 'utf8', timeout: 10_000 });
    check(result, config);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('acquisition accepts the measured 768 MiB cap with 896 MiB scratch reserve and preserves the trial', () => {
  withBudgetConfig(() => { const now = Date.now(); return { archiveAt: now + 5000, expiresAt: now + 635_000 }; }, (result, config) => {
    expect(result.status).toBe(1); // transport's intentional supplier failure
    expect(existsSync(join(config.output, 'receipt.json'))).toBe(true);
    expect(readFileSync(join(config.output, 'restored/trial/sentinel'), 'utf8')).toBe('retained fixture');
  });
});

test('private large acquisition guard stops a real writer and restores its complete stopped prefix', () => {
  const root = mkdtempSync('/tmp/plugnz-preservation-test-');
  try {
    const bin = join(root, 'bin'); mkdirSync(bin);
    const df = join(bin, 'df');
    writeFileSync(df, '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted on\\nfixture 10000000 1000 7340032 1%% /\\n"\n');
    chmodSync(df, 0o755);
    const cli = join(root, 'cli');
    writeFileSync(cli, `#!${process.execPath}\n${readFileSync(resolve('test/fixtures/preservation-transport.mjs'), 'utf8')}`); chmodSync(cli, 0o755);
    const now = Date.now();
    const config = { sandbox: 'plugnz-fixture', project: 'fixture', team: 'fixture', cli,
      experimentUid: 21001, evidenceRoot: '/vercel/sandbox/proof/fixture', output: join(root, 'output'),
      operation: 'private-large-acquisition', baselineUsedBytes: 1, archiveAt: now + 5000, expiresAt: now + 785_000,
      diskGrowthBytes: 6 * 1024 ** 3, diskReserveBytes: 2944 * 1024 ** 2,
      archiveBytes: 258 * 1024 ** 2, retainedBodyBytes: 257 * 1024 ** 2, command: ['fast-partial'] };
    config.sdkRoot = join(root, 'sdk'); mkdirSync(join(config.sdkRoot, 'dist/auth'), { recursive: true });
    writeFileSync(join(config.sdkRoot, 'dist/index.js'), `export const Sandbox={get:async()=>({name:'plugnz-fixture',status:'running',expiresAt:new Date(${config.expiresAt})})};`);
    writeFileSync(join(config.sdkRoot, 'dist/auth/index.js'), 'export const getAuth=()=>({});');
    const configPath = join(root, 'config.json'); writeFileSync(configPath, JSON.stringify(config));

    const result = spawnSync(process.execPath, [resolve('scripts/sandbox-preservation-controller.mjs'), configPath], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OPEN_PLUGIN_PRESERVATION_TRANSPORT_ROOT: root },
      encoding: 'utf8', timeout: 10_000 });
    expect(result.status).toBe(1); // transport's intentional supplier failure
    if (!existsSync(join(config.output, 'receipt.json'))) throw new Error(`${result.stderr}\n${readFileSync(join(config.output, 'preservation-failure.json'), 'utf8')}`);
    expect(readFileSync(join(config.output, 'restored/trial/sentinel'), 'utf8')).toBe('retained fixture');
    const stopped = JSON.parse(readFileSync(join(root, 'writer-stopped.json'), 'utf8'));
    const source = readFileSync(join(root, 'evidence/prefix'));
    expect(stopped.stopped).toBe('retained-body-budget'); expect(stopped.bytes).toBe(source.length);
    expect(readFileSync(join(config.output, 'restored/trial/prefix'))).toEqual(source);
    const pid = Number(readFileSync(join(root, 'writer-pid'), 'utf8'));
    expect(() => process.kill(pid, 0)).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const [label, overrides] of [
  ['acquisition archive above 768 MiB', { archiveBytes: 768 * 1024 ** 2 + 1 }],
  ['acquisition scratch reserve below 896 MiB', { diskReserveBytes: 896 * 1024 ** 2 - 1 }],
  ['native archive above 100 MiB', { operation: 'native-proof', archiveBytes: 100 * 1024 ** 2 + 1 }],
  ['acquisition expiry reserve below 630 seconds', () => { const now = Date.now(); return { archiveAt: now + 5000, expiresAt: now + 634_000 }; }],
]) test(`preservation controller rejects ${label} before any transport or output mutation`, () => {
  withBudgetConfig(overrides, (result, config) => {
    expect(result.status).toBe(1);
    expect(existsSync(config.output)).toBe(false);
    expect(existsSync(resolve(config.sdkRoot, '../evidence'))).toBe(false);
  });
});
