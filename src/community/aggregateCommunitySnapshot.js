import { COMMUNITY_SNAPSHOT_SCHEMA_VERSION, COMMUNITY_SUPPRESSION_THRESHOLD, publicStat } from "./eventContract.js";

const PERIODS = Object.freeze({
  "24h": { label: "Past 24 hours", milliseconds: 24 * 60 * 60 * 1000 },
  "7d": { label: "Past 7 days", milliseconds: 7 * 24 * 60 * 60 * 1000 },
  "30d": { label: "Past 30 days", milliseconds: 30 * 24 * 60 * 60 * 1000 }
});

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, Number(map.get(key) || 0) + Number(amount || 0));
}

function top(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower));
}

function distribution(participants, key) {
  const values = [...participants.values()].map((row) => Number(row[key] || 0));
  return { p25: percentile(values, 0.25), p50: percentile(values, 0.5), p75: percentile(values, 0.75), p90: percentile(values, 0.9) };
}

function safeChoice(map, participantCount) {
  const leader = top(map);
  if (!leader || participantCount < COMMUNITY_SUPPRESSION_THRESHOLD || leader[1] < COMMUNITY_SUPPRESSION_THRESHOLD) {
    return { status: participantCount ? "suppressed" : "warming", value: null, count: 0, share: null };
  }
  const total = [...map.values()].reduce((sum, value) => sum + value, 0);
  return { status: "live", value: leader[0], count: leader[1], share: total ? Math.round((leader[1] / total) * 100) : 0 };
}

