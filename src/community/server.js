import http from "node:http";
import { isIP } from "node:net";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { CommunityStore } from "./communityStore.js";
import { aggregateCommunitySnapshot } from "./aggregateCommunitySnapshot.js";
import { COMMUNITY_BATCH_LIMIT, normalizeCommunityEvent } from "./eventContract.js";
import { DIAGNOSTIC_BATCH_LIMIT, normalizeDiagnosticReport, normalizeFeedback } from "./feedbackContract.js";
import { isChallengeWeekKey, normalizeChallengeScore, openChallengeWeeks } from "./challengeContract.js";
import { createTurnstileHumanCheck } from "./humanCheck.js";
import { normalizeLeaguePulse } from "./pulseContract.js";

const PORT = Number(process.env.PORT || 8082);
const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_ORIGINS = ["https://playfranchisearchitect.com", "https://staging.playfranchisearchitect.com"];
const PROCESS_CAPABILITY_KEY = randomBytes(32);
const PROCESS_ADDRESS_KEY = randomBytes(32);
const CAPABILITY_TTL_MS = 15 * 60 * 1000;
const CAPABILITY_USE_LIMIT = 16;
const CAPABILITY_PARTICIPANT_LIMIT = 4;
const CAPABILITY_PARTICIPANT_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// A feedback note is something a person typed, so one address gets a handful
// an hour. Its capability is a separate, single-purpose kind (see `scope`).
const FEEDBACK_LIMIT_PER_HOUR = 5;
const FEEDBACK_CAPABILITY_LIMIT_PER_HOUR = 10;
const FEEDBACK_CAPABILITY_USES = 2;
// Two more bounds behind the hourly one, because five an hour from each of a
// few addresses is still enough to bury a day's reading: one address gets a
// dozen notes a day, and the whole service accepts a bounded number an hour.
const FEEDBACK_LIMIT_PER_DAY = 12;
const FEEDBACK_SERVICE_LIMIT_PER_HOUR = 120;
const FEEDBACK_SERVICE_KEY = "feedback-service";
const DIAGNOSTICS_LIMIT_PER_HOUR = 30;
const CHALLENGE_SCORE_LIMIT_PER_HOUR = 20;
// A pulse is sent when the game is hidden or closed and after each season, so
// an honest browser sends a handful an hour; a whole household on one address
// stays well under this.
const PULSE_LIMIT_PER_HOUR = 60;

export function runtimeSourceRevision(value = process.env.SOURCE_REVISION) {
  const revision = String(value || "").trim();
  return /^[a-zA-Z0-9._-]{1,64}$/.test(revision) ? revision : "local-worktree";
}

const SOURCE_REVISION = runtimeSourceRevision();

function allowedOrigins() {
  return new Set(String(process.env.COMMUNITY_ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(",")).split(",").map((value) => value.trim().replace(/\/+$/, "")).filter(Boolean));
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", ...headers });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    received += buffer.length;
    if (received > MAX_BODY_BYTES) { const error = new Error("Request body is too large."); error.status = 413; throw error; }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  try { return body ? JSON.parse(body) : {}; } catch { const error = new Error("Invalid JSON body."); error.status = 400; throw error; }
}

function participantId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{16,96}$/.test(id) ? id : null;
}

export function createMemoryRateLimiter({ limit = 90, windowMs = 60_000, clock = () => Date.now() } = {}) {
  const buckets = new Map();
  return (key) => {
    const now = clock();
    const bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return { ok: true, remaining: limit - 1 }; }
    bucket.count += 1;
    if (buckets.size > 10_000) for (const [entry, value] of buckets) if (now >= value.resetAt) buckets.delete(entry);
    return { ok: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  };
}

function isLoopbackAddress(value) {
  const address = String(value || "").trim().toLowerCase().replace(/^::ffff:/, "");
  return address === "127.0.0.1" || address === "::1";
}

function isTruthyFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

