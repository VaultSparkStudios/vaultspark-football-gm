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
export const CHALLENGE_CODE_MAX_LENGTH = 512;
const CHALLENGE_BODY_MAX_LENGTH = 384;
const TEAM_ID_RE = /^[A-Z0-9_-]{1,5}$/;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

function validSeed(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validStartYear(value) {
  return Number.isInteger(value) && value >= 1900 && value <= 3000;
}

function validRivalSeasons(value) {
  return value == null || (Number.isInteger(value) && value >= 1 && value <= 200);
}

function boundedRivalName(value) {
  if (value == null || value === "") return null;
  const name = String(value).trim().slice(0, 24);
  return name && !CONTROL_CHAR_RE.test(name) ? name : null;
}

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
  const t = String(teamId || "").toUpperCase();
  const rs = rivalSeasons == null || rivalSeasons === "" ? null : Number(rivalSeasons);
  const rn = boundedRivalName(rivalName);
  if (!validSeed(s) || !validStartYear(y) || !TEAM_ID_RE.test(t) || !validRivalSeasons(rs)) return null;
  if (rivalName && !rn) return null;
  const payload = { s, y, t };
  if (rs != null) payload.rs = rs;
  if (rn) payload.rn = rn;
  const body = toBase64Url(JSON.stringify(payload));
  if (body.length > CHALLENGE_BODY_MAX_LENGTH) return null;
  const code = `${CODE_PREFIX}.${body}.${checksum4(`${CODE_PREFIX}.${body}`)}`;
  return code.length <= CHALLENGE_CODE_MAX_LENGTH ? code : null;
}

/**
 * @param {string} code
 * @returns {{seed:number,startYear:number,teamId:string,rivalSeasons:number|null,rivalName:string|null}|null}
 */
export function decodeChallengeCode(code) {
  if (typeof code !== "string") return null;
  const trimmed = code.trim();
  if (!trimmed || trimmed.length > CHALLENGE_CODE_MAX_LENGTH || CONTROL_CHAR_RE.test(trimmed)) return null;
  const parts = trimmed.split(".");
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX) return null;
  const [prefix, body, chk] = parts;
  if (!body || body.length > CHALLENGE_BODY_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(body)) return null;
  if (!/^[a-z0-9]{4}$/.test(chk)) return null;
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
  const rivalSeasons = payload?.rs == null ? null : Number(payload.rs);
  const rivalName = boundedRivalName(payload?.rn);
  if (!validSeed(seed) || !validStartYear(startYear) || !TEAM_ID_RE.test(teamId)) return null;
  if (!validRivalSeasons(rivalSeasons)) return null;
  if (payload?.rn != null && !rivalName) return null;
  return {
    seed,
    startYear,
    teamId,
    rivalSeasons,
    rivalName
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
