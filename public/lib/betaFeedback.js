/**
 * betaFeedback.js — "Tell the Commissioner" beta feedback capture (S14)
 *
 * Static-host compatible: no backend, no PII. Builds a prefilled GitHub issue
 * URL carrying game context (year/week/phase/tab/runtime), and — when the
 * player has opted into privacy-first analytics — copies the local analytics
 * digest to the clipboard so they can paste it into the issue if they choose.
 *
 * URL building is pure so Node tests can verify it without a DOM.
 */

import { state } from "./appState.js";
import { showToast } from "./appCore.js";
import { exportSummary, isOptedIn } from "./analytics.js";
import { buildLaunchReadinessRows } from "./tabSettings.js";

import {
  buildLocalPlaytestExport,
  buildLocalPlaytestReceipt,
  buildLocalPlaytestTrend,
  loadLocalPlaytestReceipts,
  saveLocalPlaytestReceipt
} from "./playtestReceipts.js";
export {
  PLAYTEST_RECEIPT_SCHEMA_VERSION,
  PLAYTEST_RECEIPT_STORAGE_KEY,
  buildLocalPlaytestExport,
  buildLocalPlaytestReceipt,
  buildLocalPlaytestTrend,
  loadLocalPlaytestReceipts,
  saveLocalPlaytestReceipt
} from "./playtestReceipts.js";

const REPO_ISSUE_BASE = "https://github.com/VaultSparkStudios/vaultspark-football-gm/issues/new";

/**
 * Build a prefilled GitHub new-issue URL.
 * @param {object} ctx { year, week, phase, tab, runtimeMode, appVersion }
 * @returns {string}
 */
export function buildFeedbackIssueUrl(ctx = {}) {
  const readinessRows = Array.isArray(ctx.launchReadinessRows) ? ctx.launchReadinessRows : [];
  const fingerprintRows = Array.isArray(ctx.franchiseFingerprint) ? ctx.franchiseFingerprint : [];
  const lines = [
    "<!-- Tell the Commissioner: describe what happened, what you expected, and what you'd love to see. -->",
    "",
    "**What happened / what would make this better?**",
    "",
    "",
    "---",
    "_Auto-attached game context:_",
    `- Season: ${ctx.year ?? "?"} · Week ${ctx.week ?? "?"} · ${ctx.phase ?? "?"}`,
    `- Screen: ${ctx.tab ?? "?"} · Runtime: ${ctx.runtimeMode ?? "?"}`,
    ...fingerprintRows.map((row) => `- Franchise/${row.label}: ${row.value}`),    ...(ctx.playtestReceipt ? [
      `- Playtest/Clarity: ${ctx.playtestReceipt.ratings.clarity}/5`,
      `- Playtest/Agency: ${ctx.playtestReceipt.ratings.agency}/5`,
      `- Playtest/Pace: ${ctx.playtestReceipt.ratings.pace}/5`,
      `- Playtest/Return intent: ${ctx.playtestReceipt.ratings.returnIntent}/5`,
      ...(ctx.playtestReceipt.note ? [`- Playtest/Note: ${ctx.playtestReceipt.note}`] : [])
    ] : []),
    ...readinessRows.map((row) => `- Readiness/${row.area}: ${row.status} — ${row.detail}`),
    ctx.analyticsAttached
      ? "- Analytics digest: copied to clipboard — paste below if you want to share it."
      : "- Analytics digest: not attached (opt in via Settings → Analytics)."
  ];
  const params = new URLSearchParams({
    title: `[Beta feedback] ${ctx.phase ?? "general"} — ${ctx.tab ?? "game"}`,
    body: lines.join("\n"),
    labels: "beta-feedback"
  });
  return `${REPO_ISSUE_BASE}?${params.toString()}`;
}

