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

import { state, api, TEAM_THEME_MAP } from "./appState.js";
import { escapeHtml } from "./appCore.js";
import { observeBackgroundTask, recordClientDiagnostic } from "./clientDiagnostics.js";
import { buildArchitectCut } from "./architectCut.js";
import { buildDecisionAnthology } from "./decisionAnthology.js";
import { findTeamStanding, formatTeamRecord, teamRecordWinPct } from "./teamRecord.js";

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
 * @param {object} dashboard current dashboard state at the season review boundary
 * @returns {Promise<object|null>}
 */
export async function buildSeasonEpilogue(dashboard) {
  const d = dashboard || state.dashboard;
  if (!d) return null;
  // The review opens in season-awards before the engine increments currentYear.
  const seasonYear = Number(d.seasonAwardsStage?.year ??
    (d.phase === "season-awards" ? d.currentYear : (d.currentYear || 0) - 1));
  const team = d.controlledTeam || {};
  const teamKey = team.abbrev || team.teamId || d.controlledTeamId || "";

  const standings = d.latestStandings || [];
  const myRow = findTeamStanding(standings, { ...team, id: teamKey });
  const winPct = teamRecordWinPct(myRow);
  const isChampion = Boolean(d.lastChampionTeamId && (d.lastChampionTeamId === (team.teamId || teamKey)));
  const madePlayoffs = Boolean(myRow.playoffSeed || myRow.playoffExit || myRow.madePlayoffs);

  const authorityKey = [d.currentYear || "", d.currentWeek || "", teamKey].join(":");
  const loadOptional = async (operation, loader, fallback) => {
    const value = await observeBackgroundTask(loader, {
      surface: "season-epilogue",
      operation,
      authorityKey
    });
    return value ?? fallback;
  };
  const [arcs, records, fan, capsule, transactions] = await Promise.all([
    loadOptional("season-arcs", async () => (await api("/api/season-arcs"))?.arcs || [], []),
    loadOptional("franchise-records", async () => (await api("/api/records/franchise"))?.records || null, null),
    loadOptional("fan-sentiment", async () => (await api("/api/fan-sentiment"))?.fanSentiment || null, null),
    loadOptional("time-capsule", async () => (await api("/api/time-capsule"))?.capsule || null, null),
    loadOptional(
      "architect-cut-transactions",
      async () => {
        const query = new URLSearchParams({ team: teamKey, limit: "500" });
        return (await api(`/api/transactions?${query.toString()}`))?.transactions || [];
      },
      []
    )
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

  // Time-capsule receipts: only for the season that just ended, only once graded.
  const receipts =
    capsule && capsule.year === seasonYear && capsule.graded
      ? {
          hits: capsule.graded.hits,
          pushes: capsule.graded.pushes,
          misses: capsule.graded.misses,
          rows: capsule.graded.receipts || [],
          reporterVerdict: capsule.graded.reporterVerdict || ""
        }
      : null;

  const quoteKey = outcomeKey(winPct, isChampion, madePlayoffs);
  const architectCut = buildArchitectCut({
    seasonYear,
    teamId: teamKey,
    architectLedger: d.architectLedger || [],
    transactions,
    draftHistory: d.draftHistory || []
  });
  const decisionAnthology = buildDecisionAnthology({
    teamId: teamKey,
    throughYear: seasonYear,
    architectLedger: d.architectLedger || [],
    transactions,
    draftHistory: d.draftHistory || []
  });
  return {
    seasonYear,
    record: formatTeamRecord(myRow),
    isChampion,
    isMiracleRunSeason: isMiracleRun(winPct, madePlayoffs),
    arcVerdicts,
    recordsBroken: recordsBroken.slice(0, 4),
    fanApproval: fan ? Math.round(fan.approval ?? 0) : null,
    fanLabel: fan?.label || null,
    receipts,
    architectCut,
    decisionAnthology,
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

  const receiptIcon = { hit: "✅", push: "➖", miss: "❌" };
  const receiptsHtml = ep.receipts
    ? `<div class="ep-records ep-receipts">
        <div class="ep-section-label">The Report Card — Preseason Predictions, Graded (${ep.receipts.hits}-${ep.receipts.misses}${ep.receipts.pushes ? `, ${ep.receipts.pushes} push` : ""})</div>
        ${ep.receipts.rows
          .map(
            (r) => `<div class="ep-record">${receiptIcon[r.verdict] || "➖"} ${escapeHtml(r.text)}<br>
              <em>${escapeHtml(r.evidence || "")}</em></div>`
          )
          .join("")}
        ${ep.receipts.reporterVerdict ? `<blockquote class="ep-quote">"${escapeHtml(ep.receipts.reporterVerdict)}"<cite>— Beat Reporter, grading the board</cite></blockquote>` : ""}
      </div>`
    : "";

  const cut = ep.architectCut;
  const cutCards = cut.turningPoints.length
    ? `<div class="ep-cut-grid">${cut.turningPoints.map((point) => `
        <article class="ep-cut-card">
          <div class="ep-cut-kicker">#${point.rank} · ${escapeHtml(point.sourceLabel)} · ${escapeHtml(point.evidenceState)}</div>
          <h4>${escapeHtml(point.title)}</h4>
          <dl>
            <div><dt>Declared intent</dt><dd>${escapeHtml(point.declaredIntent)}</dd></div>
            <div><dt>Observed evidence</dt><dd>${escapeHtml(point.observedEvidence)}</dd></div>
            <div><dt>Next adaptation</dt><dd>${escapeHtml(point.nextAdaptation)}</dd></div>
          </dl>
          <p class="ep-cut-limit">${escapeHtml(point.limitations)}</p>
        </article>`).join("")}</div>`
    : `<p class="ep-cut-empty">No decisions were recorded this season. The review remains incomplete; no turning points were invented.</p>`;
  const sourceSummary = Object.entries(cut.sources)
    .map(([source, count]) => `${source.replace(/([A-Z])/g, " $1").toLowerCase()}: ${count}`)
    .join(" · ");
  const missingSummary = cut.missingSources.length
    ? `<p class="ep-cut-missing">Missing evidence: ${escapeHtml(cut.missingSources.map((source) => source.replace(/([A-Z])/g, " $1").toLowerCase()).join(", "))}</p>`
    : "";
  const architectCutHtml = `<section class="ep-architect-cut" aria-label="Architect's Cut">
      <div class="ep-section-label">Architect's Cut — Three Decisions That Shaped the Year</div>
      <p class="ep-cut-status">Evidence status: <strong>${escapeHtml(cut.status)}</strong> · ${escapeHtml(sourceSummary)}</p>
      ${cutCards}
      ${missingSummary}
      <p class="ep-cut-disclaimer">${escapeHtml(cut.disclaimer)}</p>
    </section>`;

  const priorVolumes = (ep.decisionAnthology?.volumes || []).filter((volume) => volume.seasonYear !== ep.seasonYear);
  const anthologyHtml = `<section class="ep-anthology" aria-label="Decision Anthology">
      <div class="ep-section-label">Decision Anthology</div>
      ${priorVolumes.length
        ? `<div class="ep-anthology-shelf">${priorVolumes.map((volume) => `<div class="ep-anthology-volume">
            <strong>${escapeHtml(String(volume.seasonYear))}</strong>
            <span>${escapeHtml(volume.headline)}</span>
            <small>${escapeHtml(volume.status)} · ${volume.turningPointCount} recorded turning point${volume.turningPointCount === 1 ? "" : "s"} · ${volume.sourceCoverage}/4 sources</small>
          </div>`).join("")}</div>`
        : `<p class="ep-cut-empty">Volume ${escapeHtml(String(ep.seasonYear))} opens the anthology. Future seasons will preserve their evidence coverage beside it.</p>`}
      <p class="ep-cut-disclaimer">${escapeHtml(ep.decisionAnthology?.disclaimer || "")}</p>
    </section>`;

  const section = document.createElement("div");
  section.className = "season-epilogue";
  section.innerHTML = `
    <div class="ep-divider">— SEASON EPILOGUE —</div>
    ${ep.isChampion ? `<div class="ep-champion">🏆 WORLD CHAMPIONS</div>` : ""}
    ${ep.isMiracleRunSeason ? `<div class="ep-miracle-run">⭐ MIRACLE RUN — Against all odds, we made it.</div>` : ""}
    ${arcHtml}
    ${recordsHtml}
    ${receiptsHtml}
    ${architectCutHtml}
    ${anthologyHtml}
    ${fanHtml}
    <blockquote class="ep-quote">"${escapeHtml(ep.closingQuote)}"<cite>— Head Coach, season-ending press conference</cite></blockquote>
  `;
  bodyEl.appendChild(section);
  mountEpilogueShareControl(section, ep, dashboard);
}

// S109 — the epilogue panel is the season's one cinematic payoff moment;
// loaded lazily so a player who never shares never pays for momentCard.js.
function mountEpilogueShareControl(section, ep, dashboard) {
  const mount = document.createElement("div");
  mount.className = "moment-card-share-mount";
  section.appendChild(mount);
  import("./momentCard.js").then((momentCard) => {
    momentCard.mountShareControl(mount, () => {
      const d = dashboard || state.dashboard || {};
      const teamAbbrev = d.controlledTeam?.abbrev || "";
      const theme = TEAM_THEME_MAP[teamAbbrev] || {};
      const headline = ep.isChampion
        ? "World Champions"
        : ep.isMiracleRunSeason
          ? "Miracle Run"
          : `${ep.seasonYear} Season Epilogue`;
      const stats = [
        { label: "Record", value: ep.record },
        ep.fanApproval != null ? { label: "Fan Approval", value: `${ep.fanApproval}/100` } : null,
        ep.recordsBroken.length ? { label: "Records Set", value: ep.recordsBroken.length } : null
      ].filter(Boolean);
      return {
        kind: "season-epilogue",
        headline,
        subline: ep.closingQuote,
        stats,
        teamCode: teamAbbrev,
        teamName: d.controlledTeam?.name || "",
        primary: theme.primary,
        secondary: theme.secondary,
        seasonLabel: `${ep.seasonYear} Season`,
        challengeCode: momentCard.deriveActiveChallengeCode(state)
      };
    });
  }).catch((error) => recordClientDiagnostic({ surface: "moment-card", operation: "share-control", error, severity: "warning" }));
}
