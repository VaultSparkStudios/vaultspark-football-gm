import http from "node:http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { CommunityStore } from "./communityStore.js";
import { aggregateCommunitySnapshot } from "./aggregateCommunitySnapshot.js";
import { COMMUNITY_BATCH_LIMIT, normalizeCommunityEvent } from "./eventContract.js";

const PORT = Number(process.env.PORT || 8082);
const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_ORIGINS = ["https://playfranchisearchitect.com", "https://staging.playfranchisearchitect.com"];
const PROCESS_CAPABILITY_KEY = randomBytes(32);
const PROCESS_ADDRESS_KEY = randomBytes(32);
const CAPABILITY_TTL_MS = 15 * 60 * 1000;
const CAPABILITY_USE_LIMIT = 16;
const CAPABILITY_PARTICIPANT_LIMIT = 4;
const CAPABILITY_PARTICIPANT_WINDOW_MS = 24 * 60 * 60 * 1000;

function allowedOrigins() {
  return new Set(String(process.env.COMMUNITY_ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(",")).split(",").map((value) => value.trim().replace(/\/+$/, "")).filter(Boolean));
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...headers });
  res.end(body);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) { const error = new Error("Request body is too large."); error.status = 413; throw error; }
  }
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

function trustedRequestAddress(req) {
  const peer = String(req.socket?.remoteAddress || "unknown").trim();
  if (!isLoopbackAddress(peer)) return peer;
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || peer;
}

/**
 * Produces a process-local, privacy-safe rate-limit key. Raw network addresses
 * exist only long enough to compute this HMAC; they are never stored or logged.
 */
export function createPrivacySafeAddressKey(signingKey = PROCESS_ADDRESS_KEY) {
  const key = Buffer.isBuffer(signingKey) ? signingKey : Buffer.from(String(signingKey));
  return (req) => createHmac("sha256", key).update(`community-address-v1:${trustedRequestAddress(req)}`).digest("base64url");
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

  function issue(participantId) {
    const now = Number(clock());
    prune(now);
    const subject = participantSubject(participantId, key);
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
    const boundedUseLimit = Math.max(1, Math.min(64, Math.floor(Number(useLimit) || CAPABILITY_USE_LIMIT)));
    const payload = { v: 1, sub: subject, exp: expiresAt, nonce, useLimit: boundedUseLimit };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const capability = `${encoded}.${signCapabilityPayload(encoded, key)}`;
    active.set(nonce, { subject, expiresAt, useLimit: boundedUseLimit, uses: 0, capability });
    activeBySubject.set(subject, nonce);
    return { capability, expiresAt: new Date(expiresAt).toISOString(), useLimit: boundedUseLimit, remainingUses: boundedUseLimit };
  }

  function consume(capability, participantId) {
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
    const subject = participantSubject(participantId, key);
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
  addressKey = createPrivacySafeAddressKey()
} = {}) {
  if (!store) throw new Error("Community Stats handler requires a store.");
  return async function handler(req, res) {
    const url = new URL(req.url || "/", "http://community.local");
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
        sendJson(res, 200, { ...health, service: "franchise-architect-community-stats" }, { "Cache-Control": "no-store" }); return;
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
        const issuance = capabilityIssueRateLimit(privateAddressKey, id);
        if (!issuance.ok) { sendJson(res, 429, { ok: false, error: "Participation capability limit reached; try again shortly." }, { "Retry-After": String(issuance.retryAfter) }); return; }
        sendJson(res, 201, { ok: true, schemaVersion: "1.0", ...capabilities.issue(id) }, { "Cache-Control": "no-store" }); return;
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
      sendJson(res, status, { ok: false, error: status >= 500 ? "Community Stats is temporarily unavailable." : error.message }, { "Cache-Control": "no-store" });
    }
  };
}

export function startCommunityStatsServer({ databaseUrl = process.env.DATABASE_URL, keyPath = process.env.COMMUNITY_KEY_PATH } = {}) {
  const store = new CommunityStore({ databaseUrl, ...(keyPath ? { keyPath } : {}) });
  const server = http.createServer(createCommunityStatsHandler({ store }));
  server.listen(PORT, "0.0.0.0", () => console.log(`Community Stats listening on ${PORT}`));
  const close = async () => { server.close(); await store.close(); };
  process.once("SIGTERM", close); process.once("SIGINT", close);
  return { server, store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startCommunityStatsServer();
