/**
 * Tutorial Campaign — Year 1 Franchise Challenge
 *
 * A guided 3-decision intro scenario that surfaces scheme fit,
 * owner patience, and scouting confidence in context BEFORE the player
 * touches a full league.
 *
 * Fully skippable. State persisted to localStorage so it doesn't repeat.
 * Renders as an overlay modal on first league creation.
 *
 * Steps:
 *   1. IDENTITY    — pick your franchise identity (scheme + culture)
 *   2. PRESSURE    — your owner delivers the mandate (win expectation)
 *   3. FIRST CALL  — a scout calls with a prospect flag (scouting confidence demo)
 *
 * After step 3, the tutorial resolves and the player enters the full game.
 */

import { closeModal, openModal } from "./modalManager.js";
import { buildStartScenarioRequest } from "./startScenarioContract.js";
import { franchiseStorageKey } from "./franchiseScope.js";

const TUTORIAL_SEEN_PREFIX = "vsfgm:tutorial-seen:v2";

export function tutorialSeenKey(scope = {}) {
  return franchiseStorageKey(TUTORIAL_SEEN_PREFIX, scope);
}

export function getTutorialState(scope = {}, storage = globalThis.localStorage) {
  const value = storage?.getItem?.(tutorialSeenKey(scope));
  return value === "done" || value === "deferred" ? value : null;
}

export function hasTutorialBeenSeen(scope = {}, storage = globalThis.localStorage) {
  return getTutorialState(scope, storage) !== null;
}

export function markTutorialSeen(scope = {}, storage = globalThis.localStorage, status = "done") {
  storage?.setItem?.(tutorialSeenKey(scope), status === "deferred" ? "deferred" : "done");
}

export function resetTutorial(scope = {}, storage = globalThis.localStorage) {
  storage?.removeItem?.(tutorialSeenKey(scope));
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "identity",
    title: "Who Are You Building?",
    body: `Every franchise has an identity. Your scheme shapes which players thrive here.
           Your owner's personality determines how much rope you get to build it.
           Choose your starting direction — you can refine this later.`,
    choices: [
      {
        id: "air-raid",
        label: "Air Raid Offense",
        sub: "Speed, spacing, pass-first. Your QB needs to be elite to survive.",
        schemeTip: "Scheme fit for WRs with Route Running ≥ 80 will be High."
      },
      {
        id: "ground-control",
        label: "Ground Control",
        sub: "Physical, clock-eating, win the line of scrimmage. Patient owner required.",
        schemeTip: "Scheme fit for Power RBs and blocking TEs will be High."
      },
      {
        id: "balanced",
        label: "Balanced Attack",
        sub: "Flexibility over identity. Easier to build but harder to dominate.",
        schemeTip: "Broader scheme fit tolerance. Good for a rebuilding franchise."
      }
    ]
  },
  {
    id: "pressure",
    title: "Your Owner Sets the Table",
    body: null, // dynamically set based on prior choice
    choices: [
      {
        id: "win-now",
        label: "Win Now",
        sub: "The owner expects playoffs in Year 1. You'll be judged quickly.",
        ownerTip: "Owner patience is LOW. Hot-seat pressure arrives fast if you miss."
      },
      {
        id: "rebuild",
        label: "Full Rebuild",
        sub: "The owner wants a dynasty, not a quick fix. You have time — use it wisely.",
        ownerTip: "Owner patience is HIGH. Trade veterans for picks. Build for Year 4+."
      },
      {
        id: "balanced-mandate",
        label: "Measured Progress",
        sub: "Make the playoffs within 3 years. Consistent growth expected.",
        ownerTip: "Owner patience is MODERATE. Missing the playoffs two years in a row triggers hot-seat."
      }
    ]
  },
  {
    id: "first-call",
    title: "Your Scout Calls",
    body: `It's Week 1 of your first season. Your scouting director flags a prospect.
           You can act on this signal or wait — but scouting confidence decays if you ignore your board.
           Invest in your scouts and they bring you better intel.`,
    choices: [
      {
        id: "trust-scout",
        label: "Trust the Report",
        sub: "Pin the first real prospect your director flags once the draft class exists.",
        scoutTip: "Scouting confidence is built by weekly points invested + staff skill. Low investment = low confidence."
      },
      {
        id: "wait-more-info",
        label: "Request More Scouting",
        sub: "Reserve six points for a deeper read on the first real prospect your director flags.",
        scoutTip: "More points → higher reveal quality at draft time. The board rewards patience."
      },
      {
        id: "ignore",
        label: "Pass on This Prospect",
        sub: "Move on. Not every signal is worth chasing.",
        scoutTip: "If your board is weak, every miss compounds. Build scout depth before being selective."
      }
    ]
  }
];

