/*
 * themeCustomizer.js — the theme design customization control.
 *
 * Upgrades the old single ◐/◑ toggle into a popover with:
 *   - Appearance: System / Light / Dark
 *   - Accent: Gold (default) / Emerald / Azure / Crimson / Violet
 *
 * Persists two keys and applies them as data attributes on <html>, so all
 * theming stays in CSS (see styles.css [data-theme]/[data-accent] blocks) and
 * pre-paint boot (themeBoot.js) can restore them without a flash.
 */

const THEME_KEY = "franchise-architect-theme"; // "light" | "dark"  (resolved)
const MODE_KEY = "franchise-architect-theme-mode"; // "system" | "light" | "dark"
const ACCENT_KEY = "franchise-architect-accent"; // "gold" | "emerald" | ...

const ACCENTS = [
  { id: "gold", label: "Gold" },
  { id: "emerald", label: "Emerald" },
  { id: "azure", label: "Azure" },
  { id: "crimson", label: "Crimson" },
  { id: "violet", label: "Violet" }
];

let nextPanelId = 0;

function readMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "system" || saved === "light" || saved === "dark") return saved;
    // Legacy: a bare theme key with no mode key means an explicit light/dark pick.
    const legacy = localStorage.getItem(THEME_KEY);
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

function readAccent() {
  try {
    const saved = localStorage.getItem(ACCENT_KEY);
    if (ACCENTS.some((a) => a.id === saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return "gold";
}

function systemPrefersLight() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
}

export function resolveTheme(mode = readMode()) {
  if (mode === "light" || mode === "dark") return mode;
  return systemPrefersLight() ? "light" : "dark";
}

export function applyTheme(mode = readMode(), accent = readAccent()) {
  const theme = resolveTheme(mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (document.body) document.body.dataset.theme = theme;
  if (accent && accent !== "gold") {
    root.dataset.accent = accent;
    if (document.body) document.body.dataset.accent = accent;
  } else {
    delete root.dataset.accent;
    if (document.body) delete document.body.dataset.accent;
  }
  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(THEME_KEY, theme); // keep legacy key in sync
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    /* ignore persistence failure */
  }
  return { theme, mode, accent };
}

function focusSelectedControl(panel) {
  const selected =
    panel.querySelector('.theme-cx-mode[aria-pressed="true"]') ||
    panel.querySelector('.theme-cx-accent[aria-pressed="true"]') ||
    panel.querySelector("button");
  selected?.focus();
}

function moveWithinGroup(event, selector) {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return false;
  const buttons = Array.from(event.currentTarget.querySelectorAll(selector));
  const currentIndex = buttons.indexOf(event.target);
  if (currentIndex < 0) return false;
  event.preventDefault();
  const last = buttons.length - 1;
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? last
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? (currentIndex - 1 + buttons.length) % buttons.length
        : (currentIndex + 1) % buttons.length;
  buttons[nextIndex]?.focus();
  buttons[nextIndex]?.click();
  return true;
}

function buildPanel(state, onChange) {
  const panel = document.createElement("div");
  panel.className = "theme-cx-panel";
  panel.id = `theme-cx-panel-${++nextPanelId}`;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Theme customization");
  panel.hidden = true;

  const modes = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" }
  ];

  panel.innerHTML = `
    <div>
      <p class="theme-cx-title">Appearance</p>
      <div class="theme-cx-modes" role="group" aria-label="Appearance">
        ${modes
          .map(
            (m) =>
              `<button type="button" class="theme-cx-mode" data-mode="${m.id}" aria-pressed="false">${m.label}</button>`
          )
          .join("")}
      </div>
    </div>
    <div>
      <p class="theme-cx-title">Accent</p>
      <div class="theme-cx-accents" role="group" aria-label="Accent color">
        ${ACCENTS.map(
          (a) =>
            `<button type="button" class="theme-cx-accent" data-accent="${a.id}" aria-pressed="false" title="${a.label}" aria-label="${a.label} accent"></button>`
        ).join("")}
      </div>
    </div>
  `;

  function sync() {
    panel.querySelectorAll(".theme-cx-mode").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.mode === state.mode));
    });
    panel.querySelectorAll(".theme-cx-accent").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.accent === state.accent));
    });
  }

  panel.addEventListener("click", (event) => {
    const modeBtn = event.target.closest?.(".theme-cx-mode");
    const accentBtn = event.target.closest?.(".theme-cx-accent");
    if (modeBtn) {
      state.mode = modeBtn.dataset.mode;
    } else if (accentBtn) {
      state.accent = accentBtn.dataset.accent;
    } else {
      return;
    }
    onChange(state);
    sync();
  });

  panel.addEventListener("keydown", (event) => {
    if (event.target.closest?.(".theme-cx-modes")) {
      moveWithinGroup(event, ".theme-cx-mode");
    } else if (event.target.closest?.(".theme-cx-accents")) {
      moveWithinGroup(event, ".theme-cx-accent");
    }
  });

  panel.sync = sync;
  return panel;
}

export function initThemeCustomizer(buttonId) {
  const button = document.getElementById(buttonId);
  const state = { mode: readMode(), accent: readAccent() };
  applyTheme(state.mode, state.accent);

  if (!button) return; // pre-paint apply already done; no control on this page.

  button.textContent = "◐";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Customize theme");
  button.title = "Customize theme";

  // Wrap the button so the panel can anchor to it.
  const wrap = document.createElement("span");
  wrap.className = "theme-cx";
  button.parentNode.insertBefore(wrap, button);
  wrap.appendChild(button);

  const panel = buildPanel(state, (next) => {
    applyTheme(next.mode, next.accent);
    // Keep every mounted customizer (setup + game share the module) in sync.
    document.querySelectorAll(".theme-cx-panel").forEach((p) => p.sync && p.sync());
  });
  button.setAttribute("aria-controls", panel.id);
  wrap.appendChild(panel);
  panel.sync();

  function close({ restoreFocus = false } = {}) {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus();
  }
  function open() {
    panel.sync();
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    focusSelectedControl(panel);
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (panel.hidden) open();
    else close();
  });

  document.addEventListener("click", (event) => {
    if (!panel.hidden && !wrap.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      close({ restoreFocus: true });
    }
  });

  // Track live OS theme changes while in System mode.
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const listener = () => {
      if (state.mode === "system") applyTheme(state.mode, state.accent);
    };
    if (mq.addEventListener) mq.addEventListener("change", listener);
    else if (mq.addListener) mq.addListener(listener);
  }

  return { applyTheme, state };
}
