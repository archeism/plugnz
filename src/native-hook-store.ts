/** Read-only native extension package catalog; safe to load from doctor. */
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import type { InstalledPlugin } from './host';

export const NATIVE_HOOK_MARKER = '.plgnz-install.json';
export type HookRegistration =
  | { kind: 'json-array'; path: string; field: string; entry: string }
  | { kind: 'module'; path: string; content: string };
export interface NativeHookStore {
  id: string;
  root(): string;
  packages(): string;
  entryFile: string;
  registration(id: string, entry: string): HookRegistration;
}
export interface NativeHookOwner {
  kind: 'portable-hooks';
  schemaVersion: 1;
  pluginId: string;
  source: string;
  sourceSha: string;
  fingerprint: string;
}

function entryExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) { if ((error as { code?: string }).code === 'ENOENT') return false; throw error; }
}

export function hookIdentityKey(id: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9._-]*$/iu.test(id)) throw new Error('Unsafe native hook identity: ' + id);
  return createHash('sha256').update(id).digest('hex').slice(0, 32);
}
export function hookPackagePath(store: NativeHookStore, id: string): string {
  return join(store.packages(), hookIdentityKey(id));
}
export function hookRegistration(store: NativeHookStore, id: string): HookRegistration {
  return store.registration(id, join(hookPackagePath(store, id), store.entryFile));
}
export function assertHookPath(store: NativeHookStore, path: string): void {
  const root = resolve(store.root()), target = resolve(path), suffix = relative(root, target);
  if (suffix === '..' || suffix.startsWith('../') || suffix.startsWith('..\\')) throw new Error('Native hook path escapes host root');
  let current = root;
  for (const part of ['', ...suffix.split(/[\\/]/u).filter(Boolean)]) {
    if (part) current = join(current, part);
    if (entryExists(current) && lstatSync(current).isSymbolicLink()) throw new Error('Native hook path is redirected: ' + current);
  }
}
export function readHookOwner(root: string): NativeHookOwner | null {
  const path = join(root, NATIVE_HOOK_MARKER);
  if (!entryExists(path)) return null;
  if (lstatSync(path).isSymbolicLink()) throw new Error('Native hook ownership marker is redirected: ' + path);
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<NativeHookOwner>;
  if (value.kind !== 'portable-hooks' || value.schemaVersion !== 1 ||
    typeof value.pluginId !== 'string' || typeof value.source !== 'string' ||
    typeof value.sourceSha !== 'string' || typeof value.fingerprint !== 'string') {
    throw new Error('Invalid native hook ownership marker: ' + path);
  }
  return value as NativeHookOwner;
}
export function registrationText(registration: HookRegistration): string | undefined {
  if (!entryExists(registration.path)) return undefined;
  const stat = lstatSync(registration.path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Native hook registration is not a regular file: ' + registration.path);
  return readFileSync(registration.path, 'utf8');
}
export function registrationDocument(registration: Extract<HookRegistration, { kind: 'json-array' }>, raw: string | undefined): Record<string, unknown> {
  const value: unknown = raw === undefined ? {} : JSON.parse(raw);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Native extension settings must be a JSON object: ' + registration.path);
  const result = value as Record<string, unknown>;
  const entries = result[registration.field];
  if (entries !== undefined && (!Array.isArray(entries) || entries.some(item => typeof item !== 'string'))) {
    throw new Error('Native extension settings ' + registration.field + ' must be a string array');
  }
  return result;
}
export function registrationEnabled(registration: HookRegistration, raw = registrationText(registration)): boolean {
  if (registration.kind === 'module') return raw === registration.content;
  const value = registrationDocument(registration, raw);
  return (value[registration.field] as string[] | undefined)?.includes(registration.entry) ?? false;
}
export function listNativeHookPackages(store: NativeHookStore): InstalledPlugin[] {
  assertHookPath(store, store.packages());
  if (!existsSync(store.packages())) return [];
  return readdirSync(store.packages()).flatMap(name => {
    if (!/^[0-9a-f]{32}$/u.test(name)) return [];
    const path = join(store.packages(), name);
    assertHookPath(store, path);
    if (!lstatSync(path).isDirectory()) return [];
    const owner = readHookOwner(path);
    if (owner === null) return [];
    if (hookPackagePath(store, owner.pluginId) !== path) throw new Error('Native hook package identity does not match its owned slot');
    const at = owner.pluginId.indexOf('@');
    const registration = hookRegistration(store, owner.pluginId);
    assertHookPath(store, registration.path);
    return [{
      id: owner.pluginId, name: owner.pluginId.slice(0, at), marketplace: owner.pluginId.slice(at + 1),
      path, contentRoots: { package: path }, sha: owner.sourceSha,
      enabled: registrationEnabled(registration),
    }];
  });
}
