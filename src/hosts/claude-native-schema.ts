/** Read-only compatibility guard for the pinned native known_marketplaces schema.
 * Evidence: docs/evidence/issue35-claude-native-source-schema-20261011.md.
 * Validate, never normalize: native unknown object keys are accepted unchanged.
 */
type RecordValue = Record<string, unknown>;
type Invalid = (path: string, expectation: string) => never;
const control = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const reserved = new Set(['inline', 'builtin', 'skills-dir', 'synced', 'claude-plugin-test']);
const official275 = new Set(['claude-community', 'claude-plugins-community', 'healthcare', 'claude-code-marketplace', 'claude-code-plugins', 'claude-plugins-official', 'anthropic-marketplace', 'anthropic-plugins', 'agent-skills', 'anthropic-agent-skills', 'life-sciences', 'knowledge-work-plugins', 'claude-for-legal', 'claude-for-financial-services', 'financial-services-plugins', 'first-party-plugins', 'claude-tag-plugins']);
const metadataHosts = new Set(['metadata.google.internal', 'metadata.goog', 'metadata', 'instance-data', 'instance-data.ec2.internal', 'ip6-localhost', 'ip6-loopback', 'localhost.localdomain', 'localhost4', 'localhost4.localdomain4', 'localhost6', 'localhost6.localdomain6']);
const metadataIps = new Set(['100.100.100.200', '168.63.129.16', '192.0.0.192']);
function object(value: unknown, path: string, invalid: Invalid): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid(path, 'object');
  return value as RecordValue;
}
function string(value: unknown, path: string, invalid: Invalid): string {
  if (typeof value !== 'string') return invalid(path, 'string');
  return value;
}
function optionalStrings(value: RecordValue, keys: readonly string[], path: string, invalid: Invalid): void {
  for (const key of keys) if (value[key] !== undefined) string(value[key], `${path}.${key}`, invalid);
}
function optionalBoolean(value: RecordValue, key: string, path: string, invalid: Invalid): void {
  if (value[key] !== undefined && typeof value[key] !== 'boolean') invalid(`${path}.${key}`, 'boolean');
}
function headers(value: RecordValue, path: string, invalid: Invalid): void {
  if (value.headers !== undefined) for (const [key, entry] of Object.entries(object(value.headers, `${path}.headers`, invalid))) string(entry, `${path}.headers.${key}`, invalid);
  if (value.headersHelper !== undefined) printable(value.headersHelper, `${path}.headersHelper`, false, invalid);
}
function printable(value: unknown, path: string, nonempty: boolean, invalid: Invalid): void {
  const text = string(value, path, invalid);
  if ((nonempty && text.length === 0) || text.length > 500 || /[^\x20-\x7E]| {4,}/u.test(text)) invalid(path, 'printable ASCII, at most 500 characters, no four-space runs');
}
function url(value: unknown, path: string, invalid: Invalid): { protocol: string; hostname: string } {
  const text = string(value, path, invalid);
  try { return new URL(text); } catch { return invalid(path, 'URL'); }
}
function registry(value: RecordValue, path: string, invalid: Invalid): void {
  if (value.registry === undefined) return;
  const text = string(value.registry, `${path}.registry`, invalid), parsed = url(text, `${path}.registry`, invalid);
  if (!/^https?:\/\/[^/\\]/iu.test(text) || !['http:', 'https:'].includes(parsed.protocol)) invalid(`${path}.registry`, 'http(s) registry URL');
}
function name(value: unknown, path: string, marketplace: boolean, version: string | undefined, invalid: Invalid): void {
  const text = string(value, path, invalid), lower = text.toLowerCase();
  if (text.length === 0 || text.includes(' ') || control.test(text)) invalid(path, 'nonempty name without spaces, control or bidirectional-formatting characters');
  if (!marketplace) return;
  if (/[\\/]/u.test(text) || text.includes('..') || text === '.' || reserved.has(lower)) invalid(path, 'native marketplace name');
  // 2.1.295 Ki(true) defers official/look-alike-name checks until catalog load.
  if (version === '2.1.275' && (official275.has(lower) || /[^\u0020-\u007E]/u.test(text) || /(?:official[^a-z0-9]*(anthropic|claude)|(?:anthropic|claude)[^a-z0-9]*official|^(?:anthropic|claude)[^a-z0-9]*(marketplace|plugins|official))/iu.test(text))) invalid(path, '2.1.275 settings marketplace name without reserved/official impersonation');
}
function blockedIpv4(bytes: readonly number[]): boolean {
  return bytes[0] === 127 || bytes[0] === 0 || (bytes[0] === 169 && bytes[1] === 254) || metadataIps.has(bytes.join('.'));
}
function ipv6Bytes(host: string): number[] {
  const parts = host.split('::'), left = parts[0] ? parts[0].split(':') : [], right = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const numbers = (values: string[]): number[] => values.flatMap(value => { const n = Number.parseInt(value, 16); return [n >> 8, n & 255]; });
  const start = numbers(left), end = numbers(right);
  return [...start, ...Array(16 - start.length - end.length).fill(0) as number[], ...end];
}
function archiveHostBlocked(hostname: string): boolean {
  let host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host === '' || host === 'localhost' || host.endsWith('.localhost') || metadataHosts.has(host) || (host.startsWith('instance-data.') && host.endsWith('.compute.internal'))) return true;
  // The caller supplies URL.hostname: IPv4 and bracketed IPv6 are already
  // canonicalized by the same WHATWG URL parser used by native refinements.
  if (/^\d+\.\d+\.\d+\.\d+$/u.test(host)) return blockedIpv4(host.split('.').map(Number));
  if (!host.includes(':')) return false;
  const b = ipv6Bytes(host);
  const nat64 = b[0] === 0 && b[1] === 100 && b[2] === 255 && b[3] === 155;
  if ((nat64 && b[4] === 0 && b[5] === 1) || b.every(n => n === 0) || (b.slice(0, 15).every(n => n === 0) && b[15] === 1) || host === 'fd00:ec2::254' || (b[0] === 254 && b[1]! >= 128 && b[1]! <= 191)) return true;
  const embedded: number[][] = [];
  if (b[0] === 32 && b[1] === 2) embedded.push(b.slice(2, 6));
  if ((b.slice(0, 10).every(n => n === 0) && ((b[10] === 255 && b[11] === 255) || (b[10] === 0 && b[11] === 0))) || (nat64 && b.slice(4, 12).every(n => n === 0)) || ((b[8] === 0 || b[8] === 2) && b[9] === 0 && b[10] === 94 && b[11] === 254)) embedded.push(b.slice(12, 16));
  return embedded.some(blockedIpv4);
}
function pluginSource(value: unknown, path: string, invalid: Invalid): void {
  const source = object(value, path, invalid), kind = string(source.source, `${path}.source`, invalid);
  switch (kind) {
    case 'npm': {
      const pkg = string(source.package, `${path}.package`, invalid);
      if (!/^(?:file|https?|git(?:\+https?|\+ssh)?|ssh|github|gitlab|bitbucket):/iu.test(pkg) && pkg.includes('..')) invalid(`${path}.package`, 'npm reference without path traversal');
      optionalStrings(source, ['version'], path, invalid); registry(source, path, invalid); break;
    }
    case 'url': case 'github': case 'git-subdir':
      string(source[kind === 'github' ? 'repo' : 'url'], `${path}.${kind === 'github' ? 'repo' : 'url'}`, invalid);
      optionalStrings(source, ['ref', 'sha'], path, invalid);
      if (source.sha !== undefined && !/^[a-f0-9]{40}$/u.test(source.sha as string)) invalid(`${path}.sha`, '40-character lowercase commit SHA');
      if (kind === 'git-subdir' && string(source.path, `${path}.path`, invalid).length === 0) invalid(`${path}.path`, 'nonempty string');
      break;
    case 'archive': {
      const parsed = url(source.url, `${path}.url`, invalid);
      if (parsed.protocol !== 'https:' || archiveHostBlocked(parsed.hostname)) invalid(`${path}.url`, 'HTTPS archive URL without loopback/link-local/metadata host');
      optionalStrings(source, ['sha256'], path, invalid);
      if (source.sha256 !== undefined && !/^[a-f0-9]{64}$/iu.test(source.sha256 as string)) invalid(`${path}.sha256`, '64-character hex SHA-256');
      break;
    }
    case 'command':
      printable(source.command, `${path}.command`, true, invalid);
      if (source.timeout !== undefined && (typeof source.timeout !== 'number' || !Number.isInteger(source.timeout) || source.timeout <= 0 || source.timeout > 600)) invalid(`${path}.timeout`, 'positive integer at most 600');
      if (source.mode !== undefined && source.mode !== 'copy' && source.mode !== 'link') invalid(`${path}.mode`, 'copy or link');
      break;
    default: invalid(`${path}.source`, 'native remote inline plugin source');
  }
}
export function assertClaudeMarketplaceSource(value: unknown, path: string, version: string | undefined, invalid: Invalid): void {
  const source = object(value, path, invalid), kind = string(source.source, `${path}.source`, invalid);
  switch (kind) {
    case 'url': url(source.url, `${path}.url`, invalid); headers(source, path, invalid); break;
    case 'github': case 'git':
      string(source[kind === 'github' ? 'repo' : 'url'], `${path}.${kind === 'github' ? 'repo' : 'url'}`, invalid);
      optionalStrings(source, ['ref', 'path'], path, invalid); optionalBoolean(source, 'skipLfs', path, invalid);
      if (source.sparsePaths !== undefined && (!Array.isArray(source.sparsePaths) || source.sparsePaths.some(v => typeof v !== 'string'))) invalid(`${path}.sparsePaths`, 'array of strings');
      break;
    case 'npm': {
      const pkg = string(source.package, `${path}.package`, invalid);
      if (!(/^@[a-z0-9][a-z0-9._-]*\/\*$/u.test(pkg) || (!pkg.includes('..') && !pkg.includes('//') && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(pkg)))) invalid(`${path}.package`, 'native npm package name or scope wildcard');
      optionalStrings(source, ['version'], path, invalid); registry(source, path, invalid); break;
    }
    case 'file': case 'directory': string(source.path, `${path}.path`, invalid); break;
    case 'skills-dir': break;
    case 'hostPattern': string(source.hostPattern, `${path}.hostPattern`, invalid); break;
    case 'pathPattern': string(source.pathPattern, `${path}.pathPattern`, invalid); break;
    case 'settings': {
      name(source.name, `${path}.name`, true, version, invalid);
      if (!Array.isArray(source.plugins)) return invalid(`${path}.plugins`, 'array of inline plugins');
      for (const [index, value] of source.plugins.entries()) {
        const pluginPath = `${path}.plugins[${index}]`, plugin = object(value, pluginPath, invalid);
        name(plugin.name, `${pluginPath}.name`, false, version, invalid);
        pluginSource(plugin.source, `${pluginPath}.source`, invalid);
        optionalStrings(plugin, ['description', 'version'], pluginPath, invalid);
        optionalBoolean(plugin, 'strict', pluginPath, invalid); headers(plugin, pluginPath, invalid);
      }
      if (source.owner !== undefined) {
        const owner = object(source.owner, `${path}.owner`, invalid);
        if (string(owner.name, `${path}.owner.name`, invalid).length === 0) invalid(`${path}.owner.name`, 'nonempty string');
        optionalStrings(owner, ['email', 'url'], `${path}.owner`, invalid);
      }
      break;
    }
    default: invalid(`${path}.source`, 'native marketplace source discriminator');
  }
}
