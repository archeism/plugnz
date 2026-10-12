import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync,
  symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { inventoryArchiveSource, measureRetainedArchive, preservationProfile,
  retentionStopReason, validatePreservationBudget } from '../scripts/sandbox-preservation-budget.mjs';
import { stageBundle } from '../scripts/sandbox-preservation-stage.mjs';

function archiveAndRestore(temp, sources, compressed = true) {
  const bundle = join(temp, 'bundle'); stageBundle(bundle, sources);
  const archive = join(temp, compressed ? 'evidence.tar.gz' : 'evidence.tar');
  const create = compressed ? ['-czf', archive, '-C', bundle, '.'] : ['-cf', archive, '-C', bundle, '.'];
  expect(spawnSync('tar', create).status).toBe(0);
  const restored = join(temp, 'restored'); mkdirSync(restored);
  const extract = compressed ? ['-xzf', archive, '-C', restored] : ['-xf', archive, '-C', restored];
  expect(spawnSync('tar', extract).status).toBe(0);
  return { archive, restored };
}

test('same-inode trial and supplier aliases consume one body and both restore', () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-large-');
  try {
    const trial = join(temp, 'trial-source'), supplier = join(temp, 'supplier-source');
    mkdirSync(trial); mkdirSync(supplier);
    writeFileSync(join(trial, 'body'), 'one physical body');
    linkSync(join(trial, 'body'), join(supplier, 'alias'));
    const sources = [
      { namespace: 'trial', root: trial, inventory: inventoryArchiveSource(trial), omittedPaths: [] },
      { namespace: 'suppliers/0', root: supplier, inventory: inventoryArchiveSource(supplier), omittedPaths: [] },
    ];

    const measured = measureRetainedArchive(sources);
    expect(measured.regularPaths).toBe(2);
    expect(measured.uniqueBodies).toBe(1);
    expect(measured.bodyBytes).toBe(17);

    const { restored } = archiveAndRestore(temp, sources);
    expect(readFileSync(join(restored, 'trial/body'), 'utf8')).toBe('one physical body');
    expect(readFileSync(join(restored, 'suppliers/0/alias'), 'utf8')).toBe('one physical body');
    expect(existsSync(join(restored, 'trial/body'))).toBe(true);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('scaled incompressible raw-at-limit data with long and empty entries fits its projected archive and restores', () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-large-');
  try {
    const trial = join(temp, 'trial-source'), long = 'x'.repeat(140);
    mkdirSync(trial); mkdirSync(join(trial, long));
    const bytes = Buffer.allocUnsafe(2 * 1024 ** 2);
    let state = 0x12345678;
    for (let index = 0; index < bytes.length; index++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5; bytes[index] = state & 0xff;
    }
    writeFileSync(join(trial, 'body'), bytes); writeFileSync(join(trial, long, 'empty'), '');
    const sources = [{ namespace: 'trial', root: trial, inventory: inventoryArchiveSource(trial), omittedPaths: [] }];
    const measured = measureRetainedArchive(sources);
    expect(measured.bodyBytes).toBe(2 * 1024 ** 2);
    expect(measured.archiveBytes).toBeLessThanOrEqual(2304 * 1024);
    const { archive, restored } = archiveAndRestore(temp, sources);
    expect(lstatSync(archive).size).toBeLessThanOrEqual(measured.archiveBytes);
    expect(createHash('sha256').update(readFileSync(join(restored, 'trial/body'))).digest('hex'))
      .toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(readFileSync(join(restored, `trial/${long}/empty`)).length).toBe(0);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('equal copied bodies on different inodes consume capacity twice', () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-large-');
  try {
    const trial = join(temp, 'trial-source'), supplier = join(temp, 'supplier-source');
    mkdirSync(trial); mkdirSync(supplier); writeFileSync(join(trial, 'body'), 'copied bytes');
    copyFileSync(join(trial, 'body'), join(supplier, 'copy'));
    const measured = measureRetainedArchive([
      { namespace: 'trial', root: trial, inventory: inventoryArchiveSource(trial), omittedPaths: [] },
      { namespace: 'suppliers/0', root: supplier, inventory: inventoryArchiveSource(supplier), omittedPaths: [] },
    ]);
    expect(measured.regularPaths).toBe(2); expect(measured.uniqueBodies).toBe(2); expect(measured.bodyBytes).toBe(24);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('sparse logical bodies, symlinks and hardlinks cannot understate the tar projection', () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-large-');
  try {
    const trial = join(temp, 'trial-source'); mkdirSync(trial);
    writeFileSync(join(trial, 'sparse'), 'tail'); truncateSync(join(trial, 'sparse'), 4 * 1024 ** 2);
    linkSync(join(trial, 'sparse'), join(trial, 'hardlink'));
    const target = `missing/${'y'.repeat(140)}`; symlinkSync(target, join(trial, 'link'));
    const sources = [{ namespace: 'trial', root: trial, inventory: inventoryArchiveSource(trial), omittedPaths: [] }];
    const measured = measureRetainedArchive(sources);
    expect(measured.bodyBytes).toBe(4 * 1024 ** 2); expect(measured.uniqueBodies).toBe(1); expect(measured.regularPaths).toBe(2);
    const { archive, restored } = archiveAndRestore(temp, sources, false);
    expect(lstatSync(archive).size).toBeLessThanOrEqual(measured.tarBytes);
    expect(lstatSync(join(restored, 'trial/sparse')).size).toBe(4 * 1024 ** 2);
    expect(readlinkSync(join(restored, 'trial/link'))).toBe(target);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('large acquisition guard reserves 256 MiB against both body growth and tar projection', () => {
  const profile = preservationProfile('private-large-acquisition');
  const config = { retainedBodyBytes: 2560 * 1024 ** 2, archiveBytes: 2816 * 1024 ** 2 };
  expect(retentionStopReason({ bodyBytes: config.retainedBodyBytes - profile.monitorHeadroomBytes - 1,
    archiveBytes: config.archiveBytes - profile.monitorHeadroomBytes - 1 }, config, profile)).toBe(null);
  expect(retentionStopReason({ bodyBytes: config.retainedBodyBytes - profile.monitorHeadroomBytes,
    archiveBytes: 0 }, config, profile)).toBe('retained-body-budget');
  expect(retentionStopReason({ bodyBytes: 0,
    archiveBytes: config.archiveBytes - profile.monitorHeadroomBytes }, config, profile)).toBe('archive-projection-budget');
});

test('large acquisition requires its reviewed limits without widening existing profiles', () => {
  const now = 1_000_000;
  const large = { operation: 'private-large-acquisition', archiveAt: now, expiresAt: now + 780_000,
    diskGrowthBytes: 6 * 1024 ** 3, diskReserveBytes: 2944 * 1024 ** 2,
    archiveBytes: 2816 * 1024 ** 2, retainedBodyBytes: 2560 * 1024 ** 2 };
  expect(validatePreservationBudget(large, 6 * 1024 ** 3).reserveMs).toBe(780_000);
  for (const overrides of [
    { diskReserveBytes: 2944 * 1024 ** 2 - 1 }, { archiveBytes: 2816 * 1024 ** 2 + 1 },
    { retainedBodyBytes: 2560 * 1024 ** 2 + 1 }, { diskGrowthBytes: 6 * 1024 ** 3 + 1 },
    { expiresAt: now + 780_000 - 1 },
  ]) expect(() => validatePreservationBudget({ ...large, ...overrides }, 6 * 1024 ** 3)).toThrow();
  expect(() => validatePreservationBudget(large, 6 * 1024 ** 3 - 1)).toThrow();

  const acquisition = { operation: 'acquisition', archiveAt: now, expiresAt: now + 630_000,
    diskGrowthBytes: 3 * 1024 ** 3, diskReserveBytes: 896 * 1024 ** 2, archiveBytes: 768 * 1024 ** 2 };
  expect(validatePreservationBudget(acquisition, 3 * 1024 ** 3).reserveMs).toBe(630_000);
  expect(() => validatePreservationBudget({ ...acquisition, archiveBytes: 768 * 1024 ** 2 + 1 }, 6 * 1024 ** 3)).toThrow();
  expect(() => validatePreservationBudget({ ...acquisition, diskGrowthBytes: 3 * 1024 ** 3 + 1 }, 6 * 1024 ** 3)).toThrow();
  expect(() => validatePreservationBudget({ ...acquisition, retainedBodyBytes: 1 }, 6 * 1024 ** 3)).toThrow();
  const native = { operation: 'native-proof', archiveAt: now, expiresAt: now + 170_000,
    diskGrowthBytes: 3 * 1024 ** 3, diskReserveBytes: 128 * 1024 ** 2, archiveBytes: 100 * 1024 ** 2 };
  expect(validatePreservationBudget(native, 0).reserveMs).toBe(170_000);
  expect(() => validatePreservationBudget({ ...native, archiveBytes: 100 * 1024 ** 2 + 1 }, 0)).toThrow();
});

test('Node and Bun providers agree on bigint device/inode identity accounting', () => {
  const temp = mkdtempSync('/tmp/plugnz-preservation-large-');
  try {
    const trial = join(temp, 'trial-source'); mkdirSync(trial); writeFileSync(join(trial, 'body'), 'runtime parity');
    linkSync(join(trial, 'body'), join(trial, 'alias'));
    const inventory = inventoryArchiveSource(trial);
    const bunMeasurement = measureRetainedArchive([{ namespace: 'trial', root: trial, inventory, omittedPaths: [] }]);
    const module = pathToFileURL(resolve('scripts/sandbox-preservation-budget.mjs')).href;
    const script = `const {inventoryArchiveSource,measureRetainedArchive}=await import(process.argv[1]);
      const root=process.argv[2],inventory=inventoryArchiveSource(root);
      console.log(JSON.stringify({inventory,measurement:measureRetainedArchive([{namespace:'trial',root,inventory,omittedPaths:[]}])}));`;
    const node = spawnSync('node', ['--input-type=module', '-e', script, module, trial], { encoding: 'utf8' });
    expect(node.status).toBe(0);
    const result = JSON.parse(node.stdout);
    expect(result.inventory.map(row => [row.path, row.device, row.inode])).toEqual(
      inventory.map(row => [row.path, row.device, row.inode]));
    expect(result.measurement).toEqual(bunMeasurement);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