/**
 * Forwarding headers are honoured only when the TCP peer is the loopback
 * reverse proxy (ops/Caddyfile), which replaces any client-supplied
 * X-Forwarded-For with the address it actually saw. A direct peer can never
 * pick its own key. `cf-connecting-ip` is additionally honoured from that proxy
 * only when COMMUNITY_TRUST_PROXY is set (i.e. the deployment sits behind
 * Cloudflare and the proxy is locked to Cloudflare's ranges).
 */
function trustedRequestAddress(req, env = process.env) {
  const peer = String(req.socket?.remoteAddress || "unknown").trim();
  if (!isLoopbackAddress(peer)) return peer;
  if (isTruthyFlag(env.COMMUNITY_TRUST_PROXY)) {
    const cf = String(req.headers["cf-connecting-ip"] || "").trim();
    if (cf) return cf;
  }
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || peer;
}

/**
 * Groups an address for rate limiting. One IPv6 subscriber is normally handed
 * a whole /64, so counting each of its addresses separately would let a single
 * connection mint unlimited keys; every address in a /64 therefore shares one
 * group. IPv4 addresses (including IPv4-mapped IPv6) are counted individually,
 * and anything that is not an address is passed through unchanged.
 */
export function rateLimitAddressGroup(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const mapped = /^(?:::ffff:|0{1,4}(?::0{1,4}){4}:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(raw);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  if (isIP(raw) !== 6) return raw;
  let text = raw;
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) text = `${dotted[1]}${((Number(dotted[2]) << 8) | Number(dotted[3])).toString(16)}:${((Number(dotted[4]) << 8) | Number(dotted[5])).toString(16)}`;
  const [head, tail] = text.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const groups = tail === undefined
    ? headParts
    : [...headParts, ...Array(Math.max(0, 8 - headParts.length - tailParts.length)).fill("0"), ...tailParts];
  return `${groups.slice(0, 4).map((part) => (parseInt(part, 16) || 0).toString(16)).join(":")}::/64`;
}

/**
 * Produces a process-local, privacy-safe rate-limit key. Raw network addresses
 * exist only long enough to compute this HMAC; they are never stored or logged.
 * Every limiter in the handler (requests, capabilities, feedback, diagnostics)
 * keys on this one value, so the IPv6 /64 grouping applies to all of them.
 */
export function createPrivacySafeAddressKey(signingKey = PROCESS_ADDRESS_KEY, { env = process.env } = {}) {
  const key = Buffer.isBuffer(signingKey) ? signingKey : Buffer.from(String(signingKey));
  return (req) => createHmac("sha256", key).update(`community-address-v1:${rateLimitAddressGroup(trustedRequestAddress(req, env))}`).digest("base64url");
}

function capabilityError(message = "Participation capability is invalid, expired, or exhausted.") {
  const error = new Error(message);
  error.status = 401;
  return error;
}

function participantSubject(participantId, signingKey) {
  return createHmac("sha256", signingKey).update(`community-participant-v1:${participantId}`).digest("base64url");
}

function signCapabilityPayload(encodedPayload, signingKey) {
  return createHmac("sha256", signingKey).update(encodedPayload).digest("base64url");
}

