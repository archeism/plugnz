/** Private, currently unwired. Excludes cooperating same-file local writers only. */
import { createRequire } from 'node:module';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

type Phase = 'runtime' | 'binding' | 'acquire' | 'release';
interface Database { exec(sql: string): unknown; close(): void }
interface Identity { dev: bigint; ino: bigint; uid: bigint; mode: bigint; nlink: bigint;
  isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }
const runtime = process as unknown as { versions: { bun?: string; node: string }; getuid?: () => number };
const stat = (path: string): Identity => (lstatSync as unknown as (path: string, options: { bigint: true }) => Identity)(path, { bigint: true });
// Root connections independently of async-frame liveness across await and GC.
const activeConnections = new Set<Database>();

export class SqliteFileLeaseError extends Error {
  constructor(readonly phase: Phase, readonly leasePath: string, readonly primaryError: unknown,
    readonly releaseErrors: readonly unknown[] = []) {
    super(`SQLite file lease ${phase} failed for '${leasePath}': ${diagnostic(primaryError)}${releaseErrors.length === 0 ? '' : `; release: ${releaseErrors.map(diagnostic).join('; ')}`}`);
    this.name = 'SqliteFileLeaseError';
  }
}

/** Existing canonical private parent; stable owned regular database, never unlink/replace. */
export async function withSqliteFileLease<T>(leasePath: string, criticalSection: () => Promise<T>): Promise<T> {
  const Database = provider(leasePath); // Unsupported runtime refuses before filesystem creation.
  let parent: Identity;
  let prior: Identity | null;
  try { parent = ownedParent(leasePath); prior = ownedFile(leasePath); }
  catch (error) { throw new SqliteFileLeaseError('binding', leasePath, error); }
  let database: Database | undefined;
  let acquired = false;
  let identity: Identity;
  try {
    database = new Database(leasePath);
    activeConnections.add(database);
    identity = ownedFile(leasePath)!;
    assertSame(parent, ownedParent(leasePath));
    if (prior !== null) assertSame(prior, identity);
    database.exec('PRAGMA busy_timeout=0;');
    database.exec('PRAGMA schema_version;'); // Corruption must not reach the callback.
    database.exec('BEGIN EXCLUSIVE;'); acquired = true;
    assertSame(identity, ownedFile(leasePath));
  } catch (error) {
    const release = releaseDatabase(database, acquired);
    throw new SqliteFileLeaseError('acquire', leasePath, error, release);
  }
  let result: T | undefined;
  let callbackFailed = false;
  let callbackError: unknown;
  const release: unknown[] = [];
  try { result = await criticalSection(); }
  catch (error) { callbackFailed = true; callbackError = error; }
  finally {
    // Strong database reference remains reachable across the suspended await and GC.
    try { assertSame(parent, ownedParent(leasePath)); assertSame(identity!, ownedFile(leasePath)); }
    catch (error) { release.push(error); }
    try { database.exec('ROLLBACK;'); } catch (error) { release.push(error); }
    try { database.close(); activeConnections.delete(database); } catch (error) { release.push(error); }
  }
  if (release.length > 0) throw new SqliteFileLeaseError('release', leasePath,
    callbackFailed ? callbackError : new Error('lease release did not verify'), release);
  if (callbackFailed) throw callbackError;
  return result as T;
}

function provider(path: string): new (path: string) => Database {
  try {
    if (!runtime.versions.bun) {
      const [major = 0, minor = 0] = runtime.versions.node.split('.').map(Number);
      if (major < 22 || major === 22 && minor < 13 || major === 23 && minor < 4) {
        throw new Error('unflagged node:sqlite unavailable; no flags or fallback addons are used');
      }
    }
    const require = createRequire(import.meta.url);
    const name = runtime.versions.bun ? 'bun:sqlite' : 'node:sqlite';
    const loaded = require(name) as { Database?: new (path: string) => Database; DatabaseSync?: new (path: string) => Database };
    const Database = runtime.versions.bun ? loaded.Database : loaded.DatabaseSync;
    if (typeof Database !== 'function') throw new Error('SQLite builtin constructor unavailable');
    return Database;
  } catch (error) { throw new SqliteFileLeaseError('runtime', path, error); }
}

function ownedParent(path: string): Identity {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(dirname(path)) !== dirname(path)) {
    throw new Error('lease path requires an existing canonical parent without redirects');
  }
  const parent = stat(dirname(path));
  const uid = runtime.getuid?.();
  if (uid === undefined || parent.uid !== BigInt(uid) || !parent.isDirectory() || parent.isSymbolicLink()
    || (parent.mode & 0o022n) !== 0n || (parent.mode & 0o300n) !== 0o300n) {
    throw new Error('lease parent must be owned, private and owner-writable/searchable');
  }
  return parent;
}

function ownedFile(path: string): Identity | null {
  let file: Identity;
  try { file = stat(path); }
  catch (error) { if ((error as { code?: string }).code === 'ENOENT') return null; throw error; }
  const uid = runtime.getuid?.();
  if (!file.isFile() || file.isSymbolicLink() || uid === undefined || file.uid !== BigInt(uid)
    || file.nlink !== 1n || (file.mode & 0o022n) !== 0n || (file.mode & 0o200n) === 0n) {
    throw new Error('lease database must be an owned writable regular file without links');
  }
  return file;
}

function assertSame(expected: Identity, actual: Identity | null): void {
  if (actual === null || expected.dev !== actual.dev || expected.ino !== actual.ino) throw new Error('lease inode binding changed');
}

function releaseDatabase(database: Database | undefined, rollback: boolean): unknown[] {
  const errors: unknown[] = [];
  if (database === undefined) return errors;
  if (rollback) try { database.exec('ROLLBACK;'); } catch (error) { errors.push(error); }
  try { database.close(); activeConnections.delete(database); } catch (error) { errors.push(error); }
  return errors;
}

function diagnostic(error: unknown): string { return error instanceof Error ? error.message : String(error); }
