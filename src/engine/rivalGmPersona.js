// Deliberately NOT the shared derivedRng: its FNV-mod-N draws disperse poorly
// for near-identical keys (MIA vs NYJ collided on every pick in verification),
// and changing the shared util would silently re-roll existing leagues' staff.
// xmur3-style finalizer gives full avalanche while staying deterministic.
function hash32(input) {
  let h = 1779033703 ^ input.length;
  for (let index = 0; index < input.length; index += 1) {
    h = Math.imul(h ^ input.charCodeAt(index), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function pickFrom(list, key) {
  return list[hash32(key) % list.length];
}

/**
 * Rival GM Personas with Persistent Memory (S70)
 *
 * Every rival club gets a named general manager with stable traits, derived
 * deterministically from the league seed + team id (derivedRng — never the
 * session RNG stream, so replays and normalizers stay in sync). A bounded
 * per-team memory ledger records only real receipted interactions with the
 * player's franchise (trades, rejected/accepted inbound offers, free-agency
 * outbids). Flavor text is descriptive and non-causal: personas never grant
 * or remove a single point of on-field value.
 */

const FIRST_NAMES = [
  "Marcus", "Dana", "Elliot", "Rhonda", "Terrence", "Sofia", "Grant", "Priya",
  "Walt", "Camille", "Dre", "Harlan", "Nadia", "Vince", "Iris", "Roman",
  "Tobias", "Lena", "Cyrus", "Maeve", "Dalton", "Ingrid", "Omar", "Sylvia",
  "Reggie", "Blair", "Hollis", "Tessa", "Warren", "Yolanda", "Felix", "Greta"
];

const LAST_NAMES = [
  "Calloway", "Brooks", "Vanterpool", "Ostrander", "Whitfield", "Delgado",
  "Marsh", "Kowalski", "Tanaka", "Renfro", "Abernathy", "Silva", "Crowder",
  "Lindqvist", "Okafor", "Beauchamp", "Hargrove", "Stackhouse", "Mercer",
  "Villanueva", "Pruitt", "Ashford", "Navarro", "Kessler", "Duval", "Ricci",
  "Templeton", "Ferris", "Braddock", "Yates", "Holloway", "Quint"
];

const TRAIT_POOL = [
  "never forgets a lopsided deal",
  "works the phones on draft night",
  "overpays for proven playoff tape",
  "hunts contract-year bargains",
  "won't move future firsts",
  "loves positional versatility",
  "drafts for scheme fit over athleticism",
  "bids late and hard in free agency",
  "leaks negotiations to the press",
  "treats the deadline like a holiday",
  "guards the cap like a vault",
  "collects former teammates"
];

const MEMORY_LIMIT = 8;

/**
 * Deterministic persona for a rival club. Same league seed + team → same GM,
 * forever, across saves and replays.
 */
export function getRivalGmPersona(league, teamId) {
  const seedKey = `rival-gm|${league?.seed ?? league?.id ?? "league"}|${teamId}`;
  const first = pickFrom(FIRST_NAMES, `${seedKey}|first`);
  const last = pickFrom(LAST_NAMES, `${seedKey}|last`);
  const traitA = pickFrom(TRAIT_POOL, `${seedKey}|traitA`);
  let traitB = pickFrom(TRAIT_POOL, `${seedKey}|traitB`);
  if (traitB === traitA) traitB = TRAIT_POOL[(TRAIT_POOL.indexOf(traitA) + 5) % TRAIT_POOL.length];
  const team = (league?.teams || []).find((row) => row.id === teamId);
  return {
    teamId,
    name: `${first} ${last}`,
    traits: [traitA, traitB],
    style: team?.strategyProfile || "balanced"
  };
}

function ensureMemoryRoot(league) {
  if (!league.rivalGmMemory || typeof league.rivalGmMemory !== "object") {
    league.rivalGmMemory = {};
  }
  return league.rivalGmMemory;
}

/**
 * Append one receipted interaction to a rival GM's bounded memory ledger.
 * entry: { type, year, week, summary } — summary must describe a real event.
 */
export function recordRivalGmMemory(league, teamId, entry) {
  if (!league || !teamId || !entry?.type || !entry?.summary) return null;
  const root = ensureMemoryRoot(league);
  const rows = Array.isArray(root[teamId]) ? root[teamId] : [];
  const record = {
    type: String(entry.type),
    year: Number(entry.year) || null,
    week: Number(entry.week) || null,
    summary: String(entry.summary).slice(0, 200)
  };
  rows.push(record);
  root[teamId] = rows.slice(-MEMORY_LIMIT);
  return record;
}

export function getRivalGmMemory(league, teamId) {
  const rows = league?.rivalGmMemory?.[teamId];
  return Array.isArray(rows) ? rows : [];
}

const MEMORY_VOICE = {
  "trade-with-you": (m) => `still thinks about the ${m.year} trade with your front office`,
  "accepted-your-offer": (m) => `signed off on your ${m.year} proposal and would deal again`,
  "declined-inbound": (m) => `remembers you passing on their ${m.year} offer`,
  "accepted-inbound": (m) => `got their ${m.year} offer accepted and counts it as a win`,
  "outbid-you": (m) => `beat you to a free agent in ${m.year} and enjoys retelling it`
};

/**
 * One deterministic descriptive line referencing the latest real memory, or
 * a trait line when no shared history exists. Never a stat claim.
 */
export function personaGrudgeLine(persona, memory) {
  const latest = memory.length ? memory[memory.length - 1] : null;
  if (latest && MEMORY_VOICE[latest.type]) {
    return `${persona.name} ${MEMORY_VOICE[latest.type](latest)}.`;
  }
  return `${persona.name} ${persona.traits[0]}.`;
}

/**
 * Intel block for the pre-game rival card: persona identity plus the shared
 * history that actually happened.
 */
export function buildPersonaIntel(league, teamId) {
  const persona = getRivalGmPersona(league, teamId);
  const memory = getRivalGmMemory(league, teamId);
  return {
    persona,
    memory,
    line: personaGrudgeLine(persona, memory)
  };
}
