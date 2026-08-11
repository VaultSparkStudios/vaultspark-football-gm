function immediateSchedule(callback) {
  return callback();
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
      const target = documentRef?.getElementById?.(targetId) || null;
      if (!target) {
        const message = typeof missingMessage === "function"
          ? missingMessage({ ...action, targetTab, targetId })
          : missingMessage;
        if (message) announce(message);
        resolve({ targetTab, targetId, focused: false, reason: "target-unavailable" });
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
