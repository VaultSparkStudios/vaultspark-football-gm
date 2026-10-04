/**
 * Core stat applier (multi-sport Phase 1 step 2).
 *
 * A match engine returns what happened in a game as plain records (see
 * src/sport/matchEngineContract.js); this is the one place those records reach
 * the StatBook. Records are applied in their shared `seq` order, which is the
 * order the football engine used to write them inline. Order matters: a
 * player's season tally of games per team decides which team the season is
 * credited to, and ties break on which team was written first.
 *
 * The arithmetic is the StatBook's own (registerGameAppearance / applyStatDelta),
 * so applying here is byte-identical to the old inline writes.
 */
export function orderedGameStatRecords(output) {
  const records = [];
  for (const record of output?.appearances || []) records.push({ kind: "appearance", record });
  for (const record of output?.statDeltas || []) records.push({ kind: "statDelta", record });
  for (const record of output?.snapCounts || []) records.push({ kind: "snapCount", record });
  // seq values are unique per game, so this order is total.
  return records.sort((a, b) => a.record.seq - b.record.seq);
}

export function applyGameStats(statBook, output) {
  for (const { kind, record } of orderedGameStatRecords(output)) {
    if (kind === "appearance") {
      statBook.registerGameAppearance(
        record.playerId,
        record.year,
        record.started,
        record.teamId,
        record.position,
        record.seasonType
      );
    } else {
      statBook.applyStatDelta(record.playerId, record.year, record.delta, record.meta);
    }
  }
}
