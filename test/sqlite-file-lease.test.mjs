import { expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const BUN = process.env.OPEN_PLUGIN_TEST_LEASE_BUN || process.execPath;
const NODE = process.env.OPEN_PLUGIN_TEST_LEASE_NODE || 'node';
const worker = resolve(import.meta.dirname, 'sqlite-file-lease-worker.mjs');
function launch(runtime, artifact, lease, protectedFile, mode) {
  const child = spawn(runtime, [...(runtime === NODE ? ['--expose-gc', ...(mode === 'unsupported' ? ['--no-experimental-sqlite'] : [])] : []), worker, artifact, lease, protectedFile, mode], {
    env: { ...process.env, OPEN_PLUGIN_HOME: join(lease, '..') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  const exit = new Promise(resolveExit => child.once('close', (code, signal) => resolveExit({ code, signal })));
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const first = new Promise((resolveLine, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error(`worker timed out: ${stderr}`)); }, 5000);
    child.stdout.on('data', () => { if (stdout.includes('\n')) { clearTimeout(timer); resolveLine(JSON.parse(stdout.split('\n')[0])); } });
    child.once('close', () => { if (!stdout.includes('\n')) { clearTimeout(timer); reject(Error(`worker exited without result: ${stderr}`)); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  return { child, first, exit, rows: () => stdout.trim().split('\n').map(line => JSON.parse(line)) };
}
async function fixture(callback) {
  const root = realpathSync(mkdtempSync('/tmp/plugnz-sqlite-lease-')); chmodSync(root, 0o700);
  const artifact = join(root, 'helper.mjs'), lease = join(root, 'lease.sqlite'), protectedFile = join(root, 'protected.txt');
  try {
    const built = spawnSync(BUN, ['build', resolve(import.meta.dirname, '../src/sqlite-file-lease.ts'), '--target=node', '--outfile', artifact], { encoding: 'utf8' });
    expect({ code: built.status, stderr: built.status === 0 ? '' : built.stderr }).toEqual({ code: 0, stderr: '' });
    await callback({ root, artifact, lease, protectedFile });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('actual Bun and Node exclude across await and GC; SIGKILL releases the same persistent inode', async () => {
  if (process.env.OPEN_PLUGIN_TEST_LEASE_BUN) expect(spawnSync(BUN, ['--version'], { encoding: 'utf8' }).stdout.trim()).toBe('1.3.14');
  if (process.env.OPEN_PLUGIN_TEST_LEASE_NODE) expect(spawnSync(NODE, ['--version'], { encoding: 'utf8' }).stdout.trim()).toBe('v22.23.1');
  await fixture(async ({ artifact, lease, protectedFile }) => {
    for (const [holderRuntime, contenderRuntime] of [[BUN, BUN], [BUN, NODE], [NODE, BUN], [NODE, NODE]]) {
      const started = Date.now();
      const holder = launch(holderRuntime, artifact, lease, protectedFile, 'hold');
      try {
        expect((await holder.first).state).toBe('acquired');
        const identity = statSync(lease);
        const before = readFileSync(protectedFile, 'utf8');
        const contender = launch(contenderRuntime, artifact, lease, protectedFile, 'probe');
        const refusal = await contender.first; await contender.exit;
        expect(refusal.phase).toBe('acquire');
        expect(refusal.diagnostic).toContain('locked');
        expect(readFileSync(protectedFile, 'utf8')).toBe(before);
        holder.child.kill('SIGKILL'); expect((await holder.exit).signal).toBe('SIGKILL');
        const retry = launch(contenderRuntime, artifact, lease, protectedFile, 'probe');
        expect((await retry.first).state).toBe('acquired'); expect((await retry.exit).code).toBe(0);
        expect(existsSync(lease)).toBe(true);
        expect({ dev: statSync(lease).dev, ino: statSync(lease).ino }).toEqual({ dev: identity.dev, ino: identity.ino });
        expect(retry.rows().at(-1).result).toBe('finished');
        console.log(JSON.stringify({ holderRuntime, contenderRuntime, held: await holder.first, refusal,
          retry: retry.rows(), elapsedMs: Date.now() - started, leaseBytes: statSync(lease).size,
          scope: 'private unwired same-file lease, not ledger CAS or native fence' }));
      } finally { holder.child.kill('SIGKILL'); await holder.exit; }
    }
  });
}, 20_000);
test('awaited callback failure releases; release failures retain both callback and release evidence', async () => {
  await fixture(async ({ artifact, lease, protectedFile }) => {
    for (const runtime of [BUN, NODE]) {
      for (const mode of ['throw', 'release-fault']) {
        const failed = launch(runtime, artifact, lease, protectedFile, mode); await failed.first; await failed.exit;
        const result = failed.rows().at(-1);
        if (mode === 'throw') expect(result.diagnostic).toBe('awaited callback fault');
        else expect({ phase: result.phase, primary: result.primary, release: result.release }).toEqual({ phase: 'release', primary: 'awaited callback fault', release: ['rollback receipt fault', 'close receipt fault'] });
        const retry = launch(runtime, artifact, lease, protectedFile, 'probe');
        expect((await retry.first).state).toBe('acquired'); await retry.exit;
      }
    }
  });
}, 20_000);
test('corrupt, redirected and permission-invalid lease bindings refuse before protected callback writes', async () => {
  await fixture(async ({ root, artifact, lease, protectedFile }) => {
    for (const runtime of [BUN, NODE]) {
      writeFileSync(lease, 'not sqlite bytes');
      chmodSync(lease, 0o600);
      const corrupt = launch(runtime, artifact, lease, protectedFile, 'probe'); expect((await corrupt.first).phase).toBe('acquire'); await corrupt.exit;
      expect(existsSync(protectedFile)).toBe(false); rmSync(lease);
      const foreign = join(root, 'foreign.sqlite'); writeFileSync(foreign, 'foreign'); symlinkSync(foreign, lease);
      const redirected = launch(runtime, artifact, lease, protectedFile, 'probe'); expect((await redirected.first).phase).toBe('binding'); await redirected.exit;
      expect(readFileSync(foreign, 'utf8')).toBe('foreign'); expect(existsSync(protectedFile)).toBe(false); rmSync(lease);
      linkSync(foreign, lease);
      const linked = launch(runtime, artifact, lease, protectedFile, 'probe'); expect((await linked.first).phase).toBe('binding'); await linked.exit;
      expect(readFileSync(foreign, 'utf8')).toBe('foreign'); expect(existsSync(protectedFile)).toBe(false); rmSync(lease);
      chmodSync(root, 0o500);
      const denied = launch(runtime, artifact, lease, protectedFile, 'probe'); expect((await denied.first).phase).toBe('binding'); await denied.exit;
      expect(existsSync(protectedFile)).toBe(false); chmodSync(root, 0o700);
    }
  });
}, 20_000);

test('an actually unavailable Node SQLite builtin refuses before creating the database or protected data', async () => {
  await fixture(async ({ artifact, lease, protectedFile }) => {
    const refused = launch(NODE, artifact, lease, protectedFile, 'unsupported');
    const result = await refused.first; await refused.exit;
    expect(result.phase).toBe('runtime');
    expect(result.diagnostic).toContain('node:sqlite');
    expect(existsSync(lease)).toBe(false);
    expect(existsSync(protectedFile)).toBe(false);
  });
}, 20_000);
