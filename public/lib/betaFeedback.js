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

const REPO_ISSUE_BASE = "https://github.com/VaultSparkStudios/vaultspark-football-gm/issues/new";

/**
 * Build a prefilled GitHub new-issue URL.
 * @param {object} ctx { year, week, phase, tab, runtimeMode, appVersion }
 * @returns {string}
 */
export function buildFeedbackIssueUrl(ctx = {}) {
  const readinessRows = Array.isArray(ctx.launchReadinessRows) ? ctx.launchReadinessRows : [];
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

export async function openFeedback() {
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
  window.open(url, "_blank", "noopener");
  showToast(
    analyticsAttached
      ? "Feedback form opened — analytics digest copied, paste it in if you'd like."
      : "Feedback form opened — thanks for making the game better!"
  );
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
      <button id="betaFeedbackBtn" class="btn btn-accent" data-testid="beta-feedback-btn">Send Feedback</button>`;
    settingsTab.insertBefore(panel, settingsTab.firstElementChild);
    document.getElementById("betaFeedbackBtn")?.addEventListener("click", () => {
      openFeedback().catch(() => {});
    });
  }

  const fmModal = document.getElementById("franchiseMomentModal");
  if (fmModal && !document.getElementById("fmFeedbackLink")) {
    const link = document.createElement("button");
    link.id = "fmFeedbackLink";
    link.className = "fm-feedback-link";
    link.textContent = "Tell the Commissioner";
    link.addEventListener("click", () => {
      openFeedback().catch(() => {});
    });
    fmModal.appendChild(link);
  }
}
