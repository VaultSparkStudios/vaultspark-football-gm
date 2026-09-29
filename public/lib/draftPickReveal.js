/**
 * Draft pick reveal — the on-the-clock broadcast moment.
 *
 * S86 [audit #2]. Split out of tabDraft.js for two reasons:
 *
 *  1. `DRAFT_ANALYST_LINES` was read by `pickAnalystLine` but never declared
 *     anywhere in the repository. Because ES module scope is strict, that read
 *     threw a ReferenceError inside the awaited reveal, so the in-row "Draft"
 *     button rejected its promise and the /api/draft/user-pick request was
 *     never issued — silently, with no modal and no error surface.
 *  2. The draft island was sitting at 15.03% headroom against a 15% floor, so
 *     it had no room for the fix. This modal is user-triggered presentation,
 *     not part of the eager draft table render, which makes it the correct
 *     thing to move behind a dynamic import (the same pattern tabDraft.js
 *     already uses for the on-clock trade market panel).
 *
 * The caller treats a load failure as "proceed with the pick": the reveal is
 * flavour, and losing it must never cost the player their selection.
 */
import { state, TEAM_THEME_MAP } from "./appState.js";
import { recordClientDiagnostic } from "./clientDiagnostics.js";
import { escapeHtml } from "./appCore.js";
import { getProspectNarrative } from "./prospectNarratives.js";
import { closeModal, openModal } from "./modalManager.js";

const DRAFT_ANALYST_LINES = Object.freeze([
  "They had this card in early. No hesitation.",
  "Value meets need — that's a room that did its homework.",
  "Board's been shaken up. Someone just lost their guy.",
  "A quiet pick now, a loud one in three years.",
  "Character grades carried this one over the raw tools.",
  "That's the pick the tape said, not the one the crowd wanted.",
  "Front office trusted its scouts over the consensus board.",
  "Best player available, and it wasn't especially close."
]);

export function pickAnalystLine(seed) {
  if (!DRAFT_ANALYST_LINES.length) return "";
  const idx = Math.abs(seed || Date.now()) % DRAFT_ANALYST_LINES.length;
  return DRAFT_ANALYST_LINES[idx];
}

export function renderDraftPickReveal(modal, prospect, teamName, onConfirm, { round = null } = {}) {
  const body = modal.querySelector(".draft-reveal-body");
  if (body) {
    // S108 — the draft surface carries the scout's read, not the truth; the
    // reveal speaks to what the room knows at the moment of the pick.
    const shownOverall = prospect?.overall ?? prospect?.scouting?.scoutedOverall ?? null;
    const overallLabel = prospect?.overall != null ? "OVR" : "Scout OVR";
    const analyst = pickAnalystLine(
      (prospect?.name?.charCodeAt(0) || 0) + (shownOverall || 0)
    );
    body.innerHTML = `
      <div class="draft-reveal-clock">⏱ On the clock: <strong>${escapeHtml(teamName || "Your Team")}</strong></div>
      <div class="draft-reveal-pick">
        <div class="dr-pos-badge">${escapeHtml(prospect?.position || prospect?.pos || "?")}</div>
        <div class="dr-name">${escapeHtml(prospect?.name || "Unknown")}</div>
        <div class="dr-ovr">${overallLabel} ${shownOverall ?? "—"}</div>
      </div>
      <div class="draft-reveal-analyst">"${escapeHtml(analyst)}"</div>
      <div class="prospect-origin-note">${escapeHtml(getProspectNarrative(prospect).line)}</div>
      <button class="dr-confirm-btn btn-primary">Confirm Pick</button>
      <div class="moment-card-share-mount"></div>
    `;
    body.querySelector(".dr-confirm-btn")?.addEventListener("click", () => {
      closeModal(modal);
      modal.hidden = true;
      modal.classList.remove("active");
      onConfirm();
    }, { once: true });
    // S109 — only the first-round reveal is share-worthy; later rounds skip
    // the control entirely rather than mount one that never gets used.
    if (Number(round) === 1) mountDraftRevealShareControl(body, prospect, teamName, shownOverall);
  }
  modal.hidden = false;
  modal.classList.add("active");
  openModal(modal, {
    onClose: () => {
      modal.hidden = true;
      modal.classList.remove("active");
      closeModal(modal);
      onConfirm();
    }
  });
}

// S109 — the user's first-round pick reveal, loaded lazily so a player who
// never shares never pays for momentCard.js.
function mountDraftRevealShareControl(body, prospect, teamName, shownOverall) {
  const mount = body.querySelector(".moment-card-share-mount");
  if (!mount) return;
  import("./momentCard.js")
    .then((momentCard) => momentCard.mountDraftRevealShareControl(mount, { prospect, teamName, shownOverall, state, teamThemeMap: TEAM_THEME_MAP }))
    .catch((error) => recordClientDiagnostic({ surface: "moment-card", operation: "share-control", error, severity: "warning" }));
}
