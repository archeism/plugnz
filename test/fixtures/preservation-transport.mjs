// Explicit local transport fixture: no Vercel/network/UID mutation.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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
    if (['fail', 'partial'].includes(config.command[0])) process.exitCode = 42;
    else {
      while (!existsSync(join(root, 'stop'))) await new Promise(resolve => setTimeout(resolve, 20));
      process.exitCode = 1;
    }
  } else if (action === 'stop') writeFileSync(join(root, 'stop'), 'stopped');
  else {
    mkdirSync(join(evidence, 'control')); mkdirSync(join(evidence, 'trial'));
    copyFileSync(join(evidence, 'sentinel'), join(evidence, 'trial/sentinel'));
    const bytes = readFileSync(join(evidence, 'sentinel'));
    writeFileSync(join(evidence, 'control/inventory.json'), JSON.stringify([{ path: 'sentinel', kind: 'file', bytes: bytes.length, mode: 0o644, sha256: createHash('sha256').update(bytes).digest('hex') }]));
    if (config.command[0] === 'partial') {
      mkdirSync(join(evidence, 'suppliers/0'), { recursive: true });
      const bytes = Buffer.from('unknown partial bytes');
      writeFileSync(join(evidence, 'suppliers/0/unknown'), bytes); chmodSync(join(evidence, 'suppliers/0/unknown'), 0o644);
      writeFileSync(join(evidence, 'control/reconstructible-suppliers.json'), JSON.stringify([{ acquisition: 'incomplete', omittedPaths: [], inventory: [{ path: 'unknown', kind: 'file', bytes: bytes.length, mode: 0o644, sha256: createHash('sha256').update(bytes).digest('hex') }] }]));
    } else writeFileSync(join(evidence, 'control/reconstructible-suppliers.json'), '[]');
    const archive = path(`${config.evidenceRoot}.tar.gz`);
    const r = spawnSync('tar', ['-czf', archive, '-C', evidence, '.']);
    if (r.status !== 0) throw new Error('Fixture tar failed');
    const content = readFileSync(archive);
    console.log(JSON.stringify({ archive: `${config.evidenceRoot}.tar.gz`, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex'), files: 1 }));
  }
}
