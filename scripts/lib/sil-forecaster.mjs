export function parseSilHistory(markdown = "") {
  return [...String(markdown).matchAll(/##[^\n]*?(?:Session\s+)?(\d+)?[^\n]*\n([\s\S]*?)(?=\n##\s|$)/g)]
    .map((match, index) => {
      const body = match[2] || "";
      const total = body.match(/Total:\s*(\d+)\/(\d+)/) || match[0].match(/Total:\s*(\d+)\/(\d+)/);
      const score = body.match(/Score:\s*(\d+)\s*\/\s*(\d+)/);
      const parsed = total || score;
      if (!parsed) return null;
      return {
        session: Number(match[1]) || index + 1,
        total: Number(parsed[1]),
        max: Number(parsed[2])
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.session - a.session);
}

export function forecastNext(sessions = [], { velocity = 0 } = {}) {
  if (!sessions.length) return null;
  const current = sessions[0];
  const previous = sessions[1];
  const recentDelta = previous ? current.total - previous.total : 0;
  const projectedDelta = Math.round((Number(velocity) || recentDelta || 0) / 3);
  return {
    totalPredicted: Math.max(0, Math.min(current.max || 1000, current.total + projectedDelta)),
    categories: {}
  };
}
