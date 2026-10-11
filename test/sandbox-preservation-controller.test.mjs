import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

for (const mode of ['fail', 'wait']) test(`preservation controller retains ${mode} without agent interaction`, () => {
  const root = mkdtempSync('/tmp/plugnz-preservation-test-');
  try {
    const cli = join(root, 'cli');
    writeFileSync(cli, `#!${process.execPath}\n${readFileSync(resolve('test/fixtures/preservation-transport.mjs'), 'utf8')}`); chmodSync(cli, 0o755);
    const config = { sandbox: 'plugnz-fixture', project: 'fixture', team: 'fixture', cli,
      experimentUid: 21001, evidenceRoot: '/vercel/sandbox/proof/fixture', output: join(root, 'output'),
      baselineUsedBytes: 1,
      archiveAt: Date.now() + (mode === 'fail' ? 5000 : 1000), expiresAt: Date.now() + 240_000,
      diskGrowthBytes: 256 * 1024 ** 2, diskReserveBytes: 128 * 1024 ** 2, archiveBytes: 1024 ** 2, command: [mode] };
    config.sdkRoot = join(root, 'sdk'); mkdirSync(join(config.sdkRoot, 'dist/auth'), { recursive: true });
    const metadata = () => writeFileSync(join(config.sdkRoot, 'dist/index.js'), `export const Sandbox={get:async()=>({name:'plugnz-fixture',status:'running',expiresAt:new Date(${config.expiresAt})})};`);
    metadata(); writeFileSync(join(config.sdkRoot, 'dist/auth/index.js'), 'export const getAuth=()=>({});');
    const configPath = join(root, 'config.json'); writeFileSync(configPath, JSON.stringify(config));
    const execute = () => spawnSync(process.execPath, [resolve('scripts/sandbox-preservation-controller.mjs'), configPath], {
      env: { ...process.env, OPEN_PLUGIN_PRESERVATION_TRANSPORT_ROOT: root }, encoding: 'utf8', timeout: 10_000 });
    const result = execute(); expect(result.status).toBe(1);
    if (!existsSync(join(config.output, 'receipt.json'))) throw new Error(`${result.stderr}\n${readFileSync(join(config.output, 'preservation-failure.json'), 'utf8')}`);
    const receipt = JSON.parse(readFileSync(join(config.output, 'receipt.json'), 'utf8'));
    expect(receipt.reason).toBe(mode === 'fail' ? 'supplier-failure' : 'archive-deadline');
    expect(receipt.restoredFiles).toBe(1);
    expect(readFileSync(join(config.output, 'restored/trial/sentinel'), 'utf8')).toBe('retained fixture');
    const original = readFileSync(join(config.output, 'receipt.json'), 'utf8');
    config.archiveAt = Date.now() + 5000; config.expiresAt = Date.now() + 240_000; metadata();
    writeFileSync(configPath, JSON.stringify(config));
    const retry = execute(); expect(retry.status).toBe(1); expect(retry.stderr).toContain('cannot be overwritten');
    expect(readFileSync(join(config.output, 'receipt.json'), 'utf8')).toBe(original);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 15_000);
