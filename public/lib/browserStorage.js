export function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}
