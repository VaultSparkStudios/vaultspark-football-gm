/**
 * Human check on capability issuance (Cloudflare Turnstile).
 *
 * Off unless the service is given both a secret and the matching public site
 * key. When it is on, a capability is issued only after Cloudflare's Siteverify
 * API confirms the token the browser solved. Any other outcome refuses the
 * request: a missing or rejected token is a 403 that tells the browser which
 * site key to solve, and a Siteverify call that fails or times out is a 503.
 *
 * The visitor's address is deliberately not sent (`remoteip` is optional), so
 * this adds no new place an address leaves the service.
 */

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_ACTION = "capability";
const TOKEN_MAX_LENGTH = 2048; // Siteverify's documented token ceiling.
const DEFAULT_TIMEOUT_MS = 5000;

function refusal(status, message, siteKey) {
  const error = new Error(message);
  error.status = status;
  error.humanCheck = { provider: "turnstile", siteKey, action: TURNSTILE_ACTION };
  return error;
}

/**
 * @returns {null | { siteKey: string, verify(token: unknown): Promise<void> }}
 * `null` when the check is not configured; otherwise `verify` resolves for a
 * token Siteverify accepts and throws (with `status` and `humanCheck`) for
 * everything else.
 */
export function createTurnstileHumanCheck({
  secret = process.env.COMMUNITY_TURNSTILE_SECRET,
  siteKey = process.env.COMMUNITY_TURNSTILE_SITE_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = console
} = {}) {
  const secretKey = String(secret || "").trim();
  const publicKey = String(siteKey || "").trim();
  if (!secretKey && !publicKey) return null;
  if (!secretKey || !/^[A-Za-z0-9_-]{8,128}$/.test(publicKey)) {
    // Half a configuration cannot be solved by any browser. Stay off, loudly,
    // rather than lock every player out of sharing and feedback.
    logger?.error?.("Community Stats human check is not enabled: COMMUNITY_TURNSTILE_SECRET and a valid COMMUNITY_TURNSTILE_SITE_KEY are both required.");
    return null;
  }

  async function verify(token) {
    if (typeof token !== "string" || !token || token.length > TOKEN_MAX_LENGTH) {
      throw refusal(403, "A human check is required before sharing or sending feedback.", publicKey);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    let result;
    try {
      const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secretKey, response: token }),
        signal: controller.signal
      });
      result = await response.json();
    } catch {
      throw refusal(503, "The human check could not be confirmed; try again shortly.", publicKey);
    } finally { clearTimeout(timer); }
    const codes = Array.isArray(result?.["error-codes"]) ? result["error-codes"] : [];
    if (result?.success !== true) {
      // A bad secret or a Cloudflare-side fault is ours, not the visitor's.
      if (codes.some((code) => code === "internal-error" || code === "invalid-input-secret" || code === "missing-input-secret" || code === "bad-request")) {
        logger?.error?.(`Community Stats human check failed upstream: ${codes.filter((code) => /^[a-z-]{1,40}$/.test(String(code))).join(",") || "unknown"}`);
        throw refusal(503, "The human check could not be confirmed; try again shortly.", publicKey);
      }
      throw refusal(403, "The human check did not pass; please try again.", publicKey);
    }
    // A token solved for some other widget action is not a capability request.
    if (result.action && result.action !== TURNSTILE_ACTION) {
      throw refusal(403, "The human check did not pass; please try again.", publicKey);
    }
  }

  return { siteKey: publicKey, verify };
}
