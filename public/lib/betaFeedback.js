/**
 * betaFeedback.js — "Tell the Commissioner" beta feedback capture (S14)
 *
 * Static-host compatible: no backend, no PII. Builds a prefilled GitHub issue
 * URL carrying game context (year/week/phase/tab/runtime). A local playtest
 * receipt is included only when the player explicitly selects it.
 *
 * URL building is pure so Node tests can verify it without a DOM.
 */

import { state } from "./appState.js";
import { showToast } from "./appCore.js";
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
export const FEEDBACK_DISCLOSURE_LIMITS = Object.freeze({
  fingerprintRows: 8,
  readinessRows: 12,
  label: 40,
  status: 24,
  value: 160,
  detail: 220
});

function boundedPublicText(value, limit) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export function buildFeedbackDisclosureReceipt(ctx = {}) {
  const fingerprintSource = Array.isArray(ctx.franchiseFingerprint) ? ctx.franchiseFingerprint : [];
  const readinessSource = Array.isArray(ctx.launchReadinessRows) ? ctx.launchReadinessRows : [];
  const fingerprintRows = fingerprintSource.slice(0, FEEDBACK_DISCLOSURE_LIMITS.fingerprintRows).map((row) => ({
    label: boundedPublicText(row?.label, FEEDBACK_DISCLOSURE_LIMITS.label) || "Context",
    value: boundedPublicText(row?.value, FEEDBACK_DISCLOSURE_LIMITS.value) || "unknown"
  }));
  const readinessRows = readinessSource.slice(0, FEEDBACK_DISCLOSURE_LIMITS.readinessRows).map((row) => ({
    area: boundedPublicText(row?.area, FEEDBACK_DISCLOSURE_LIMITS.label) || "Area",
    status: boundedPublicText(row?.status, FEEDBACK_DISCLOSURE_LIMITS.status) || "Unknown",
    detail: boundedPublicText(row?.detail, FEEDBACK_DISCLOSURE_LIMITS.detail) || "No detail supplied"
  }));
  return Object.freeze({
    schemaVersion: "1.0",
    kind: "feedback-disclosure-receipt",
    fingerprintRows,
    readinessRows,
    omitted: Object.freeze({
      fingerprintRows: Math.max(0, fingerprintSource.length - fingerprintRows.length),
      readinessRows: Math.max(0, readinessSource.length - readinessRows.length)
    })
  });
}

export function selectPublishedPlaytestReceipt(receipt) {
  if (receipt?.schemaVersion !== "1.0" || receipt?.kind !== "local-playtest-receipt") return null;
  const metrics = ["clarity", "agency", "pace", "returnIntent"];
  const ratings = Object.fromEntries(metrics.map((metric) => [metric, Number(receipt.ratings?.[metric])]));
  if (Object.values(ratings).some((rating) => !Number.isInteger(rating) || rating < 1 || rating > 5)) return null;
  return {
    schemaVersion: "1.0",
    kind: "published-playtest-receipt",
    ratings,
    note: boundedPublicText(receipt.note, 280)
  };
}

/**
 * Build a prefilled GitHub new-issue URL.
 * @param {object} ctx { year, week, phase, tab, runtimeMode, appVersion }
 * @returns {string}
 */
