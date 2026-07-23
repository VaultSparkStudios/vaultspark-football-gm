import { buildLocalPlaytestReceipt, saveLocalPlaytestReceipt } from "./playtestReceipts.js";

export const CONTEXTUAL_FEEDBACK_STORAGE_KEY = "vsfgm:contextual-feedback:v1";
export const CONTEXTUAL_FEEDBACK_CADENCE_MS = 7 * 24 * 60 * 60 * 1000;

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

export function loadContextualFeedbackLedger(storage = globalThis.localStorage) {
  const parsed = safeParse(storage?.getItem?.(CONTEXTUAL_FEEDBACK_STORAGE_KEY) || "{}", {});
  return {
    version: 1,
    lastPromptAt: Number(parsed.lastPromptAt) || 0,
    occurrences: parsed.occurrences && typeof parsed.occurrences === "object" ? parsed.occurrences : {}
  };
}

export function saveContextualFeedbackLedger(ledger, storage = globalThis.localStorage) {
  storage?.setItem?.(CONTEXTUAL_FEEDBACK_STORAGE_KEY, JSON.stringify(ledger));
  return ledger;
}

export function deriveContextualEvidenceMoments(dashboard = {}) {
  const teamId = dashboard.controlledTeamId || dashboard.controlledTeam?.id || "unknown";
  const moments = [];
  const latestChampion = (dashboard.champions || []).at(-1);
  if (Number(dashboard.seasonsSimulated) > 0 && latestChampion?.year != null) {
    moments.push({
      id: `season-${teamId}-${latestChampion.year}`,
      kind: "season-complete",
      kicker: "Season ledger closed",
      title: `How did the ${latestChampion.year} season feel?`,
      question: "Capture clarity, agency, pacing, and whether you want another season while the full arc is fresh."
    });
  }
  const selection = dashboard.draft?.controlledSelections?.[0];
  if (selection) {
    moments.push({
      id: `draft-${teamId}-${dashboard.draft.year}-${selection.pick}`,
      kind: "controlled-team-draft-selection",
      kicker: "Draft decision landed",
      title: `${selection.player || selection.pos || "Your selection"} joined the franchise`,
      question: "Was the board readable, did the choice feel like yours, and did the room move at the right pace?"
    });
  }
  const opening = dashboard.openingContractProgress;
  if (opening?.status === "completed" && opening.result) {
    moments.push({
      id: `opening-${teamId}-${dashboard.currentYear || dashboard.startYear || "year"}`,
      kind: "opening-contract-complete",
      kicker: "Opening contract complete",
      title: "Your first franchise promise has evidence",
      question: "Before the season opens up, record how clear, consequential, and well-paced that first command felt."
    });
  }
  return moments;
}

export function selectContextualEvidenceMoment({ dashboard = {}, ledger = {}, now = Date.now() } = {}) {
  const normalized = {
    lastPromptAt: Number(ledger.lastPromptAt) || 0,
    occurrences: ledger.occurrences || {}
  };
  if (normalized.lastPromptAt && now - normalized.lastPromptAt < CONTEXTUAL_FEEDBACK_CADENCE_MS) return null;
  return deriveContextualEvidenceMoments(dashboard).find((moment) => {
    const state = normalized.occurrences[moment.id] || {};
    return !state.completed && !state.dismissed && Number(state.snoozedUntil || 0) <= now;
  }) || null;
}

export function recordContextualFeedbackAction({ ledger = {}, momentId, action, now = Date.now() } = {}) {
  if (!momentId) throw new Error("A contextual evidence moment is required.");
  const next = {
    version: 1,
    lastPromptAt: action === "shown" ? now : Number(ledger.lastPromptAt) || 0,
    occurrences: { ...(ledger.occurrences || {}) }
  };
  const occurrence = { ...(next.occurrences[momentId] || {}) };
  if (action === "shown") occurrence.promptedAt = now;
  else if (action === "snooze") occurrence.snoozedUntil = now + CONTEXTUAL_FEEDBACK_CADENCE_MS;
  else if (action === "dismiss") occurrence.dismissed = true;
  else if (action === "saved") occurrence.completed = true;
  else throw new Error(`Unknown contextual feedback action: ${action}`);
  next.occurrences[momentId] = occurrence;
  return next;
}

