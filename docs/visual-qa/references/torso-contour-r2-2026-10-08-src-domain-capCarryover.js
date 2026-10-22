// The forecast and the annual boundary share the same election policy.
// Future transactions can change room; this calculation does not elect funds.
export function projectCapCarryover(league, capSpace) {
  const modern = league.capModel?.version === 'nfl-modern-cap-v1';
  const unused = Math.max(0, capSpace);
  return {
    amount: modern ? Math.round(unused) : Math.min(35_000_000, Math.round(unused * 0.48)),
    policy: modern ? 'full-unused-room-election-v1' : 'legacy-fractional-carryover-v1'
  };
}
