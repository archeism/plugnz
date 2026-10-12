// Proposal checks only; importing this test cannot enable a migration action.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lifecycleAttemptIdForPlannedScopes } from '../src/planner';

const document = readFileSync(new URL('../docs/zcode-two-id-migration-contract-proposal.md', import.meta.url), 'utf8');
const frame = parts => parts.map(part => `${part.length}\0${part}\0`).join('');
const operation = parts => `operation-v1-${createHash('sha256').update(frame(parts)).digest('hex')}`;

test('transaction requires whole-batch admission, fencing and revalidation before its first write', () => {
  const transaction = document.split('## Transaction, CAS and restart\n')[1].split('\nRollback validates')[0];
  const steps = transaction.split(/\n(?=\d+\. )/u).map(step => step.trim()).filter(Boolean);
  const firstWrite = steps.findIndex(step => /Persist fresh|FIRST atomic accepted/u.test(step));
  const admission = steps.findIndex(step => /Global (?:read-only )?admission/u.test(step));
  const fences = steps.findIndex(step => /Acquire .*fence/u.test(step));
  const revalidation = steps.findIndex(step => /[Rr]evalidate /u.test(step));
  expect(admission).toBeGreaterThanOrEqual(0);
  expect(fences).toBeGreaterThan(admission);
  expect(revalidation).toBeGreaterThan(fences);
  expect(firstWrite).toBeGreaterThan(revalidation);
  expect(steps[fences]).toContain('deterministic global canonical order');
  expect(steps[revalidation]).toContain('command-global zero-write');
});

test('proposal specifies an actual NUL, not a backslash-zero operation salt', () => {
  expect(document.includes('sourceFingerprint + "\\0" + attemptId')).toBe(true);
  expect(document.includes('sourceFingerprint + "\\\\0" + attemptId')).toBe(false);
});

test('supported Node independently reproduces the same documented literal framing', () => {
  const golden = JSON.parse(/<!-- zcode-operation-golden-v1 -->\n```json\n([\s\S]+?)\n```/u.exec(document)[1]);
  const result = spawnSync(process.env.OPEN_PLUGIN_TEST_PACKED_NODE || 'node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'; import { createHash } from 'node:crypto';
    assert(Number(process.versions.node.split('.')[0]) >= 22);
    const g=JSON.parse(process.argv[1]), nul=String.fromCharCode(0);
    const hash=p=>createHash('sha256').update(p.map(s=>String(s.length)+nul+s+nul).join('')).digest('hex');
    const attempt='attempt-v1-'+hash([String(g.stateGeneration),'sync',g.scopeId,g.sourceFingerprint,g.packageName]);
    assert.equal(attempt,'attempt-v1-539846b9c0b94590ffd345250188834e1ba0db89a1d7a04654abd6fd475bbe11');
    const operation='operation-v1-'+hash(['desired-pair',g.scopeId,g.packageName,g.newNativeId,g.sourceFingerprint+nul+attempt]);
    assert.equal(operation,'operation-v1-43655b1cb41cb836e6b1dfb9acb13031c1f6b7b56a65bad742343e6df015550f');
    console.log(JSON.stringify({node:process.version,attempt,operation}));
  `, JSON.stringify(golden)], { encoding: 'utf8', timeout: 10_000, env: { PATH: process.env.PATH } });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).operation).toBe(golden.operationId);
});
test('proposal has an executable literal operation/attempt framing golden', () => {
  const block = /<!-- zcode-operation-golden-v1 -->\n```json\n([\s\S]+?)\n```/u.exec(document);
  expect(block !== null).toBe(true);
  const golden = JSON.parse(block[1]);
  const attemptId = lifecycleAttemptIdForPlannedScopes(golden.stateGeneration, [{ scope: { id: golden.scopeId }, selectorMode: 'all',
    desired: { sourceFingerprint: golden.sourceFingerprint, packages: [{ packageId: golden.packageName }] } }]);
  expect(attemptId).toBe('attempt-v1-539846b9c0b94590ffd345250188834e1ba0db89a1d7a04654abd6fd475bbe11');
  expect(golden.attemptId).toBe(attemptId);
  const parts = ['desired-pair', golden.scopeId, golden.packageName, golden.newNativeId, `${golden.sourceFingerprint}\0${attemptId}`];
  expect(parts[4].length).toBe(140);
  expect(Buffer.from(frame(parts)).toString('hex')).toBe(golden.framedUtf8Hex);
  expect(operation(parts)).toBe('operation-v1-43655b1cb41cb836e6b1dfb9acb13031c1f6b7b56a65bad742343e6df015550f');
  expect(operation(parts)).toBe(golden.operationId);
  const wrong = [...parts.slice(0, -1), `${golden.sourceFingerprint}\\0${attemptId}`];
  expect(operation(wrong)).toBe('operation-v1-8bfc31decbc66d89967a5d55058e006303f44ac5a85e4bbc6e5265a24f4f6ad8');
  expect(operation(wrong) === golden.operationId).toBe(false);
});
