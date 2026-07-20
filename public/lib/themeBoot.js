/*
 * themeBoot.js — pre-paint theme bootstrap for static pages.
 * Classic (non-module) script so it can run synchronously in <head>
 * before first paint. Uses the same system-preference resolution order as the game shell:
 * saved "franchise-architect-theme" preference first, then
 * prefers-color-scheme, defaulting to dark. Must never throw.
 */
(function () {
  var THEME_KEY = "franchise-architect-theme";
  var MODE_KEY = "franchise-architect-theme-mode";
  var ACCENT_KEY = "franchise-architect-accent";
  var ACCENTS = { gold: 1, emerald: 1, azure: 1, crimson: 1, violet: 1 };
  var theme = "dark";
  var accent = "gold";
  try {
    var mode = window.localStorage.getItem(MODE_KEY);
    var saved = window.localStorage.getItem(THEME_KEY);
    if (mode === "light" || mode === "dark") {
      theme = mode;
    } else if (mode === "system" || !mode) {
      if (saved === "light" || saved === "dark") {
        theme = saved; // last resolved value (avoids flash); corrected on module load
      } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
        theme = "light";
      }
    }
    var savedAccent = window.localStorage.getItem(ACCENT_KEY);
    if (savedAccent && ACCENTS[savedAccent]) accent = savedAccent;
  } catch (error) {
    /* Storage or media query unavailable (private mode, sandbox): keep defaults. */
  }
  try {
    document.documentElement.setAttribute("data-theme", theme);
    if (accent && accent !== "gold") {
      document.documentElement.setAttribute("data-accent", accent);
    }
  } catch (error) {
    /* Never block page render over theming. */
  }
})();
