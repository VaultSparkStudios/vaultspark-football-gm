import path from "node:path";

/**
 * HTTP hardening helpers for the Node dev/self-host server (src/server.js).
 *
 * Kept in their own module so they can be exercised directly by tests: the
 * server entry point listens on import and exports nothing.
 */

export const MAX_REQUEST_BODY_BYTES = 1_000_000;

export const BUFFERED_BODY = Symbol("vsfgm.bufferedBody");

/**
 * Response headers applied to every Node response. No CSP here: the static
 * HTML is served by Pages in production, which carries its own policy.
 */
export const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin"
});

export function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
}

function bodyTooLargeError(limit) {
  const error = new Error(`Request body exceeds ${limit} bytes.`);
  error.status = 413;
  error.expose = true;
  error.code = "BODY_TOO_LARGE";
  return error;
}

/**
 * Read the request body, once.
 *
 * The franchise authority boundary (S63) has to inspect the body before any
 * mutating route acts on it, but the stream can only be consumed a single time
 * and every route already calls this helper for itself. Memoizing on the request
 * lets the guard read the body up front while each route's existing call site
 * keeps working unchanged.
 *
 * Bytes are counted on the raw chunks (not decoded string length). Once the
 * limit is crossed the promise rejects with a 413 error (`status`, `expose`)
 * and the stream stops being consumed: listeners are detached and the request
 * is paused, so the caller can answer 413 and then destroy the request.
 */
export function readRequestBody(req, { limit = MAX_REQUEST_BODY_BYTES } = {}) {
  if (req[BUFFERED_BODY] !== undefined) return Promise.resolve(req[BUFFERED_BODY]);
  return new Promise((resolve, reject) => {
    let settled = false;
    let received = 0;
    const chunks = [];

    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      req.pause();
      reject(error);
    };
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      received += buffer.length;
      if (received > limit) {
        fail(bodyTooLargeError(limit));
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const body = Buffer.concat(chunks).toString("utf8");
      req[BUFFERED_BODY] = body;
      resolve(body);
    };
    const onError = (error) => fail(error);

    const declared = Number(req.headers?.["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      fail(bodyTooLargeError(limit));
      return;
    }
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

/**
 * After answering 413 to an upload that is still streaming, stop it safely.
 *
 * Destroying the socket while unread request bytes sit in the kernel buffer
 * makes TCP send RST, which can discard the 413 before the client reads it.
 * So once the response is flushed the remainder is discarded for a short,
 * byte- and time-bounded grace window, then the request is destroyed.
 */
export function stopOversizeUpload(req, res, { graceMs = 1000, maxDiscardBytes = 8 * MAX_REQUEST_BODY_BYTES } = {}) {
  const begin = () => {
    if (req.destroyed || req.readableEnded) return;
    let discarded = 0;
    const close = () => {
      clearTimeout(timer);
      if (!req.destroyed) req.destroy();
    };
    const timer = setTimeout(close, graceMs);
    timer.unref?.();
    req.on("data", (chunk) => {
      discarded += chunk.length;
      if (discarded > maxDiscardBytes) close();
    });
    req.once("end", () => clearTimeout(timer));
    req.resume();
  };
  if (res.writableFinished) begin();
  else res.once("finish", begin);
}

/** True when `resolved` is `baseDir` itself or a path strictly inside it. */
export function isPathInsideBaseDir(resolved, baseDir) {
  return resolved === baseDir || resolved.startsWith(baseDir + path.sep);
}

/**
 * Parse and clamp a numeric query parameter (limit/count style). A missing,
 * non-numeric or zero value takes the fallback, matching the routes' existing
 * `toInt(value) || fallback` convention.
 */
export function clampQueryInt(value, { min, max, fallback }) {
  let parsed = null;
  if (value != null && value !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) parsed = Math.floor(n);
  }
  const chosen = parsed || fallback;
  return Math.max(min, Math.min(max, chosen));
}

function isTruthyFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

/**
 * Rate-limit key for a request.
 *
 * Forwarding headers are client-controlled unless a trusted proxy sits in
 * front of the server, so they are honoured only when VSFGM_TRUST_PROXY is set:
 * then `cf-connecting-ip` wins, falling back to the right-most X-Forwarded-For
 * hop (the one appended by the nearest proxy, not the spoofable left-most one).
 * Without the flag the socket peer address is the only identity.
 */
export function resolveClientAddress(req, { env = process.env } = {}) {
  const peer = String(req.socket?.remoteAddress || "unknown").trim() || "unknown";
  if (!isTruthyFlag(env.VSFGM_TRUST_PROXY)) return peer;
  const cf = String(req.headers?.["cf-connecting-ip"] || "").trim();
  if (cf) return cf;
  const hops = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return hops.length ? hops[hops.length - 1] : peer;
}
