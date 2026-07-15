const POSITION_IDENTITY = {
  QB: { noun: "field general", craft: "processing leverage, protecting the football, and creating answers after the snap" },
  RB: { noun: "backfield catalyst", craft: "reading blocks, surviving contact, and turning space into chain-moving yards" },
  WR: { noun: "coverage stressor", craft: "creating separation, finishing catches, and changing the geometry of a defense" },
  TE: { noun: "formation multiplier", craft: "winning through the seam while carrying real blocking responsibility" },
  OL: { noun: "pocket architect", craft: "keeping the launch point clean and creating dependable movement in the run game" },
  DL: { noun: "front-line disruptor", craft: "compressing the pocket, denting run fits, and forcing offenses off schedule" },
  LB: { noun: "second-level eraser", craft: "diagnosing concepts, fitting the run, and closing space in coverage" },
  DB: { noun: "coverage closer", craft: "denying windows, contesting the catch point, and limiting explosive plays" },
  K: { noun: "pressure specialist", craft: "turning narrow scoring windows into points when the game tightens" },
  P: { noun: "field-position specialist", craft: "flipping the field, controlling return space, and pinning offenses deep" }
};

const PRIMARY_CATEGORY = {
  QB: "passing",
  RB: "rushing",
  WR: "receiving",
  TE: "receiving",
  OL: "blocking",
  DL: "defense",
  LB: "defense",
  DB: "defense",
  K: "kicking",
  P: "punting"
};