export function createParticipationCapabilityAuthority({
  signingKey = PROCESS_CAPABILITY_KEY,
  clock = () => Date.now(),
  ttlMs = CAPABILITY_TTL_MS,
  useLimit = CAPABILITY_USE_LIMIT
} = {}) {
  const key = Buffer.isBuffer(signingKey) ? signingKey : Buffer.from(String(signingKey));
  const active = new Map();
  const activeBySubject = new Map();

  function prune(now) {
    for (const [nonce, state] of active) {
      if (state.expiresAt > now && state.uses < state.useLimit) continue;
      active.delete(nonce);
      if (activeBySubject.get(state.subject) === nonce) activeBySubject.delete(state.subject);
    }
  }

  // `scope` names the one job a capability may do. A "feedback" capability is
  // handed out without the per-address browser limit, so it must never be
  // accepted where game stats are written or deleted.
  function issue(participantId, { scope = "events", useLimit: requestedUseLimit = useLimit } = {}) {
    const now = Number(clock());
    prune(now);
    const subject = `${scope}:${participantSubject(participantId, key)}`;
    const existingNonce = activeBySubject.get(subject);
    const existing = active.get(existingNonce);
    if (existing) {
      return {
        capability: existing.capability,
        expiresAt: new Date(existing.expiresAt).toISOString(),
        useLimit: existing.useLimit,
        remainingUses: existing.useLimit - existing.uses
      };
    }
    const nonce = randomBytes(16).toString("base64url");
    const expiresAt = now + Math.max(1, Number(ttlMs) || CAPABILITY_TTL_MS);
    const boundedUseLimit = Math.max(1, Math.min(64, Math.floor(Number(requestedUseLimit) || CAPABILITY_USE_LIMIT)));
    const payload = { v: 1, sub: subject, exp: expiresAt, nonce, useLimit: boundedUseLimit };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const capability = `${encoded}.${signCapabilityPayload(encoded, key)}`;
    active.set(nonce, { subject, expiresAt, useLimit: boundedUseLimit, uses: 0, capability });
    activeBySubject.set(subject, nonce);
    return { capability, expiresAt: new Date(expiresAt).toISOString(), useLimit: boundedUseLimit, remainingUses: boundedUseLimit };
  }

  function consume(capability, participantId, scope = "events") {
    const token = String(capability || "");
    if (token.length < 32 || token.length > 2048) throw capabilityError();
    const [encoded, suppliedSignature, extra] = token.split(".");
    if (!encoded || !suppliedSignature || extra) throw capabilityError();
    const expectedSignature = signCapabilityPayload(encoded, key);
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw capabilityError();

    let payload;
    try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw capabilityError(); }
    const now = Number(clock());
    const subject = `${scope}:${participantSubject(participantId, key)}`;
    const state = active.get(payload?.nonce);
    if (payload?.v !== 1 || payload.sub !== subject || !Number.isFinite(payload.exp) || payload.exp <= now || !state ||
        state.subject !== subject || state.expiresAt !== payload.exp || state.useLimit !== payload.useLimit || state.uses >= state.useLimit) {
      if (payload?.nonce) active.delete(payload.nonce);
      throw capabilityError();
    }
    state.uses += 1;
    const remainingUses = state.useLimit - state.uses;
    if (!remainingUses) {
      active.delete(payload.nonce);
      if (activeBySubject.get(subject) === payload.nonce) activeBySubject.delete(subject);
    }
    return { expiresAt: new Date(state.expiresAt).toISOString(), remainingUses };
  }

  return { issue, consume };
}

export function createCapabilityIssueLimiter({
  signingKey = PROCESS_ADDRESS_KEY,
  clock = () => Date.now(),
  participantLimit = CAPABILITY_PARTICIPANT_LIMIT,
  windowMs = CAPABILITY_PARTICIPANT_WINDOW_MS
} = {}) {
  const key = Buffer.isBuffer(signingKey) ? signingKey : Buffer.from(String(signingKey));
  const buckets = new Map();
  return (privateAddressKey, participantId) => {
    const now = Number(clock());
    let bucket = buckets.get(privateAddressKey);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { resetAt: now + windowMs, participants: new Set() };
      buckets.set(privateAddressKey, bucket);
    }
    const participant = participantSubject(participantId, key);
    if (bucket.participants.has(participant)) {
      return { ok: true, remaining: Math.max(0, participantLimit - bucket.participants.size) };
    }
    if (bucket.participants.size >= participantLimit) {
      return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
    }
    bucket.participants.add(participant);
    if (buckets.size > 10_000) for (const [entry, value] of buckets) if (now >= value.resetAt) buckets.delete(entry);
    return { ok: true, remaining: participantLimit - bucket.participants.size };
  };
}

