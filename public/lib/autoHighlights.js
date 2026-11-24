// "Play highlights automatically after my game": a device-local choice, off
// by default, readable at boot without loading the recap or the replay.

const KEY = "fa:auto-highlights";

export function isAutoHighlightsEnabled() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoHighlightsEnabled(enabled) {
  try {
    localStorage.setItem(KEY, enabled === true ? "1" : "0");
  } catch {
    // No storage: the choice reads as off.
  }
}

// Never for a bye, with reduced motion, or on top of an open dialog.
export function shouldAutoPlayHighlights(game, { enabled, reducedMotion, modalOpen }) {
  return Boolean(game?.gameId) && enabled === true && reducedMotion !== true && modalOpen !== true;
}
