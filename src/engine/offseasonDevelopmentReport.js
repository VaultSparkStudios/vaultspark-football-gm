/**
 * S108 — the offseason development report.
 *
 * `progressPlayer` has computed every player's annual overall move since the
 * engine existed, and until S108 the number was overwritten into his ratings
 * and forgotten. The GM was told "12 retired, 40 contracts expired" and nothing
 * about who grew into the potential the profile promised him. S107 made
 * potential a real per-player runway; this is where the runway is seen paying
 * out, or not.
 *
 * Pure: it reads the ledger `applyAgingProgressionAndRetirements` returns and
 * produces a small, save-safe summary. Only the controlled club's top movers
 * are kept by name — the whole league's ledger is ~1,600 rows a season and the
 * save payload is budgeted (S65).
 */

const MOVERS_KEPT = 5;

const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round = (value, digits = 2) => Number(finite(value).toFixed(digits));

function mover(row) {
  return {
    playerId: row.playerId,
    name: row.name,
    position: row.position,
    age: row.age,
    before: row.before,
    after: row.after,
    change: row.change,
    potential: row.potential ?? null,
    trait: row.trait ?? null,
    retired: Boolean(row.retired)
  };
}

function summarize(rows) {
  const changes = rows.map((row) => finite(row.change));
  const improved = changes.filter((change) => change > 0).length;
  const declined = changes.filter((change) => change < 0).length;
  return {
    progressed: rows.length,
    improved,
    declined,
    held: rows.length - improved - declined,
    netOverall: changes.reduce((sum, change) => sum + change, 0),
    meanChange: rows.length ? round(changes.reduce((sum, change) => sum + change, 0) / rows.length, 3) : 0
  };
}

const signed = (value) => `${value > 0 ? "+" : ""}${value}`;

/**
 * Build the report for one club from the league-wide ledger.
 *
 * `risers` are the club's largest positive moves, `fallers` its largest
 * declines (still-active players only in both — a retiree's decline is the
 * retirement, and that is reported by the retirements count already).
 */
export function buildOffseasonDevelopmentReport({ progressed = [], teamId = null, year = null } = {}) {
  const rows = Array.isArray(progressed) ? progressed : [];
  const club = teamId ? rows.filter((row) => row.teamId === teamId) : [];
  const active = club.filter((row) => !row.retired);
  const byChangeDesc = (a, b) => b.change - a.change || a.after - b.after || String(a.name).localeCompare(String(b.name));
  const byChangeAsc = (a, b) => a.change - b.change || b.after - a.after || String(a.name).localeCompare(String(b.name));
  const risers = active.filter((row) => row.change > 0).sort(byChangeDesc).slice(0, MOVERS_KEPT).map(mover);
  const fallers = active.filter((row) => row.change < 0).sort(byChangeAsc).slice(0, MOVERS_KEPT).map(mover);
  const clubSummary = summarize(active);
  const leagueSummary = summarize(rows.filter((row) => !row.retired));

  const parts = [];
  if (risers[0]) parts.push(`Biggest riser: ${risers[0].name} (${risers[0].position}) ${signed(risers[0].change)} to ${risers[0].after}`);
  if (fallers[0]) parts.push(`Steepest decline: ${fallers[0].name} (${fallers[0].position}) ${signed(fallers[0].change)} to ${fallers[0].after}`);
  const summaryLine = active.length
    ? `${clubSummary.improved} of ${clubSummary.progressed} improved, ${clubSummary.declined} declined (net ${signed(clubSummary.netOverall)} OVR).${parts.length ? ` ${parts.join(". ")}.` : ""}`
    : "";

  return {
    year,
    teamId,
    club: clubSummary,
    league: leagueSummary,
    risers,
    fallers,
    summaryLine,
    headline: active.length
      ? risers[0]
        ? `Offseason development: ${risers[0].name} ${signed(risers[0].change)} to ${risers[0].after} leads ${clubSummary.improved} improved`
        : `Offseason development: ${clubSummary.declined} of ${clubSummary.progressed} declined, nobody improved`
      : "Offseason development: no progressed players on the club"
  };
}
