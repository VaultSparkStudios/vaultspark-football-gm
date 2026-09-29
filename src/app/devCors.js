/**
 * devCors.js — origin policy for the local development server.
 *
 * S109. `applyCorsHeaders` used to reflect any request Origin when no
 * ALLOWED_ORIGINS were configured, which is every developer's default. The
 * deployed game never calls this server (the browser runtime is the product),
 * so exposure was a developer on a shared network — but a server that also
 * holds one shared franchise session should fail closed by default.
 */

export const DEFAULT_DEV_ORIGINS = Object.freeze([
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
]);

const ORIGIN_ENV_KEYS = ["APP_ORIGIN", "GAME_PUBLIC_ORIGIN", "GAME_SERVICE_ORIGIN", "API_ORIGIN"];

export function resolveAllowedOrigins(env = process.env) {
  const configured = ORIGIN_ENV_KEYS
    .map((key) => String(env[key] || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_DEV_ORIGINS);
}

// Header pairs in setHeader order. The API-contract parity gate reads the
// methods literal in this exact `"name", "value"` shape.
export function corsHeadersFor(requestOrigin, allowedOrigins) {
  const origin = String(requestOrigin || "").trim().replace(/\/+$/, "");
  if (!origin || !allowedOrigins.has(origin)) return null;
  return [
    ["Access-Control-Allow-Origin", origin],
    ["Vary", "Origin"],
    ["Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS"],
    ["Access-Control-Allow-Headers", "Content-Type"]
  ];
}
