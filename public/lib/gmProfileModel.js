/**
 * GM Profile — the view model.
 *
 * Pure: no imports, no DOM, no clock. It turns three things the client already
 * holds into the words the GM Profile page shows:
 *
 *   legacy   — the career summary from GET /api/gm-legacy
 *   gmCareer — dashboard.gmCareer (clubs managed, dismissals, current tenure)
 *   trophies — the achievement registry, what is earned, and progress on the rest
 *
 * A missing or damaged number is shown as zero seasons or left out. It is never
 * guessed.
 */

const FIRED_REASONS = new Set(["ultimatum-failed", "patience-exhausted"]);

// Only a real number (or a numeric string) counts; Number(null) is 0.
function finiteOr(value, fallback) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatRecord(wins, losses, ties) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function clubName(teams, teamId, fallback = "") {
  const team = (Array.isArray(teams) ? teams : []).find((entry) => entry && entry.id === teamId) || null;
  if (team?.city && team?.nickname) return `${team.city} ${team.nickname}`;
  return text(team?.name, text(fallback, teamId ? String(teamId) : "Unknown club"));
}

function yearSpan(startYear, endYear, { open = false } = {}) {
  const start = finiteOr(startYear, null);
  const end = finiteOr(endYear, null);
  if (start === null && end === null) return "";
  if (open) return start === null ? "" : `${start} to now`;
  if (start === null || end === null || start === end) return String(start ?? end);
  return `${start} to ${end}`;
}

function buildClubs({ gmCareer, teams, totals }) {
  if (!gmCareer || typeof gmCareer !== "object") return [];
  // dashboard.gmCareer.history arrives newest first; the page reads oldest first.
  const past = (Array.isArray(gmCareer.history) ? gmCareer.history : [])
    .filter((entry) => entry && typeof entry === "object" && entry.teamId)
    .slice()
    .reverse()
    .map((entry) => {
      const wins = finiteOr(entry.wins, 0);
      const losses = finiteOr(entry.losses, 0);
      const ties = finiteOr(entry.ties, 0);
      return {
        teamId: String(entry.teamId),
        name: clubName(teams, entry.teamId, entry.teamName),
        years: yearSpan(entry.startYear, entry.endYear),
        seasons: finiteOr(entry.seasons, 0),
        wins,
        losses,
        ties,
        record: text(entry.record, formatRecord(wins, losses, ties)),
        playoffBerths: finiteOr(entry.playoffAppearances, 0),
        titles: finiteOr(entry.titles, 0),
        current: false,
        fired: FIRED_REASONS.has(entry.reason),
        howItEnded: text(entry.reasonLabel, "Left the club")
      };
    });
  const tenure = gmCareer.tenure;
  if (gmCareer.dismissed === true || gmCareer.status === "dismissed" || !tenure?.teamId) return past;

  // The current club's record is the career total less every closed tenure.
  // The server sends at most the last ten tenures, so with ten on the page the
  // subtraction could be missing one and the record is left out instead.
  let record = null;
  if (totals && past.length < 10) {
    const wins = totals.wins - past.reduce((sum, club) => sum + club.wins, 0);
    const losses = totals.losses - past.reduce((sum, club) => sum + club.losses, 0);
    const ties = totals.ties - past.reduce((sum, club) => sum + club.ties, 0);
    if (wins >= 0 && losses >= 0 && ties >= 0) record = formatRecord(wins, losses, ties);
  }
  return [
    ...past,
    {
      teamId: String(tenure.teamId),
      name: clubName(teams, tenure.teamId),
      years: yearSpan(tenure.startYear, null, { open: true }),
      seasons: finiteOr(tenure.seasons, 0),
      record,
      playoffBerths: null,
      titles: null,
      current: true,
      fired: false,
      howItEnded: ""
    }
  ];
}

