import { clamp } from "../utils/rng.js";

const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;

// Record occurrence even if the injury has healed before the offseason. This
// small season accumulator avoids keeping unbounded medical history in saves.
export function recordDevelopmentInjury(player, injury) {
  const health = player.developmentHealth ||= { injuries: 0, majorInjuries: 0, missedWeeks: 0 };
  health.injuries = finite(health.injuries) + 1;
  if (injury?.severity === "major" || finite(injury?.weeksRemaining) >= 7) health.majorInjuries = finite(health.majorInjuries) + 1;
}

// Quality is opportunity-normalized. A player with little playing time has no
// grade; benching, a bye or an injury must not become poor performance.
export function seasonalDevelopmentQuality(player, year) {
  const s = player?.seasonStats?.[year];
  if (!s) return null;
  const p = s.passing || {}, r = s.rushing || {}, c = s.receiving || {};
  const d = s.defense || {}, b = s.blocking || {}, k = s.kicking || {}, u = s.punting || {};
  const snaps = s.snaps || {};
  switch (player.position) {
    case "QB": return finite(p.att) >= 150 ? (finite(p.yards) + 20 * finite(p.td) - 45 * finite(p.int)) / p.att : null;
    case "RB": return finite(r.att) >= 80 ? (finite(r.yards) + 10 * finite(r.td) - 20 * finite(r.fumbles)) / r.att : null;
    case "WR": case "TE": return finite(c.targets) >= 50 ? (finite(c.yards) + 10 * finite(c.td) - 5 * finite(c.drops)) / c.targets : null;
    case "OL": return finite(snaps.passBlock) >= 250 ? -(finite(b.pressuresAllowed) + 3 * finite(b.sacksAllowed) + finite(b.penalties)) / snaps.passBlock : null;
    case "DL": case "LB": case "DB": return finite(snaps.defense) >= 350
      ? (finite(d.tackles) + 6 * finite(d.sacks) + 3 * finite(d.tfl) + 8 * finite(d.int) + 2 * finite(d.passDefended)) / snaps.defense : null;
    case "K": return finite(k.fga) >= 20 ? finite(k.fgm) / k.fga : null;
    case "P": return finite(u.punts) >= 30 ? (finite(u.yards) + 8 * finite(u.in20) - 8 * finite(u.touchbacks) - 20 * finite(u.blocks)) / u.punts : null;
    default: return null;
  }
}

export function measureDevelopmentPerformance(league, year) {
  const rooms = new Map();
  for (const player of league?.players || []) {
    if (player.status === "retired") continue;
    const quality = seasonalDevelopmentQuality(player, year);
    if (quality === null || !Number.isFinite(quality)) continue;
    const room = rooms.get(player.position) || [];
    room.push({ id: player.id, quality });
    rooms.set(player.position, room);
  }
  const result = new Map();
  for (const room of rooms.values()) {
    if (room.length < 12) continue;
    const sorted = room.map(row => row.quality).sort((a, b) => a - b);
    const low = sorted[Math.floor((sorted.length - 1) * 0.15)];
    const high = sorted[Math.floor((sorted.length - 1) * 0.90)];
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const row of room) {
      // Ties at a boundary receive no arbitrary ID-ordered grade. A minimum
      // margin suppresses revisions when the whole position played alike.
      const margin = Math.max(Math.abs(median) * 0.05, 0.005);
      result.set(row.id, row.quality < low && row.quality < median - margin ? "poor"
        : row.quality > high && row.quality > median + margin ? "breakout" : "steady");
    }
  }
  return result;
}

export function revisePlayerPotential(player, { year, performance = null } = {}) {
  if (player.potential == null || !Number.isFinite(Number(player.potential))) return null;
  // The offseason pipeline and headless facade share this authority. Retrying
  // an already-applied stage must not debit the same season twice.
  if (year != null && player.lastPotentialRevision?.year === year) return player.lastPotentialRevision;
  const before = Number(player.potential);
  const health = player.developmentHealth || {};
  const reasons = [];
  let change = 0;
  const injuryLoss = Math.min(4, finite(health.majorInjuries) * 2
    + (finite(health.missedWeeks) >= 8 ? 1 : 0) + (finite(health.injuries) >= 3 ? 1 : 0));
  if (injuryLoss) {
    const applied = Math.max(0, Math.min(injuryLoss, before + change - 40));
    change -= applied;
    reasons.push(applied ? `Injury setbacks reduced the projected ceiling by ${applied}.`
      : "Injury setbacks recorded; the projected ceiling is already at the minimum of 40.");
  }
  if (performance === "poor") {
    player.poorDevelopmentSeasons = finite(player.poorDevelopmentSeasons) + 1;
    const loss = player.poorDevelopmentSeasons >= 2 ? 2 : 1;
    const applied = Math.max(0, Math.min(loss, before + change - 40));
    change -= applied;
    reasons.push(applied ? `Below-peer production over a meaningful workload reduced the projected ceiling by ${applied}.`
      : "Below-peer production recorded; the projected ceiling is already at the minimum of 40.");
  } else if (performance !== null) {
    player.poorDevelopmentSeasons = 0;
    if (performance === "breakout" && finite(player.age) <= 28 && !injuryLoss) {
      const applied = Math.max(0, Math.min(1, 99 - before - change));
      change += applied;
      reasons.push(applied ? `A standout season raised the projected ceiling by ${applied}.`
        : "A standout season confirmed the projected ceiling at the maximum of 99.");
    }
  }
  player.potential = clamp(before + change, 40, 99);
  const revision = { year: year ?? null, before, after: player.potential, change: player.potential - before, reasons, performance };
  player.lastPotentialRevision = revision;
  delete player.developmentHealth;
  return revision;
}