// ── Mount tutorial modal ──────────────────────────────────────────────────────

export function mountTutorial({ onComplete, onSkip, scope = {}, completed = false, storage = globalThis.localStorage }) {
  if (completed || hasTutorialBeenSeen(scope, storage)) { onSkip?.(); return; }

  let currentStep = 0;
  const selections = {};

  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "tutorial-title");
  document.body.appendChild(overlay);

  function dismissTutorial(callback) {
    closeModal(overlay);
    // Skipping is an explicit deferral receipt, not completion — the Opening
    // Contract stays declarable later (Overview CTA, Settings, command palette).
    // A contract that was applied stays "done": the receipt screen's own
    // dismiss must never downgrade completion to deferral.
    if (getTutorialState(scope, storage) !== "done") {
      markTutorialSeen(scope, storage, "deferred");
    }
    overlay.remove();
    callback?.(selections);
  }

  function renderReceipt(receipt) {
    closeModal(overlay);
    const modal = document.createElement("div");
    modal.className = "tutorial-modal tutorial-receipt";

    const header = document.createElement("div");
    header.className = "tutorial-header";
    const kicker = document.createElement("div");
    kicker.className = "brand-kicker";
    kicker.textContent = "Opening Contract Applied";
    const title = document.createElement("h2");
    title.id = "tutorial-title";
    title.textContent = "Your franchise now carries these choices";
    header.append(kicker, title);

    const list = document.createElement("div");
    list.className = "tutorial-receipt-list";
    for (const key of ["identity", "pressure", "scouting"]) {
      const effect = receipt.effects?.[key];
      if (!effect) continue;
      const row = document.createElement("article");
      row.className = "tutorial-receipt-row";
      const label = document.createElement("strong");
      label.textContent = effect.label || key;
      const detail = document.createElement("p");
      detail.textContent = effect.description || "";
      const status = document.createElement("span");
      status.className = "small";
      status.textContent = key === "scouting" && effect.status === "pending-draft-class"
        ? "Saved for later: this call applies to the draft class as soon as it is revealed."
        : "Applied from the current league state.";
      row.append(label, detail, status);
      list.appendChild(row);
    }

    const actions = document.createElement("div");
    actions.className = "tutorial-actions";
    const enter = document.createElement("button");
    enter.type = "button";
    enter.className = "btn-primary tutorial-next";
    enter.textContent = "Enter the Franchise";
    enter.addEventListener("click", () => dismissTutorial());
    actions.appendChild(enter);

    modal.append(header, list, actions);
    overlay.replaceChildren(modal);
    openModal(overlay, { onClose: () => dismissTutorial() });
  }

  function render() {
    closeModal(overlay);
    const step = STEPS[currentStep];
    const isLast = currentStep === STEPS.length - 1;

    // Dynamic body for pressure step based on scheme choice
    let body = step.body;
    if (step.id === "pressure") {
      const scheme = selections["identity"] || "balanced";
      const schemeLabel = scheme === "air-raid" ? "Air Raid" : scheme === "ground-control" ? "Ground Control" : "Balanced Attack";
      body = `You've chosen a ${schemeLabel} identity. Now your owner is setting expectations.
              Owner patience directly affects how long you have before the hot seat arrives.
              Choose your franchise's starting pressure level.`;
    }

    overlay.innerHTML = `
      <div class="tutorial-modal">
        <div class="tutorial-progress">
          ${STEPS.map((s, i) =>
            `<div class="tutorial-pip ${i < currentStep ? "done" : i === currentStep ? "active" : ""}"></div>`
          ).join("")}
        </div>
        <div class="tutorial-header">
          <div class="brand-kicker">Year 1 Franchise Challenge · Step ${currentStep + 1} of ${STEPS.length}</div>
          <h2 id="tutorial-title">${step.title}</h2>
        </div>
        <p class="tutorial-body">${body}</p>
        <div class="tutorial-choices">
          ${step.choices.map((c) => `
            <button class="tutorial-choice ${selections[step.id] === c.id ? "selected" : ""}"
                    data-choice="${c.id}" aria-pressed="${selections[step.id] === c.id}">
              <div class="choice-label">${c.label}</div>
              <div class="choice-sub">${c.sub}</div>
              <div class="choice-tip">${c.schemeTip || c.ownerTip || c.scoutTip || ""}</div>
            </button>`).join("")}
        </div>
        <div class="tutorial-actions">
          <button class="btn-ghost tutorial-skip" id="tutSkipBtn">Skip Tutorial</button>
          <button class="btn-primary tutorial-next" id="tutNextBtn" ${!selections[step.id] ? "disabled" : ""}>
            ${isLast ? "Enter the League" : "Next"}
          </button>
        </div>
      </div>`;

    // Bind choice buttons
    overlay.querySelectorAll(".tutorial-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        selections[step.id] = btn.dataset.choice;
        overlay.querySelectorAll(".tutorial-choice").forEach((b) => {
          b.classList.toggle("selected", b.dataset.choice === selections[step.id]);
          b.setAttribute("aria-pressed", b.dataset.choice === selections[step.id]);
        });
        overlay.querySelector("#tutNextBtn").disabled = false;
      });
    });

    overlay.querySelector("#tutSkipBtn").addEventListener("click", () => {
      dismissTutorial(onSkip);
    });

    overlay.querySelector("#tutNextBtn").addEventListener("click", async () => {
      if (!selections[step.id]) return;
      if (isLast) {
        const nextButton = overlay.querySelector("#tutNextBtn");
        nextButton.disabled = true;
        nextButton.textContent = "Applying Contract…";
        try {
          const receipt = await onComplete?.(buildStartScenarioRequest(selections));
          if (!receipt?.effects) throw new Error("The league did not confirm your Opening Contract. Try again.");
          markTutorialSeen(scope, storage);
          renderReceipt(receipt);
        } catch (error) {
          nextButton.disabled = false;
          nextButton.textContent = "Retry Applying Contract";
          let errorEl = overlay.querySelector(".tutorial-error");
          if (!errorEl) {
            errorEl = document.createElement("p");
            errorEl.className = "tutorial-error";
            errorEl.setAttribute("role", "alert");
            overlay.querySelector(".tutorial-actions")?.before(errorEl);
          }
          errorEl.textContent = error?.message || "The opening contract could not be applied. Nothing was marked complete.";
        }
      } else {
        currentStep++;
        render();
      }
    });

    // The style element is injected immediately before first mount. Force one
    // layout flush before focus so the fixed overlay never behaves like an
    // unstyled page-end node and scrolls the document during first paint.
    void overlay.offsetWidth;
    openModal(overlay, { onClose: () => dismissTutorial(onSkip) });
  }

  render();
}

// Compatibility export; tutorial rules are delivered by the app stylesheet.

export function injectTutorialStyles() { /* Styles ship in styles.css. */ }
