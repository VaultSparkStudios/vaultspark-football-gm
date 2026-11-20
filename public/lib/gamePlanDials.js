// The pace / run-pass lean / coverage dials under the weekly tactic choice.
// Loaded on demand the first time the weekly plan modal opens, so the dials
// cost nothing at boot. Ids and copy come from gamePlanDepth.js — the same
// declaration the command boundary and the drive engine read.
import {
  GAME_PLAN_DIMENSIONS,
  activeGamePlan,
  describeGamePlan,
  gamePlanOption,
  neutralGamePlan,
  normalizeGamePlan
} from "./gamePlanDepth.js";

// The selection lives for the page session, so next week's modal opens on what
// the player last set; a reload starts back at neutral.
let weeklyGamePlan = neutralGamePlan();

/**
 * What the player left set, in the shape the weekly plan composer sends:
 * `{ dials, summary }` with only the dials moved off neutral, or null when
 * every dial is at its middle.
 */
export function readWeeklyGamePlan() {
  const dials = activeGamePlan(weeklyGamePlan);
  return dials ? { dials, summary: describeGamePlan(dials) } : null;
}

/** Render the three segmented controls into `host` and wire them. */
export function mountGamePlanDials(host) {
  if (!host) return;
  weeklyGamePlan = normalizeGamePlan(weeklyGamePlan);
  host.innerHTML = GAME_PLAN_DIMENSIONS.map((dimension) => {
    const labelId = `gamePlan-${dimension.key}-label`;
    const tradeId = `gamePlan-${dimension.key}-trade`;
    const current = weeklyGamePlan[dimension.key];
    return `<div class="game-plan-dial" data-game-plan-dial="${dimension.key}">
      <span class="game-plan-dial-label" id="${labelId}">${dimension.label}</span>
      <div class="game-plan-segments" role="radiogroup" aria-labelledby="${labelId}" aria-describedby="${tradeId}">
        ${dimension.options.map((option) => `<button type="button" role="radio" class="game-plan-segment" data-game-plan-key="${dimension.key}" data-game-plan-value="${option.id}" aria-checked="${option.id === current}" tabindex="${option.id === current ? 0 : -1}">${option.label}</button>`).join("")}
      </div>
      <small class="game-plan-trade" id="${tradeId}">${gamePlanOption(dimension.key, current).trade}</small>
    </div>`;
  }).join("");
  const choose = (button, { focus = false } = {}) => {
    const key = button.dataset.gamePlanKey;
    const option = gamePlanOption(key, button.dataset.gamePlanValue);
    if (!option) return;
    weeklyGamePlan = { ...weeklyGamePlan, [key]: option.id };
    host.querySelectorAll(`[data-game-plan-key="${key}"]`).forEach((candidate) => {
      const selected = candidate === button;
      candidate.setAttribute("aria-checked", selected ? "true" : "false");
      candidate.tabIndex = selected ? 0 : -1;
    });
    const trade = host.querySelector(`#gamePlan-${key}-trade`);
    if (trade) trade.textContent = option.trade;
    if (focus) button.focus();
  };
  host.querySelectorAll(".game-plan-segment").forEach((button) => {
    button.onclick = () => choose(button);
    button.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const group = Array.from(host.querySelectorAll(`[data-game-plan-key="${button.dataset.gamePlanKey}"]`));
      const index = group.indexOf(button);
      const next = event.key === "Home" ? 0
        : event.key === "End" ? group.length - 1
          : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + group.length) % group.length;
      choose(group[next], { focus: true });
    };
  });
  host.hidden = false;
}
