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

const TUTORIAL_SEEN_KEY = "vsfgm_tutorial_seen_v1";

export function hasTutorialBeenSeen() {
  return localStorage.getItem(TUTORIAL_SEEN_KEY) === "done";
}

export function markTutorialSeen() {
  localStorage.setItem(TUTORIAL_SEEN_KEY, "done");
}

export function resetTutorial() {
  localStorage.removeItem(TUTORIAL_SEEN_KEY);
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
    body: `It's Week 2 of your first season. Your scouting director flags a prospect.
           You can act on this signal or wait — but scouting confidence decays if you ignore your board.
           This is how the world-state system works: invest in your staff and they surface better intel.`,
    choices: [
      {
        id: "trust-scout",
        label: "Trust the Report",
        sub: "Lock this prospect at the top of your board. Your scout's read is usually right if you've invested in the scouting department.",
        scoutTip: "Scouting confidence is built by weekly points invested + staff skill. Low investment = low confidence."
      },
      {
        id: "wait-more-info",
        label: "Request More Scouting",
        sub: "Spend weekly scouting points to get a higher-confidence report before committing.",
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

export function mountTutorial({ onComplete, onSkip }) {
  if (hasTutorialBeenSeen()) { onSkip?.(); return; }

  let currentStep = 0;
  const selections = {};

  const overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "tutorial-title");
  document.body.appendChild(overlay);

  function render() {
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
      markTutorialSeen();
      overlay.remove();
      onSkip?.();
    });

    overlay.querySelector("#tutNextBtn").addEventListener("click", () => {
      if (!selections[step.id]) return;
      if (isLast) {
        markTutorialSeen();
        overlay.remove();
        onComplete?.(selections);
      } else {
        currentStep++;
        render();
      }
    });
  }

  render();
}

// ── Tutorial CSS (injected inline, idempotent) ────────────────────────────────

export function injectTutorialStyles() {
  if (document.getElementById("tutorial-styles")) return;
  const style = document.createElement("style");
  style.id = "tutorial-styles";
  style.textContent = `
    .tutorial-overlay {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(6, 10, 13, 0.88);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
      backdrop-filter: blur(6px);
    }
    .tutorial-modal {
      background: #111820; border: 1px solid #2a3a4a;
      border-radius: 12px; max-width: 680px; width: 100%;
      padding: 2rem; display: flex; flex-direction: column; gap: 1.25rem;
      max-height: 90vh; overflow-y: auto;
    }
    .tutorial-progress { display: flex; gap: .5rem; }
    .tutorial-pip { width: 28px; height: 4px; border-radius: 2px; background: #2a3a4a; }
    .tutorial-pip.active { background: var(--accent, #d7a24a); }
    .tutorial-pip.done { background: var(--success, #63d68c); }
    .tutorial-header .brand-kicker { font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: #6a7a8a; margin-bottom: .35rem; }
    .tutorial-header h2 { font-size: 1.4rem; color: #f5f1e7; margin: 0; }
    .tutorial-body { color: #a0b0b8; line-height: 1.6; font-size: .9rem; }
    .tutorial-choices { display: flex; flex-direction: column; gap: .65rem; }
    .tutorial-choice {
      background: #182028; border: 1px solid #2a3a4a; border-radius: 8px;
      padding: .85rem 1rem; text-align: left; cursor: pointer; transition: border-color .15s, background .15s;
      width: 100%;
    }
    .tutorial-choice:hover { border-color: #4a6a7a; background: #1e2c38; }
    .tutorial-choice.selected { border-color: var(--accent, #d7a24a); background: rgba(215,162,74,.08); }
    .choice-label { font-weight: 700; font-size: .95rem; color: #f5f1e7; margin-bottom: .2rem; }
    .choice-sub { font-size: .82rem; color: #8a9ab0; margin-bottom: .35rem; }
    .choice-tip { font-size: .75rem; color: #5a7a6a; font-style: italic; }
    .tutorial-choice.selected .choice-tip { color: var(--accent, #d7a24a); }
    .tutorial-actions { display: flex; justify-content: space-between; align-items: center; padding-top: .5rem; }
    .tutorial-next:disabled { opacity: .45; cursor: not-allowed; }
  `;
  document.head.appendChild(style);
}
