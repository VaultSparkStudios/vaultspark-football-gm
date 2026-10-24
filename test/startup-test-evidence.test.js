import assert from 'node:assert/strict';
import test from 'node:test';
import { describeStartupTests, lastSessionTests } from '../scripts/lib/startup-test-evidence.mjs';
import { renderLastCompleted } from '../scripts/lib/brief-blocks.mjs';

test('stale source-bound receipts never become current passing totals', () => {
  const status = { testsPassing: null, testsTotal: null };
  const inspection = { valid: true, fresh: false, receipt: { passed: 1752, total: 1752, generatedAt: '2026-10-02T12:00:00Z' } };
  const result = describeStartupTests(inspection, status);
  assert.equal(result.signal, '⚠');
  assert.match(result.current, /^STALE · current unverified; historical 1752\/1752 \(2026-10-02\)/);
  assert.match(result.current, /current unverified/);
  assert.deepEqual(status, { testsPassing: null, testsTotal: null });
});

test('missing and invalid receipts retain unknown current totals', () => {
  assert.match(describeStartupTests().current, /Current totals unverified/);
  const result = describeStartupTests({ valid: false, fresh: true, receipt: { passed: 9999, total: 9999 } }, { testsPassing: 3, testsTotal: 4, testsLastRun: '2026-10-01' });
  assert.match(result.current, /^STALE · current unverified; historical 3\/4/);
  assert.doesNotMatch(result.current, /9999|passing/);
});

test('fresh direct receipts preserve their test scope', () => {
  const result = describeStartupTests({ valid: true, fresh: true, receipt: { command: 'core', passed: 7, total: 7 } });
  assert.equal(result.signal, '✓');
  assert.equal(result.current, '7/7 passing · core');
});

test('last-session tests come only from the matching session handoff', () => {
  const handoff = '# Session 121 Closeout\n\n## Where We Left Off (Session 121)\n\n- Tests: CI 7/7; browser 271 passed/3 skipped; unit aggregate unmeasured.\n\n## Evidence\n- Tests: wrong section\n';
  assert.equal(lastSessionTests(handoff, 121), 'CI 7/7; browser 271 passed/3 skipped; unit aggregate unmeasured.');
  assert.equal(lastSessionTests(handoff, 122), 'Unverified for this session');
  assert.equal(lastSessionTests('', 121), 'Unverified for this session');
});

test('structured and string last-session cards use the matching handoff test evidence', () => {
  const handoff = '## Where We Left Off (Session 121)\n- Tests: Unit aggregate unmeasured; CI seven jobs passed.\n';
  const tests = lastSessionTests(handoff, 121);
  for (const summary of ['S121 delivered', { session: 121, shipped: ['delivered'], tests: '1752/1752 passing' }]) {
    const output = renderLastCompleted(summary, { expectedSession: 121, tests });
    assert.match(output, /Unit aggregate unmeasured/);
    assert.doesNotMatch(output, /1752/);
  }
  const missing = renderLastCompleted({ session: 122, shipped: ['delivered'], tests: '1752/1752 passing' }, { expectedSession: 122, tests: lastSessionTests(handoff, 122) });
  assert.match(missing, /Unverified for this session/);
  assert.doesNotMatch(missing, /1752/);
});

test('long prior-session evidence keeps its unmeasured limitation readable', () => {
  const output = renderLastCompleted('S121 delivered', { expectedSession: 121, tests: 'All seven exact-candidate CI jobs passed; browser 271 passed/3 skipped. Unit aggregate is unmeasured.' });
  assert.match(output, /Unit aggregate is unmeasured\./);
  assert.ok(output.split('\n').filter(line => line.startsWith('║')).every(line => line.length === 68));
});
