// Physical identity is shared by game-service ledgers. Feature-specific year
// horizons belong to their callers, not to the game's canonical identity.
export function canonicalFootballGame({ year, week = 0, seasonType = 'regular', homeTeamId, awayTeamId, label = 'regular-season', round = null }) {
  if (!Number.isSafeInteger(year) || year < 1900 || year > 9999 || !Number.isSafeInteger(week)
    || (seasonType === 'regular' ? week < 1 || week > 18 : seasonType !== 'playoffs' || week !== 0)
    || typeof homeTeamId !== 'string' || !homeTeamId || typeof awayTeamId !== 'string' || !awayTeamId || homeTeamId === awayTeamId
    || typeof label !== 'string' || !label || (seasonType === 'regular' ? round !== null : !['wildcard', 'divisional', 'conference', 'super-bowl'].includes(round)))
    throw new TypeError('Invalid canonical football game');
  if (seasonType === 'regular' ? label !== 'regular-season' : round === 'super-bowl' ? label !== 'super-bowl' : ![`afc-${round}`, `nfc-${round}`].includes(label))
    throw new TypeError('Invalid canonical game label');
  return { year, week, seasonType, homeTeamId, awayTeamId, label, round,
    gameId: `${year}-${seasonType}-${label}-${week}-${awayTeamId}-${homeTeamId}` };
}

// Physical playoff IDs use week zero; medical elapsed periods include the
// two-week interval between conference championships and the final.
export function footballGameMedicalWeek(game) {
  const canonical = canonicalFootballGame(game);
  return canonical.seasonType === 'regular' ? canonical.week
    : { wildcard: 19, divisional: 20, conference: 21, 'super-bowl': 23 }[canonical.round];
}
