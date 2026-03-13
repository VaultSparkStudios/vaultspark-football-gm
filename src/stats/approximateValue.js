export const OFFENSIVE_AV_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
export const DEFENSIVE_AV_POSITIONS = new Set(["DL", "LB", "DB"]);

export function approximateValueFromStats(position, stats) {
  if (!stats) return 0;
  const pos = String(position || "").toUpperCase();

  if (pos === "QB") {
    return Math.max(
      0,
      Math.round(
        (stats.passing?.yards || 0) / 165 +
          (stats.passing?.td || 0) * 0.8 -
          (stats.passing?.int || 0) * 0.6 +
          (stats.rushing?.yards || 0) / 120
      )
    );
  }

  if (pos === "RB") {
    return Math.max(
      0,
      Math.round(
        (stats.rushing?.yards || 0) / 115 +
          (stats.rushing?.td || 0) * 0.7 +
          (stats.receiving?.yards || 0) / 180 +
          (stats.receiving?.td || 0) * 0.45
      )
    );
  }

  if (pos === "WR" || pos === "TE") {
    return Math.max(0, Math.round((stats.receiving?.yards || 0) / 125 + (stats.receiving?.td || 0) * 0.75));
  }

  if (pos === "OL") {
    return Math.max(
      0,
      Math.round((stats.snaps?.offense || 0) / 130 - (stats.blocking?.sacksAllowed || 0) * 1.5)
    );
  }

  if (pos === "K" || pos === "P") {
    return Math.max(
      0,
      Math.round((stats.kicking?.fgm || 0) * 0.45 + (stats.punting?.in20 || 0) * 0.2)
    );
  }

  return Math.max(
    0,
    Math.round(
      (stats.defense?.tackles || 0) / 6 +
        (stats.defense?.sacks || 0) * 1.2 +
        (stats.defense?.int || 0) * 1.5 +
        (stats.defense?.ff || 0) * 0.8
    )
  );
}