function buildTier(persona) {
  if (!persona?.current) return { tier: null, nextTier: null };
  const tier = {
    number: finiteOr(persona.current.tier, 1),
    name: text(persona.current.name, "General Manager"),
    description: text(persona.current.description)
  };
  if (!persona.next) return { tier, nextTier: null };
  const paths = (Array.isArray(persona.next.advancementPaths) ? persona.next.advancementPaths : [])
    .filter((path) => path && typeof path === "object" && Number.isFinite(Number(path.target)))
    .map((path) => {
      const current = finiteOr(path.current, 0);
      const target = Number(path.target);
      const done = path.satisfied === true || current >= target;
      const label = text(path.label, "Goal");
      return {
        label,
        current,
        target,
        remaining: Math.max(0, target - current),
        done,
        text: done ? `${label}: ${target} reached` : `${label}: ${current} of ${target}`
      };
    });
  return {
    tier,
    nextTier: {
      number: finiteOr(persona.next.tier, tier.number + 1),
      name: text(persona.next.name, "Next tier"),
      rule: paths.length > 1 ? "Reach any one of these to move up." : "Reach this to move up.",
      paths
    }
  };
}

function buildTrophies({ achievements, earned, locked }) {
  const registry = Array.isArray(achievements) ? achievements.filter((entry) => entry && entry.id) : [];
  const earnedRecords = earned && typeof earned === "object" ? earned : {};
  const progressById = new Map((Array.isArray(locked) ? locked : []).filter(Boolean).map((row) => [row.id, row]));
  const rows = registry.map((achievement) => {
    const record = earnedRecords[achievement.id] || null;
    const objective = progressById.get(achievement.id) || null;
    const measurable = !record && objective?.kind === "measurable" && Number(objective.target) > 0;
    const current = measurable ? Math.max(0, finiteOr(objective.current, 0)) : null;
    const target = measurable ? Number(objective.target) : null;
    return {
      id: achievement.id,
      name: text(achievement.name, achievement.id),
      icon: text(achievement.icon),
      desc: text(achievement.desc),
      tier: text(achievement.tier, "bronze"),
      earned: Boolean(record),
      earnedAt: record?.earnedAt || null,
      franchise: text(record?.franchise),
      progress: measurable
        ? {
            current,
            target,
            pct: Math.min(100, Math.round((current / target) * 100)),
            text: `${Math.min(current, target)} of ${target} ${text(objective.unit)}`.trim()
          }
        : null
    };
  });
  return { earnedCount: rows.filter((row) => row.earned).length, total: rows.length, rows };
}

export function buildGmProfile({
  legacy = null,
  gmCareer = null,
  teams = [],
  achievements = [],
  earned = {},
  locked = []
} = {}) {
  const standing = gmCareer?.standing || null;
  const seasons = finiteOr(legacy?.seasons, finiteOr(standing?.seasons, 0));
  const hasTotals = [legacy?.wins, legacy?.losses].every((value) => finiteOr(value, null) !== null);
  const totals = hasTotals
    ? { wins: finiteOr(legacy.wins, 0), losses: finiteOr(legacy.losses, 0), ties: finiteOr(legacy.ties, 0) }
    : null;
  const clubs = buildClubs({ gmCareer, teams, totals });
  const dismissed = gmCareer?.dismissed === true || gmCareer?.status === "dismissed";
  const { tier, nextTier } = buildTier(legacy?.persona);
  const currentClub = clubs.find((club) => club.current) || null;
  return {
    career: {
      seasons,
      record: totals ? formatRecord(totals.wins, totals.losses, totals.ties) : text(legacy?.record, text(standing?.record, "0-0")),
      playoffBerths: finiteOr(legacy?.playoffs, 0),
      titles: finiteOr(legacy?.superBowls, 0),
      score: seasons > 0 ? finiteOr(legacy?.score, finiteOr(standing?.score, null)) : null,
      grade: seasons > 0 ? text(legacy?.grade, text(standing?.grade)) : "",
      clubs,
      clubCount: new Set(clubs.map((club) => club.teamId)).size,
      dismissals: clubs.filter((club) => club.fired).length,
      status: dismissed ? "between-clubs" : "employed",
      statusText: dismissed
        ? "You are between clubs. Take a job to carry this record on."
        : currentClub
          ? `General manager of the ${currentClub.name}.`
          : "",
      tier,
      nextTier
    },
    trophies: buildTrophies({ achievements, earned, locked })
  };
}
