import http from "node:http";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { CommunityStore } from "./communityStore.js";
import { aggregateCommunitySnapshot } from "./aggregateCommunitySnapshot.js";
import { COMMUNITY_BATCH_LIMIT, normalizeCommunityEvent } from "./eventContract.js";

const PORT = Number(process.env.PORT || 8082);
const MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_ORIGINS = ["https://playfranchisearchitect.com", "https://staging.playfranchisearchitect.com"];

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

function requestIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function etag(payload) { return `"${createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24)}"`; }

export function createCommunityStatsHandler({ store, origins = allowedOrigins(), rateLimit = createMemoryRateLimiter() } = {}) {
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

    const rate = rateLimit(requestIp(req));
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
        if (req.headers["if-none-match"] === tag) { res.writeHead(304, { ETag: tag, "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" }); res.end(); return; }
        sendJson(res, snapshot.status === "unavailable" ? 503 : 200, snapshot, { ETag: tag, "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" }); return;
      }
      if (req.method === "POST" && url.pathname === "/community/v1/events") {
        const body = await readJson(req);
        const id = participantId(body.participantId);
        if (body.schemaVersion !== "1.0" || !id || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > COMMUNITY_BATCH_LIMIT) {
          sendJson(res, 400, { ok: false, error: `Expected schemaVersion 1.0, an anonymous browser identifier, and 1-${COMMUNITY_BATCH_LIMIT} events.` }); return;
        }
        const now = Date.now();
        const events = body.events.map((row) => normalizeCommunityEvent(row, { now }));
        if (events.some((row) => row == null)) { sendJson(res, 400, { ok: false, error: "One or more events failed the public receipt contract." }); return; }
        const result = await store.ingest(id, events);
        sendJson(res, 202, { ok: true, ...result, receivedAt: new Date(now).toISOString() }, { "Cache-Control": "no-store" }); return;
      }
      if (req.method === "DELETE" && url.pathname === "/community/v1/participation") {
        const body = await readJson(req);
        const id = participantId(body.participantId);
        if (body.schemaVersion !== "1.0" || !id) { sendJson(res, 400, { ok: false, error: "A valid anonymous browser identifier is required." }); return; }
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
