/**
 * challengeCodes.js — Shareable seeded challenge codes (S14)
 *
 * The sim is fully deterministic from a seed, so a compact code is enough for
 * a friend to replay your exact league and try to beat your result — no
 * accounts, no server, works on a pure static host.
 *
 * Code format:  VSFC1.<base64url-json>.<fnv1a-checksum>
 * Payload:      { s: seed, y: startYear, t: teamId, rs: rivalSeasons, rn: rivalName }
 * The checksum rejects typos and tampering; the version prefix allows future
 * payload evolution without breaking old codes.
 *
 * Pure functions (encode/decode/checksum) are environment-free so Node tests
 * can exercise them; only the rival-target store touches localStorage.
 */

const CODE_PREFIX = "VSFC1";
const RIVAL_KEY = "vsfgm_challenge_rival_v1";

// ── FNV-1a 32-bit checksum, base36, 4 chars ──────────────────────────────────

export function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function checksum4(str) {
  return (fnv1a(str) % 1679616).toString(36).padStart(4, "0"); // 36^4
}

// ── base64url helpers (browser + Node) ───────────────────────────────────────

function toBase64Url(str) {
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(str)))
      : Buffer.from(str, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return typeof atob === "function"
    ? decodeURIComponent(escape(atob(b64)))
    : Buffer.from(b64, "base64").toString("utf8");
}

// ── Encode / decode ──────────────────────────────────────────────────────────

/**
 * @param {object} input
 * @param {number} input.seed        league RNG seed
 * @param {number} input.startYear   league start year
 * @param {string} input.teamId      controlled team id
 * @param {number} [input.rivalSeasons] the result to beat (seasons to a title)
 * @param {string} [input.rivalName]    display name of the challenger
 * @returns {string|null} challenge code, or null on invalid input
 */
export function encodeChallengeCode({ seed, startYear, teamId, rivalSeasons, rivalName } = {}) {
  const s = Number(seed);
  const y = Number(startYear);
  const t = String(teamId || "").toUpperCase().slice(0, 5);
  if (!Number.isFinite(s) || !Number.isFinite(y) || !t) return null;
  const payload = { s, y, t };
  if (Number.isFinite(Number(rivalSeasons)) && Number(rivalSeasons) > 0) {
    payload.rs = Number(rivalSeasons);
  }
  if (rivalName) payload.rn = String(rivalName).slice(0, 24);
  const body = toBase64Url(JSON.stringify(payload));
  return `${CODE_PREFIX}.${body}.${checksum4(`${CODE_PREFIX}.${body}`)}`;
}

/**
 * @param {string} code
 * @returns {{seed:number,startYear:number,teamId:string,rivalSeasons:number|null,rivalName:string|null}|null}
 */
export function decodeChallengeCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX) return null;
  const [prefix, body, chk] = parts;
  if (checksum4(`${prefix}.${body}`) !== chk) return null;
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(body));
  } catch {
    return null;
  }
  const seed = Number(payload?.s);
  const startYear = Number(payload?.y);
  const teamId = String(payload?.t || "").toUpperCase();
  if (!Number.isFinite(seed) || !Number.isFinite(startYear) || !teamId) return null;
  return {
    seed,
    startYear,
    teamId,
    rivalSeasons: Number.isFinite(Number(payload.rs)) ? Number(payload.rs) : null,
    rivalName: payload.rn ? String(payload.rn) : null
  };
}

// ── Rival-target store (browser only) ────────────────────────────────────────

export function saveRivalTarget(decoded) {
  try {
    if (!decoded) localStorage.removeItem(RIVAL_KEY);
    else localStorage.setItem(RIVAL_KEY, JSON.stringify(decoded));
  } catch {
    // storage unavailable — non-critical
  }
}

export function loadRivalTarget() {
  try {
    const raw = localStorage.getItem(RIVAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
