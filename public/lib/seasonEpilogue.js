/**
 * seasonEpilogue.js — Season Epilogue payoff ritual (S14)
 *
 * End-of-season is the natural churn point. The epilogue aggregates the
 * season's scattered resolution moments — narrative arc verdicts, franchise
 * records broken, fan approval trajectory, a closing press-room quote — into
 * one cinematic sequence appended to the existing Season Review modal.
 *
 * All data comes from endpoints that already exist in both runtimes:
 *   /api/season-arcs · /api/records/franchise · /api/fan-sentiment
 * The closing quote is deterministic (seeded by year + outcome) so replays
 * of the same season produce the same epilogue.
 */

import { state, api } from "./appState.js";
import { escapeHtml } from "./appCore.js";

// ── Closing quote bank (deterministic, outcome-keyed) ────────────────────────

const QUOTE_BANK = {
  champion: [
    "They said it couldn't be done here. Hang the banner.",
    "This one belongs to every fan who never stopped believing.",
    "Dynasties start with a single ring. We're not done."
  ],
  "miracle-run": [
    "Nobody believed in us. We didn't care. That's what made it special.",
    "They had us buried in October. We used it as fuel. Remember that.",
    "This city needed a miracle. This team delivered one. Write it down."
  ],
  contender: [
    "We knocked on the door. Next year we kick it down.",
    "Close isn't the goal. But close means the window is open.",
    "The locker room knows what it tasted. That hunger carries."
  ],
  mediocre: [
    "Average teams make excuses. We'll make moves instead.",
    "The film doesn't lie. Neither will the offseason.",
    "Somewhere between rebuilding and contending is a decision. We'll make it."
  ],
  struggling: [
    "The record is what it is. The plan is bigger than one season.",
    "Nobody in that room is hiding from this. We own it.",
    "Foundations get poured in seasons like this one. Remember it."
  ]
};

export function isMiracleRun(winPct, madePlayoffs) {
  return madePlayoffs && winPct < 0.5;
}

function outcomeKey(winPct, isChampion, madePlayoffs) {
  if (isChampion) return "champion";
  if (isMiracleRun(winPct, madePlayoffs)) return "miracle-run";
  if (winPct >= 0.6) return "contender";
  if (winPct >= 0.45) return "mediocre";
  return "struggling";
}

function pickQuote(key, seedYear) {
  const bank = QUOTE_BANK[key] || QUOTE_BANK.mediocre;
  return bank[Math.abs(seedYear) % bank.length];
}

// ── Aggregator ────────────────────────────────────────────────────────────────

/**
 * Build the epilogue model for the season that just ended.
 * @param {object} dashboard current dashboard state (post-rollover)
 * @returns {Promise<object|null>}
 */
