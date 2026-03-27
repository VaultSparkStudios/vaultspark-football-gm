/**
 * @deprecated Use the rewind implementation in src/app/api/localApiRuntime.js instead.
 * The canonical rewind system uses localApiRuntime.js routes (/api/rewind/*) with
 * localStorage directly (keys: vsfgm-rw-index, vsfgm:rw-state:{id}).
 * This file is retained for reference but should not be imported by new code.
 *
 * Rewind Manager — Save Replay & Rewind System
 *
 * Auto-snapshots game state at key decision points:
 *   - Pre-draft (before the user's first pick)
 *   - Pre-trade-deadline (Week 9 of regular season)
 *   - Start of each new season
 *   - Before any user-initiated trade is committed
 *
 * Snapshots are stored in the save store under a dedicated slot prefix.
 * The seeded RNG is deterministic: rewinding to a snapshot and re-simming
 * non-user decisions produces the same outcomes. User decisions diverge.
 *
 * Max snapshots: MAX_REWIND_SLOTS (default 10), pruned oldest-first.
 *
 * Snapshot structure:
 *   {
 *     id: string,
 *     label: string,         // human-readable description
 *     trigger: string,       // "pre-draft" | "pre-trade-deadline" | "season-start" | "pre-trade"
 *     year: number,
 *     week: number,
 *     phase: string,
 *     createdAt: ISO string,
 *     stateKey: string       // save store key where the serialized state lives
 *   }
 */

const MAX_REWIND_SLOTS = 10;
const REWIND_META_KEY = "rewind_meta";
const REWIND_STATE_PREFIX = "rewind_state_";

// ── Metadata management ───────────────────────────────────────────────────────

export async function loadRewindMeta(saveStore, leagueId) {
  try {
    const raw = await saveStore.load(`${leagueId}_${REWIND_META_KEY}`);
    if (!raw) return [];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRewindMeta(saveStore, leagueId, snapshots) {
  await saveStore.save(`${leagueId}_${REWIND_META_KEY}`, JSON.stringify(snapshots));
}

// ── Create a snapshot ─────────────────────────────────────────────────────────

/**
 * @param {object}  saveStore
 * @param {string}  leagueId
 * @param {object}  sessionState    — raw serializable game state object
 * @param {object}  opts
 * @param {string}  opts.trigger    — trigger label
 * @param {string}  opts.label      — human-readable label
 * @param {number}  opts.year
 * @param {number}  opts.week
 * @param {string}  opts.phase
 */
export async function createRewindSnapshot(saveStore, leagueId, sessionState, opts) {
  const { trigger, label, year, week, phase } = opts;

  const snapshots = await loadRewindMeta(saveStore, leagueId);

  const id = `${leagueId}-${trigger}-${year}-${week}-${Date.now()}`;
  const stateKey = `${leagueId}_${REWIND_STATE_PREFIX}${id}`;

  // Persist state
  await saveStore.save(stateKey, JSON.stringify(sessionState));

  // Prepend metadata entry
  snapshots.unshift({
    id,
    label: label || trigger,
    trigger,
    year,
    week,
    phase: phase || "unknown",
    createdAt: new Date().toISOString(),
    stateKey
  });

  // Prune oldest entries beyond the slot limit
  while (snapshots.length > MAX_REWIND_SLOTS) {
    const oldest = snapshots.pop();
    try { await saveStore.delete(oldest.stateKey); } catch { /* ignored */ }
  }

  await saveRewindMeta(saveStore, leagueId, snapshots);
  return snapshots[0];
}

// ── Load a snapshot for rewind ────────────────────────────────────────────────

export async function loadRewindSnapshot(saveStore, leagueId, snapshotId) {
  const snapshots = await loadRewindMeta(saveStore, leagueId);
  const meta = snapshots.find((s) => s.id === snapshotId);
  if (!meta) throw new Error(`Rewind snapshot ${snapshotId} not found.`);

  const raw = await saveStore.load(meta.stateKey);
  if (!raw) throw new Error(`Rewind state data missing for snapshot ${snapshotId}.`);

  const state = typeof raw === "string" ? JSON.parse(raw) : raw;
  return { meta, state };
}

// ── Delete a snapshot ─────────────────────────────────────────────────────────

export async function deleteRewindSnapshot(saveStore, leagueId, snapshotId) {
  const snapshots = await loadRewindMeta(saveStore, leagueId);
  const idx = snapshots.findIndex((s) => s.id === snapshotId);
  if (idx === -1) return;

  const [removed] = snapshots.splice(idx, 1);
  try { await saveStore.delete(removed.stateKey); } catch { /* ignored */ }
  await saveRewindMeta(saveStore, leagueId, snapshots);
}

// ── Trigger helpers (called from session module hooks) ────────────────────────

export async function snapshotSeasonStart(saveStore, leagueId, sessionState, year) {
  return createRewindSnapshot(saveStore, leagueId, sessionState, {
    trigger: "season-start",
    label: `Start of Season ${year}`,
    year,
    week: 0,
    phase: "preseason"
  });
}

export async function snapshotPreDraft(saveStore, leagueId, sessionState, year) {
  return createRewindSnapshot(saveStore, leagueId, sessionState, {
    trigger: "pre-draft",
    label: `Pre-Draft — Season ${year}`,
    year,
    week: 0,
    phase: "draft"
  });
}

export async function snapshotPreTradeDeadline(saveStore, leagueId, sessionState, year, week) {
  return createRewindSnapshot(saveStore, leagueId, sessionState, {
    trigger: "pre-trade-deadline",
    label: `Pre-Trade Deadline — Season ${year}, Week ${week}`,
    year,
    week,
    phase: "regular-season"
  });
}

export async function snapshotPreTrade(saveStore, leagueId, sessionState, year, week, tradeDesc) {
  return createRewindSnapshot(saveStore, leagueId, sessionState, {
    trigger: "pre-trade",
    label: `Before Trade: ${tradeDesc || "user trade"} (Season ${year}, Week ${week})`,
    year,
    week,
    phase: "regular-season"
  });
}