function readable(value) {
  return String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function aggregatePeriod(rows, periodKey, computedAt) {
  const spec = PERIODS[periodKey];
  const cutoff = Date.parse(computedAt) - spec.milliseconds;
  const selected = rows.filter((row) => Date.parse(row.occurred_at || row.occurredAt) >= cutoff);
  const participants = new Map();
  const choices = { teams: new Map(), eras: new Map(), archetypes: new Map(), difficulties: new Map(), modes: new Map(), tactics: new Map(), positions: new Map(), decisions: new Map(), challenges: new Map(), feats: new Map(), contractBands: new Map(), staffRoles: new Map() };
  const totals = { events: 0, franchises: 0, weeks: 0, seasons: 0, wins: 0, losses: 0, ties: 0, trades: 0, draftPicks: 0, freeAgents: 0, contracts: 0, staffMoves: 0, challenges: 0, championships: 0, playoffBerths: 0, decisions: 0, rareFeats: 0 };

  for (const row of selected) {
    const participantKey = row.participant_hash || row.participantHash;
    if (!participantKey) continue;
    if (!participants.has(participantKey)) participants.set(participantKey, { weeks: 0, franchises: 0, trades: 0, draftPicks: 0, championships: 0, decisions: 0 });
    const own = participants.get(participantKey);
    const d = typeof row.dimensions === "string" ? JSON.parse(row.dimensions) : (row.dimensions || {});
    const m = typeof row.metrics === "string" ? JSON.parse(row.metrics) : (row.metrics || {});
    totals.events += 1;
    if (row.type === "league_started") {
      totals.franchises += 1; own.franchises += 1;
      increment(choices.teams, d.team); increment(choices.eras, d.era); increment(choices.archetypes, d.archetype); increment(choices.difficulties, d.difficulty); increment(choices.modes, d.mode);
    } else if (row.type === "weeks_managed") {
      const weeks = Number(m.weeks || 0); totals.weeks += weeks; own.weeks += weeks;
      totals.seasons += Number(m.seasonsCompleted || 0); totals.wins += Number(m.wins || 0); totals.losses += Number(m.losses || 0); totals.ties += Number(m.ties || 0);
      totals.championships += Number(m.championships || 0); own.championships += Number(m.championships || 0); totals.playoffBerths += Number(m.playoffBerths || 0);
      if (d.tactic && d.tactic !== "none") increment(choices.tactics, d.tactic, weeks || 1);
      if (d.decision && d.decision !== "none") { totals.decisions += 1; own.decisions += 1; increment(choices.decisions, d.decision); }
      if (d.difficulty && d.difficulty !== "unknown") increment(choices.difficulties, d.difficulty, weeks || 1);
    } else if (row.type === "trade_completed") { totals.trades += 1; own.trades += 1; }
    else if (row.type === "draft_pick") { totals.draftPicks += 1; own.draftPicks += 1; increment(choices.positions, d.position); }
    else if (row.type === "free_agent_signed") { totals.freeAgents += 1; increment(choices.contractBands, d.contractBand); }
    else if (row.type === "contract_completed") { totals.contracts += 1; increment(choices.contractBands, d.contractBand); }
    else if (row.type === "staff_changed") { totals.staffMoves += 1; increment(choices.staffRoles, d.role); }
    else if (row.type === "challenge_completed") { totals.challenges += 1; increment(choices.challenges, d.challenge); }
    else if (row.type === "rare_feat") { totals.rareFeats += Number(m.count || 1); increment(choices.feats, d.feat, Number(m.count || 1)); }
  }

  const sampleSize = participants.size;
  const status = sampleSize === 0 ? "warming" : sampleSize < COMMUNITY_SUPPRESSION_THRESHOLD ? "suppressed" : "live";
  const visible = status === "live";
  const stat = (id, label, value, interpretation, distributionValue = null) => publicStat({
    id, label, value: visible ? value : null, period: spec.label, sampleSize, computedAt, interpretation,
    status, ...(distributionValue ? { distribution: distributionValue } : {})
  });
  const participantStat = publicStat({ id: "participating-browsers", label: "Participating browsers", value: sampleSize, period: spec.label, sampleSize, computedAt, interpretation: "Anonymous browsers that opted into Community Stats and contributed a valid receipt in this period.", status: sampleSize ? "live" : "warming" });
  const topTeam = safeChoice(choices.teams, sampleSize);
  const topEra = safeChoice(choices.eras, sampleSize);
  const topArchetype = safeChoice(choices.archetypes, sampleSize);
  const topDifficulty = safeChoice(choices.difficulties, sampleSize);
  const topMode = safeChoice(choices.modes, sampleSize);
  const topTactic = safeChoice(choices.tactics, sampleSize);
  const topPosition = safeChoice(choices.positions, sampleSize);
  const topChallenge = safeChoice(choices.challenges, sampleSize);
  const topFeat = safeChoice(choices.feats, sampleSize);
  const topContract = safeChoice(choices.contractBands, sampleSize);
  const topStaffRole = safeChoice(choices.staffRoles, sampleSize);
  const choiceStat = (id, label, choice, interpretation) => ({ id, label, value: choice.value, unit: "category", period: spec.label, sampleSize, computedAt, interpretation, status: choice.status, count: choice.status === "live" ? choice.count : null, share: choice.status === "live" ? choice.share : null });

  const stats = {
    participants: participantStat,
    franchises: stat("franchises-founded", "Franchises founded", totals.franchises, "New leagues created by participating browsers in this period.", distribution(participants, "franchises")),
    weeks: stat("weeks-managed", "Weeks managed", totals.weeks, "Receipted franchise weeks completed in this period.", distribution(participants, "weeks")),
    seasons: stat("seasons-completed", "Seasons completed", totals.seasons, "Season boundaries crossed through receipted weekly commands."),
    decisions: stat("gm-decisions", "GM decisions committed", totals.decisions, "Weekly commands that included an explicit General Manager decision.", distribution(participants, "decisions")),
    trades: stat("trades-completed", "Trades completed", totals.trades, "Successful trade transactions, counted once per receipt.", distribution(participants, "trades")),
    draftPicks: stat("draft-picks", "Draft picks made", totals.draftPicks, "User-controlled draft selections completed in this period.", distribution(participants, "draftPicks")),
    freeAgents: stat("free-agents-signed", "Free agents signed", totals.freeAgents, "Accepted free-agent transactions from participating franchises."),
    contracts: stat("contracts-completed", "Contract moves", totals.contracts, "Re-signings, negotiations, restructures, tags and fifth-year options."),
    staffMoves: stat("staff-moves", "Staff moves", totals.staffMoves, "Receipted coaching market actions."),
    wins: stat("wins", "Wins", totals.wins, "Controlled-team wins observed in completed weekly receipts."),
    championships: stat("championships", "Championships", totals.championships, "Controlled franchises that crossed a season boundary as champion."),
    playoffBerths: stat("playoff-berths", "Playoff-calibre seasons", totals.playoffBerths, "A bounded proxy based on nine or more regular-season wins at a crossed season boundary; not a causal claim."),
    challenges: stat("challenges-completed", "Challenges completed", totals.challenges, "Submitted speedrun or structured challenge completions."),
    rareFeats: stat("rare-feats", "Rare feats", totals.rareFeats, "Suppressed achievement classes such as championships and undefeated seasons."),
    topTeam: choiceStat("top-team", "Most-managed team", topTeam, "The most common controlled team among eligible league-start receipts."),
    topEra: choiceStat("top-era", "Leading era", topEra, "The most selected era profile among eligible league starts."),
    topArchetype: choiceStat("top-archetype", "Leading franchise challenge", topArchetype, "The most selected opening franchise archetype."),
    topDifficulty: choiceStat("top-difficulty", "Leading difficulty", topDifficulty, "The most common difficulty across starts and managed weeks."),
    topMode: choiceStat("top-mode", "Leading simulation mode", topMode, "The most selected simulation resolution mode."),
    topTactic: choiceStat("top-tactic", "Leading weekly identity", topTactic, "The most frequently receipted weekly tactical identity."),
    topPosition: choiceStat("top-position", "Most-drafted position", topPosition, "The position selected most often in user-controlled draft picks."),
    topChallenge: choiceStat("top-challenge", "Leading challenge", topChallenge, "The most commonly completed structured challenge."),
    topFeat: choiceStat("top-feat", "Most common rare feat", topFeat, "The leading eligible rare-feat class; small cohorts remain suppressed."),
    topContract: choiceStat("top-contract-band", "Leading contract band", topContract, "The most common annual-value band across eligible signings and contract moves."),
    topStaffRole: choiceStat("top-staff-role", "Most-changed staff role", topStaffRole, "The coaching role most often changed in eligible market receipts.")
  };

  const insights = [];
  if (sampleSize === 0) insights.push("The huddle is warming up. No participating-browser receipts have landed in this period yet.");
  else if (!visible) insights.push(`Community choices stay private until at least ${COMMUNITY_SUPPRESSION_THRESHOLD} participating browsers contribute.`);
  else {
    if (topTactic.status === "live") insights.push(`${readable(topTactic.value)} is the community's leading weekly identity at ${topTactic.share}% of receipted tactic-weeks.`);
    if (topPosition.status === "live") insights.push(`${String(topPosition.value).toUpperCase()} is the most-drafted position in the current window.`);
    if (!insights.length) insights.push(`${totals.weeks.toLocaleString("en-US")} receipted weeks are shaping the live community baseline.`);
  }

  return {
    key: periodKey,
    label: spec.label,
    status,
    sampleSize,
    headline: [stats.participants, stats.franchises, stats.weeks, stats.seasons, stats.decisions, stats.championships],
    categories: [
      { id: "scale", label: "Community Scale", stats: [stats.participants, stats.franchises, stats.weeks, stats.seasons] },
      { id: "league-lab", label: "League Lab", stats: [stats.topEra, stats.topArchetype, stats.topDifficulty, stats.topMode] },
      { id: "team-loyalty", label: "Team Loyalty", stats: [stats.topTeam] },
      { id: "strategy", label: "Strategy & Tactics", stats: [stats.topTactic, stats.decisions] },
      { id: "roster-market", label: "Roster Market", stats: [stats.trades, stats.freeAgents, stats.contracts, stats.topContract, stats.staffMoves, stats.topStaffRole] },
      { id: "draft-room", label: "Draft Room", stats: [stats.draftPicks, stats.topPosition] },
      { id: "pressure-outcomes", label: "Pressure & Outcomes", stats: [stats.wins, stats.playoffBerths, stats.championships] },
      { id: "challenges", label: "Challenges & Rare Feats", stats: [stats.challenges, stats.topChallenge, stats.rareFeats, stats.topFeat] }
    ],
    comparisons: {
      weeks: stats.weeks.distribution || null,
      franchises: stats.franchises.distribution || null,
      trades: stats.trades.distribution || null,
      draftPicks: stats.draftPicks.distribution || null,
      championships: stats.championships.distribution || null,
      decisions: stats.decisions.distribution || null
    },
    insights
  };
}

export function aggregateCommunitySnapshot(rows = [], { now = new Date().toISOString(), truncated = false } = {}) {
  const periods = Object.fromEntries(Object.keys(PERIODS).map((key) => [key, aggregatePeriod(rows, key, now)]));
  const latestReceiptAt = rows.reduce((latest, row) => {
    const value = row.received_at || row.receivedAt || row.occurred_at || row.occurredAt;
    return !latest || Date.parse(value) > Date.parse(latest) ? value : latest;
  }, null);
  return {
    schemaVersion: COMMUNITY_SNAPSHOT_SCHEMA_VERSION,
    status: truncated ? "partial" : periods["30d"].status,
    computedAt: now,
    latestReceiptAt,
    refreshAfterSeconds: 60,
    rawRetentionDays: 30,
    suppressionThreshold: COMMUNITY_SUPPRESSION_THRESHOLD,
    denominator: "participating anonymous browsers",
    provenance: "Aggregate of validated, consented, contract-derived browser receipts. It is client-reported and not a census of all players.",
    periods,
    defaultPeriod: "30d"
  };
}

export { PERIODS };
