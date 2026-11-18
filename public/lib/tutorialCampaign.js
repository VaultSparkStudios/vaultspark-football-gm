import { browserStorage } from "./browserStorage.js";
// Opening Contract: skippable identity, pressure and scouting choices on one screen.

import { closeModal, openModal } from "./modalManager.js";
import { buildStartScenarioRequest } from "./startScenarioContract.js";
import { franchiseStorageKey } from "./franchiseScope.js";

const TUTORIAL_SEEN_PREFIX = "vsfgm:tutorial-seen:v2";

export function tutorialSeenKey(scope = {}) {
  return franchiseStorageKey(TUTORIAL_SEEN_PREFIX, scope);
}

export function getTutorialState(scope = {}, storage = browserStorage()) {
  try {
    const value = storage?.getItem?.(tutorialSeenKey(scope));
    return value === "done" || value === "deferred" ? value : null;
  } catch { return null; }
}

export function hasTutorialBeenSeen(scope = {}, storage = browserStorage()) {
  return getTutorialState(scope, storage) !== null;
}

export function markTutorialSeen(scope = {}, storage = browserStorage(), status = "done") {
  try { storage?.setItem?.(tutorialSeenKey(scope), status === "deferred" ? "deferred" : "done"); } catch {}
}

export function resetTutorial(scope = {}, storage = browserStorage()) {
  try { storage?.removeItem?.(tutorialSeenKey(scope)); } catch {}
}

// ── The three opening calls ───────────────────────────────────────────────────
// All three are asked on one screen. Each call's `id` is the key the engine
// expects in the start-scenario request; `fallback` is the middle-of-the-road
// answer that starts selected, so a new GM can confirm in one click.

export const OPENING_CALLS = Object.freeze([
  {
    id: "identity",
    fallback: "balanced",
    title: "Who Are You Building?",
    body: "Your scheme shapes which players thrive here. You can refine it later.",
    choices: [
      {
        id: "air-raid",
        label: "Air Raid Offense",
        sub: "Speed, spacing, pass-first. Your QB needs to be elite to survive.",
        tip: "Scheme fit for WRs with Route Running ≥ 80 will be High."
      },
      {
        id: "ground-control",
        label: "Ground Control",
        sub: "Physical, clock-eating, win the line of scrimmage. Patient owner required.",
        tip: "Scheme fit for Power RBs and blocking TEs will be High."
      },
      {
        id: "balanced",
        label: "Balanced Attack",
        sub: "Flexibility over identity. Easier to build but harder to dominate.",
        tip: "Broader scheme fit tolerance. Good for a rebuilding franchise."
      }
    ]
  },
  {
    id: "pressure",
    fallback: "balanced-mandate",
    title: "Your Owner Sets the Table",
    body: "Owner patience decides how long you have before the hot seat arrives.",
    choices: [
      {
        id: "win-now",
        label: "Win Now",
        sub: "The owner expects playoffs in Year 1. You'll be judged quickly.",
        tip: "Owner patience is LOW. Hot-seat pressure arrives fast if you miss."
      },
      {
        id: "rebuild",
        label: "Full Rebuild",
        sub: "The owner wants a dynasty, not a quick fix. You have time — use it wisely.",
        tip: "Owner patience is HIGH. Trade veterans for picks. Build for Year 4+."
      },
      {
        id: "balanced-mandate",
        label: "Measured Progress",
        sub: "Make the playoffs within 3 years. Consistent growth expected.",
        tip: "Owner patience is MODERATE. Missing the playoffs two years in a row triggers hot-seat."
      }
    ]
  },
  {
    id: "first-call",
    fallback: "trust-scout",
    title: "Your Scout Calls",
    body: "It's Week 1 of your first season and your scouting director flags a prospect.",
    choices: [
      {
        id: "trust-scout",
        label: "Trust the Report",
        sub: "Pin the first real prospect your director flags once the draft class exists.",
        tip: "Scouting confidence is built by weekly points invested + staff skill. Low investment = low confidence."
      },
      {
        id: "wait-more-info",
        label: "Request More Scouting",
        sub: "Reserve six points for a deeper read on the first real prospect your director flags.",
        tip: "More points → higher reveal quality at draft time. The board rewards patience."
      },
      {
        id: "ignore",
        label: "Pass on This Prospect",
        sub: "Move on. Not every signal is worth chasing.",
        tip: "If your board is weak, every miss compounds. Build scout depth before being selective."
      }
    ]
  }
]);

