// Read-only diagnosis of the retained failed native trial; not mutation authority.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = '/vercel/sandbox/codex-final-proof/rollback/home';
const checkout = join(root, '.codex/.tmp/marketplaces/plugnz-proof');
const git = (dir, args) => {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 10_000 });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
};
function inventory(root) {
  const rows = [], hash = createHash('sha256');
  const visit = (dir, prefix) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.git') continue;
      const file = join(dir, name), rel = prefix ? `${prefix}/${name}` : name, stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`unexpected symlink: ${file}`);
      if (stat.isDirectory()) { hash.update(`d\0${rel}\0`); rows.push([rel, 'directory']); visit(file, rel); }
      else {
        const digest = createHash('sha256').update(readFileSync(file)).digest('hex'), mode = stat.mode & 0o111 ? 'x' : '-';
        hash.update(`f\0${rel}\0${mode}\0${digest}\0`); rows.push([rel, mode, digest]);
      }
    }
  };
  visit(root, ''); return { fingerprint: hash.digest('hex'), rows };
}
const head = git(checkout, ['rev-parse', 'HEAD']);
const snapshots = join(root, 'cache/source-snapshots');
const report = JSON.parse(readFileSync('/vercel/sandbox/codex-final-proof/rollback/native-exit-report.json', 'utf8'));
const candidates = [join(snapshots, report.command.sourceSnapshots[0].reference.fingerprint)];
const actual = inventory(checkout);
const comparison = candidates.map(dir => {
  const expected = inventory(dir), left = new Map(expected.rows.map(row => [row[0], row])), right = new Map(actual.rows.map(row => [row[0], row]));
  const differences = [...new Set([...left.keys(), ...right.keys()])].filter(path => JSON.stringify(left.get(path)) !== JSON.stringify(right.get(path))).map(path => ({ path, expected: left.get(path) ?? null, actual: right.get(path) ?? null }));
  return { snapshot: dir, fingerprint: expected.fingerprint, differences };
});
console.log(JSON.stringify({ head, origin: git(checkout, ['config', '--get', 'remote.origin.url']), status: git(checkout, ['status', '--porcelain=v1', '--untracked-files=all']), actualFingerprint: actual.fingerprint, comparison }, null, 2));
