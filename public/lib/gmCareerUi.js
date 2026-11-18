/**
 * GM career screens — the dismissal moment, the job market, resignation, and
 * the words that make the stakes visible before they bite.
 *
 * Loaded on demand only (`import("./gmCareerUi.js")`), never statically: the
 * boot payload has no room for screens most sessions never open. The server
 * decides everything shown here — `dashboard.gmCareer` carries the status, the
 * offers and the copy; this module only draws it and sends the choice back
 * through POST /api/career.
 */

import { api, state } from "./appState.js";
import { escapeHtml, presentActionError, runAction } from "./appCore.js";
import { applyDashboard, hydrateTab, invalidateHydrationDomains } from "./gameFlow.js";
import { closeModal, openModal } from "./modalManager.js";

const OVERLAY_ID = "gmCareerOverlay";
const WARNING_ID = "gmCareerWarning";

let overlayStep = null;
let switchBound = false;

const career = () => state.dashboard?.gmCareer || null;

async function refreshAfterCareerChange(response) {
  applyDashboard(response.state);
  invalidateHydrationDomains();
  await hydrateTab(state.activeTab || "overviewTab", { force: true });
}

// ── Free choice of club (Sandbox rules only) ─────────────────────────────────

function syncTeamSwitch(view) {
  const select = document.getElementById("teamSelect");
  const control = select?.closest("label");
  if (!select || !control) return;
  control.hidden = view?.freeTeamSwitch !== true;
  if (switchBound) return;
  switchBound = true;
  select.addEventListener("change", (event) =>
    runAction(async () => {
      const response = await api("/api/control-team", { method: "POST", body: { teamId: event.target.value } });
      await refreshAfterCareerChange(response);
    }, "Switching team...")
  );
}

// ── The stakes, in words, beside the owner's patience ────────────────────────

function syncWarning(view) {
  const banner = document.getElementById("ownerUltimatumBanner");
  if (!banner) return;
  banner.querySelector(`#${WARNING_ID}`)?.remove();
  if (!view?.warning || view.dismissed) return;
  const note = document.createElement("div");
  note.id = WARNING_ID;
  note.className = "ultimatum-banner gm-career-warning";
  note.setAttribute("role", "status");
  note.innerHTML = `
    <div class="ultimatum-body">
      <strong>Your job is on the line</strong>
      <span>${escapeHtml(view.warning)}</span>
    </div>`;
  banner.append(note);
  banner.hidden = false;
}

// ── Overlay ──────────────────────────────────────────────────────────────────

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "gm-career-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "gmCareerTitle");
  overlay.dataset.testid = "gm-career-overlay";
  document.body.append(overlay);
  return overlay;
}

function showOverlay(step, html, { dismissible = false } = {}) {
  const overlay = ensureOverlay();
  overlay.innerHTML = `<div class="gm-career-card" data-step="${escapeHtml(step)}">${html}</div>`;
  overlay.dataset.step = step;
  overlay.hidden = false;
  overlayStep = step;
  // A required choice cannot be skipped: Escape is swallowed unless this step
  // is one the player opened voluntarily.
  openModal(overlay, { onClose: dismissible ? closeOverlay : () => {} });
  // Read the heading first; the action buttons follow in tab order.
  overlay.querySelector("#gmCareerTitle")?.focus({ preventScroll: true });
  overlay.scrollTop = 0;
  return overlay;
}

function closeOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  overlayStep = null;
  if (!overlay) return;
  closeModal(overlay);
  overlay.hidden = true;
  overlay.replaceChildren();
}

function seasonsText(count) {
  return `${count} season${count === 1 ? "" : "s"}`;
}

function showDismissal(view) {
  const dismissal = view.dismissal;
  const resigned = dismissal.reason === "resigned";
  const overlay = showOverlay("dismissal", `
    <p class="gm-career-kicker">${escapeHtml(dismissal.teamName)} · ${escapeHtml(String(dismissal.year ?? ""))}</p>
    <h2 id="gmCareerTitle" tabindex="-1">${resigned ? "You have stepped down" : "You have been relieved of your duties"}</h2>
    <p class="gm-career-lede">${escapeHtml(dismissal.summary)}</p>
    <dl class="gm-career-facts">
      <div><dt>Your time in charge</dt><dd>${escapeHtml(seasonsText(Number(dismissal.seasons) || 0))}</dd></div>
      <div><dt>Record</dt><dd>${escapeHtml(dismissal.record || "0-0")}</dd></div>
    </dl>
    <p class="gm-career-note">The league carries on. Your career record goes with you to the next club.</p>
    <div class="gm-career-actions">
      <button type="button" class="btn-primary" data-career-action="market">See the job market</button>
    </div>`);
  overlay.querySelector("[data-career-action='market']").addEventListener("click", () => showJobMarket(career()));
}

