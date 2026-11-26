// S133: a shareable player card. The dossier's front silhouette in the club's
// game kit beside the numbers a scout reads (frame, RAS, Speed Score, catch
// radius, height, weight, wingspan, hands), drawn to a 1200x630 PNG the player
// downloads. Built only on click from the lazy frame-card module; nothing is
// sent anywhere.

export const PLAYER_CARD_SIZE = Object.freeze({ width: 1200, height: 630 });

const inches = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function heightText(value) {
  const n = inches(value);
  return n == null ? null : `${Math.floor(n / 12)}'${Math.round(n % 12)}"`;
}

/** Pure: the card's text, in reading order, from the dossier's player payload. */
export function playerCardLines(player = {}) {
  const card = player.physicalCard || {};
  const values = player.bodyMeasurements?.values || {};
  const ras = Number(card.ras);
  const stats = [
    card.archetype ? ["Frame", String(card.archetype)] : null,
    Number.isFinite(ras) ? ["RAS", ras.toFixed(1)] : null,
    card.speedScore != null ? ["Speed Score", String(card.speedScore)] : null,
    card.catchRadiusInches != null && ["WR", "TE", "RB", "DB"].includes(player.position) ? ["Catch radius", `${card.catchRadiusInches}"`] : null
  ].filter(Boolean);
  const body = [
    heightText(values.heightInches ?? player.heightInches) ? ["Height", heightText(values.heightInches ?? player.heightInches)] : null,
    inches(values.weightLbs ?? player.weightLbs) ? ["Weight", `${inches(values.weightLbs ?? player.weightLbs)} lb`] : null,
    inches(values.wingspanInches) ? ["Wingspan", `${inches(values.wingspanInches)}"`] : null,
    inches(values.handSizeInches) ? ["Hands", `${inches(values.handSizeInches)}"`] : null
  ].filter(Boolean);
  const overall = Number(player.overall ?? player.ratings?.overall);
  const subtitle = [player.position, player.teamId, Number.isFinite(overall) ? `${Math.round(overall)} OVR` : null, player.age ? `Age ${player.age}` : null]
    .filter(Boolean).join(" · ");
  return {
    name: String(player.name || "Player").slice(0, 28),
    subtitle,
    stats: stats.slice(0, 4),
    body: body.slice(0, 4),
    fileName: `franchise-architect-${String(player.name || "player").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player"}.png`
  };
}

function loadSvgImage(svgMarkup) {
  return new Promise((resolve, reject) => {
    const markup = /xmlns=/.test(svgMarkup) ? svgMarkup : svgMarkup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("silhouette unavailable")); };
    image.src = url;
  });
}

function drawTiles(ctx, rows, x, y, accent) {
  rows.forEach(([label, value], index) => {
    const tx = x + (index % 2) * 330;
    const ty = y + Math.floor(index / 2) * 112;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(tx, ty, 310, 96);
    ctx.fillStyle = accent;
    ctx.font = "800 40px Arial";
    ctx.fillText(value, tx + 20, ty + 50);
    ctx.fillStyle = "#a9bac6";
    ctx.font = "600 21px Arial";
    ctx.fillText(label, tx + 20, ty + 82);
  });
}

/** Draw the card; resolves to the canvas. The silhouette is optional. */
export async function drawPlayerCard(canvas, player, { silhouetteSvg = "", teamColors = null } = {}) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx) throw new Error("Card canvas unavailable");
  const lines = playerCardLines(player);
  const primary = /^#[0-9a-f]{6}$/i.test(teamColors?.primary || "") ? teamColors.primary : "#1d6b57";
  const accent = /^#[0-9a-f]{6}$/i.test(teamColors?.secondary || "") ? teamColors.secondary : "#f7c948";
  canvas.width = PLAYER_CARD_SIZE.width;
  canvas.height = PLAYER_CARD_SIZE.height;
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#0f1a21");
  grad.addColorStop(0.62, "#16252e");
  grad.addColorStop(1, primary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, 18, canvas.height);
  if (silhouetteSvg) {
    try {
      const image = await loadSvgImage(silhouetteSvg);
      const h = 560, w = Math.round(h * (image.width / image.height || 0.5));
      ctx.drawImage(image, 70, 36, w, h);
    } catch { /* the numbers still make the card */ }
  }
  const left = 420;
  ctx.fillStyle = "#3dd6a3";
  ctx.font = "700 24px Arial";
  ctx.fillText("FRANCHISE ARCHITECT · SCOUTING CARD", left, 78);
  ctx.fillStyle = "#f2f6ef";
  ctx.font = "800 64px Arial";
  ctx.fillText(lines.name, left, 152);
  ctx.fillStyle = "#a9bac6";
  ctx.font = "600 28px Arial";
  ctx.fillText(lines.subtitle, left, 196);
  drawTiles(ctx, lines.stats, left, 232, accent);
  ctx.fillStyle = "#f2f6ef";
  ctx.font = "600 24px Arial";
  ctx.fillText(lines.body.map(([label, value]) => `${label} ${value}`).join("   "), left, 498);
  ctx.fillStyle = "#7f93a1";
  ctx.font = "500 20px Arial";
  ctx.fillText("Measured against his position across the league today · playfranchisearchitect.com", left, 570);
  return canvas;
}

/** Build the card in the page and hand it to the player as a PNG download. */
export async function downloadPlayerCard(player, { silhouetteSvg = "", teamColors = null, doc = globalThis.document } = {}) {
  const canvas = doc.createElement("canvas");
  await drawPlayerCard(canvas, player, { silhouetteSvg, teamColors });
  const link = doc.createElement("a");
  link.download = playerCardLines(player).fileName;
  link.href = canvas.toDataURL("image/png");
  link.click();
  return link.download;
}
