// Situational calls — the club's standing game-day posture for fourth downs and
// the two-minute drill. Loaded lazily from the Desk so it adds nothing to boot.
import { state, api } from "./appState.js";
import { escapeHtml, showToast } from "./appCore.js";

const GROUPS = [
  {
    key: "fourthDown",
    label: "4th down",
    options: [
      { value: "conservative", label: "Conservative", help: "Punt or kick unless it's a sure thing." },
      { value: "by-the-book", label: "By the book", help: "Your coaches make the usual call for the spot and score." },
      { value: "aggressive", label: "Aggressive", help: "Keep the offense on the field more often on fourth and short." }
    ]
  },
  {
    key: "twoMinute",
    label: "Two-minute drill",
    note: "End of each half, when you trail or the game is tied.",
    options: [
      { value: "protect", label: "Protect the ball", help: "Fewer snaps and more runs. Don't give it away." },
      { value: "standard", label: "Standard", help: "Your normal offense, no change in pace." },
      { value: "hurry-up", label: "Hurry-up", help: "More snaps and more throws to get points before the break." }
    ]
  }
];

const DEFAULTS = { fourthDown: "by-the-book", twoMinute: "standard" };
let saving = false;

function currentCalls() {
  return { ...DEFAULTS, ...(state.dashboard?.controlledTeam?.situationalCalls || {}) };
}

export function renderSituationalCalls() {
  const card = document.getElementById("situationalCallsCard");
  if (!card) return;
  if (!state.dashboard?.controlledTeamId) {
    card.hidden = true;
    return;
  }
  const calls = currentCalls();
  card.hidden = false;
  card.innerHTML = `
    <div class="situational-calls-head">
      <h3 id="situationalCallsTitle">Situational calls</h3>
      <span class="small">Your standing orders on game day. They stay until you change them.</span>
    </div>
    ${GROUPS.map((group) => {
      const selected = group.options.find((option) => option.value === calls[group.key]) || group.options[1];
      const labelId = `situationalCalls-${group.key}`;
      return `
        <div class="situational-calls-row">
          <span id="${labelId}" class="situational-calls-label">${escapeHtml(group.label)}</span>
          <div class="team-mode-switch situational-calls-switch" role="group" aria-labelledby="${labelId}">
            ${group.options.map((option) => `
              <button type="button" data-situational-key="${group.key}" data-situational-value="${option.value}"
                aria-pressed="${option.value === selected.value}" ${saving ? "disabled" : ""}>${escapeHtml(option.label)}</button>`).join("")}
          </div>
          <span class="small situational-calls-help" aria-live="polite">${escapeHtml(selected.help)}${group.note ? ` ${escapeHtml(group.note)}` : ""}</span>
        </div>`;
    }).join("")}
  `;
  if (!card.dataset.wired) {
    card.dataset.wired = "1";
    card.addEventListener("click", (event) => {
      const button = event.target.closest?.("button[data-situational-key]");
      if (button && !button.disabled) choose(button.dataset.situationalKey, button.dataset.situationalValue);
    });
  }
}

async function choose(key, value) {
  if (saving || currentCalls()[key] === value) return;
  saving = true;
  renderSituationalCalls();
  try {
    const result = await api("/api/situational-calls", {
      method: "POST",
      body: { teamId: state.dashboard?.controlledTeamId, [key]: value }
    });
    if (state.dashboard?.controlledTeam) state.dashboard.controlledTeam.situationalCalls = result.situationalCalls;
    const option = GROUPS.find((group) => group.key === key)?.options.find((entry) => entry.value === value);
    showToast(`${key === "fourthDown" ? "4th down" : "Two-minute drill"}: ${option?.label || value}.`);
  } catch (error) {
    showToast(error?.message || "That call could not be saved.");
  } finally {
    saving = false;
    renderSituationalCalls();
    document.querySelector(`#situationalCallsCard button[data-situational-key="${key}"][aria-pressed="true"]`)?.focus();
  }
}