function offerCard(offer) {
  const records = (offer.recentRecords || [])
    .map((row) => `<li><span>${escapeHtml(String(row.year))}</span> <strong>${escapeHtml(row.record)}</strong></li>`)
    .join("");
  return `
    <article class="gm-career-offer" data-team="${escapeHtml(offer.teamId)}" data-kind="${escapeHtml(offer.kind)}">
      <header>
        <h3>${escapeHtml(offer.name)}</h3>
        <span class="gm-career-kind">${escapeHtml(offer.kindLabel)}</span>
      </header>
      <p>${escapeHtml(offer.pitch)}</p>
      <dl class="gm-career-facts">
        <div><dt>Last three seasons</dt><dd><ul class="gm-career-records">${records || "<li>No finished season yet</li>"}</ul></dd></div>
        <div><dt>Salary cap</dt><dd>${escapeHtml(offer.capText)}</dd></div>
        <div><dt>What the owner expects</dt><dd>${escapeHtml(offer.expectation)}</dd></div>
      </dl>
      <button type="button" class="btn-primary" data-career-take="${escapeHtml(offer.teamId)}"
        aria-label="Take the ${escapeHtml(offer.name)} job">Take the job</button>
    </article>`;
}

function showJobMarket(view) {
  if (!view?.dismissed) { closeOverlay(); return; }
  const standing = view.standing || {};
  const standingText = Number(standing.seasons) > 0
    ? `Your career record is ${standing.record} over ${seasonsText(Number(standing.seasons))}${standing.label ? ` — ${standing.label}` : ""}. That record decides who calls.`
    : "You have no finished season on your record yet, so only clubs starting over are calling.";
  const offers = view.offers || [];
  const overlay = showOverlay("market", `
    <p class="gm-career-kicker">Job market</p>
    <h2 id="gmCareerTitle" tabindex="-1">Choose your next club</h2>
    <p class="gm-career-lede">${escapeHtml(standingText)}</p>
    <div class="gm-career-offers">
      ${offers.length ? offers.map(offerCard).join("") : `<p class="gm-career-note">No club is hiring right now. You can start a new league.</p>`}
    </div>
    <div class="gm-career-actions">
      <a class="gm-career-link" href="./" data-career-action="new-league">Start a new league</a>
    </div>`);
  overlay.querySelectorAll("[data-career-take]").forEach((button) => {
    button.addEventListener("click", () => takeJob(button.dataset.careerTake, button));
  });
  overlay.querySelector("[data-career-action='new-league']").addEventListener("click", (event) => {
    event.preventDefault();
    leaveForStartPage().catch(presentActionError);
  });
}

async function leaveForStartPage() {
  const recovery = await import("./clientRecoveryUi.js");
  await recovery.flushLocalSessionCheckpoint();
  window.location.href = new URL("./", document.baseURI).toString();
}

function takeJob(teamId, button) {
  const overlay = document.getElementById(OVERLAY_ID);
  const buttons = [...(overlay?.querySelectorAll("button") || [])];
  return runAction(async () => {
    const response = await api("/api/career", { method: "POST", body: { action: "take-job", teamId } });
    closeOverlay();
    await refreshAfterCareerChange(response);
    const club = state.dashboard?.controlledTeam?.name || teamId;
    return { actionStatus: "committed", statusText: `You are the new general manager of ${club}.` };
  }, "Taking the job...", { key: "gm-career", controls: buttons.length ? buttons : [button] });
}

// ── Resignation (voluntary — Escape and "Stay" both back out) ────────────────

export function confirmResign() {
  const view = career();
  if (!view || view.dismissed) return syncGmCareer();
  const club = state.dashboard?.controlledTeam?.name || "your club";
  const overlay = showOverlay("resign", `
    <p class="gm-career-kicker">Boardroom</p>
    <h2 id="gmCareerTitle" tabindex="-1">Resign as general manager?</h2>
    <p class="gm-career-lede">You will leave ${escapeHtml(club)} today. This cannot be undone. You then choose from the clubs willing to hire you, or start a new league.</p>
    <div class="gm-career-actions">
      <button type="button" class="warn" data-career-action="resign">Resign</button>
      <button type="button" data-career-action="stay">Stay</button>
    </div>`, { dismissible: true });
  overlay.querySelector("[data-career-action='stay']").addEventListener("click", closeOverlay);
  overlay.querySelector("[data-career-action='resign']").addEventListener("click", (event) =>
    runAction(async () => {
      const response = await api("/api/career", { method: "POST", body: { action: "resign" } });
      closeOverlay();
      await refreshAfterCareerChange(response);
      syncGmCareer();
      return { actionStatus: "committed", statusText: "You have resigned." };
    }, "Resigning...", { key: "gm-career", controls: [event.currentTarget] })
  );
  return overlay;
}

// ── Entry point ──────────────────────────────────────────────────────────────

/** Bring every career surface in line with the dashboard the server just sent. */
export function syncGmCareer() {
  const view = career();
  // Once loaded, keep syncing on every dashboard so a rules change is reflected.
  state.gmCareerUi = true;
  syncTeamSwitch(view);
  syncWarning(view);
  if (view?.dismissed) {
    // Keep the player's place if the market is already open; otherwise start
    // with the moment itself.
    if (overlayStep === "market") showJobMarket(view);
    else if (overlayStep !== "dismissal") showDismissal(view);
  } else if (overlayStep === "dismissal" || overlayStep === "market") {
    closeOverlay();
  }
  return view;
}