export function defaultOpeningSelections() {
  return Object.fromEntries(OPENING_CALLS.map((call) => [call.id, call.fallback]));
}

export function openingContractMarkup(selections = defaultOpeningSelections()) {
  return `
      <div class="tutorial-modal tutorial-single">
        <div class="tutorial-header">
          <div class="brand-kicker">Opening Contract · Year 1</div>
          <h2 id="tutorial-title">Three calls to start your first season</h2>
        </div>
        <p class="tutorial-body">Choose how you play, what your owner expects and how you scout.
          A middle-of-the-road answer is already selected for each, so you can change any of them or start as is.</p>
        ${OPENING_CALLS.map((call, index) => `
        <section class="tutorial-group" data-step="${call.id}" role="group" aria-labelledby="tutorial-call-${call.id}">
          <h3 id="tutorial-call-${call.id}" class="tutorial-group-title">${index + 1}. ${call.title}</h3>
          <p class="tutorial-group-body">${call.body}</p>
          <div class="tutorial-choices">
            ${call.choices.map((c) => `
            <button type="button" class="tutorial-choice ${selections[call.id] === c.id ? "selected" : ""}"
                    data-choice="${c.id}" aria-pressed="${selections[call.id] === c.id}">
              <div class="choice-label">${c.label}</div>
              <div class="choice-sub">${c.sub}</div>
              <div class="choice-tip">${c.tip}</div>
            </button>`).join("")}
          </div>
        </section>`).join("")}
        <div class="tutorial-actions">
          <button type="button" class="btn-ghost tutorial-skip" id="tutSkipBtn">Skip for now</button>
          <button type="button" class="btn-primary tutorial-next" id="tutNextBtn">Start My Franchise</button>
        </div>
      </div>`;
}

// ── Mount the Opening Contract ────────────────────────────────────────────────

export function mountTutorial({ onComplete, onSkip, scope = {}, completed = false, storage = browserStorage() }) {
  if (completed || hasTutorialBeenSeen(scope, storage)) { onSkip?.(); return; }

  const selections = defaultOpeningSelections();

  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "tutorial-title");
  document.body.appendChild(overlay);

  function dismissTutorial(callback) {
    closeModal(overlay);
    // Skipping defers the Opening Contract rather than completing it, so it
    // stays available later (Overview, Settings, command palette). A contract
    // that was applied stays "done": closing must never downgrade it.
    if (getTutorialState(scope, storage) !== "done") {
      markTutorialSeen(scope, storage, "deferred");
    }
    overlay.remove();
    callback?.(selections);
  }

  overlay.innerHTML = openingContractMarkup(selections);

  for (const group of overlay.querySelectorAll(".tutorial-group")) {
    const buttons = group.querySelectorAll(".tutorial-choice");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        selections[group.dataset.step] = btn.dataset.choice;
        buttons.forEach((b) => {
          const selected = b === btn;
          b.classList.toggle("selected", selected);
          b.setAttribute("aria-pressed", selected);
        });
      });
    });
  }

  overlay.querySelector("#tutSkipBtn").addEventListener("click", () => {
    dismissTutorial(onSkip);
  });

  const confirmButton = overlay.querySelector("#tutNextBtn");
  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    confirmButton.textContent = "Applying Contract…";
    try {
      const receipt = await onComplete?.(buildStartScenarioRequest(selections));
      if (!receipt?.effects) throw new Error("The league did not confirm your Opening Contract. Try again.");
      markTutorialSeen(scope, storage);
      // The applied choices stay on the Overview's Opening Contract card, so
      // there is no second screen to click through.
      dismissTutorial();
    } catch (error) {
      confirmButton.disabled = false;
      confirmButton.textContent = "Retry Applying Contract";
      let errorEl = overlay.querySelector(".tutorial-error");
      if (!errorEl) {
        errorEl = document.createElement("p");
        errorEl.className = "tutorial-error";
        errorEl.setAttribute("role", "alert");
        overlay.querySelector(".tutorial-actions")?.before(errorEl);
      }
      errorEl.textContent = error?.message || "The opening contract could not be applied. Nothing was marked complete.";
    }
  });

  // The style element is injected immediately before first mount. Force one
  // layout flush before focus so the fixed overlay never behaves like an
  // unstyled page-end node and scrolls the document during first paint.
  void overlay.offsetWidth;
  openModal(overlay, { onClose: () => dismissTutorial(onSkip) });
}

// Compatibility export; tutorial rules are delivered by the app stylesheet.

export function injectTutorialStyles() { /* Styles ship in styles.css. */ }
