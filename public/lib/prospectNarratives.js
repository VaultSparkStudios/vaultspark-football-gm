const ORIGINS = [
  "Former option quarterback who converted late and still sees leverage before the ball is snapped.",
  "Small-school captain with a private workout that forced three area scouts back into the building.",
  "Two-sport recruit with rare spatial feel and questions about weekly football-only polish.",
  "Walk-on starter who kept earning snaps through special teams, film work, and clean assignments.",
  "Bloodline prospect raised around pro meeting rooms, but still fighting the weight of the name.",
  "Late bloomer from a run-heavy program whose best reps came when the game sped up.",
  "Transfer portal riser with one loud season and a thin but intriguing evidence trail.",
  "Senior Bowl climber whose interviews matched the tape better than the public board expected."
];

const PROVING_GROUNDS = [
  "rebuilt a losing room into a bowl-week problem",
  "carried a thin depth chart through three injury weeks",
  "won over a new staff after being buried in spring practice",
  "became the player opponents had to identify before every snap",
  "played his best football after the coordinator changed the system",
  "kept production stable while the supporting cast turned over"
];

const PRESSURE_TRAITS = {
  QB: ["two-minute answers", "protection ownership", "audible confidence"],
  RB: ["dirty-yard patience", "third-down trust", "contact finish"],
  WR: ["separator craft", "sideline composure", "coverage answers"],
  TE: ["formation fluency", "red-zone timing", "run-pass disguise"],
  OL: ["silent-count calm", "anchor recovery", "line-call discipline"],
  DL: ["late-down rush plan", "double-team stamina", "gap violence"],
  LB: ["green-dot command", "screen diagnosis", "run-fit urgency"],
  DB: ["route memory", "panic-free recovery", "catch-point timing"],
  K: ["bad-weather nerve", "operation rhythm", "fourth-quarter pulse"],
  P: ["field-flip touch", "plus-territory restraint", "rush calm"]
};

const FLAGS = {
  QB: ["processor", "platform reset", "late-down courage"],
  RB: ["contact balance", "protection trust", "explosive crease"],
  WR: ["route detail", "catch-point nerve", "slot/outside versatility"],
  TE: ["formation stress", "inline growth", "red-zone pacing"],
  OL: ["anchor", "hand recovery", "combo timing"],
  DL: ["first-step violence", "gap discipline", "motor"],
  LB: ["diagnosis", "coverage spacing", "green-dot potential"],
  DB: ["mirror skill", "ball tracking", "tackling edge"],
  K: ["operation calm", "weather leg", "late-game pulse"],
  P: ["hang control", "coffin-corner feel", "field-flip leg"]
};

export function narrativeSeed(value = "") {
  return String(value).split("").reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0);
}

export function getProspectNarrative(prospect = {}) {
  const id = prospect.playerId || prospect.id || prospect.name || prospect.player || "prospect";
  const seed = Math.abs(narrativeSeed(id));
  const pos = String(prospect.pos || prospect.position || "").toUpperCase();
  const flags = FLAGS[pos] || ["football character", "development runway", "competitive makeup"];
  const traits = PRESSURE_TRAITS[pos] || ["practice urgency", "role clarity", "competitive resilience"];
  const origin = ORIGINS[seed % ORIGINS.length];
  const flag = flags[seed % flags.length];
  const provingGround = PROVING_GROUNDS[Math.floor(seed / 3) % PROVING_GROUNDS.length];
  const pressureTrait = traits[Math.floor(seed / 7) % traits.length];
  const risk = (prospect.confidence || prospect.scoutingConfidence || 0) >= 75
    ? "The room has enough information to act with conviction."
    : (prospect.confidence || prospect.scoutingConfidence || 0) >= 45
      ? "The grade is usable, but the staff still wants one more confirming report."
      : "The upside is visible, but the grade is still a projection.";
  const backstory = `${origin} He ${provingGround}; the staff's pressure read is ${pressureTrait}.`;
  return {
    origin,
    flag,
    provingGround,
    pressureTrait,
    backstory,
    risk,
    line: `${backstory} Staff flag: ${flag}. ${risk}`
  };
}

export function getScoutingRevealTier(prospect = {}) {
  const confidence = Number(prospect.confidence ?? prospect.scoutingConfidence ?? 0);
  if (confidence >= 82) return { label: "Full reveal", className: "scout-reveal-elite", range: "±1 OVR" };
  if (confidence >= 64) return { label: "Strong read", className: "scout-reveal-strong", range: "±3 OVR" };
  if (confidence >= 38) return { label: "Partial read", className: "scout-reveal-partial", range: "±6 OVR" };
  return { label: "Blind spot", className: "scout-reveal-blind", range: "??" };
}
