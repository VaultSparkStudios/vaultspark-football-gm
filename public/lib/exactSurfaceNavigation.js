function immediateSchedule(callback) {
  return callback();
}

/**
 * Is `target` actually reachable inside the tab we just activated?
 *
 * S101: getElementById is document-global and inactive tabs are display:none, so
 * a target in another tab was still "found", focus silently fell to <body>, and
 * this resolved focused:true — certifying a destination never reached. Returns
 * true only when misplacement or hiding is positively confirmed; an environment
 * that cannot tell us stays permissive.
 */
function isUnreachable(target, targetTab) {
  let node = target;
  let guard = 0;
  while (node && guard < 100) {
    guard += 1;
    if (node.hidden === true) return true;
    const classList = node.classList;
    const isPanel = typeof classList?.contains === "function" && classList.contains("tab-panel");
    if (isPanel) return Boolean(node.id && node.id !== targetTab);
    node = node.parentElement || null;
  }
  return false;
}

/**
 * Activate a tab, wait for its hydration authority, then focus the exact
 * player-decision surface. Callers provide the tab owner so this module stays
 * dependency-free and usable by both the browser and focused tests.
 */
export async function navigateToExactSurface(action = {}, {
  activateTab,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  schedule = immediateSchedule,
  announce = () => {},
  successMessage = null,
  missingMessage = null
} = {}) {
  if (typeof activateTab !== "function") throw new TypeError("activateTab is required.");

  const targetTab = action.targetTab || "overviewTab";
  const targetId = action.targetId || null;
  await Promise.resolve(activateTab(targetTab));

  if (!targetId) return { targetTab, targetId: null, focused: false, reason: "target-not-declared" };

  return new Promise((resolve) => {
    schedule(() => {
      const found = documentRef?.getElementById?.(targetId) || null;
      const target = found && !isUnreachable(found, targetTab) ? found : null;
      if (!target) {
        const message = typeof missingMessage === "function"
          ? missingMessage({ ...action, targetTab, targetId })
          : missingMessage;
        if (message) announce(message);
        resolve({
          targetTab,
          targetId,
          focused: false,
          reason: found ? "target-not-in-tab" : "target-unavailable"
        });
        return;
      }

      const reducedMotion = windowRef?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
      target.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      if (typeof target.setAttribute === "function"
        && (typeof target.hasAttribute !== "function" || !target.hasAttribute("tabindex"))) {
        target.setAttribute("tabindex", "-1");
      }
      target.focus?.({ preventScroll: true });
      const message = typeof successMessage === "function"
        ? successMessage({ ...action, targetTab, targetId })
        : successMessage;
      if (message) announce(message);
      resolve({ targetTab, targetId, focused: true, reason: "focused" });
    });
  });
}