export async function buildSeasonEpilogue(dashboard) {
  const d = dashboard || state.dashboard;
  if (!d) return null;
  const seasonYear = (d.currentYear || 0) - 1;
  const team = d.controlledTeam || {};
  const teamKey = team.abbrev || team.teamId || d.controlledTeamId || "";

  const standings = d.latestStandings || [];
  const myRow = standings.find((r) => r.team === teamKey) || {};
  const wins = myRow.wins || 0;
  const losses = myRow.losses || 0;
  const winPct = wins + losses > 0 ? wins / (wins + losses) : 0.5;
  const isChampion = Boolean(d.lastChampionTeamId && (d.lastChampionTeamId === (team.teamId || teamKey)));
  const madePlayoffs = Boolean(myRow.playoffSeed || myRow.playoffExit || myRow.madePlayoffs);

  const [arcs, records, fan] = await Promise.all([
    api("/api/season-arcs").then((r) => r?.arcs || []).catch(() => []),
    api("/api/records/franchise").then((r) => r?.records || null).catch(() => null),
    api("/api/fan-sentiment").then((r) => r?.fanSentiment || null).catch(() => null)
  ]);

  // Arc verdicts: the generator reflects final standings after rollover.
  const arcVerdicts = arcs.map((arc) => ({
    icon: arc.icon || "📖",
    title: arc.title,
    delivered: arc.status === "on-track",
    verdict: arc.status === "on-track" ? "Delivered" : "Fell short"
  }));

  // Records set during the season that just ended.
  const recordsBroken = [];
  if (records && typeof records === "object") {
    for (const [category, entries] of Object.entries(records)) {
      const list = Array.isArray(entries) ? entries : [entries];
      for (const rec of list) {
        if (rec && Number(rec.year) === seasonYear) {
          recordsBroken.push({
            category,
            holder: rec.name || rec.player || rec.holder || "",
            value: rec.value ?? rec.total ?? ""
          });
        }
      }
    }
  }

  const quoteKey = outcomeKey(winPct, isChampion, madePlayoffs);
  return {
    seasonYear,
    record: wins || losses ? `${wins}–${losses}` : "—",
    isChampion,
    isMiracleRunSeason: isMiracleRun(winPct, madePlayoffs),
    arcVerdicts,
    recordsBroken: recordsBroken.slice(0, 4),
    fanApproval: fan ? Math.round(fan.approval ?? 0) : null,
    fanLabel: fan?.label || null,
    closingQuote: pickQuote(quoteKey, seasonYear),
    quoteKey
  };
}

// ── Renderer (appends to the Season Review modal body) ───────────────────────

export async function appendSeasonEpilogue(bodyEl, dashboard) {
  if (!bodyEl) return;
  const ep = await buildSeasonEpilogue(dashboard);
  if (!ep) return;

  const arcHtml = ep.arcVerdicts.length
    ? `<div class="ep-arcs">${ep.arcVerdicts
        .map(
          (a) => `<div class="ep-arc ${a.delivered ? "ep-arc-won" : "ep-arc-lost"}">
            <span class="ep-arc-icon">${escapeHtml(a.icon)}</span>
            <span class="ep-arc-title">${escapeHtml(a.title)}</span>
            <span class="ep-arc-verdict">${escapeHtml(a.verdict)}</span>
          </div>`
        )
        .join("")}</div>`
    : "";

  const recordsHtml = ep.recordsBroken.length
    ? `<div class="ep-records">
        <div class="ep-section-label">Records Set in ${ep.seasonYear}</div>
        ${ep.recordsBroken
          .map(
            (r) => `<div class="ep-record">🏅 <strong>${escapeHtml(String(r.holder))}</strong>
              — ${escapeHtml(String(r.category))}${r.value !== "" ? ` (${escapeHtml(String(r.value))})` : ""}</div>`
          )
          .join("")}
      </div>`
    : "";

  const fanHtml = ep.fanApproval != null
    ? `<div class="ep-fan">
        <div class="ep-section-label">Fan Pulse</div>
        <div class="ep-fan-meter"><span class="ep-fan-fill" style="width:${ep.fanApproval}%"></span></div>
        <div class="ep-fan-text">${ep.fanApproval}/100 · ${escapeHtml(ep.fanLabel || "")}</div>
      </div>`
    : "";

  const section = document.createElement("div");
  section.className = "season-epilogue";
  section.innerHTML = `
    <div class="ep-divider">— SEASON EPILOGUE —</div>
    ${ep.isChampion ? `<div class="ep-champion">🏆 WORLD CHAMPIONS</div>` : ""}
    ${ep.isMiracleRunSeason ? `<div class="ep-miracle-run">⭐ MIRACLE RUN — Against all odds, we made it.</div>` : ""}
    ${arcHtml}
    ${recordsHtml}
    ${fanHtml}
    <blockquote class="ep-quote">"${escapeHtml(ep.closingQuote)}"<cite>— Head Coach, season-ending press conference</cite></blockquote>
  `;
  bodyEl.appendChild(section);
}
