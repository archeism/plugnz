/** Pure reader protocol for the evidenced Cursor same-root variant; no writers. */
import { isAbsolute, resolve } from 'node:path';
import { canonicalAdoptionJson, type AdoptionDigest } from '../legacy-adoption-proof';
import { validateStableIdentityString } from '../source-reference';
import type { LifecycleReadbackData, TargetVersionObservation } from '../lifecycle-host';

export interface CursorAdoptionNativeProof {
  adapterId: string;
  format: 'cursor/legacy-marker-v1';
  evidenceId: AdoptionDigest;
  version: TargetVersionObservation;
  aliasMode: 'same-root';
  oldLedgerNativeId: string; oldPhysicalNativeId: string; newNativeId: string;
  packageName: string; packageVersion: string;
  marker: { source: string; pluginId: string; fingerprint: string; rawDigest: AdoptionDigest };
  roots: { label: string; path: string; fullFingerprint: AdoptionDigest; payloadFingerprint: AdoptionDigest }[];
  projectedPayloadFingerprint: AdoptionDigest;
  pins: string[];
  retention: LifecycleReadbackData['retention'];
}

export function parseCursorAdoptionNativeProof(value: unknown): CursorAdoptionNativeProof {
  const row = object(value); exact(row, ['adapterId', 'format', 'evidenceId', 'version', 'aliasMode', 'oldLedgerNativeId', 'oldPhysicalNativeId', 'newNativeId', 'packageName', 'packageVersion', 'marker', 'roots', 'projectedPayloadFingerprint', 'pins', 'retention']);
  if (row.adapterId !== 'cursor' || row.format !== 'cursor/legacy-marker-v1' || row.aliasMode !== 'same-root' || row.oldPhysicalNativeId !== row.newNativeId) fail('unsupported native adoption variant');
  for (const key of ['oldLedgerNativeId', 'oldPhysicalNativeId', 'newNativeId', 'packageName', 'packageVersion']) stable(row[key]);
  digest(row.evidenceId); digest(row.projectedPayloadFingerprint);
  const versionRow = object(row.version); exact(versionRow, ['kind', 'version', 'probeId']); member(versionRow.kind, ['detected']); stable(versionRow.version); stable(versionRow.probeId);
  const marker = object(row.marker); exact(marker, ['source', 'pluginId', 'fingerprint', 'rawDigest']); stable(marker.source); stable(marker.pluginId); stable(marker.fingerprint); digest(marker.rawDigest);
  if (!Array.isArray(row.roots) || row.roots.length !== 1) fail('same-root proof requires one root');
  const roots = row.roots.map(value => {
    const root = object(value); exact(root, ['label', 'path', 'fullFingerprint', 'payloadFingerprint']); stable(root.label); stable(root.path);
    if (root.label !== 'local') fail('proof requires its exact local content root label');
    if (!isAbsolute(root.path as string) || resolve(root.path as string) !== root.path) fail('native proof root must be canonical absolute');
    digest(root.fullFingerprint); digest(root.payloadFingerprint);
    if (root.payloadFingerprint !== row.projectedPayloadFingerprint) fail('native payload differs from frozen projection'); return root;
  });
  if (!Array.isArray(row.pins)) fail('pins must be an array');
  for (const pin of row.pins) stable(pin);
  if (new Set(row.pins).size !== row.pins.length || canonicalAdoptionJson(row.pins) !== canonicalAdoptionJson([...row.pins].sort())) fail('native pins must be unique and sorted');
  const retention = object(row.retention); exact(retention, ['pluginData', 'inactiveMetadata']);
  for (const key of ['pluginData', 'inactiveMetadata']) {
    const resource = object(retention[key]); exact(resource, ['state', 'fingerprint']); member(resource.state, ['present', 'absent', 'missing', 'not-observed']);
    if (resource.state === 'present') {
      if (typeof resource.fingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(resource.fingerprint)) fail('invalid retention fingerprint');
    } else if (resource.fingerprint !== null) fail('absent retention cannot claim a fingerprint');
  }
  return { ...row, roots } as unknown as CursorAdoptionNativeProof;
}
function object(value: unknown): Record<string, unknown> { if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('expected object'); return value as Record<string, unknown>; }
function exact(row: Record<string, unknown>, fields: readonly string[]): void { if (Object.keys(row).some(key => !fields.includes(key)) || fields.some(key => !(key in row))) fail('missing or unknown fields'); }
function stable(value: unknown): void { if (typeof value !== 'string') fail('expected stable text'); validateStableIdentityString(value as string, 'Cursor adoption identity'); }
function digest(value: unknown): void { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail('invalid canonical digest'); }
function member(value: unknown, choices: readonly string[]): void { if (typeof value !== 'string' || !choices.includes(value)) fail('unsupported enum'); }
function fail(message: string): never { throw new Error(`invalid Cursor adoption proof: ${message}`); }
