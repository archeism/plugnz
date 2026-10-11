import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { withLifecycleCliHarness } from './lifecycle-cli-harness';
import { parseLifecycleReport } from '../src/lifecycle-report';
import { adoptionDigest, parseLegacyRecordProof } from '../src/legacy-adoption-proof';

test('a supplied adoption expectation without matching legacy proof blocks every native scope before writes', async () => {
  await withLifecycleCliHarness(harness => {
    harness.writeHome({ '.cursor/.keep': '' });
    const alpha = harness.source('alpha', { 'plugin.json': '{"name":"alpha","version":"1.0.0"}\n' });
    const demo = harness.source('demo', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    const manifest = join(harness.source('batch', {}), 'manifest.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, entries: [alpha, demo].map((locator, index) => ({
      operation: 'sync', source: { kind: 'local', locator }, target: { kind: 'cursor', instance: 'default' },
      selectors: [{ package: index === 0 ? 'alpha' : 'demo', adoptExisting: index === 1,
        ...(index === 0 ? {} : { expectedAdoption: { schemaVersion: 1, admissionId: `sha256:${'a'.repeat(64)}` } }) }],
    })) }));
    const result = harness.run(['sync', '--manifest', manifest, '--json']);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    expect(report.summary.reason?.diagnostic).toContain('no independently proven matching legacy operation');
    expect(report.summary.mutationStarted).toBe(false);
    expect(result.state.after).toBeUndefined();
    expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
  });
});

test('unsealed legacy history is retained with an actionable diagnostic instead of a nonexistent retry verb', async () => {
  await withLifecycleCliHarness(harness => {
    const source = harness.source('legacy', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    harness.writeHome({ '.cursor/.keep': '', 'state.json': JSON.stringify({ version: 1, installs: [{
      host: 'cursor', id: 'demo@personal', source, sourceSha: 'original-revision', ownership: 'plgnz', pending: 'install',
    }] }) });
    const result = harness.run(['sync', source, '--target', 'cursor', '--plugin', 'demo', '--adopt-existing', '--json']);
    const report = parseLifecycleReport(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(1);
    expect(report.summary.reason!.diagnostic).toContain('no durable sealed recovery authority');
    expect(report.summary.reason!.diagnostic.includes("Retry the original 'legacy-recovery' command")).toBe(false);
    expect(result.state.after).toEqual(result.state.before);
    expect(result.stores.cursor.after).toEqual(result.stores.cursor.before);
  });
});

test('scopes previews exact imported legacy identities and snapshot digest without upgrading or writing history', async () => {
  await withLifecycleCliHarness(harness => {
    const source = harness.source('legacy', { 'plugin.json': '{"name":"demo","version":"1.0.0"}\n' });
    harness.writeHome({ 'state.json': JSON.stringify({ version: 1, installs: [{
      host: 'cursor', id: 'demo@personal', source, sourceSha: 'original-revision', ownership: 'plgnz',
      pending: 'install', pins: ['server'], fingerprint: 'original-fingerprint',
    }] }) });
    const result = harness.run(['scopes', '--target', 'cursor', '--json']);
    const output = JSON.parse(result.stdout) as { scopes: Array<{ adoptionHistory?: { schemaVersion: number; legacyRecords: unknown[]; records: unknown[] } }> };
    expect(result.exitCode).toBe(0);
    const history = output.scopes[0]!.adoptionHistory;
    expect(history?.schemaVersion).toBe(1);
    expect(history!.records).toEqual([]);
    const proof = parseLegacyRecordProof(history!.legacyRecords[0]);
    expect(proof.original.package).toBe('demo@personal');
    expect(proof.snapshot.activation.packageId).toBe('demo@personal');
    expect(proof.snapshot.journal.packageId).toBe('demo@personal');
    expect(proof.snapshot.activation.pins).toEqual(['server']);
    expect(proof.original.sealed).toBe(false);
    expect(proof.original.command).toBe('legacy-recovery');
    const forged = JSON.parse(JSON.stringify(proof)) as typeof proof;
    forged.snapshot.activation.sourceRevision = 'forged-revision';
    expect(rejectedLegacyProof(forged)).toBe(true);
    const unknown = { ...proof, schemaVersion: 2 };
    expect(rejectedLegacyProof(unknown)).toBe(true);
    const sealed = { ...proof, original: { ...proof.original, sealed: true } };
    expect(rejectedLegacyProof(sealed)).toBe(true);
    const mismatched = JSON.parse(JSON.stringify(proof)) as typeof proof;
    mismatched.snapshot.activation.packageId = 'demo';
    mismatched.recordDigest = adoptionDigest('plugnz/legacy-record/v1', mismatched.snapshot);
    expect(rejectedLegacyProof(mismatched)).toBe(true);
    const missingPending = JSON.parse(JSON.stringify(proof)) as typeof proof;
    delete missingPending.snapshot.activation.pending;
    missingPending.recordDigest = adoptionDigest('plugnz/legacy-record/v1', missingPending.snapshot);
    const foreignActivation = JSON.parse(JSON.stringify(missingPending)) as typeof proof;
    foreignActivation.snapshot.activation.packageId = 'other';
    foreignActivation.snapshot.activation.nativeId = 'other@foreign';
    foreignActivation.recordDigest = adoptionDigest('plugnz/legacy-record/v1', foreignActivation.snapshot);
    expect([missingPending, foreignActivation].map(rejectedLegacyProof)).toEqual([true, true]);
    const wrongAttempt = JSON.parse(JSON.stringify(proof)) as typeof proof;
    wrongAttempt.snapshot.activation.pending!.attemptId = 'foreign-attempt';
    wrongAttempt.recordDigest = adoptionDigest('plugnz/legacy-record/v1', wrongAttempt.snapshot);
    const wrongOperation = JSON.parse(JSON.stringify(proof)) as typeof proof;
    wrongOperation.snapshot.activation.pending!.operation = 'remove';
    wrongOperation.recordDigest = adoptionDigest('plugnz/legacy-record/v1', wrongOperation.snapshot);
    expect([wrongAttempt, wrongOperation].map(rejectedLegacyProof)).toEqual([true, true]);
    const extra = { ...proof, snapshot: { ...proof.snapshot, unknown: true } };
    expect(rejectedLegacyProof(extra)).toBe(true);
    expect(result.state.after).toEqual(result.state.before);
  });
});

function rejectedLegacyProof(value: unknown): boolean {
  try { parseLegacyRecordProof(value); return false; } catch { return true; }
}
