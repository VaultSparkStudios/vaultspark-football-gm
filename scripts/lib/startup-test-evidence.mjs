/** Keep current source-bound test evidence separate from historical summaries. */
export function describeStartupTests(inspection = {}, status = {}) {
  const receipt = inspection.receipt;
  const usable = inspection.valid === true && receipt;
  if (usable && inspection.fresh === true) {
    const scope = receipt.command || 'requested shards';
    return { signal: '✓', current: `${receipt.passed}/${receipt.total} passing · ${scope}`, historical: null };
  }
  const passed = usable ? receipt.passed : status.testsPassing;
  const total = usable ? receipt.total : status.testsTotal;
  const date = (usable ? receipt.generatedAt?.slice(0, 10) : status.testsLastRun) || 'undated';
  const historical = Number.isInteger(passed) && Number.isInteger(total) && total > 0
    ? `${passed}/${total} (${date})`
    : null;
  return {
    signal: '⚠',
    current: historical ? `STALE · current unverified; historical ${historical}` : 'Current totals unverified · no fresh direct receipt',
    historical
  };
}

export function lastSessionTests(handoff = '', expectedSession) {
  const block = String(handoff).match(/(?:^|\n)## Where We Left Off[^\n]*\(Session\s+(\d+)\)[^\n]*\n([\s\S]*?)(?=\n## |$)/);
  if (!block || Number(block[1]) !== Number(expectedSession)) return 'Unverified for this session';
  return block[2].match(/^- Tests:\s*(.+)$/m)?.[1]?.trim() || 'Unverified for this session';
}
