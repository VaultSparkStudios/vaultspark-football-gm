const THEME_KEY = "franchise-architect-theme";

export function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}

export function applyThemeMode(theme = getPreferredTheme()) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  document.body.dataset.theme = next;
  document.querySelectorAll("#themeToggleBtn, #setupThemeToggleBtn").forEach((button) => {
    button.textContent = next === "light" ? "◑" : "◐";
    button.setAttribute("aria-label", `Switch to ${next === "light" ? "dark" : "light"} theme`);
  });
  localStorage.setItem(THEME_KEY, next);
  return next;
}

export function bindThemeToggle(buttonId) {
  applyThemeMode();
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    applyThemeMode(current === "light" ? "dark" : "light");
  });
}