function etag(payload) { return `"${createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24)}"`; }

function matchesEtag(value, tag) {
  return String(value || "")
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//i, ""))
    .some((candidate) => candidate === "*" || candidate === tag);
}

export function createCommunityStatsHandler({
  store,
  origins = allowedOrigins(),
  rateLimit = createMemoryRateLimiter(),
  capabilityIssueRateLimit = createCapabilityIssueLimiter(),
  capabilities = createParticipationCapabilityAuthority(),
  addressKey = createPrivacySafeAddressKey(),
  feedbackRateLimit = createMemoryRateLimiter({ limit: FEEDBACK_LIMIT_PER_HOUR, windowMs: HOUR_MS }),
  feedbackCapabilityRateLimit = createMemoryRateLimiter({ limit: FEEDBACK_CAPABILITY_LIMIT_PER_HOUR, windowMs: HOUR_MS }),
  feedbackDailyRateLimit = createMemoryRateLimiter({ limit: FEEDBACK_LIMIT_PER_DAY, windowMs: 24 * HOUR_MS }),
  feedbackServiceRateLimit = createMemoryRateLimiter({ limit: FEEDBACK_SERVICE_LIMIT_PER_HOUR, windowMs: HOUR_MS }),
  humanCheck = createTurnstileHumanCheck(),
  diagnosticsRateLimit = createMemoryRateLimiter({ limit: DIAGNOSTICS_LIMIT_PER_HOUR, windowMs: HOUR_MS }),
  challengeScoreRateLimit = createMemoryRateLimiter({ limit: CHALLENGE_SCORE_LIMIT_PER_HOUR, windowMs: HOUR_MS }),
  pulseRateLimit = createMemoryRateLimiter({ limit: PULSE_LIMIT_PER_HOUR, windowMs: HOUR_MS }),
  pulseOrigins = new Set(String(process.env.COMMUNITY_PULSE_ORIGINS || "https://playfranchisearchitect.com").split(",").map((value) => value.trim().replace(/\/+$/, "")).filter(Boolean)),
  challengeClock = () => Date.now()
} = {}) {
  if (!store) throw new Error("Community Stats handler requires a store.");
  return async function handler(req, res) {
    // A request line the URL parser rejects (for example "//") is a bad request, not a crash.
    let url;
    try { url = new URL(req.url || "/", "http://community.local"); }
    catch { sendJson(res, 400, { ok: false, error: "Invalid request." }); return; }
    const origin = String(req.headers.origin || "").replace(/\/+$/, "");
    const originAllowed = !origin || origins.has(origin) || (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin) && process.env.NODE_ENV !== "production");
    if (originAllowed && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,If-None-Match");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") { res.writeHead(originAllowed ? 204 : 403); res.end(); return; }
    if (!originAllowed) { sendJson(res, 403, { ok: false, error: "Origin is not allowed." }); return; }
    const isMutation = req.method === "POST" || req.method === "DELETE" || req.method === "PUT" || req.method === "PATCH";
    if (isMutation && !origin) { sendJson(res, 403, { ok: false, error: "Mutation requests require an allowed browser origin." }); return; }

    const privateAddressKey = addressKey(req);
    const rate = rateLimit(privateAddressKey);
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    if (!rate.ok) { sendJson(res, 429, { ok: false, error: "Request limit reached; try again shortly." }, { "Retry-After": String(rate.retryAfter) }); return; }

    try {
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/community/v1/health")) {
        const health = await store.health();
        sendJson(res, 200, { ...health, service: "franchise-architect-community-stats", sourceRevision: SOURCE_REVISION }, { "Cache-Control": "no-store" }); return;
      }
      if (req.method === "GET" && url.pathname === "/community/v1/snapshot") {
        let snapshot;
        try { snapshot = await store.snapshot(); }
        catch (error) {
          if (store.cache) snapshot = { ...store.cache, status: "stale", degradation: "The database is temporarily unavailable; this is the last computed aggregate." };
          else snapshot = { ...aggregateCommunitySnapshot([], { now: new Date().toISOString() }), status: "unavailable", degradation: "The live aggregate is temporarily unavailable." };
        }
        const tag = etag(snapshot);
        if (matchesEtag(req.headers["if-none-match"], tag)) { res.writeHead(304, { ETag: tag, "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" }); res.end(); return; }
        sendJson(res, snapshot.status === "unavailable" ? 503 : 200, snapshot, { ETag: tag, "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" }); return;
      }
      if (req.method === "POST" && url.pathname === "/community/v1/capability") {
        const body = await readJson(req);
        const id = participantId(body.participantId);
        if (body.schemaVersion !== "1.0" || !id) { sendJson(res, 400, { ok: false, error: "A valid anonymous browser identifier is required." }); return; }
        // Feedback needs no Community Stats sharing, so its capability is tied
        // to a throwaway identifier and counted per address by the hour instead
        // of against the per-address browser limit that protects the statistics.
        const feedbackOnly = body.purpose === "feedback";
        // With a human check configured, nothing is issued (and no allowance
        // is spent) until Cloudflare confirms the token this browser solved.
        if (humanCheck) await humanCheck.verify(body.humanCheckToken);
        const issuance = feedbackOnly ? feedbackCapabilityRateLimit(privateAddressKey) : capabilityIssueRateLimit(privateAddressKey, id);
        if (!issuance.ok) { sendJson(res, 429, { ok: false, error: "Participation capability limit reached; try again shortly." }, { "Retry-After": String(issuance.retryAfter) }); return; }
        const lease = feedbackOnly ? capabilities.issue(id, { scope: "feedback", useLimit: FEEDBACK_CAPABILITY_USES }) : capabilities.issue(id);
        sendJson(res, 201, { ok: true, schemaVersion: "1.0", ...lease }, { "Cache-Control": "no-store" }); return;
      }
      if (req.method === "POST" && url.pathname === "/community/v1/feedback") {
        const allowance = feedbackRateLimit(privateAddressKey);
        if (!allowance.ok) { sendJson(res, 429, { ok: false, error: "Feedback limit reached; try again later." }, { "Retry-After": String(allowance.retryAfter) }); return; }
        const body = await readJson(req);
        const id = participantId(body.participantId);
        const feedback = normalizeFeedback(body.feedback);
        if (body.schemaVersion !== "1.0" || !id || !feedback) {
          sendJson(res, 400, { ok: false, error: "Expected schemaVersion 1.0, a request identifier, a category and a message." }); return;
        }
        capabilities.consume(body.capability, id, "feedback");
        // Counted only for a note that is otherwise acceptable, so a refused
        // request cannot use up anybody's day or the service's hour.
        const daily = feedbackDailyRateLimit(privateAddressKey);
        if (!daily.ok) { sendJson(res, 429, { ok: false, error: "Feedback limit reached for today; please use email instead." }, { "Retry-After": String(daily.retryAfter) }); return; }
        const service = feedbackServiceRateLimit(FEEDBACK_SERVICE_KEY);
        if (!service.ok) { sendJson(res, 429, { ok: false, error: "The feedback inbox is busy; try again later or use email." }, { "Retry-After": String(service.retryAfter) }); return; }
        // The request identifier only binds the capability; it is not stored.
        await store.saveFeedback(feedback);
        sendJson(res, 202, { ok: true, receivedAt: new Date().toISOString() }, { "Cache-Control": "no-store" }); return;
      }
      if (req.method === "POST" && url.pathname === "/community/v1/diagnostics") {
        const allowance = diagnosticsRateLimit(privateAddressKey);
        if (!allowance.ok) { sendJson(res, 429, { ok: false, error: "Error report limit reached; try again later." }, { "Retry-After": String(allowance.retryAfter) }); return; }
        const body = await readJson(req);
        const id = participantId(body.participantId);
        if (body.schemaVersion !== "1.0" || !id || !Array.isArray(body.reports) || body.reports.length < 1 || body.reports.length > DIAGNOSTIC_BATCH_LIMIT) {
          sendJson(res, 400, { ok: false, error: `Expected schemaVersion 1.0, an anonymous browser identifier, and 1-${DIAGNOSTIC_BATCH_LIMIT} error reports.` }); return;
        }
        capabilities.consume(body.capability, id);
        const reports = body.reports.map((row) => normalizeDiagnosticReport(row));
        if (reports.some((row) => row == null)) { sendJson(res, 400, { ok: false, error: "One or more error reports are not in the expected shape." }); return; }
        const result = await store.saveDiagnostics(id, reports);
        sendJson(res, 202, { ok: true, ...result }, { "Cache-Control": "no-store" }); return;
      }
      if (req.method === "POST" && url.pathname === "/community/v1/events") {
        const body = await readJson(req);
        const id = participantId(body.participantId);
        if (body.schemaVersion !== "1.0" || !id || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > COMMUNITY_BATCH_LIMIT) {
          sendJson(res, 400, { ok: false, error: `Expected schemaVersion 1.0, an anonymous browser identifier, and 1-${COMMUNITY_BATCH_LIMIT} events.` }); return;
        }
        capabilities.consume(body.capability, id);
        const now = Date.now();
        const events = body.events.map((row) => {
          const normalized = normalizeCommunityEvent(row, { now });
          return normalized ? { ...normalized, evidenceTier: "browser-receipt" } : null;
        });
        if (events.some((row) => row == null)) { sendJson(res, 400, { ok: false, error: "One or more events failed the public receipt contract." }); return; }
        const result = await store.ingest(id, events);
        sendJson(res, 202, { ok: true, ...result, receivedAt: new Date(now).toISOString() }, { "Cache-Control": "no-store" }); return;
      }
      // Weekly challenge board. A score needs the same sharing capability as
      // game stats, so only a browser with Community Stats on can post one.
      if (req.method === "POST" && url.pathname === "/community/v1/challenge/score") {
        const allowance = challengeScoreRateLimit(privateAddressKey);
        if (!allowance.ok) { sendJson(res, 429, { ok: false, error: "Challenge score limit reached; try again later." }, { "Retry-After": String(allowance.retryAfter) }); return; }
        const body = await readJson(req);
        const id = participantId(body.participantId);
        if (body.schemaVersion !== "1.0" || !id || !body.entry || typeof body.entry !== "object") {
          sendJson(res, 400, { ok: false, error: "Expected schemaVersion 1.0, an anonymous browser identifier, and one challenge score." }); return;
        }
        capabilities.consume(body.capability, id);
        const entry = normalizeChallengeScore(body.entry, { now: challengeClock() });
        if (!entry) { sendJson(res, 400, { ok: false, error: "That score does not fit an open week's challenge goal." }); return; }
        const result = await store.saveChallengeScore(id, entry);
        sendJson(res, 202, { ok: true, ...result }, { "Cache-Control": "no-store" }); return;
      }
      if (req.method === "GET" && url.pathname === "/community/v1/challenge/board") {
        const week = url.searchParams.get("week");
        if (!isChallengeWeekKey(week) || !openChallengeWeeks(challengeClock()).includes(week)) {
          sendJson(res, 400, { ok: false, error: "Expected an open challenge week such as 2026-W47." }, { "Cache-Control": "no-store" }); return;
        }
        const board = await store.challengeBoard(week);
        sendJson(res, 200, board, { "Cache-Control": "public, max-age=30, s-maxage=60" }); return;
      }
      // First steps: how many participating browsers reached each early
      // milestone, and how long people were away before coming back. The same
      // figures the snapshot carries, on their own for a report to read.
      if (req.method === "GET" && url.pathname === "/community/v1/first-steps") {
        const snapshot = await store.snapshot();
        const payload = {
          schemaVersion: snapshot.schemaVersion,
          computedAt: snapshot.computedAt,
          suppressionThreshold: snapshot.suppressionThreshold,
          denominator: snapshot.denominator,
          periods: Object.fromEntries(Object.entries(snapshot.periods || {}).map(([key, period]) => [key, period.firstSteps ?? null]))
        };
        sendJson(res, 200, payload, { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" }); return;
      }
      // League Pulse: anonymous counters, on by default in the game with an
      // opt-out. No identifier, no capability and no stored row per request:
      // the counters are added to a daily total and the request is forgotten.
      // An allowed browser origin is still required (checked above), the
      // address is only used, keyed and in memory, to rate-limit, and every
      // counter has a per-pulse ceiling (pulseContract.js).
      if (req.method === "POST" && url.pathname === "/community/v1/pulse") {
        const allowance = pulseRateLimit(privateAddressKey);
        if (!allowance.ok) { sendJson(res, 429, { ok: false, error: "Pulse limit reached; try again later." }, { "Retry-After": String(allowance.retryAfter) }); return; }
        const counts = normalizeLeaguePulse(await readJson(req));
        if (!counts) { sendJson(res, 400, { ok: false, error: "Expected a pulse-1 payload of known counters within their limits." }, { "Cache-Control": "no-store" }); return; }
        // Only the live game counts. Staging and local QA play the same pages,
        // so their pulses are accepted and dropped rather than refused.
        if (!pulseOrigins.has(origin)) { sendJson(res, 202, { ok: true, added: 0, counted: false }, { "Cache-Control": "no-store" }); return; }
        const result = await store.addPulse(counts);
        sendJson(res, 202, { ok: true, ...result }, { "Cache-Control": "no-store" }); return;
      }
      if (req.method === "GET" && url.pathname === "/community/v1/pulse") {
        const totals = await store.pulseTotals();
        sendJson(res, 200, totals, { "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600" }); return;
      }
      if (req.method === "DELETE" && url.pathname === "/community/v1/participation") {
        const body = await readJson(req);
        const id = participantId(body.participantId);
        if (body.schemaVersion !== "1.0" || !id) { sendJson(res, 400, { ok: false, error: "A valid anonymous browser identifier is required." }); return; }
        capabilities.consume(body.capability, id);
        const result = await store.deleteParticipant(id);
        sendJson(res, 200, { ok: true, ...result, message: "Receipts associated with this anonymous browser identifier were deleted." }, { "Cache-Control": "no-store" }); return;
      }
      sendJson(res, 404, { ok: false, error: "Community Stats route not found." }, { "Cache-Control": "no-store" });
    } catch (error) {
      const status = Number(error.status || 500);
      // A human-check refusal names the widget to solve; nothing else about the failure is sent.
      const extra = error.humanCheck ? { humanCheck: error.humanCheck } : {};
      sendJson(res, status, { ok: false, error: status >= 500 && !error.humanCheck ? "Community Stats is temporarily unavailable." : error.message, ...extra }, { "Cache-Control": "no-store" });
    }
  };
}

export function startCommunityStatsServer({ databaseUrl = process.env.DATABASE_URL, keyPath = process.env.COMMUNITY_KEY_PATH } = {}) {
  const store = new CommunityStore({ databaseUrl, ...(keyPath ? { keyPath } : {}) });
  const server = http.createServer(createCommunityStatsHandler({ store }));
  server.listen(PORT, "0.0.0.0", () => console.log(`Community Stats listening on ${PORT}`));
  // Retention must not depend on somebody writing: a quiet service still has
  // to delete rows older than 30 days. store.close() stops the timer.
  store.startRetentionTimer();
  const close = async () => { server.close(); await store.close(); };
  process.once("SIGTERM", close); process.once("SIGINT", close);
  return { server, store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startCommunityStatsServer();
