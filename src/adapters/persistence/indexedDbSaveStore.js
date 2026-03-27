/**
 * IndexedDB Save Store — High-Capacity In-Browser Persistence
 *
 * Provides up to 250MB of save storage vs localStorage's ~5MB ceiling.
 * Designed as a drop-in complement to browserSaveStore.js:
 * both expose the same save/load/list/delete surface.
 *
 * Falls back gracefully: isAvailable() returns false when IndexedDB
 * is not accessible (private browsing mode, old browser, etc.).
 *
 * Usage:
 *   const store = createIndexedDbSaveStore();
 *   if (store.isAvailable()) {
 *     await store.save("slot1", snapshot);
 *     const snap = await store.load("slot1");
 *   }
 */

const DB_NAME    = "vsfgm_saves_idb";
const DB_VERSION = 1;
const STORE_NAME = "saves";

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "slot" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTransaction(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// ── Public primitives ─────────────────────────────────────────────────────────

export async function idbSave(slot, snapshot) {
  const record = {
    slot,
    data:    JSON.stringify(snapshot),
    savedAt: new Date().toISOString(),
    size:    0
  };
  record.size = record.data.length;
  await idbTransaction("readwrite", (store) => store.put(record));
  return { slot, savedAt: record.savedAt, size: record.size };
}

export async function idbLoad(slot) {
  const record = await idbTransaction("readonly", (store) => store.get(slot));
  if (!record) return null;
  try { return JSON.parse(record.data); } catch { return null; }
}

export async function idbList() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx   = db.transaction(STORE_NAME, "readonly");
    const req  = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(
      req.result.map(({ slot, savedAt, size }) => ({ slot, savedAt, size }))
    );
    req.onerror = () => reject(req.error);
  });
}

export async function idbDelete(slot) {
  await idbTransaction("readwrite", (store) => store.delete(slot));
  return true;
}

export function isIndexedDbAvailable() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

// ── Store factory ─────────────────────────────────────────────────────────────

export function createIndexedDbSaveStore({ now = () => new Date().toISOString() } = {}) {
  const available = isIndexedDbAvailable();

  return {
    isAvailable: () => available,

    async save(slot, snapshot) {
      if (!available) throw new Error("IndexedDB not available in this context.");
      return idbSave(slot, snapshot);
    },

    async load(slot) {
      if (!available) return null;
      return idbLoad(slot);
    },

    async list() {
      if (!available) return [];
      return idbList();
    },

    async delete(slot) {
      if (!available) return false;
      return idbDelete(slot);
    },

    // Storage estimate (Chrome/Firefox only)
    async storageEstimate() {
      if (!navigator?.storage?.estimate) return null;
      const { usage, quota } = await navigator.storage.estimate();
      return {
        usedMb:  (usage / 1_048_576).toFixed(1),
        quotaMb: (quota / 1_048_576).toFixed(1),
        pct:     Math.round((usage / quota) * 100)
      };
    }
  };
}
