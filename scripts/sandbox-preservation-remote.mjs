// Isolated experiment helper. Never run against a real installation.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chownSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { stageBundle } from './sandbox-preservation-stage.mjs';
import { fileHash, inventoryArchiveSource, measureRetainedArchive, preservationProfile } from './sandbox-preservation-budget.mjs';
import { startLargeRetentionSupervisor } from './sandbox-preservation-supervisor.mjs';

const [action, configPath] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const profile = preservationProfile(config.operation);
const largeAcquisition = config.operation === 'private-large-acquisition';
const root = resolve(config.evidenceRoot);
assert.ok(root !== '/' && root.startsWith('/vercel/sandbox/proof/'));
assert.equal(process.getuid(), 0, 'Supervisor/transport must not share experiment UID');
assert.ok(Number.isSafeInteger(config.experimentUid) && config.experimentUid >= 2000 && config.experimentUid <= 60000);
assert.ok(['run', 'stop', 'archive'].includes(action));
const controlParent = join('/vercel/sandbox/preservation-control', basename(root));
const control = join(controlParent, 'control');
mkdirSync(control, { recursive: true, mode: 0o700 });
for (const path of ['/vercel/sandbox/preservation-control', controlParent, control]) {
  const stat = lstatSync(path); assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o022) === 0);
}
const write = (name, data) => writeFileSync(join(control, name), JSON.stringify(data, null, 2), { flag: 'wx' });
function ownedPids() {
  const pids = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/u.test(name)) continue;
    try {
      const status = readFileSync(`/proc/${name}/status`, 'utf8');
      if (Number(status.match(/^Uid:\s+(\d+)/mu)?.[1]) === config.experimentUid && !/^State:\s+Z/mu.test(status)) pids.push(Number(name));
    } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  }
  return pids;
}
async function stopOwned() {
  // UID authority was claimed while empty, before any experiment process existed.
  // Repeated scans catch detached grandchildren racing their parent's exit.
  for (let round = 0; round < 50; round++) {
    const pids = ownedPids();
    if (pids.length === 0) return;
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  assert.fail('Experiment writers remain alive; no stopped snapshot claim');
}
const used = () => {
  const r = spawnSync('df', ['-Pk', '/'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  return Number(r.stdout.trim().split('\n').at(-1).trim().split(/\s+/u)[2]) * 1024;
};
function inventoryFor(base, hashFiles = true) {
  return inventoryArchiveSource(base, { hashFiles, recordIdentity: largeAcquisition });
}
function supplierState(supplier, hashFiles = true) {
  assert.ok(resolve(supplier.root).startsWith('/vercel/sandbox/native/'));
  assert.ok(supplier.locator && supplier.revision && supplier.integrityFiles.length > 0);
  const checked = supplier.integrityFiles.map(file => {
    assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'));
    assert.match(file.sha256, /^[a-f0-9]{64}$/u);
    const path = join(supplier.root, file.path);
    const actual = existsSync(path) && lstatSync(path).isFile() ? fileHash(path) : null;
    return { ...file, actual, verifiedImmutableBody: actual === file.sha256 };
  });
  if (existsSync(supplier.root)) assert.ok(lstatSync(supplier.root).isDirectory() && !lstatSync(supplier.root).isSymbolicLink(), 'Supplier root redirected');
  const inventory = existsSync(supplier.root) ? inventoryFor(supplier.root, hashFiles) : [];
  return { ...supplier, integrityFiles: checked, inventory,
    acquisition: checked.every(row => row.verifiedImmutableBody) ? 'verified-bodies' : 'incomplete',
    // Only the individually prebound, matching body may be replayed from its
    // frozen locator/revision. All other supplier bytes MUST be archived.
    omittedPaths: checked.filter(row => row.verifiedImmutableBody).map(row => row.path) };
}

if (action === 'run') {
  assert.ok(!existsSync(join(control, 'started.json')), 'Attempt cannot be overwritten');
  assert.ok(Array.isArray(config.command) && config.command.length > 0);
  assert.deepEqual(ownedPids(), [], 'Experiment UID already occupied; refuse adoption');
  mkdirSync(root, { recursive: false });
  chownSync(root, config.experimentUid, config.experimentUid);
  if (config.supplierScratchRoot !== undefined) {
    assert.equal(config.supplierScratchRoot, '/vercel/sandbox/native');
    mkdirSync(config.supplierScratchRoot, { recursive: false });
    chownSync(config.supplierScratchRoot, config.experimentUid, config.experimentUid);
  }
  const baseline = config.baselineUsedBytes;
  assert.ok(Number.isSafeInteger(baseline) && baseline > 0);
  const before = used();
  write('started.json', { command: config.command, baseline, before, startedAt: new Date().toISOString() });
  if (before - baseline >= config.diskGrowthBytes - config.diskReserveBytes) {
    write('finished.json', { code: null, stopped: 'disk-budget-before-launch', before });
    process.exit(1);
  }
  const child = spawn('setpriv', ['--no-new-privs', '--bounding-set=-all', '--inh-caps=-all', '--ambient-caps=-all',
    '--reuid', String(config.experimentUid), '--regid', String(config.experimentUid), '--clear-groups', ...config.command], {
    detached: true, cwd: root, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: join(root, 'home'), CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.pid) write('pid.json', { pid: child.pid });
  let outputBytes = 0, stdout = '', stderr = '', stopped = null;
  let stopPromise, stopFailure = null, settleTimer;
  const stop = reason => {
    if (reason !== null) stopped ??= reason;
    if (!stopPromise) {
      // Pipe inheritance must not postpone containment until child.close.
      settleTimer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); }, 10_000);
      stopPromise = stopOwned().catch(error => { stopFailure = String(error); child.stdout.destroy(); child.stderr.destroy(); });
    }
    return stopPromise;
  };
  const consume = (key, chunk) => {
    const remaining = Math.max(0, 4 * 1024 * 1024 - outputBytes);
    outputBytes += chunk.length;
    if (key === 'stdout') stdout += chunk.subarray(0, remaining).toString();
    else stderr += chunk.subarray(0, remaining).toString();
    if (outputBytes > 4 * 1024 * 1024) stop('output-budget');
  };
  child.stdout.on('data', chunk => consume('stdout', chunk));
  child.stderr.on('data', chunk => consume('stderr', chunk));
  const measurements = [];
  const sample = () => {
    try {
      const allocated = used(); measurements.push({ at: Date.now(), allocated });
      // Whole filesystem includes package caches, compiler scratch and archives.
      if (allocated - baseline >= config.diskGrowthBytes - config.diskReserveBytes) stop('disk-budget');
      if (!largeAcquisition) {
        const suppliers = (config.suppliers ?? []).map(supplier => supplierState(supplier, false));
        const unknownBytes = suppliers.reduce((sum, supplier) => sum + supplier.inventory
          .filter(row => row.kind === 'file' && !supplier.omittedPaths.includes(row.path))
          .reduce((bytes, row) => bytes + row.bytes, 0), 0);
        // Preserve the reviewed Native/Codex monitor exactly; the private large
        // profile alone uses filesystem-identity and tar-projection accounting.
        if (unknownBytes >= config.archiveBytes * 0.75) stop('supplier-retention-budget');
      }
    } catch (error) { stopped = String(error); stop('measurement-failed'); }
  };
  const closeLargeMonitor = largeAcquisition ? startLargeRetentionSupervisor({ root, suppliers: config.suppliers ?? [],
    config, profile, baseline, used, stop, recordAllocated: allocated => measurements.push({ at: Date.now(), allocated }) }) : null;
  if (!largeAcquisition) sample();
  const monitor = largeAcquisition ? null : setInterval(sample, 500);
  let result;
  try {
    result = await new Promise(resolveExit => {
      child.once('error', error => resolveExit({ code: null, error: String(error) }));
      child.once('exit', () => stop(null));
      child.once('close', (code, signal) => resolveExit({ code, signal }));
    });
  } finally {
    if (monitor !== null) clearInterval(monitor);
    if (closeLargeMonitor !== null) await closeLargeMonitor();
    await stop(null);
    clearTimeout(settleTimer);
  }
  write('finished.json', { ...result, stopped, stopFailure, outputBytes, stdout, stderr, measurements, finalUsed: used() });
  process.exitCode = result.code === 0 && stopped === null && stopFailure === null ? 0 : 1;
} else if (action === 'stop') {
  write('controller-stop.json', { at: new Date().toISOString() });
  assert.ok(existsSync(join(control, 'started.json')), 'No claimed experiment UID');
  await stopOwned();
} else {
  assert.ok(existsSync(join(control, 'started.json')));
  // Controller must settle all writers before taking this immutable archive.
  assert.ok(existsSync(join(control, 'finished.json')));
  assert.deepEqual(ownedPids(), [], 'Archive requires zero live experiment writers');
  // Supplier bytes may be reconstructed, but only with a frozen acquisition
  // identity and complete stopped-state inventory. Native homes are NOT suppliers.
  const suppliers = (config.suppliers ?? []).map(supplier => supplierState(supplier));
  write('reconstructible-suppliers.json', suppliers);
  const inventory = inventoryFor(root);
  write('inventory.json', inventory);
  const archiveSources = [{ namespace: 'trial', root, inventory, omittedPaths: [] },
    { namespace: 'control', root: control, inventory: inventoryFor(control), omittedPaths: [] },
    ...suppliers.flatMap((supplier, index) => existsSync(supplier.root)
      ? [{ namespace: `suppliers/${index}`, root: supplier.root, inventory: supplier.inventory, omittedPaths: supplier.omittedPaths }]
      : [])];
  let archiveProjection;
  if (largeAcquisition) {
    archiveProjection = measureRetainedArchive(archiveSources);
    assert.ok(archiveProjection.bodyBytes <= config.retainedBodyBytes,
      'Stopped retained bodies exceed the recoverable raw budget');
    assert.ok(archiveProjection.archiveBytes <= config.archiveBytes,
      'Conservative stopped archive projection exceeds the downloadable archive budget');
  } else {
    const retainedSupplierBytes = suppliers.reduce((sum, supplier) => sum + supplier.inventory
      .filter(row => row.kind === 'file' && !supplier.omittedPaths.includes(row.path))
      .reduce((bytes, row) => bytes + row.bytes, 0), 0);
    assert.ok(inventory.reduce((sum, row) => sum + (row.bytes ?? 0), 0) + retainedSupplierBytes <= config.archiveBytes,
      'Evidence exceeds archive budget; never silently omit trial files');
  }
  const archive = `${root}.tar.gz`;
  assert.ok(!existsSync(archive), 'Archive cannot be overwritten');
  // Two explicit namespaces prevent trial-controlled files replacing privileged
  // metadata, without following or deleting any trial-created link.
  const bundle = join(controlParent, 'bundle');
  const stagingBefore = used();
  const staged = stageBundle(bundle, archiveSources);
  const stagingAllocatedGrowthBytes = used() - stagingBefore;
  assert.ok(stagingAllocatedGrowthBytes <= 128 * 1024 ** 2, 'Hardlink metadata exceeded declared scratch margin');
  const tar = spawnSync('tar', ['-czf', archive,
    '-C', bundle, '.'], { encoding: 'utf8', timeout: largeAcquisition ? 300_000 : config.operation === 'acquisition' ? 180_000 : 40_000 });
  assert.equal(tar.status, 0, tar.stderr);
  assert.ok(lstatSync(archive).size <= config.archiveBytes);
  console.log(JSON.stringify({ archive, bytes: lstatSync(archive).size,
    sha256: fileHash(archive), files: inventory.length, staging: { ...staged, allocatedGrowthBytes: stagingAllocatedGrowthBytes },
    ...(archiveProjection === undefined ? {} : { archiveProjection }) }));
}
