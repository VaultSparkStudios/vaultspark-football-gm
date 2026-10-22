function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export function recordWinPct(record, { empty = 0.5 } = {}) {
  const wins = finiteCount(record?.wins);
  const losses = finiteCount(record?.losses);
  const ties = finiteCount(record?.ties);
  const games = wins + losses + ties;
  return games > 0 ? (wins + (ties * 0.5)) / games : empty;
}

export function formatRecord(record, { separator = "-", empty = "—" } = {}) {
  if (!record) return empty;
  const wins = finiteCount(record.wins);
  const losses = finiteCount(record.losses);
  const ties = finiteCount(record.ties);
  return ties > 0
    ? `${wins}${separator}${losses}${separator}${ties}`
    : `${wins}${separator}${losses}`;
}
