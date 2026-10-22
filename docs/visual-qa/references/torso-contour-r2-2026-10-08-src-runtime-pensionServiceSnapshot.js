// Intern repeated forward service histories without deleting individual facts.
// Restore creates independent mutable ledgers; raw legacy objects stay valid.
export const PENSION_SERVICE_STORAGE = 'pension-service-dictionary-v1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid(message) {
  const error = new TypeError(`Invalid pension storage: ${message}`);
  error.reasonCode = 'SNAPSHOT_PENSION_STORAGE_INVALID'; error.status = 400; throw error;
}
function transform(snapshot, convert) {
  const list = players => !Array.isArray(players) ? players : players.map(player =>
    !object(player) || player.pensionService === undefined ? player : { ...player, pensionService: convert(player.pensionService) });
  const league = snapshot.league;
  return { ...snapshot, league: { ...league, players: list(league.players),
    ...(Array.isArray(league.retiredPlayers) ? { retiredPlayers: list(league.retiredPlayers) } : {}),
    ...(object(league.pendingDraft) && Array.isArray(league.pendingDraft.available)
      ? { pendingDraft: { ...league.pendingDraft, available: list(league.pendingDraft.available) } } : {}) } };
}
export function compactSnapshotPensionService(snapshot) {
  if (snapshot.pensionServiceStorage !== undefined) return snapshot;
  const dictionary = [], ids = new Map();
  const compact = transform(snapshot, state => {
    const signature = JSON.stringify(state);
    if (signature === undefined) invalid('non-JSON ledger');
    if (!ids.has(signature)) { ids.set(signature, dictionary.length); dictionary.push(JSON.parse(signature)); }
    return ids.get(signature);
  });
  return { ...compact, pensionServiceStorage: { version: PENSION_SERVICE_STORAGE, dictionary } };
}
export function expandSnapshotPensionService(snapshot) {
  if (snapshot.pensionServiceStorage === undefined) return snapshot;
  const storage = snapshot.pensionServiceStorage;
  if (!object(storage) || storage.version !== PENSION_SERVICE_STORAGE || !Array.isArray(storage.dictionary)
    || Object.keys(storage).some(key => !['version', 'dictionary'].includes(key))) invalid('unsupported dictionary');
  const expanded = transform(snapshot, reference => {
    if (!Number.isSafeInteger(reference) || reference < 0 || reference >= storage.dictionary.length) invalid('reference out of range');
    try { return JSON.parse(JSON.stringify(storage.dictionary[reference])); }
    catch { invalid('non-JSON ledger'); }
  });
  delete expanded.pensionServiceStorage;
  return expanded;
}