export function buildFeedbackIssueUrl(ctx = {}) {
  const disclosure = buildFeedbackDisclosureReceipt(ctx);
  const { readinessRows, fingerprintRows } = disclosure;
  const phase = boundedPublicText(ctx.phase, 40) || "?";
  const tab = boundedPublicText(ctx.tab, 48) || "?";
  const runtimeMode = boundedPublicText(ctx.runtimeMode, 32) || "?";
  const year = boundedPublicText(ctx.year, 8) || "?";
  const week = boundedPublicText(ctx.week, 8) || "?";
  const omittedCount = disclosure.omitted.fingerprintRows + disclosure.omitted.readinessRows;
  const lines = [
    "<!-- Tell the Commissioner: describe what happened, what you expected, and what you'd love to see. -->",
    "",
    "**What happened / what would make this better?**",
    "",
    "",
    "---",
    "_Auto-attached game context:_",
    `- Season: ${year} · Week ${week} · ${phase}`,
    `- Screen: ${tab} · Runtime: ${runtimeMode}`,
    ...fingerprintRows.map((row) => `- Franchise/${row.label}: ${row.value}`),    ...(ctx.playtestReceipt ? [
      `- Playtest/Clarity: ${ctx.playtestReceipt.ratings.clarity}/5`,
      `- Playtest/Agency: ${ctx.playtestReceipt.ratings.agency}/5`,
      `- Playtest/Pace: ${ctx.playtestReceipt.ratings.pace}/5`,
      `- Playtest/Return intent: ${ctx.playtestReceipt.ratings.returnIntent}/5`,
      ...(ctx.playtestReceipt.note ? [`- Playtest/Note: ${ctx.playtestReceipt.note}`] : [])
    ] : []),
    ...readinessRows.map((row) => `- Readiness/${row.area}: ${row.status} — ${row.detail}`),
    ...(omittedCount ? [`- Disclosure budget: ${omittedCount} excess context row${omittedCount === 1 ? " was" : "s were"} omitted.`] : []),
    ctx.playtestReceipt
      ? "- Playtest receipt: explicitly selected for this report."
      : "- Playtest receipt: not attached — local receipts stay private unless selected."
  ];
  const params = new URLSearchParams({
    title: `[Beta feedback] ${phase === "?" ? "general" : phase} — ${tab === "?" ? "game" : tab}`,
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

function gatherContext({ includePlaytestReceipt = false } = {}) {
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
    playtestReceipt: includePlaytestReceipt
      ? selectPublishedPlaytestReceipt(loadLocalPlaytestReceipts()[0])
      : null,
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
  const includePlaytestReceipt = document.getElementById("attachLatestPlaytestReceiptInput")?.checked === true;
  const ctx = gatherContext({ includePlaytestReceipt });
  const url = buildFeedbackIssueUrl(ctx);
  commitFeedbackNavigation({ popup, url, browser: window });
  showToast(includePlaytestReceipt && ctx.playtestReceipt
    ? "Feedback form opened with the selected local receipt."
    : "Feedback form opened — local receipts stayed private.");
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
        <label class="playtest-attach-choice"><input id="attachLatestPlaytestReceiptInput" type="checkbox" /> Attach the latest local receipt to my next feedback report</label>
        <p id="playtestAttachmentPreview" class="small" aria-live="polite">No receipt selected. Local ratings and notes remain on this device.</p>
        <p id="playtestJourneyDisclosure" class="small">Export includes only your saved ratings plus allowlisted relative journey checkpoints. It excludes accounts, tokens, absolute journey timestamps, and save data.</p>
        <div id="playtestTrend" class="playtest-trend small" aria-live="polite"></div>
      </details>`;
    settingsTab.insertBefore(panel, settingsTab.firstElementChild);
    document.getElementById("betaFeedbackBtn")?.addEventListener("click", () => {
      openFeedback().catch(reportFeedbackError);
    });
    const refreshReceiptCount = () => {
      const receipts = loadLocalPlaytestReceipts();
      const count = receipts.length;
      const target = document.getElementById("playtestReceiptCount");
      const packet = buildLocalPlaytestExport(receipts);
      if (target) target.textContent = `${count} local receipt${count === 1 ? "" : "s"} · ${packet.journey.eventCount} journey checkpoint${packet.journey.eventCount === 1 ? "" : "s"}`;
      const trend = buildLocalPlaytestTrend(receipts);
      const trendTarget = document.getElementById("playtestTrend");
      if (trendTarget) trendTarget.textContent = trend.available
        ? `Local signal (${trend.count}): clarity ${trend.averages.clarity}/5 · agency ${trend.averages.agency}/5 · pace ${trend.averages.pace}/5 · another session ${trend.averages.returnIntent}/5. ${trend.warning}`
        : `${trend.count}/${trend.minimum} receipts recorded before a local trend is shown. ${trend.warning}`;
      const attach = document.getElementById("attachLatestPlaytestReceiptInput");
      if (attach) {
        attach.disabled = count === 0;
        if (!count) attach.checked = false;
      }
      const preview = document.getElementById("playtestAttachmentPreview");
      const selected = attach?.checked ? selectPublishedPlaytestReceipt(receipts[0]) : null;
      if (preview) preview.textContent = selected
        ? `Selected for the next report: clarity ${selected.ratings.clarity}/5 · agency ${selected.ratings.agency}/5 · pace ${selected.ratings.pace}/5 · another session ${selected.ratings.returnIntent}/5${selected.note ? " · note included" : " · no note"}.`
        : "No receipt selected. Local ratings and notes remain on this device.";
    };
    document.getElementById("attachLatestPlaytestReceiptInput")?.addEventListener("change", refreshReceiptCount);
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
