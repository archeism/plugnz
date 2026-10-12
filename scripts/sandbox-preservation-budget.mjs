// Private preservation accounting shared by the remote helper and its tests.
// Node documents Stats.dev/ino as the device and filesystem inode identifiers,
// and bigint stats avoid lossy identity keys. Bun documents node:fs as implemented:
// https://nodejs.org/api/fs.html#statsdev
// https://nodejs.org/api/fs.html#statsino
// https://bun.com/docs/runtime/nodejs-compat#nodefs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

const TAR_BLOCK = 512;
const TAR_RECORD = 10 * 1024;
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

const PROFILES = {
  native: { archiveMs: 50_000, downloadMs: 60_000, marginMs: 30_000, maxDiskGrowthBytes: 3 * GiB,
    minDiskReserveBytes: 128 * MiB, maxArchiveBytes: 100 * MiB, minLocalFreeBytes: 0 },
  acquisition: { archiveMs: 240_000, downloadMs: 300_000, marginMs: 60_000, maxDiskGrowthBytes: 3 * GiB,
    minDiskReserveBytes: 896 * MiB, maxArchiveBytes: 768 * MiB, minLocalFreeBytes: 3 * GiB },
  large: { archiveMs: 360_000, downloadMs: 300_000, marginMs: 90_000, maxDiskGrowthBytes: 6 * GiB,
    minDiskReserveBytes: 2944 * MiB, maxArchiveBytes: 2816 * MiB, minLocalFreeBytes: 6 * GiB,
    maxRetainedBodyBytes: 2560 * MiB, monitorHeadroomBytes: 256 * MiB },
};

export function preservationProfile(operation) {
  assert.ok(operation === undefined || ['acquisition', 'native-proof', 'method-probe', 'private-large-acquisition'].includes(operation));
  if (operation === 'private-large-acquisition') return PROFILES.large;
  if (operation === 'acquisition') return PROFILES.acquisition;
  return PROFILES.native;
}

export function validatePreservationBudget(config, availableBytes) {
  const profile = preservationProfile(config.operation);
  const reserveMs = 15_000 + 15_000 + profile.archiveMs + profile.downloadMs + profile.marginMs;
  assert.ok(config.expiresAt - config.archiveAt >= reserveMs, 'Reserve complete bounded preservation pipeline');
  assert.ok(config.diskGrowthBytes > 0 && config.diskGrowthBytes <= profile.maxDiskGrowthBytes);
  assert.ok(config.diskReserveBytes >= profile.minDiskReserveBytes);
  assert.ok(config.archiveBytes > 0 && config.archiveBytes <= profile.maxArchiveBytes);
  if (profile.maxRetainedBodyBytes === undefined) assert.equal(config.retainedBodyBytes, undefined,
    'Raw retained-body ceiling is private to large acquisition');
  else assert.ok(config.retainedBodyBytes > 0 && config.retainedBodyBytes <= profile.maxRetainedBodyBytes);
  if (profile.minLocalFreeBytes > 0) assert.ok(availableBytes >= profile.minLocalFreeBytes,
    `${config.operation === 'acquisition' ? 'Acquisition' : 'Private large acquisition'} requires ${profile.minLocalFreeBytes / GiB} GiB local archive/restore headroom`);
  return { ...profile, reserveMs };
}

function roundUp(value, multiple) { return Math.ceil(value / multiple) * multiple; }

export function fileHash(path) {
  const hash = createHash('sha256'), fd = openSync(path, 'r'), buffer = Buffer.alloc(64 * 1024);
  try { let count; while ((count = readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, count)); }
  finally { closeSync(fd); }
  return hash.digest('hex');
}

