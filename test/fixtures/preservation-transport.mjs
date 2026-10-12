// Explicit local transport fixture: no Vercel/network/UID mutation.
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.OPEN_PLUGIN_PRESERVATION_TRANSPORT_ROOT;
if (!root?.startsWith('/tmp/plugnz-preservation-test-')) throw new Error('Isolated transport required');
const [verb, ...args] = process.argv.slice(2);
const path = value => join(root, basename(value.slice(value.indexOf(':') + 1)));
if (verb === 'copy') {
  const [from, to] = args;
  copyFileSync(from.includes(':') ? path(from) : from, to.includes(':') ? path(to) : to);
} else {
  const forwarded = args.slice(args.indexOf('--') + 1);
  const action = forwarded[2], config = JSON.parse(readFileSync(path(forwarded[3]), 'utf8'));
  const evidence = join(root, 'evidence'); mkdirSync(evidence, { recursive: true });
  if (action === 'run') {
    writeFileSync(join(evidence, 'sentinel'), 'retained fixture');
    chmodSync(join(evidence, 'sentinel'), 0o644);
    if (config.command[0] === 'fast-partial') {
      const { preservationProfile } = await import(pathToFileURL(join(root, 'sandbox-preservation-budget.mjs')).href);
      const { startLargeRetentionSupervisor } =
        await import(pathToFileURL(join(root, 'sandbox-preservation-supervisor.mjs')).href);
      const prefix = join(evidence, 'prefix');
      const writer = spawn(process.execPath, ['-e',
        `const {appendFileSync}=require('node:fs');const p=process.argv[1],b=Buffer.alloc(32768,0xa5);for(;;){appendFileSync(p,b);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2)}`,
        prefix], { detached: true, stdio: 'ignore' });
      writeFileSync(join(root, 'writer-pid'), String(writer.pid));
      let resolveStop;
      const stopped = new Promise(resolve => { resolveStop = resolve; });
      const closeMonitor = startLargeRetentionSupervisor({ root: evidence, suppliers: [], config,
        profile: preservationProfile(config.operation), baseline: 1, used: () => 1,
        intervalMs: 20, measurementDeadlineMs: 750,
        stop: reason => { try { process.kill(-writer.pid, 'SIGKILL'); } catch {} resolveStop(reason); } });
      const reason = await stopped;
      await new Promise(resolve => writer.once('close', resolve));
      await closeMonitor();
      let prior = -1, stable = 0;
      for (let check = 0; check < 20 && stable < 3; check++) {
        await new Promise(resolve => setTimeout(resolve, 20));
        const size = lstatSync(prefix).size;
        stable = size === prior ? stable + 1 : 0; prior = size;
      }
      if (stable < 3) throw new Error('Writer prefix did not settle after process exit');
      writeFileSync(join(root, 'writer-stopped.json'), JSON.stringify({ stopped: reason, bytes: prior }));
      process.exitCode = 42;
    } else if (['fail', 'partial'].includes(config.command[0])) process.exitCode = 42;
    else {
      while (!existsSync(join(root, 'stop'))) await new Promise(resolve => setTimeout(resolve, 20));
      process.exitCode = 1;
    }
  } else if (action === 'stop') writeFileSync(join(root, 'stop'), 'stopped');
  else {
    mkdirSync(join(evidence, 'control')); mkdirSync(join(evidence, 'trial'));
    copyFileSync(join(evidence, 'sentinel'), join(evidence, 'trial/sentinel'));
    const bytes = readFileSync(join(evidence, 'sentinel'));
    const inventory = [{ path: 'sentinel', kind: 'file', bytes: bytes.length, mode: 0o644, sha256: createHash('sha256').update(bytes).digest('hex') }];
    if (config.command[0] === 'fast-partial') {
      copyFileSync(join(evidence, 'prefix'), join(evidence, 'trial/prefix'));
      const prefix = readFileSync(join(evidence, 'prefix'));
      inventory.push({ path: 'prefix', kind: 'file', bytes: prefix.length, mode: lstatSync(join(evidence, 'prefix')).mode & 0o777,
        sha256: createHash('sha256').update(prefix).digest('hex') });
    }
    writeFileSync(join(evidence, 'control/inventory.json'), JSON.stringify(inventory));
    if (config.command[0] === 'partial') {
      mkdirSync(join(evidence, 'suppliers/0'), { recursive: true });
      const bytes = Buffer.from('unknown partial bytes');
      writeFileSync(join(evidence, 'suppliers/0/unknown'), bytes); chmodSync(join(evidence, 'suppliers/0/unknown'), 0o644);
      writeFileSync(join(evidence, 'control/reconstructible-suppliers.json'), JSON.stringify([{ acquisition: 'incomplete', omittedPaths: [], inventory: [{ path: 'unknown', kind: 'file', bytes: bytes.length, mode: 0o644, sha256: createHash('sha256').update(bytes).digest('hex') }] }]));
    } else writeFileSync(join(evidence, 'control/reconstructible-suppliers.json'), '[]');
    const archive = path(`${config.evidenceRoot}.tar.gz`);
    const r = spawnSync('tar', ['-czf', archive, '-C', evidence, '.'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Fixture tar failed: ${r.stderr}`);
    const content = readFileSync(archive);
    console.log(JSON.stringify({ archive: `${config.evidenceRoot}.tar.gz`, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex'), files: inventory.length }));
  }
}
