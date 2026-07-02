/*
 * themeBoot.js — pre-paint theme bootstrap for static pages.
 * Classic (non-module) script so it can run synchronously in <head>
 * before first paint. Mirrors the resolution order of lib/themeMode.js:
 * saved "franchise-architect-theme" preference first, then
 * prefers-color-scheme, defaulting to dark. Must never throw.
 */
(function () {
  var THEME_KEY = "franchise-architect-theme";
  var theme = "dark";
  try {
    var saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") {
      theme = saved;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      theme = "light";
    }
  } catch (error) {
    /* Storage or media query unavailable (private mode, sandbox): keep dark. */
  }
  try {
    document.documentElement.setAttribute("data-theme", theme);
  } catch (error) {
    /* Never block page render over theming. */
  }
})();
