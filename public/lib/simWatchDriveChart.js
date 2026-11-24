// S133: the Sim-Watch drive chart. Loaded with the first broadcast.
import { deriveFieldState, driveKey } from "./simWatchPlayback.js";

/**
 * S133: the game as a drive chart. One row per drive, in order: who had the
 * ball, where it started and ended on a 0-100 field drawn from the home end
 * zone (same orientation as deriveFieldState), and how it finished. Plays
 * without a recorded spot are skipped rather than invented.
 */
export function buildDriveChart(plays = [], teamIds = {}, throughIndex = Infinity) {
  const drives = [];
  let previous = null;
  const last = Math.min(plays.length - 1, Number.isFinite(throughIndex) ? throughIndex : plays.length - 1);
  for (let index = 0; index <= last; index += 1) {
    const play = { ...plays[index] };
    play.__derivedDriveKey = driveKey(play, index, previous);
    previous = play;
    const spot = deriveFieldState(play, teamIds);
    const text = String(play.description || play.type || "").toLowerCase();
    let drive = drives[drives.length - 1];
    if (!drive || drive.key !== play.__derivedDriveKey) {
      drive = { key: play.__derivedDriveKey, teamId: play.offenseTeamId || null, startX: spot ? spot.x : null, endX: spot ? spot.x : null, plays: 0, result: null };
      drives.push(drive);
    }
    drive.plays += 1;
    if (spot) { if (drive.startX == null) drive.startX = spot.x; drive.endX = spot.x; }
    const type = String(play.type || "").toLowerCase();
    if (text.includes("touchdown")) drive.result = "td";
    else if (type === "field-goal" || text.includes("field goal is good")) drive.result = "fg";
    else if (type === "interception" || type === "fumble" || /intercept|fumble/.test(text)) drive.result = "turnover";
    else if (type === "punt" || text.includes("punt")) drive.result = drive.result || "punt";
  }
  return drives.filter((drive) => drive.startX != null).map(({ key, ...drive }) => drive);
}

// S133: every drive so far as an arrow on the field, coloured by club, with
// how it ended. Drawn from the same spots the live ball uses.
const DRIVE_RESULT_LABEL = { td: "TD", fg: "FG", turnover: "TO", punt: "Punt" };
export function renderDriveChart(svg, context, index) {
  if (!svg || !context?.plays?.length) return;
  const drives = buildDriveChart(context.plays, context.teamIds, index).slice(-12);
  const rowHeight = 9;
  const height = Math.max(rowHeight * 2, drives.length * rowHeight + 4);
  svg.setAttribute("viewBox", `0 0 300 ${height}`);
  const yardLines = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((yard) => `<line x1="${yard * 3}" y1="0" x2="${yard * 3}" y2="${height}" class="sw-drive-yard${yard === 50 ? " sw-drive-mid" : ""}"></line>`).join("");
  const rows = drives.map((drive, i) => {
    const y = 4 + i * rowHeight + rowHeight / 2;
    const x1 = (drive.startX * 3).toFixed(1), x2 = (drive.endX * 3).toFixed(1);
    const side = drive.teamId === context.teamIds.home ? "home" : "away";
    const label = DRIVE_RESULT_LABEL[drive.result] || "";
    return `<g class="sw-drive sw-drive-${side} sw-drive-${drive.result || "open"}"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"></line><circle cx="${x2}" cy="${y}" r="2.4"></circle>${label ? `<text x="${Math.min(288, Math.max(Number(x1), Number(x2)) + 4)}" y="${y + 2.6}">${label}</text>` : ""}</g>`;
  }).join("");
  svg.innerHTML = yardLines + rows;
  svg.setAttribute("aria-label", `Drive chart: ${drives.length} drive${drives.length === 1 ? "" : "s"} so far`);
}
