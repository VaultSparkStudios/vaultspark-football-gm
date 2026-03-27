/**
 * GitHub Gist Save Sync
 *
 * Exports a compressed snapshot to a private GitHub Gist and imports it back.
 * No backend required — uses the GitHub REST API directly from the browser.
 * Authentication is via a user-provided Personal Access Token (gist scope only).
 *
 * Token is stored in localStorage (user-managed, not transmitted to our servers).
 *
 * Usage:
 *   exportToGist(snapshot, token)  → returns { gistId, url }
 *   importFromGist(gistId, token)  → returns { snapshot }
 *   listGists(token)               → returns [{ id, description, updatedAt }]
 */

const GIST_API = "https://api.github.com/gists";
const GIST_FILENAME = "vsfgm-save.json";
const TOKEN_KEY = "vsfgm_gist_token";
const GIST_ID_KEY = "vsfgm_gist_id";

// ── Token helpers ─────────────────────────────────────────────────────────────

export function getSavedToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function saveToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getSavedGistId() {
  return localStorage.getItem(GIST_ID_KEY) || "";
}

export function saveGistId(id) {
  if (id) localStorage.setItem(GIST_ID_KEY, id);
  else localStorage.removeItem(GIST_ID_KEY);
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
  if (content.length > 10_000_000) throw new Error("Snapshot too large for Gist (> 10 MB). Try exporting after a shorter session.");

  const targetId = gistId || getSavedGistId();
  const description = `VaultSpark Football GM save — ${new Date().toISOString().slice(0, 10)} (${size} KB)`;
  const body = {
    description,
    public: false,
    files: { [GIST_FILENAME]: { content } }
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

  const raw = file.content || file.raw_url
    ? await fetch(file.raw_url).then((r) => r.text())
    : null;
  if (!raw) throw new Error("Could not read Gist file content.");

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
