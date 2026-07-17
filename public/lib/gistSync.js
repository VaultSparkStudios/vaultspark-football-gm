/**
 * GitHub Gist Save Sync
 *
 * Exports a compressed snapshot to a private GitHub Gist and imports it back.
 * No backend required — uses the GitHub REST API directly from the browser.
 * Authentication is via a user-provided Personal Access Token (gist scope only).
 *
 * Token is kept in memory/sessionStorage for this tab only and is never written
 * to persistent localStorage or transmitted to VaultSpark servers.
 *
 * Usage:
 *   exportToGist(snapshot, token)  → returns { gistId, url }
 *   importFromGist(gistId, token)  → returns { snapshot }
 *   listGists(token)               → returns [{ id, description, updatedAt }]
 */

const GIST_API = "https://api.github.com/gists";
const GIST_FILENAME = "vsfgm-save.json";
const INTEGRITY_FILENAME = "vsfgm-save.integrity.json";

// ── Integrity stamp (S14) ─────────────────────────────────────────────────────
// Mirrors src/adapters/persistence/saveStoreShared.js — kept inline because
// gistSync is a dependency-free leaf module in the static Pages bundle.

function computeSnapshotChecksum(serialized) {
  const str = String(serialized);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildIntegrityStamp(serialized) {
  return { algo: "fnv1a32", checksum: computeSnapshotChecksum(serialized), length: String(serialized).length };
}

function verifyIntegrityStamp(serialized, integrity) {
  if (!integrity || integrity.algo !== "fnv1a32") return true; // legacy payloads: nothing to verify
  const str = String(serialized);
  return integrity.length === str.length && integrity.checksum === computeSnapshotChecksum(str);
}
const TOKEN_KEY = "vsfgm_gist_token";
const GIST_ID_KEY = "vsfgm_gist_id";
const MAX_GIST_BYTES = 10_000_000;
let memoryToken = "";

function storageOrNull(name) {
  try {
    return globalThis[name] || null;
  } catch {
    return null;
  }
}

function removeLegacyToken() {
  const persistent = storageOrNull("localStorage");
  const legacy = persistent?.getItem(TOKEN_KEY) || "";
  persistent?.removeItem(TOKEN_KEY);
  return legacy;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export function getSavedToken() {
  if (memoryToken) return memoryToken;
  const session = storageOrNull("sessionStorage");
  const sessionToken = session?.getItem(TOKEN_KEY) || "";
  if (sessionToken) {
    memoryToken = sessionToken;
    removeLegacyToken();
    return memoryToken;
  }
  const legacy = removeLegacyToken();
  if (legacy) {
    memoryToken = legacy;
    session?.setItem(TOKEN_KEY, legacy);
  }
  return memoryToken;
}

export function saveToken(token) {
  const normalized = String(token || "").trim();
  if (/^[•*]{4,}\S{0,4}$/.test(normalized)) {
    return { ok: false, error: "Masked token text is not a credential. Paste the token again." };
  }
  memoryToken = normalized;
  const session = storageOrNull("sessionStorage");
  if (normalized) session?.setItem(TOKEN_KEY, normalized);
  else session?.removeItem(TOKEN_KEY);
  removeLegacyToken();
  return { ok: true, stored: Boolean(normalized), scope: "tab-session" };
}

export function getSavedGistId() {
  return storageOrNull("localStorage")?.getItem(GIST_ID_KEY) || "";
}

export function saveGistId(id) {
  const storage = storageOrNull("localStorage");
  if (id) storage?.setItem(GIST_ID_KEY, id);
  else storage?.removeItem(GIST_ID_KEY);
}

async function readGistFile(file, label) {
  if (!file) return null;
  if (typeof file.content === "string") {
    if (new Blob([file.content]).size > MAX_GIST_BYTES) throw new Error(`${label} is too large (> 10 MB).`);
    return file.content;
  }
  if (!file.raw_url) return null;
  const response = await fetch(file.raw_url, { headers: { Accept: "application/vnd.github.raw+json" } });
  if (!response.ok) throw new Error(`Could not fetch ${label}: HTTP ${response.status}`);
  const content = await response.text();
  if (new Blob([content]).size > MAX_GIST_BYTES) throw new Error(`${label} is too large (> 10 MB).`);
  return content;
}

// ── Core Gist API ─────────────────────────────────────────────────────────────

async function gistRequest(method, path, token, body = null) {
  const resp = await fetch(`${GIST_API}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error ${resp.status}`);
  }
  return resp.json();
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Export a snapshot to a private GitHub Gist.
 * If a gistId is provided (or saved in localStorage), update that gist.
 * Otherwise create a new one.
 *
 * @param {object|string} snapshot — raw snapshot object or JSON string
 * @param {string}        token    — GitHub PAT with gist scope
 * @param {string}       [gistId]  — existing Gist ID to update (optional)
 * @returns {{ gistId: string, url: string }}
 */
export async function exportToGist(snapshot, token, gistId) {
  if (!token) throw new Error("GitHub token is required. Set it in Settings → Cloud Sync.");
  const content = typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot, null, 0);
  const size = (new Blob([content]).size / 1024).toFixed(0);
  if (new Blob([content]).size > MAX_GIST_BYTES) throw new Error("Snapshot too large for Gist (> 10 MB). Try exporting after a shorter session.");

  const targetId = gistId || getSavedGistId();
  const description = `Franchise Architect: Football save — ${new Date().toISOString().slice(0, 10)} (${size} KB)`;
  const body = {
    description,
    public: false,
    files: {
      [GIST_FILENAME]: { content },
      // Integrity sidecar (S14): lets import detect truncated/corrupted sync payloads.
      [INTEGRITY_FILENAME]: { content: JSON.stringify(buildIntegrityStamp(content)) }
    }
  };

  let result;
  if (targetId) {
    result = await gistRequest("PATCH", `/${targetId}`, token, body);
  } else {
    result = await gistRequest("POST", "", token, body);
  }

  const id  = result.id;
  const url = result.html_url;
  saveGistId(id);
  return { gistId: id, url };
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Import a snapshot from a GitHub Gist.
 *
 * @param {string} gistId — Gist ID to fetch
 * @param {string} token  — GitHub PAT (or empty for public gists)
 * @returns {{ snapshot: object }}
 */
export async function importFromGist(gistId, token) {
  if (!gistId) throw new Error("No Gist ID provided.");
  const headers = {
    "Accept": "application/vnd.github+json"
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${GIST_API}/${gistId}`, { headers });
  if (!resp.ok) throw new Error(`Could not fetch Gist ${gistId}: HTTP ${resp.status}`);

  const data = await resp.json();
  const file = data.files?.[GIST_FILENAME];
  if (!file) throw new Error(`Gist does not contain a "${GIST_FILENAME}" file.`);

  const raw = await readGistFile(file, "cloud save");
  if (!raw) throw new Error("Could not read Gist file content.");

  // Verify integrity sidecar when present (legacy gists without one still import).
  const integrityFile = data.files?.[INTEGRITY_FILENAME];
  if (integrityFile) {
    let integrity = null;
    try {
      const integrityRaw = await readGistFile(integrityFile, "integrity sidecar");
      integrity = integrityRaw ? JSON.parse(integrityRaw) : null;
    } catch {
      integrity = null;
    }
    if (!verifyIntegrityStamp(raw, integrity)) {
      throw new Error(
        "Cloud save failed integrity verification — the synced data is corrupt or was truncated. " +
          "Your local saves are unaffected; re-export from the device that has the good copy."
      );
    }
  }

  const snapshot = JSON.parse(raw);
  return { snapshot, description: data.description };
}

// ── List user's VSFGM gists ───────────────────────────────────────────────────

export async function listGists(token) {
  if (!token) return [];
  const data = await gistRequest("GET", "?per_page=50", token);
  return data
    .filter((g) => g.files?.[GIST_FILENAME])
    .map((g) => ({
      id: g.id,
      description: g.description,
      url: g.html_url,
      updatedAt: g.updated_at
    }));
}
