/**
 * snapshotCodec.js — fit a franchise inside a browser storage quota (S65).
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * The browser save store writes to `window.localStorage`, whose per-origin
 * budget is typically 5–10 MB. A full-season `mode:"play"` snapshot measured
 * **16.83 MB as raw JSON** even after the S65 payload reductions, because the
 * irreducible core — 1568 players carrying season and career stat lines — is
 * ~6.8 MB on its own. No amount of trimming derived data fixes that: the game
 * state simply does not fit as raw JSON.
 *
 * Snapshots are extremely repetitive JSON, so they compress exceptionally well.
 * Measured on that same full-season snapshot:
 *
 *     raw JSON            16.83 MB
 *     gzip                 1.48 MB   (11.4x)
 *     gzip + base64        1.97 MB   (8.5x effective, and base64 is what a
 *                                     string-only store can actually hold)
 *
 * That turns "cannot finish one season" into a comfortable fit.
 *
 * ── Compatibility ───────────────────────────────────────────────────────────
 *
 * Encoded payloads carry a short magic prefix. `decodeSnapshot` recognises it,
 * and passes anything else through as plain JSON — so **existing saves written
 * before this change load unchanged**, and a payload written by this build is
 * self-describing rather than relying on a schema flag.
 *
 * If `CompressionStream` is unavailable, `encodeSnapshot` falls back to plain
 * JSON rather than failing. The save is then large, but it is never lost.
 *
 * ── Integrity ───────────────────────────────────────────────────────────────
 *
 * The store stamps and verifies the *stored string*. Encoding happens before
 * stamping and decoding after verification, so the stamp continues to mean
 * exactly what it always meant: "the bytes on disk are the bytes we wrote".
 */

/** Marks a payload as gzip+base64 rather than plain JSON. */
export const ENCODED_PREFIX = "vsfgz1:";

export function isEncodedSnapshot(text) {
  return typeof text === "string" && text.startsWith(ENCODED_PREFIX);
}

export function compressionAvailable() {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000; // chunked to avoid blowing the argument limit on big saves
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function streamThrough(transform, bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Serialize a snapshot into the string the store will persist.
 * @returns {Promise<string>}
 */
export async function encodeSnapshot(snapshot) {
  const json = JSON.stringify(snapshot);
  if (!compressionAvailable()) return json;
  try {
    const deflated = await streamThrough(new CompressionStream("gzip"), new TextEncoder().encode(json));
    const encoded = `${ENCODED_PREFIX}${bytesToBase64(deflated)}`;
    // Guard against pathological inputs where the encoded form is somehow
    // larger; storing the smaller of the two is always correct.
    return encoded.length < json.length ? encoded : json;
  } catch {
    return json;
  }
}

/**
 * Parse a stored payload back into a snapshot, transparently handling both the
 * encoded form and legacy plain JSON.
 * @returns {Promise<object>}
 */
export async function decodeSnapshot(text) {
  if (!isEncodedSnapshot(text)) return JSON.parse(text);
  if (!compressionAvailable()) {
    throw new Error(
      "This save is compressed, but this browser cannot decompress it. Open it in a current browser to recover the franchise."
    );
  }
  const bytes = base64ToBytes(text.slice(ENCODED_PREFIX.length));
  const inflated = await streamThrough(new DecompressionStream("gzip"), bytes);
  return JSON.parse(new TextDecoder().decode(inflated));
}
