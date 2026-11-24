// Install the app.
//
// Browsers that can install this site announce it once, early, through
// `beforeinstallprompt`. The game shell catches that announcement and only
// then loads this module, which offers installing in two quiet places: a
// button in Settings that shows only while the browser can actually install,
// and a single dismissible line on the
// Desk after a week has been played. Neither appears when the game already
// runs as an installed app, and the Desk line never returns once it has been
// answered or dismissed. Nothing here talks to a server.

const HINT_KEY = "fa:install-hint-done";

let pending = null;
const buttons = new Set();
let listening = false;

function readDone() {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    // Without storage the hint could not be remembered as dismissed, so it is
    // treated as already done rather than shown on every visit.
    return true;
  }
}

function markDone() {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    // Nothing to remember it in.
  }
}

export function isInstalled(scope = globalThis) {
  return scope.matchMedia?.("(display-mode: standalone)")?.matches === true
    || scope.navigator?.standalone === true;
}

/** What may be shown right now. Pure, so the rules can be tested directly. */
export function installOffer({ hasPrompt, installed, hintDone, weekPlayed }) {
  const action = hasPrompt === true && installed !== true;
  return { action, hint: action && hintDone !== true && weekPlayed === true };
}

function currentOffer(weekPlayed = false) {
  return installOffer({ hasPrompt: Boolean(pending), installed: isInstalled(), hintDone: readDone(), weekPlayed });
}

function removeHint() {
  globalThis.document?.getElementById("installHint")?.remove();
}

function sync() {
  const { action } = currentOffer();
  for (const button of buttons) button.hidden = !action;
  if (!action) removeHint();
}

/** Ask the browser to install. Resolves "accepted", "dismissed" or "unavailable". */
export async function promptInstall() {
  const event = pending;
  if (!event) return "unavailable";
  // A captured prompt can be used once; the browser sends a new one if it
  // is willing to offer installing again.
  pending = null;
  markDone();
  sync();
  try {
    await event.prompt();
    return (await event.userChoice)?.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "unavailable";
  }
}

/** Wire the Settings button. It stays hidden until installing is possible. */
export function bindInstallAction(button) {
  if (!button || buttons.has(button)) return;
  buttons.add(button);
  button.addEventListener("click", () => { promptInstall(); });
  sync();
}

/** After a played week: one line on the Desk, once. */
export function maybeShowInstallHint(host = globalThis.document?.getElementById("overviewTab")) {
  if (!host || !currentOffer(true).hint || host.ownerDocument.getElementById("installHint")) return false;
  const doc = host.ownerDocument;
  const hint = doc.createElement("div");
  hint.id = "installHint";
  hint.className = "install-hint";
  hint.setAttribute("role", "status");
  const text = doc.createElement("span");
  text.textContent = "Install Franchise Architect to open it from your home screen like any other app.";
  const install = doc.createElement("button");
  install.type = "button";
  install.className = "install-hint-go";
  install.textContent = "Install the app";
  install.addEventListener("click", () => { promptInstall(); });
  const later = doc.createElement("button");
  later.type = "button";
  later.className = "install-hint-dismiss";
  later.textContent = "Not now";
  later.addEventListener("click", () => {
    markDone();
    removeHint();
  });
  hint.append(text, install, later);
  host.prepend(hint);
  return true;
}

/**
 * Take the browser's install announcement. The shell has already called
 * preventDefault() on it, which keeps the browser's own banner away.
 */
export function offerInstall(event, scope = globalThis) {
  pending = event;
  if (!listening && typeof scope.addEventListener === "function") {
    listening = true;
    scope.addEventListener("appinstalled", () => {
      pending = null;
      markDone();
      sync();
    });
  }
  bindInstallAction(scope.document?.getElementById("installAppBtn"));
  sync();
}
