// Rewind storage belongs to the runtime, including its acknowledged worker mirror.
export const REWIND_BYTE_BUDGET = 4 * 1024 * 1024;
export const REWIND_SLOT_LIMIT = 10;
const INDEX_KEY = "vsfgm-rw-index";
const STATE_PREFIX = "vsfgm:rw-state:";
const set = (storage, key, value) => typeof storage.setItemAsync === "function"
  ? storage.setItemAsync(key, value) : storage.setItem(key, value);
const remove = (storage, key) => typeof storage.removeItemAsync === "function"
  ? storage.removeItemAsync(key) : storage.removeItem(key);

/** Publish only reachable checkpoints; evict oldest, retaining the newest even
 * when it alone exceeds the runway budget. The budget uses stored string
 * length, matching the existing browser guard (not a browser quota estimate).
 */
export async function retainRewindCheckpoints(storage, entries, {
  maxSize = REWIND_BYTE_BUDGET, maxSlots = REWIND_SLOT_LIMIT, newestId = null
} = {}) {
  const seen = new Set();
  let retained = entries.filter(entry => {
    if (!entry || typeof entry.id !== "string" || !entry.id || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return storage.getItem(STATE_PREFIX + entry.id) != null;
  }).map((entry, index) => ({ entry, index, time: Date.parse(entry.createdAt) }));
  // Canonical indexes are newest-first; preserve that order for unknown dates.
  retained.sort((a, b) => {
    if ((a.entry.id === newestId) !== (b.entry.id === newestId)) return a.entry.id === newestId ? -1 : 1;
    const aKnown = Number.isFinite(a.time), bKnown = Number.isFinite(b.time);
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    return (aKnown ? b.time - a.time : 0) || a.index - b.index;
  });
  retained = retained.map(row => row.entry);
  const normalizedIndex = JSON.stringify(retained);
  if (storage.getItem(INDEX_KEY) !== normalizedIndex) await set(storage, INDEX_KEY, normalizedIndex);
  const size = () => JSON.stringify(retained).length + retained.reduce((sum, row) =>
    sum + (storage.getItem(STATE_PREFIX + row.id)?.length || 0), 0);
  let pruned = 0;
  while (retained.length > 1 && (retained.length > maxSlots || size() > maxSize)) {
    const oldest = retained.at(-1), next = retained.slice(0, -1);
    // Publish the removal before deleting bytes. A rejected index write leaves
    // every existing checkpoint intact. A rejected delete restores its entry.
    await set(storage, INDEX_KEY, JSON.stringify(next));
    try { await remove(storage, STATE_PREFIX + oldest.id); }
    catch (error) {
      try { await set(storage, INDEX_KEY, JSON.stringify(retained)); }
      catch (rollback) { throw new AggregateError([error, rollback], "Rewind cleanup failed and its index could not be restored."); }
      throw error;
    }
    retained = next;
    pruned += 1;
  }
  return { snapshots: retained, pruned };
}
