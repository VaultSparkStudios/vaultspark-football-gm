/**
 * Solves the human check the community service asks for before it issues a
 * capability. Loaded only when the service answers a capability request with
 * a challenge, so a deployment without the check never downloads this file or
 * contacts Cloudflare's challenge service.
 *
 * The widget is Cloudflare Turnstile, rendered explicitly and shown only if
 * Cloudflare decides the visitor has to interact with it.
 */

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SOLVE_TIMEOUT_MS = 60_000;
let scriptLoad = null;

/** The challenge named in a refused capability response, or null. */
export function humanCheckFrom(body) {
  const challenge = body?.humanCheck;
  if (!challenge || challenge.provider !== "turnstile") return null;
  if (typeof challenge.siteKey !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(challenge.siteKey)) return null;
  const action = typeof challenge.action === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(challenge.action) ? challenge.action : "capability";
  return { siteKey: challenge.siteKey, action };
}

function loadTurnstile(doc, win) {
  if (win.turnstile?.render) return Promise.resolve(win.turnstile);
  if (!scriptLoad) {
    scriptLoad = new Promise((resolve, reject) => {
      const script = doc.createElement("script");
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.addEventListener("load", () => (win.turnstile?.render ? resolve(win.turnstile) : reject(new Error("Human check did not load."))), { once: true });
      script.addEventListener("error", () => reject(new Error("Human check did not load.")), { once: true });
      doc.head.append(script);
    }).catch((error) => { scriptLoad = null; throw error; });
  }
  return scriptLoad;
}

/**
 * @returns {Promise<string>} a single-use token for one capability request.
 * Rejects when the script is blocked, the challenge fails, or it takes longer
 * than a minute; the caller then reports the capability as unavailable.
 */
export async function solveHumanCheck(challenge, { doc = globalThis.document, win = globalThis.window, timeoutMs = SOLVE_TIMEOUT_MS } = {}) {
  if (!challenge?.siteKey || !doc?.body || !win) throw new Error("Human check is unavailable here.");
  const turnstile = await loadTurnstile(doc, win);
  const holder = doc.createElement("div");
  holder.setAttribute("data-human-check", "");
  holder.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483000";
  doc.body.append(holder);
  let widgetId = null;
  let timer = null;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Human check timed out.")), timeoutMs);
      widgetId = turnstile.render(holder, {
        sitekey: challenge.siteKey,
        action: challenge.action,
        appearance: "interaction-only",
        callback: (token) => (typeof token === "string" && token ? resolve(token) : reject(new Error("Human check returned no token."))),
        "error-callback": () => { reject(new Error("Human check failed.")); return true; },
        "timeout-callback": () => reject(new Error("Human check timed out."))
      });
    });
  } finally {
    clearTimeout(timer);
    try { if (widgetId != null) turnstile.remove(widgetId); } catch { /* the widget is already gone */ }
    holder.remove();
  }
}