function ratingField(id, label) {
  return `<label>${label}<select data-context-rating="${id}"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select></label>`;
}

export function maybeMountContextualFeedback(dashboard = {}, {
  storage = globalThis.localStorage,
  documentRef = globalThis.document,
  now = () => Date.now(),
  onSaved = () => {}
} = {}) {
  if (!documentRef?.body || documentRef.getElementById("contextualEvidencePrompt")) return null;
  const ledger = loadContextualFeedbackLedger(storage);
  const moment = selectContextualEvidenceMoment({ dashboard, ledger, now: now() });
  if (!moment) return null;

  const panel = documentRef.createElement("aside");
  panel.id = "contextualEvidencePrompt";
  panel.className = "contextual-evidence-prompt";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-labelledby", "contextualEvidenceTitle");
  panel.innerHTML = `
    <div class="contextual-evidence-head"><span>${escapeHtml(moment.kicker)}</span><button type="button" data-context-action="dismiss" aria-label="Dismiss this evidence prompt">×</button></div>
    <h2 id="contextualEvidenceTitle">${escapeHtml(moment.title)}</h2>
    <p>${escapeHtml(moment.question)}</p>
    <div class="contextual-evidence-ratings">
      ${ratingField("clarity", "Clarity")}${ratingField("agency", "Agency")}${ratingField("pace", "Pace")}${ratingField("returnIntent", "Another session")}
    </div>
    <label class="contextual-evidence-note">One moment worth preserving (optional)<textarea data-context-note maxlength="280" rows="2"></textarea></label>
    <p class="contextual-evidence-privacy">Saved only in this browser unless you explicitly export it. No save data or personal identifier is included.</p>
    <div class="contextual-evidence-actions"><button type="button" data-context-action="snooze">Ask in a week</button><button type="button" class="btn btn-accent" data-context-action="save">Save local receipt</button></div>`;

  const shownLedger = recordContextualFeedbackAction({ ledger, momentId: moment.id, action: "shown", now: now() });
  saveContextualFeedbackLedger(shownLedger, storage);
  panel.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-context-action]");
    if (!button) return;
    const action = button.dataset.contextAction;
    const currentLedger = loadContextualFeedbackLedger(storage);
    if (action === "save") {
      const value = (name) => panel.querySelector(`[data-context-rating="${name}"]`)?.value;
      const receipt = buildLocalPlaytestReceipt({
        clarity: value("clarity"), agency: value("agency"), pace: value("pace"), returnIntent: value("returnIntent"),
        note: panel.querySelector("[data-context-note]")?.value
      }, {
        year: dashboard.currentYear, week: dashboard.currentWeek, phase: dashboard.phase,
        teamId: dashboard.controlledTeamId, openingContractStatus: dashboard.openingContractProgress?.status,
        evidenceMoment: moment.kind
      });
      saveLocalPlaytestReceipt(receipt, storage);
      saveContextualFeedbackLedger(recordContextualFeedbackAction({ ledger: currentLedger, momentId: moment.id, action: "saved", now: now() }), storage);
      onSaved(receipt);
      panel.remove();
      return;
    }
    const ledgerAction = action === "snooze" ? "snooze" : "dismiss";
    saveContextualFeedbackLedger(recordContextualFeedbackAction({ ledger: currentLedger, momentId: moment.id, action: ledgerAction, now: now() }), storage);
    panel.remove();
  });
  const host = documentRef.getElementById("overviewTab") || documentRef.body;
  host.prepend(panel);
  return moment;
}