/**
 * franchiseAuthority.js — the command layer learns which team you may act for (S63).
 *
 * Before this seam, no mutating command in the game checked that the acting team
 * was the team you control. `grep -n controlledTeamId src/runtime/GameSession.js`
 * returned forty hits and not one of them was an authorization check — every hit
 * was a default-parameter convenience (`teamId = this.controlledTeamId`), which is
 * exactly the trap: the parameter looks like a guard and is in fact an invitation.
 *
 * The practical consequence was that a client could `POST /api/staff` with a
 * rival's `teamId` and drop their coordinators to the 40 floor, `POST /api/owner`
 * to starve their staff budget and spike their ticket price until fan interest and
 * revenue collapsed, release their stars, garbage their depth chart, and demote
 * their starters to the practice squad. Those fields are live simulation inputs
 * (GameSession `staffBudget` bonus, staff quality, per-game revenue, fan interest),
 * so the competitive premise of the entire single-player game was unenforced.
 *
 * Multiplayer was worse: `multiplayerSession.queueIntent` stamps the authoritative
 * `controlledTeamId` onto every queued intent, and `applyIntents` then passed
 * `intent.payload` straight through without using it. The correct team was known,
 * recorded, and discarded one function later.
 *
 * ── Why the guard lives here and not in GameSession ──────────────────────────
 *
 * `releasePlayer`, `setDepthChart` and their peers are also called internally by
 * CPU AI maintenance for all thirty-one rival teams. A guard inside GameSession
 * would break the AI. The authority therefore belongs at the *command boundary*,
 * which both adapters share — the same shape S61 used for the Architect Thesis
 * handler and S62 used for dashboard payload parity, so parity is structural
 * rather than maintained by hand.
 *
 * Every POST route in both adapters is classified below: either team-scoped (and
 * guarded) or explicitly exempt with a recorded reason. `test/franchise-authority.test.js`
 * asserts the classification is total — a new route added later fails the suite
 * until someone classifies it, so this authority cannot silently lose coverage.
 */

/** Commands that act on behalf of one franchise, and the body field naming it. */
export const TEAM_SCOPED_COMMANDS = {
  "/api/staff": { field: "teamId", action: "change coaching staff" },
  "/api/owner": { field: "teamId", action: "change owner-facing franchise settings" },
  "/api/depth-chart": { field: "teamId", action: "set the depth chart" },
  "/api/sign": { field: "teamId", action: "sign a free agent" },
  "/api/release": { field: "teamId", action: "release a player" },
  "/api/practice-squad": { field: "teamId", action: "move a player to or from the practice squad" },
  "/api/waiver-claim": { field: "teamId", action: "claim a player off waivers" },
  "/api/roster/designation": { field: "teamId", action: "change a roster designation" },
  "/api/free-agency/offer": { field: "teamId", action: "make a free-agency offer" },
  "/api/retirement/override": { field: "teamId", action: "override a retirement" },
  "/api/injuries/rehab-plan": { field: "teamId", action: "set a rehab plan" },
  "/api/mentorship": { field: "teamId", action: "change mentorship covenants" },
  "/api/history/retire-jersey": { field: "teamId", action: "retire a jersey number" },
  "/api/scouting/allocate": { field: "teamId", action: "allocate scouting points" },
  "/api/scouting/lock-board": { field: "teamId", action: "lock the draft board" },
  "/api/contracts/resign": { field: "teamId", action: "re-sign a player" },
  "/api/contracts/restructure": { field: "teamId", action: "restructure a contract" },
  "/api/contracts/franchise-tag": { field: "teamId", action: "apply a franchise tag" },
  "/api/contracts/fifth-year-option": { field: "teamId", action: "exercise a fifth-year option" },
  "/api/contracts/negotiate": { field: "teamId", action: "negotiate a contract" },
  "/api/press-conference": { field: "teamId", action: "answer for that franchise at the podium" },
  "/api/coaching-market": { field: "teamId", action: "hire or fire coaching staff" },
  // Trades name two franchises. You may broker a trade you are actually in — not
  // one between two rivals, which was previously a way to hand yourself a league.
  "/api/trade": { participants: ["teamA", "teamB"], action: "execute a trade" },
  "/api/trade/evaluate": { participants: ["teamA", "teamB"], action: "evaluate a trade" }
};

/**
 * Every other POST route, with the reason it carries no franchise authority.
 * Recorded rather than omitted so the completeness test can prove totality.
 */