export function buildFeedbackContextFingerprint({ dashboard = {}, newsRows = [] } = {}) {
  const team = dashboard.controlledTeam || {};
  const controlledTeamId = dashboard.controlledTeamId || team.abbrev || team.teamId || "?";
  const standings = dashboard.latestStandings || [];
  const row = standings.find((entry) => entry.team === controlledTeamId || entry.team === team.abbrev || entry.teamId === controlledTeamId) || {};
  const wins = row.wins ?? team.wins ?? 0;
  const losses = row.losses ?? team.losses ?? 0;
  const capSpace = dashboard.cap?.capSpace;
  const rosterNeed = (dashboard.rosterNeeds || [])[0];
  const topNeed = rosterNeed?.pos || rosterNeed?.position || rosterNeed || "none surfaced";
  const pressure = newsRows[0]?.headline || dashboard.ownerState?.owner?.expectation?.mandate || dashboard.phase || "none surfaced";
  const capPosture = capSpace == null
    ? "unknown"
    : capSpace < 0
      ? `over cap (${_fmtMoney(capSpace)})`
      : `${_fmtMoney(capSpace)} available`;

  return [
    { label: "Team", value: `${team.name || team.abbrev || controlledTeamId}` },
    { label: "Record", value: `${wins}-${losses}` },
    { label: "Cap", value: capPosture },
    { label: "Top Need", value: String(topNeed) },
    { label: "Pressure", value: String(pressure).slice(0, 120) }
  ];
}

function gatherContext() {
  const d = state.dashboard || {};
  let runtimeMode = "unknown";
  try {
    runtimeMode = window.localStorage.getItem("vsfgm:runtime-mode") || "default";
  } catch {
    // ignore
  }
  return {
    year: d.currentYear,
    week: d.currentWeek,
    phase: d.phase,
    tab: state.activeTab || "unknown",
    runtimeMode,
    playtestReceipt: loadLocalPlaytestReceipts()[0] || null,
    franchiseFingerprint: buildFeedbackContextFingerprint({
      dashboard: state.dashboard,
      newsRows: state.newsRows
    }),
    launchReadinessRows: buildLaunchReadinessRows({
      dashboard: state.dashboard,
      saves: state.saves,
      persistence: state.persistence,
      observability: state.observability,
      speedrunChallenge: state.speedrunChallenge,
      publicDomainStatus: state.launchReadiness?.publicDomainStatus
    })
  };
}

