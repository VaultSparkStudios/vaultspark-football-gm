export const OFFENSIVE_AV_POSITIONS = new Set(["QB", "RB", "WR", "TE", "OL"]);
export const DEFENSIVE_AV_POSITIONS = new Set(["DL", "LB", "DB"]);

function ratio(numerator, denominator) {
  return denominator ? Number(numerator || 0) / Number(denominator || 0) : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function roundAv(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function offenseDrives(team = {}) {
  return Math.max(
    1,
    Number(team.drivesFor || 0) ||
      Number(team.passTd || 0) +
        Number(team.rushTd || 0) +
        Number(team.turnovers || 0) +
        Number(team.punts || 0) +
        Number(team.fga || 0)
  );
}

function defenseDrives(team = {}) {
  return Math.max(1, Number(team.drivesAgainst || 0) || offenseDrives(team));
}

function offensivePointsPerDrive(team = {}) {
  return ratio(Number(team.pointsFor || 0), offenseDrives(team));
}

function offensivePoints(team = {}, league = {}) {
  const leaguePointsPerDrive = Number(league.avgPointsPerDrive || 0) || Number(league.avgPointsAllowedPerDrive || 0) || 1.85;
  return 100 * ratio(offensivePointsPerDrive(team), leaguePointsPerDrive);
}

function defensivePoints(team = {}, league = {}) {
  const leaguePointsPerDrive = Number(league.avgPointsAllowedPerDrive || 0) || Number(league.avgPointsPerDrive || 0) || 1.85;
  const teamPointsPerDrive = ratio(Number(team.pointsAgainst || 0), defenseDrives(team)) || leaguePointsPerDrive;
  const multiplier = clamp(teamPointsPerDrive / Math.max(0.1, leaguePointsPerDrive), 0.15, 3);
  return Math.max(0, 100 * ((1 + 2 * multiplier - multiplier * multiplier) / (2 * multiplier)));
}

function honorBonus(honors = {}) {
  if (!honors || typeof honors !== "object") return 0;
  let bonus = 0;
  if (honors.allProLevel === 1) bonus += 1;
  else if (honors.allProLevel === 2) bonus += 0.5;
  if (honors.proBowler) bonus += 1;
  return bonus;
}

function allProLevelValue(honors = {}) {
  if (honors?.allProLevel === 1) return 1.5;
  if (honors?.allProLevel === 2) return 1;
  if (honors?.proBowler) return 0.5;
  return 0;
}

function allProYearMultiplier(team = {}) {
  return 80 * (Math.max(1, Number(team.games || 0)) / 16);
}

function offensiveBuckets(team = {}, league = {}) {
  const total = offensivePoints(team, league);
  const linePoints = (5 / 11) * total;
  const skillPoints = Math.max(0, total - linePoints);
  const rushShare = ratio(Number(team.rushYds || 0), Math.max(1, Number(team.totalYards || 0))) || 0.37;
  const rushPoints = clamp(skillPoints * 0.22 * (rushShare / 0.37), 0, skillPoints);
  const passerPoints = Math.max(0, (skillPoints - rushPoints) * 0.26);
  const receiverPoints = Math.max(0, skillPoints - rushPoints - passerPoints);
  return { total, linePoints, rushPoints, passerPoints, receiverPoints };
}

function efficiencyAdjustment(diff, positiveScale, negativeScale) {
  if (diff >= 0) return diff * positiveScale;
  return diff * negativeScale;
}

function offensiveSkillValue(position, stats, context) {
  const team = context.team || {};
  const league = context.league || {};
  const rushYds = Number(stats.rushing?.yards || 0);
  const recYds = Number(stats.receiving?.yards || 0);
  const passYds = Number(stats.passing?.yards || 0);
  const passingAtt = Number(stats.passing?.att || 0);
  const rushingAtt = Number(stats.rushing?.att || 0);
  const receivingRec = Number(stats.receiving?.rec || 0);
  const buckets = offensiveBuckets(team, league);
  let value = 0;

  if (passYds > 0 && Number(team.passYds || 0) > 0) {
    value += buckets.passerPoints * ratio(passYds, Number(team.passYds || 0));
    if (passingAtt >= 150) {
      const playerAypa = ratio(passYds + 20 * Number(stats.passing?.td || 0) - 45 * Number(stats.passing?.int || 0), passingAtt);
      value += efficiencyAdjustment(playerAypa - Number(league.passAypa || 0), 0.5, 2);
    }
  }

  if (rushYds > 0 && Number(team.rushYds || 0) > 0) {
    value += buckets.rushPoints * ratio(rushYds, Number(team.rushYds || 0));
    if (rushingAtt >= 200) {
      const ypc = ratio(rushYds, rushingAtt);
      value += efficiencyAdjustment(ypc - Number(league.rbYpc || 0), 0.75, 2);
    }
  }

  if (recYds > 0 && Number(team.recYds || 0) > 0) {
    value += buckets.receiverPoints * ratio(recYds, Number(team.recYds || 0));
    if (receivingRec >= 20) {
      const ypr = ratio(recYds, receivingRec);
      value += efficiencyAdjustment(ypr - Number(league.receiverYpr || 0), 0.5, 1);
    }
  }

  if (position === "TE") value += offensiveLineValue(stats, context);
  return roundAv(value + honorBonus(context.honors));
}

function offensiveLineValue(stats, context) {
  const team = context.team || {};
  const positionMultiplier = String(context.position || "").toUpperCase() === "TE" ? 0.2 : 1;
  const allProMultiplier = context.honors?.allProLevel === 1 ? 1.9 : context.honors?.allProLevel === 2 ? 1.6 : context.honors?.proBowler ? 1.3 : 1;
  const games = Math.max(0, Number(stats.games || 0));
  const starts = Math.max(0, Number(stats.gamesStarted || 0));
  const raw = games + 5 * starts * positionMultiplier * allProMultiplier;
  return roundAv((16 * raw) / Math.max(1, Number(team.games || games || 16)));
}

function defensiveValue(stats, context) {
  const team = context.team || {};
  const pos = String(context.position || "").toUpperCase();
  const league = context.league || {};
  const defenseTotal = defensivePoints(team, league);
  const frontSeven = pos === "DL" || pos === "LB";
  const teamBucketPoints = frontSeven ? Number(defenseTotal) * (2 / 3) : Number(defenseTotal) * (1 / 3);
  const teamBucketTotal = Math.max(1, frontSeven ? Number(team.frontSevenPoints || 0) : Number(team.secondaryPoints || 0));
  const tackleConstant = pos === "DL" ? 0.6 : pos === "LB" ? 0.3 : 0;
  const playerPoints =
    Math.max(0, Number(stats.games || 0)) +
    5 * Math.max(0, Number(stats.gamesStarted || 0)) +
    Number(stats.defense?.sacks || 0) +
    4 * Number(stats.defense?.fr || 0) +
    4 * Number(stats.defense?.int || 0) +
    tackleConstant * Number(stats.defense?.tackles || 0) +
    allProLevelValue(context.honors) * allProYearMultiplier(team);
  return roundAv(teamBucketPoints * ratio(playerPoints, teamBucketTotal));
}

function kickingValue(stats, context) {
  const team = context.team || {};
  const league = context.league || {};
  const xpa = Number(stats.kicking?.xpa || 0);
  const xpm = Number(stats.kicking?.xpm || 0);
  const fga40 = Number(stats.kicking?.fgA40 || 0);
  const fgm40 = Number(stats.kicking?.fgM40 || 0);
  const fga50 = Number(stats.kicking?.fgA50 || 0);
  const fgm50 = Number(stats.kicking?.fgM50 || 0);
  const fga = Number(stats.kicking?.fga || 0);
  const fgm = Number(stats.kicking?.fgm || 0);
  const fga49 = Math.max(0, fga - fga40 - fga50);
  const fgm49 = Math.max(0, fgm - fgm40 - fgm50);
  const leagueXp = Number(league.xpPct || 0);
  const leagueFg40 = Number(league.fgUnder40Pct || 0);
  const leagueFg49 = Number(league.fg40To49Pct || 0);
  const leagueFg50 = Number(league.fg50Pct || 0);
  const teamActionPoints = Number(team.fga || 0) + Number(team.xpa || 0);
  const playerShare = ratio(fga + xpa, Math.max(1, teamActionPoints));
  const avgAv = (3.125 / 16) * Math.max(1, Number(team.games || 0)) * playerShare;
  const expectedFg = leagueFg40 * fga40 + leagueFg49 * fga49 + leagueFg50 * fga50;
  const paa = 3 * (fgm - expectedFg) + (xpm - leagueXp * xpa);
  return roundAv((16 * (avgAv + paa)) / Math.max(1, Number(team.games || 0)));
}

function puntingValue(stats, context) {
  const team = context.team || {};
  const league = context.league || {};
  const punts = Number(stats.punting?.punts || 0);
  const grossYpa = punts > 0 ? Number(stats.punting?.yards || 0) / punts : 0;
  const teamShare = ratio(punts, Math.max(1, Number(team.punts || 0)));
  const avgAv = (2.1875 / 16) * Math.max(1, Number(team.games || 0)) * teamShare;
  const paa = ((grossYpa - Number(league.puntGrossYpa || 0)) * punts) / 200 - Number(stats.punting?.blocks || 0) * 2;
  return roundAv((16 * (avgAv + paa)) / Math.max(1, Number(team.games || 0)));
}

export function approximateValueFromStats(position, stats, context = {}) {
  if (!stats) return 0;
  const pos = String(position || "").toUpperCase();
  if (!context.team || !context.league) {
    if (pos === "QB") {
      return roundAv(
        (stats.passing?.yards || 0) / 165 +
          (stats.passing?.td || 0) * 0.8 -
          (stats.passing?.int || 0) * 0.6 +
          (stats.rushing?.yards || 0) / 120
      );
    }
    if (pos === "RB") {
      return roundAv(
        (stats.rushing?.yards || 0) / 115 +
          (stats.rushing?.td || 0) * 0.7 +
          (stats.receiving?.yards || 0) / 180 +
          (stats.receiving?.td || 0) * 0.45
      );
    }
    if (pos === "WR" || pos === "TE") {
      return roundAv((stats.receiving?.yards || 0) / 125 + (stats.receiving?.td || 0) * 0.75);
    }
    if (pos === "OL") {
      return roundAv((stats.snaps?.offense || 0) / 130 - (stats.blocking?.sacksAllowed || 0) * 1.5);
    }
    if (pos === "K" || pos === "P") {
      return roundAv((stats.kicking?.fgm || 0) * 0.45 + (stats.punting?.in20 || 0) * 0.2);
    }
    return roundAv(
      (stats.defense?.tackles || 0) / 6 +
        (stats.defense?.sacks || 0) * 1.2 +
        (stats.defense?.int || 0) * 1.5 +
        (stats.defense?.ff || 0) * 0.8
    );
  }

  const fullContext = { ...context, position: pos };
  if (pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE") return offensiveSkillValue(pos, stats, fullContext);
  if (pos === "OL") return offensiveLineValue(stats, fullContext);
  if (pos === "DL" || pos === "LB" || pos === "DB") return defensiveValue(stats, fullContext);
  if (pos === "K") return kickingValue(stats, fullContext);
  if (pos === "P") return puntingValue(stats, fullContext);
  return 0;
}
