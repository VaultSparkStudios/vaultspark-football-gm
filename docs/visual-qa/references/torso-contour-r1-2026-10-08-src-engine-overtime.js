// NFL 2026 Rule 16. Drive callbacks retain the engine's synthetic field-position
// and timing model; this controller owns opportunity entitlement and expiry.
export function runOvertime({ allowTie, firstHome, simulatePossession }) {
  const periodSeconds = allowTie ? 600 : 900;
  let elapsedSeconds = 0;
  let homePoints = 0;
  let awayPoints = 0;
  let homeBall = firstHome;
  let possessions = 0;
  let firstScored = false;
  while (!allowTie || elapsedSeconds < periodSeconds) {
    const suddenDeath = possessions >= 2 || (possessions === 1 && !firstScored);
    const scoreDifferential = homeBall ? homePoints - awayPoints : awayPoints - homePoints;
    const drive = simulatePossession({
      homeBall, elapsedSeconds: 3600 + elapsedSeconds, scoreDifferential,
      secondsRemaining: allowTie ? periodSeconds - elapsedSeconds : Infinity,
      // A winning touchdown needs no try. Initial TDs and replies trailing by
      // six or more still need one. Two-point choices remain a separate gap.
      skipTouchdownTry: suddenDeath || (possessions === 1 && scoreDifferential > -6)
    });
    if (!Number.isFinite(drive.seconds) || drive.seconds <= 0 ||
        (allowTie && drive.seconds > periodSeconds - elapsedSeconds)) {
      throw new Error("Overtime possession must advance within its available clock");
    }
    elapsedSeconds += drive.seconds;
    if (homeBall) { homePoints += drive.points; awayPoints += drive.defensivePoints || 0; }
    else { awayPoints += drive.points; homePoints += drive.defensivePoints || 0; }
    if (possessions === 0) firstScored = drive.points > 0;
    // Defensive points require no offensive reply (safety exception or a
    // return after the defense legally gained its possession).
    if (drive.defensivePoints > 0 || (suddenDeath && homePoints !== awayPoints)) break;
    if (drive.possessionEnded !== false) {
      possessions += 1;
      if (possessions >= 2 && homePoints !== awayPoints) break;
      homeBall = !homeBall;
    }
  }
  return { homePoints, awayPoints, elapsedSeconds, periodSeconds, possessions };
}