function _fmtMoney(value) {
  const abs = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(0)}K`;
  return `${prefix}$${abs}`;
}

export async function openFeedback() {
  // Open before the first await so the browser still considers this part of
  // the trusted click. Waiting for clipboard permission first causes popup
  // blockers to silently eat the Commissioner form.
  const popup = openFeedbackPlaceholder(window);
  const ctx = gatherContext();
  let analyticsAttached = false;
  if (isOptedIn()) {
    const digest = exportSummary();
    if (digest) {
      try {
        await navigator.clipboard.writeText(JSON.stringify(digest, null, 2));
        analyticsAttached = true;
      } catch {
        analyticsAttached = false;
      }
    }
  }
  const url = buildFeedbackIssueUrl({ ...ctx, analyticsAttached });
  commitFeedbackNavigation({ popup, url, browser: window });
  showToast(
    analyticsAttached
      ? "Feedback form opened — analytics digest copied, paste it in if you'd like."
      : "Feedback form opened — thanks for making the game better!"
  );
}

export function openFeedbackPlaceholder(browser = globalThis.window) {
  try {
    const popup = browser?.open?.("about:blank", "_blank");
    if (popup) popup.opener = null;
    return popup || null;
  } catch {
    return null;
  }
}

export function commitFeedbackNavigation({ popup = null, url, browser = globalThis.window } = {}) {
  if (!url) throw new Error("Feedback URL is required.");
  if (popup?.location) {
    if (typeof popup.location.replace === "function") popup.location.replace(url);
    else popup.location.href = url;
    return "popup";
  }
  if (typeof browser?.location?.assign === "function") {
    browser.location.assign(url);
    return "current-tab";
  }
  throw new Error("The feedback form could not be opened.");
}

function reportFeedbackError(error) {
  console.error("Tell the Commissioner failed", error);
  showToast("Feedback could not open. Check popup settings and try again.");
}

/**
 * Mount the feedback affordances: a Settings-tab panel button and a small
 * link inside the Franchise Moment card (the emotional high point — the best
 * moment to ask "what did you think?").
 */
export function mountBetaFeedback() {
  const settingsTab = document.getElementById("settingsTab");
  if (settingsTab && !document.getElementById("betaFeedbackPanel")) {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "betaFeedbackPanel";
    panel.innerHTML = `
      <h2>Tell the Commissioner</h2>
      <p class="small" style="opacity:0.75">Found a bug? Have an idea? Your report goes straight to the dev board —
        game context is attached automatically, never any personal data.</p>
      <button id="betaFeedbackBtn" class="btn btn-accent" data-testid="beta-feedback-btn">Send Feedback</button>
      <details class="playtest-receipt-panel">
        <summary>Record a private playtest receipt</summary>
        <p class="small">Nothing is sent automatically. Save a compact anonymous receipt locally, then choose whether to copy or attach it to feedback.</p>
        <div class="playtest-rating-grid">
          ${[["clarity", "Loop clarity"], ["agency", "Decision agency"], ["pace", "Pacing"], ["returnIntent", "Want another session"]].map(([id, label]) => `
            <label>${label}<select id="playtest-${id}"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select></label>`).join("")}
        </div>
        <label>One useful moment or friction<textarea id="playtest-note" maxlength="280" rows="3" placeholder="Optional; keep it public-safe."></textarea></label>
        <div class="row compact"><button id="savePlaytestReceiptBtn" type="button">Save Local Receipt</button><button id="copyPlaytestReceiptsBtn" type="button">Copy Receipt Pack</button><span id="playtestReceiptCount" class="small"></span></div>
        <div id="playtestTrend" class="playtest-trend small" aria-live="polite"></div>
      </details>`;
    settingsTab.insertBefore(panel, settingsTab.firstElementChild);
    document.getElementById("betaFeedbackBtn")?.addEventListener("click", () => {
      openFeedback().catch(reportFeedbackError);
    });    const refreshReceiptCount = () => {
      const count = loadLocalPlaytestReceipts().length;
      const target = document.getElementById("playtestReceiptCount");
      if (target) target.textContent = `${count} local receipt${count === 1 ? "" : "s"}`;
      const trend = buildLocalPlaytestTrend(loadLocalPlaytestReceipts());
      const trendTarget = document.getElementById("playtestTrend");
      if (trendTarget) trendTarget.textContent = trend.available
        ? `Local signal (${trend.count}): clarity ${trend.averages.clarity}/5 · agency ${trend.averages.agency}/5 · pace ${trend.averages.pace}/5 · another session ${trend.averages.returnIntent}/5. ${trend.warning}`
        : `${trend.count}/${trend.minimum} receipts recorded before a local trend is shown. ${trend.warning}`;
    };
    document.getElementById("savePlaytestReceiptBtn")?.addEventListener("click", () => {
      try {
        const d = state.dashboard || {};
        const value = (id) => document.getElementById(`playtest-${id}`)?.value;
        const receipt = buildLocalPlaytestReceipt({
          clarity: value("clarity"), agency: value("agency"), pace: value("pace"), returnIntent: value("returnIntent"),
          note: document.getElementById("playtest-note")?.value
        }, {
          year: d.currentYear, week: d.currentWeek, phase: d.phase, teamId: d.controlledTeamId,
          openingContractStatus: d.openingContractProgress?.status
        });
        saveLocalPlaytestReceipt(receipt);
        refreshReceiptCount();
        showToast("Private playtest receipt saved locally.");
      } catch (error) {
        reportFeedbackError(error);
      }
    });
    document.getElementById("copyPlaytestReceiptsBtn")?.addEventListener("click", async () => {
      const pack = buildLocalPlaytestExport(loadLocalPlaytestReceipts());
      if (!pack.count) return showToast("Record a playtest receipt before exporting.");
      try {
        await navigator.clipboard.writeText(JSON.stringify(pack, null, 2));
        showToast(`${pack.count} private playtest receipt${pack.count === 1 ? "" : "s"} copied.`);
      } catch (error) {
        reportFeedbackError(error);
      }
    });
    refreshReceiptCount();
  }

  const fmModal = document.getElementById("franchiseMomentModal");
  if (fmModal && !document.getElementById("fmFeedbackLink")) {
    const link = document.createElement("button");
    link.id = "fmFeedbackLink";
    link.className = "fm-feedback-link";
    link.textContent = "Tell the Commissioner";
    link.addEventListener("click", () => {
      openFeedback().catch(reportFeedbackError);
    });
    fmModal.appendChild(link);
  }
}
