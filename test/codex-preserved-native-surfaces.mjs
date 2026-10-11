import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { join, relative } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function treeDigest(path) {
  if (!existsSync(path)) return null;
  const rows = [];
  const visit = file => {
    const stat = lstatSync(file), name = relative(path, file) || '.';
    if (stat.isSymbolicLink()) rows.push([name, 'link', readlinkSync(file)]);
    else if (stat.isDirectory()) {
      rows.push([name, 'directory', stat.mode & 0o777]);
      for (const child of readdirSync(file).sort()) visit(join(file, child));
    } else {
      if (!stat.isFile()) throw new Error(`non-file proof surface: ${file}`);
      rows.push([name, 'file', stat.mode & 0o777, hash(readFileSync(file))]);
    }
  };
  visit(path);
  return hash(JSON.stringify(rows));
}
export function captureSurfaces(codexHome) {
  return {
    checkout: treeDigest(join(codexHome, '.tmp/marketplaces/plugnz-proof')),
    cache: treeDigest(join(codexHome, 'plugins/cache')),
    config: treeDigest(join(codexHome, 'config.toml')),
    data: treeDigest(join(codexHome, 'plugins/data')),
  };
}
