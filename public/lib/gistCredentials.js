const TOKEN_KEY = "vsfgm_gist_token";
const GIST_ID_KEY = "vsfgm_gist_id";
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