export function inventoryArchiveSource(base, { hashFiles = true, recordIdentity = true } = {}) {
  const inventory = [];
  const walk = (relative = '') => {
    for (const name of readdirSync(join(base, relative)).sort()) {
      assert.ok(!/[\r\n]/u.test(name), 'Ambiguous archive filename');
      const path = join(relative, name), absolute = join(base, path);
      const stat = lstatSync(absolute, { bigint: true });
      if (stat.isDirectory()) {
        inventory.push({ path, kind: 'directory', mode: Number(stat.mode & 0o777n) }); walk(path);
      } else if (stat.isSymbolicLink()) inventory.push({ path, kind: 'symlink', target: readlinkSync(absolute) });
      else {
        assert.ok(stat.isFile(), `Archive boundary contains a special file: ${path}`);
        assert.ok(stat.size <= BigInt(Number.MAX_SAFE_INTEGER), `Archive file is too large to measure safely: ${path}`);
        inventory.push({ path, kind: 'file', bytes: Number(stat.size), mode: Number(stat.mode & 0o777n),
          ...(recordIdentity ? { device: String(stat.dev), inode: String(stat.ino) } : {}),
          ...(hashFiles ? { sha256: fileHash(absolute) } : {}) });
      }
    }
  };
  walk(); return inventory;
}

function longRecord(value) {
  const bytes = Buffer.byteLength(value) + 1;
  return bytes > 100 ? TAR_BLOCK + roundUp(bytes, TAR_BLOCK) : 0;
}

function gzipUpperBound(bytes) {
  // zlib's compressBound formula, rounded upward, plus a conservative gzip wrapper:
  // https://zlib.net/manual.html#compressBound
  return bytes + Math.ceil(bytes / 4096) + Math.ceil(bytes / 16384) + Math.ceil(bytes / 33_554_432) + 31;
}

export function measureRetainedArchive(sources) {
  const directories = new Set(['.']);
  const identities = new Map();
  let bodyBytes = 0, entryBytes = 0, regularPaths = 0;
  for (const source of sources) {
    const omissions = new Set(source.omittedPaths);
    const namespace = `./${source.namespace}`;
    directories.add(namespace);
    for (const row of source.inventory) {
      if (omissions.has(row.path)) continue;
      const archivePath = `${namespace}/${row.path}`;
      const parts = archivePath.split('/');
      for (let length = 2; length < parts.length; length++) directories.add(parts.slice(0, length).join('/'));
      if (row.kind === 'directory') { directories.add(archivePath); continue; }
      entryBytes += TAR_BLOCK + longRecord(archivePath);
      if (row.kind === 'symlink') { entryBytes += longRecord(row.target); continue; }
      assert.equal(row.kind, 'file');
      assert.match(row.device, /^\d+$/u); assert.match(row.inode, /^\d+$/u);
      regularPaths++;
      const identity = `${row.device}:${row.inode}`;
      const prior = identities.get(identity);
      if (prior === undefined) {
        identities.set(identity, { bytes: row.bytes, archivePath });
        bodyBytes += row.bytes;
        entryBytes += roundUp(row.bytes, TAR_BLOCK);
      } else {
        assert.equal(row.bytes, prior.bytes, 'One physical file reported inconsistent logical sizes');
        entryBytes += longRecord(prior.archivePath);
      }
    }
  }
  for (const directory of directories) entryBytes += TAR_BLOCK + longRecord(`${directory}/`);
  const tarBytes = roundUp(entryBytes + 2 * TAR_BLOCK, TAR_RECORD);
  return { regularPaths, uniqueBodies: identities.size, bodyBytes, tarBytes,
    archiveBytes: gzipUpperBound(tarBytes) };
}

export function retentionStopReason(measurement, config, profile = preservationProfile(config.operation)) {
  assert.ok(profile.monitorHeadroomBytes > 0 && config.retainedBodyBytes > profile.monitorHeadroomBytes &&
    config.archiveBytes > profile.monitorHeadroomBytes);
  if (measurement.bodyBytes >= config.retainedBodyBytes - profile.monitorHeadroomBytes) return 'retained-body-budget';
  if (measurement.archiveBytes >= config.archiveBytes - profile.monitorHeadroomBytes) return 'archive-projection-budget';
  return null;
}