export const AUTHORITY_EXEMPT_COMMANDS = {
  "/api/control-team": "defines authority itself — claiming a franchise cannot require already holding it",
  "/api/new-league": "creates the league and its controlled team",
  "/api/onboarding/start-scenario": "opening contract for the controlled team; carries no team field",
  "/api/settings": "league-wide settings, not a franchise action",
  "/api/advance-week": "advances the league clock for all thirty-two franchises at once; not an action taken on behalf of one team",
  "/api/advance-season": "advances the league clock for all thirty-two franchises at once; not an action taken on behalf of one team",
  "/api/offseason/advance": "advances the shared offseason pipeline for the whole league; not an action taken on behalf of one team",
  "/api/draft/prepare": "league-wide draft setup",
  "/api/draft/user-pick": "acts for whichever team is on the clock; carries no team field to spoof",
  "/api/draft/on-clock-trade": "controlled-team live-slot authority; offer and ownership fingerprints prevent acting for a rival",
  "/api/draft/cpu": "advances CPU picks; league clock",
  "/api/combine/run": "runs the combine for the entire prospect class; every franchise reads the same generated results",
  "/api/architect-thesis": "controlled-team declaration; carries no team field",
  "/api/trade-offers": "responds to offers addressed to the controlled team; TradeService owns endorsement",
  "/api/brand-identity": "controlled-team branding; carries no team field",
  "/api/calibration/jobs": "realism calibration tooling",
  "/api/jobs/simulate": "background simulation job",
  "/api/saves/save": "persistence, not a franchise action",
  "/api/saves/load": "persistence, not a franchise action",
  "/api/saves/delete": "persistence, not a franchise action",
  "/api/backups/load": "persistence, not a franchise action",
  "/api/backups/delete": "persistence, not a franchise action",
  "/api/snapshot/import": "persistence, not a franchise action",
  "/api/snapshot/inspect": "persistence, not a franchise action",
  "/api/rewind/snapshot": "persistence, not a franchise action",
  "/api/rewind/restore": "persistence, not a franchise action",
  "/api/rewind/delete": "persistence, not a franchise action",
  "/api/speedrun/start": "challenge metadata for the controlled team",
  "/api/speedrun/check": "challenge metadata for the controlled team",
  "/api/speedrun/abandon": "challenge metadata for the controlled team",
  "/api/speedrun/submit": "challenge metadata for the controlled team",
  "/api/commissioner/create": "lobby management; authority is established by claiming a slot",
  "/api/commissioner/join": "lobby management; addPlayerToLobby rejects an already-claimed team",
  "/api/commissioner/ready": "lobby management, keyed by userId",
  "/api/commissioner/intent": "lobby management; the intent's team is bound from the member's slot at apply time",
  "/api/commissioner/advance": "advances the shared lobby clock once every member has readied; each member intent is bound to its own slot at apply time"
};

const normalizeTeam = (value) => String(value ?? "").trim().toUpperCase();

/**
 * Every franchise this session may act for.
 *
 * Single-player: the controlled team. Commissioner Mode is hot-seat — one browser
 * hosts the lobby and applies every member's intents — so each claimed team is
 * authorized for that session. `applyIntents` still binds each individual intent
 * to its own member's slot, so one member cannot act as another.
 *
 * @returns {Set<string>}
 */
export function authorizedTeamIds(session, { lobby = null } = {}) {
  const ids = new Set();
  const controlled = normalizeTeam(session?.controlledTeamId);
  if (controlled) ids.add(controlled);
  for (const player of lobby?.players || []) {
    const claimed = normalizeTeam(player?.controlledTeamId);
    if (claimed) ids.add(claimed);
  }
  return ids;
}

function denial({ action, attempted, authorized }) {
  const allowed = [...authorized];
  return {
    status: 403,
    payload: {
      ok: false,
      error: allowed.length
        ? `You control ${allowed.join(", ")} and cannot ${action} for ${attempted || "another franchise"}.`
        : `No franchise is under your control, so you cannot ${action}.`,
      reasonCode: "team-authority",
      attemptedTeamId: attempted || null,
      authorizedTeams: allowed
    }
  };
}

/**
 * Authorize one command against the session's franchise authority.
 *
 * Returns `null` when the command is allowed (either exempt, or acting for a team
 * this session controls) and a `{ status, payload }` denial otherwise. Both
 * adapters call this at the point they already have the parsed body, so neither
 * can drift from the other's verdict.
 *
 * A missing or blank team field is left to the route's own field validation —
 * this seam answers "may you act for that team", not "did you name a team".
 */
export function authorizeCommand({ session, route, body, lobby = null }) {
  const rule = TEAM_SCOPED_COMMANDS[route];
  if (!rule) return null;
  const authorized = authorizedTeamIds(session, { lobby });

  if (rule.participants) {
    const named = rule.participants
      .map((field) => normalizeTeam(body?.[field]))
      .filter(Boolean);
    if (named.length < rule.participants.length) return null;
    if (named.some((teamId) => authorized.has(teamId))) return null;
    return denial({ action: rule.action, attempted: named.join(" ↔ "), authorized });
  }

  const attempted = normalizeTeam(body?.[rule.field]);
  if (!attempted) return null;
  if (authorized.has(attempted)) return null;
  return denial({ action: rule.action, attempted, authorized });
}
