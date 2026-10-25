const TOKEN_KEY = "vsfgm_gist_token";
const GIST_ID_KEY = "vsfgm_gist_id";
let memoryToken = null;
let memoryGistId = null;

function storageOrNull(name) {
  try {
    return globalThis[name] || null;
  } catch {
    return null;
  }
}

function readStorage(name, key) {
  try { return storageOrNull(name)?.getItem(key) || ""; }
  catch { return ""; }
}

function writeStorage(name, key, value) {
  try {
    const storage = storageOrNull(name);
    if (value) storage?.setItem(key, value);
    else storage?.removeItem(key);
  } catch {}
}

function removeLegacyToken() {
  const legacy = readStorage("localStorage", TOKEN_KEY);
  writeStorage("localStorage", TOKEN_KEY, "");
  return legacy;
}

export function getSavedToken() {
  if (memoryToken !== null) return memoryToken;
  const sessionToken = readStorage("sessionStorage", TOKEN_KEY);
  if (sessionToken) {
    memoryToken = sessionToken;
    removeLegacyToken();
    return memoryToken;
  }
  const legacy = removeLegacyToken();
  if (legacy) {
    memoryToken = legacy;
    writeStorage("sessionStorage", TOKEN_KEY, legacy);
  }
  return memoryToken || "";
}

export function saveToken(token) {
  const normalized = String(token || "").trim();
  if (/^[•*]{4,}\S{0,4}$/.test(normalized)) {
    return { ok: false, error: "Masked token text is not a credential. Paste the token again." };
  }
  memoryToken = normalized;
  writeStorage("sessionStorage", TOKEN_KEY, normalized);
  removeLegacyToken();
  return { ok: true, stored: Boolean(normalized), scope: "tab-session" };
}

export function getSavedGistId() {
  return memoryGistId ?? readStorage("localStorage", GIST_ID_KEY);
}

export function saveGistId(id) {
  memoryGistId = String(id || "");
  writeStorage("localStorage", GIST_ID_KEY, memoryGistId);
}