function hashText(value = "") {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function titleCase(value = "") {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function careerLine(position, row = {}) {
  if (position === "QB") return `${row.yds || 0} pass yards · ${row.td || 0} TD · ${row.rate || 0} rating`;
  if (position === "RB") return `${row.yds || 0} rush yards · ${row.td || 0} TD · ${row.ypa || 0} per carry`;
  if (position === "WR" || position === "TE") return `${row.rec || 0} catches · ${row.yds || 0} yards · ${row.td || 0} TD`;
  if (position === "OL") return `${row.gs || 0} starts · ${row.passBlkSn || 0} pass-block snaps · ${row.pressuresAllowed || 0} pressures allowed`;
  if (["DL", "LB", "DB"].includes(position)) return `${row.tkl || 0} tackles · ${row.sacks || 0} sacks · ${row.int || 0} interceptions`;
  if (position === "K") return `${row.fgm || 0}/${row.fga || 0} field goals · long ${row.lng || 0}`;
  return `${row.punts || 0} punts · ${row.ypp || 0} average · ${row.in20 || 0} inside the 20`;
}

function milestoneAchievements(position, row = {}) {
  const achievements = [];
  if ((row.gs || 0) >= 16) achievements.push(`${row.gs} recorded career starts`);
  if (position === "QB" && (row.yds || 0) >= 4000) achievements.push(`${row.yds.toLocaleString()} career passing yards`);
  if (position === "RB" && (row.yds || 0) >= 1000) achievements.push(`${row.yds.toLocaleString()} career rushing yards`);
  if (["WR", "TE"].includes(position) && (row.yds || 0) >= 1000) achievements.push(`${row.yds.toLocaleString()} career receiving yards`);
  if (["DL", "LB", "DB"].includes(position) && (row.tkl || 0) >= 100) achievements.push(`${row.tkl.toLocaleString()} career tackles`);
  if (position === "K" && (row.fgm || 0) >= 50) achievements.push(`${row.fgm} career field goals made`);
  if (position === "P" && (row.in20 || 0) >= 40) achievements.push(`${row.in20} career punts downed inside the 20`);
  return achievements;
}

function nextThreshold(current, thresholds) {
  return thresholds.find((target) => current < target) || thresholds.at(-1);
}

function milestoneProgress(label, current, thresholds) {
  const target = nextThreshold(current, thresholds);
  return {
    label,
    current,
    target,
    complete: current >= target,
    progress: Math.min(100, Math.round((current / Math.max(1, target)) * 100))
  };
}

function careerMilestones(position, row = {}) {
  const starts = milestoneProgress("Career starts", Number(row.gs || 0), [16, 50, 100, 150, 200]);
  const primary =
    position === "QB"
      ? milestoneProgress("Passing yards", Number(row.yds || 0), [4000, 10000, 25000, 40000, 60000])
      : position === "RB"
        ? milestoneProgress("Rushing yards", Number(row.yds || 0), [1000, 5000, 10000, 15000])
        : ["WR", "TE"].includes(position)
          ? milestoneProgress("Receiving yards", Number(row.yds || 0), [1000, 5000, 10000, 15000])
          : ["DL", "LB", "DB"].includes(position)
            ? milestoneProgress("Career tackles", Number(row.tkl || 0), [100, 500, 1000, 1500])
            : position === "K"
              ? milestoneProgress("Field goals made", Number(row.fgm || 0), [50, 150, 300, 500])
              : position === "P"
                ? milestoneProgress("Punts inside the 20", Number(row.in20 || 0), [40, 100, 250, 400])
                : starts;
  return primary.label === starts.label ? [primary] : [primary, starts];
}

export function buildPlayerProfileNarrative(profile = {}) {
  const player = profile.player || {};
  const position = player.position || "ATH";
  const identity = POSITION_IDENTITY[position] || { noun: "roster competitor", craft: "turning preparation into dependable snaps" };
  const category = PRIMARY_CATEGORY[position] || "snaps";
  const career = profile.career?.[category] || {};
  const ratings = Object.entries(player.ratings || {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]));
  const signature = ratings.slice(0, 3).map(([name, value]) => ({ name: titleCase(name), value: Number(value) }));
  const best = signature[0] || { name: "Competitive Readiness", value: player.overall || 0 };
  const overall = Number(player.overall || 0);
  const potential = Number(player.potential ?? overall);
  const ceilingGap = potential - overall;
  const age = Number(player.age || 0);
  const phase = age <= 23 ? "early-career" : age <= 27 ? "prime-window" : age <= 31 ? "veteran-prime" : "legacy-stage";
  const seasonCount = (profile.timeline || []).length;
  const championships = (profile.timeline || []).filter((entry) => entry.champion).length;
  const awards = (profile.awardsHistory || []).map((entry) => `${entry.year} ${entry.award}`);
  const templates = [
    `${player.name || "This player"} is a ${phase} ${identity.noun} whose game is built around ${identity.craft}.`,
    `A ${phase} ${identity.noun}, ${player.name || "this player"} earns a role through ${identity.craft}.`,
    `${player.name || "This player"} profiles as a ${identity.noun} in the ${phase} of a career, with value rooted in ${identity.craft}.`
  ];
  const opening = templates[hashText(player.id || player.name) % templates.length];
  const trajectory = ceilingGap >= 8
    ? `The ${overall} OVR / ${potential} POT gap leaves a meaningful development runway.`
    : ceilingGap >= 3
      ? `At ${overall} OVR with ${potential} POT, refinement matters more than reinvention.`
      : `The ${overall} OVR / ${potential} POT profile is near its modeled ceiling, making role fit and consistency decisive.`;
  const availability = player.injury?.type
    ? `Availability watch: ${player.injury.type}${player.injury.weeksRemaining ? `, ${player.injury.weeksRemaining} week(s) remaining` : ""}.`
    : "Currently healthy and available for the active rotation.";

  const facts = [
    `Age ${age || "—"} · ${player.experience || 0} years of experience · ${seasonCount} recorded season${seasonCount === 1 ? "" : "s"}`,
    `Signature trait: ${best.name} ${best.value}`,
    `Career production: ${careerLine(position, career)}`,
    `Development: ${player.developmentTrait || "Steady"} · ${overall} OVR · ${potential} POT · ${ceilingGap >= 0 ? "+" : ""}${ceilingGap} runway`,
    availability
  ];
  const achievements = [
    ...awards,
    ...(championships ? [`${championships} championship season${championships === 1 ? "" : "s"}`] : []),
    ...milestoneAchievements(position, career)
  ];
  if (!achievements.length) {
    achievements.push(seasonCount ? `${seasonCount} season${seasonCount === 1 ? "" : "s"} of recorded league service` : "Career ledger opened; first milestone still ahead");
  }
  const milestones = careerMilestones(position, career);

  return {
    archetype: identity.noun,
    phase,
    headline: `${titleCase(phase)} ${titleCase(identity.noun)}`,
    bio: `${opening} ${trajectory} ${availability}`,
    signature,
    facts,
    achievements,
    milestones
  };
}
