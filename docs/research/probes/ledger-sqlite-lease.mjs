import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const requireBuiltin = createRequire(import.meta.url);
const provider = process.versions.bun ? 'bun:sqlite' : 'node:sqlite';
const Database = provider === 'bun:sqlite' ? requireBuiltin(provider).Database : requireBuiltin(provider).DatabaseSync;
const NODE = '/home/charlesfengyc/.local/bin/node';
const BUN = process.argv.includes('--pinned') ? '/tmp/plugnz-pr62-deps.0msIJO/node_modules/.bin/bun' : '/home/charlesfengyc/.local/bin/bun';
const file = new URL(import.meta.url).pathname;
if (process.argv[2] === 'worker') {
  await worker(process.argv[3], realpathSync(process.argv[4]));
} else {
  const directory = mkdtempSync('/tmp/plugnz-ledger-sqlite-gc-evidence-');
  const lock = join(directory, 'ledger-lock.sqlite');
  writeFileSync(join(directory, 'state.json'), '{"fixture":"lock primitive only, not a lifecycle ledger"}\n');
  const setup = new Database(lock); setup.exec('PRAGMA journal_mode=DELETE;'); setup.exec('CREATE TABLE lock_probe(id INTEGER PRIMARY KEY);'); setup.close();
  const started = performance.now(); const results = [];
  for (const [holderBin, contenderBin] of [[BUN, BUN], [BUN, NODE], [NODE, BUN], [NODE, NODE]]) {
    const holder = launch(holderBin, 'hold', lock);
    try {
      const held = await holder.line;
      if (held.state !== 'acquired' || held.gc === 'unavailable') throw Error(`holder unavailable: ${JSON.stringify(held)}`);
      const contender = launch(contenderBin, 'probe', lock);
      const busy = await contender.line; const contenderExit = await contender.exit;
      if (busy.state !== 'busy' || contenderExit.code !== 0) throw Error(`mutual exclusion failed: ${JSON.stringify(busy)}`);
      holder.process.kill('SIGKILL'); const killed = await holder.exit;
      if (killed.signal !== 'SIGKILL') throw Error(`wrong kill result: ${JSON.stringify(killed)}`);
      const retry = launch(contenderBin, 'probe', lock);
      const acquired = await retry.line; const retryExit = await retry.exit;
      if (acquired.state !== 'acquired' || retryExit.code !== 0) throw Error(`SIGKILL release failed: ${JSON.stringify(acquired)}`);
      results.push({ holder: holderBin, contender: contenderBin, holderProvider: held.provider, contenderProvider: busy.provider,
        lock, mutualExclusion: true, gc: held.gc, pressureBytes: held.pressureBytes, holderReadyRss: held.rssBytes,
        killedSignal: killed.signal, restartAcquired: true });
    } finally { holder.process.kill('SIGKILL'); }
  }
  process.stdout.write(JSON.stringify({ runtime: process.version, directory, elapsedMs: performance.now() - started,
    lockBytes: statSync(lock).size, results, scope: 'same-file SQLite exclusive lease retained in finally across await+GC; not product CAS/native adoption/network-FS proof' }, null, 2) + '\n');
}
async function worker(role, lock) {
  const database = new Database(lock);
  try {
    database.exec('PRAGMA busy_timeout=0;'); database.exec('BEGIN EXCLUSIVE;');
  } catch (error) {
    const busy = error.errcode === 5 || error.code === 'SQLITE_BUSY' || /database is locked/u.test(error.message);
    process.stdout.write(JSON.stringify({ role, provider, lock, state: busy ? 'busy' : 'error', diagnostic: error.message }) + '\n');
    database.close(); process.exit(busy ? 0 : 1);
  }
  try {
    const pressure = Array.from({ length: 16 }, () => new Uint8Array(65536));
    let gc = 'unavailable';
    if (process.versions.bun && typeof globalThis.Bun.gc === 'function') { globalThis.Bun.gc(true); gc = 'Bun.gc'; }
    else if (typeof globalThis.gc === 'function') { globalThis.gc(); gc = 'Node.gc'; }
    process.stdout.write(JSON.stringify({ role, provider, lock, state: 'acquired', gc,
      pressureBytes: pressure.reduce((sum, bytes) => sum + bytes.byteLength, 0), rssBytes: process.memoryUsage().rss }) + '\n');
    if (role === 'hold') await new Promise(() => setInterval(() => {}, 1000));
  } finally {
    // This reference must remain reachable across await/native/ledger/cleanup.
    database.exec('ROLLBACK;'); database.close();
  }
}
function launch(binary, role, lock) {
  const child = spawn(binary, [...(binary === NODE ? ['--expose-gc'] : []), file, 'worker', role, lock], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; let diagnostic = '';
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.stderr.on('data', bytes => { diagnostic += bytes; });
  const line = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(Error(`probe timeout: ${diagnostic}`)); }, 5000);
    child.stdout.on('data', bytes => {
      output += bytes;
      if (!output.includes('\n')) return;
      clearTimeout(timeout);
      try { resolve(JSON.parse(output.slice(0, output.indexOf('\n')))); } catch (error) { reject(error); }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { if (!output.includes('\n')) { clearTimeout(timeout); reject(Error(`probe exited without evidence: ${diagnostic}`)); } });
  });
  return { process: child, line, exit };
}
