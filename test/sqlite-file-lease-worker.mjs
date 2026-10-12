import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
const [artifact, lease, protectedFile, mode] = process.argv.slice(2);
const module = await import(artifact);
if (mode === 'release-fault') {
  const require = createRequire(import.meta.url);
  const Database = process.versions.bun ? require('bun:sqlite').Database : require('node:sqlite').DatabaseSync;
  const exec = Database.prototype.exec, close = Database.prototype.close;
  Database.prototype.exec = function (sql) { const result = exec.call(this, sql); if (sql === 'ROLLBACK;') throw Error('rollback receipt fault'); return result; };
  Database.prototype.close = function () { const result = close.call(this); throw Error('close receipt fault'); };
}
try {
  const result = await module.withSqliteFileLease(lease, async () => {
    appendFileSync(protectedFile, 'callback\n');
    const pressure = Array.from({ length: 16 }, () => new Uint8Array(65536));
    await new Promise(resolve => setTimeout(resolve, 20));
    if (process.versions.bun) globalThis.Bun.gc(true); else globalThis.gc();
    process.stdout.write(JSON.stringify({ state: 'acquired', runtime: process.versions.bun || process.version,
      gc: true, rssBytes: process.memoryUsage().rss,
      pressureBytes: pressure.reduce((sum, bytes) => sum + bytes.byteLength, 0) }) + '\n');
    if (mode === 'hold') await new Promise(() => setInterval(() => {
      if (process.versions.bun) globalThis.Bun.gc(true); else globalThis.gc();
    }, 50));
    await new Promise(resolve => setTimeout(resolve, 20));
    if (mode === 'throw' || mode === 'release-fault') throw Error('awaited callback fault');
    return 'finished';
  });
  process.stdout.write(JSON.stringify({ state: 'finished', result }) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ state: 'refused', name: error.name, phase: error.phase,
    diagnostic: error.message, primary: error.primaryError?.message,
    release: error.releaseErrors?.map(value => value.message) }) + '\n');
}
