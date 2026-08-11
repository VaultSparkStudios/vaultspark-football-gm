import { escapeHtml, showToast } from "./appCore.js";
import { closeModal, openModal } from "./modalManager.js";


function ceremonyCareerLine(entry = {}) {
  const stats = entry.careerStats || {};
  if (entry.pos === "QB") return `${stats.passing?.yards || 0} pass yds, ${stats.passing?.td || 0} pass TD`;
  if (entry.pos === "RB") return `${stats.rushing?.yards || 0} rush yds, ${stats.rushing?.td || 0} rush TD`;
  if (entry.pos === "WR" || entry.pos === "TE") return `${stats.receiving?.yards || 0} rec yds, ${stats.receiving?.td || 0} rec TD`;
  return `${stats.defense?.tackles || 0} tackles, ${stats.defense?.sacks || 0} sacks, ${stats.defense?.int || 0} INT`;
}

function ceremonyAwardLine(awardCounts = {}) {
  const pairs = [["MVP", awardCounts.MVP || 0], ["OPOY", awardCounts.OPOY || 0], ["DPOY", awardCounts.DPOY || 0], ["All-Pro", awardCounts.AllPro1 || 0], ["Pro Bowl", awardCounts.ProBowl || 0]].filter(([, value]) => value > 0);
  return pairs.length ? pairs.map(([label, value]) => `${label} ${value}`).join(" | ") : "No major awards logged";
}
function shareText(entry) {
  return `${entry.player} enters the Franchise Architect Hall of Fame: ${entry.pos}, ${entry.careerAv || 0} career AV, ${entry.championships || 0} titles.`;
}

function drawCard(canvas, entry) {
  if (!canvas) return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#101820");
  grad.addColorStop(0.58, "#17242d");
  grad.addColorStop(1, "#2a2516");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#f7c948";
  ctx.lineWidth = 8;
  ctx.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);
  ctx.fillStyle = "#3dd6a3";
  ctx.font = "700 30px Arial";
  ctx.fillText("FRANCHISE ARCHITECT HALL OF FAME", 72, 105);
  ctx.fillStyle = "#f2f6ef";
  ctx.font = "800 78px Arial";
  ctx.fillText(String(entry.player || "Legend").slice(0, 24), 72, 235);
  ctx.fillStyle = "#92a6b4";
  ctx.font = "600 34px Arial";
  ctx.fillText(`${entry.pos || "-"} | Retired ${entry.retiredYear || "-"} | ${entry.teams?.join(", ") || "Franchise legend"}`, 76, 295);
  const stats = [
    ["Career AV", entry.careerAv || 0],
    ["Titles", entry.championships || 0],
    ["Legacy", Math.round(entry.legacyScore || 0)],
    ["Jersey", entry.jerseyNumber ? `#${entry.jerseyNumber}` : "--"]
  ];
  stats.forEach(([label, value], index) => {
    const x = 78 + index * 250;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, 350, 210, 110);
    ctx.fillStyle = "#f7c948";
    ctx.font = "800 42px Arial";
    ctx.fillText(String(value), x + 20, 405);
    ctx.fillStyle = "#92a6b4";
    ctx.font = "600 22px Arial";
    ctx.fillText(label, x + 20, 442);
  });
  ctx.fillStyle = "#f2f6ef";
  ctx.font = "500 28px Arial";
  ctx.fillText(ceremonyCareerLine(entry).slice(0, 78), 76, 528);
  ctx.fillStyle = "#92a6b4";
  ctx.font = "500 22px Arial";
  ctx.fillText(ceremonyAwardLine(entry.awardCounts || {}).slice(0, 92), 76, 572);
  return true;
}

function setCeremonyStatus(message, tone = "") {
  const status = document.getElementById("hofCeremonyStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

export function closeHallOfFameCeremony() {
  const overlay = document.getElementById("hofCeremonyOverlay");
  if (!overlay) return;
  overlay.hidden = true;
  closeModal(overlay);
}

export function openHallOfFameCeremony(entry) {
  const overlay = document.getElementById("hofCeremonyOverlay");
  const canvas = document.getElementById("hofCeremonyCanvas");
  if (!overlay || !entry) return;
  const title = document.getElementById("hofCeremonyTitle");
  const copy = document.getElementById("hofCeremonyCopy");
  if (title) title.textContent = `${entry.player} Induction`;
  if (copy) copy.textContent = shareText(entry);
  const cardReady = drawCard(canvas, entry);
  setCeremonyStatus(cardReady ? "Ceremony card ready to share." : "Card preview unavailable; share text is still ready.", cardReady ? "success" : "error");
  overlay.hidden = false;
  openModal(overlay, { onClose: closeHallOfFameCeremony });
  overlay.onclick = (event) => {
    if (event.target === overlay) closeHallOfFameCeremony();
  };
  const closeButton = document.getElementById("hofCeremonyCloseBtn");
  if (closeButton) closeButton.onclick = closeHallOfFameCeremony;
  const copyButton = document.getElementById("hofCeremonyCopyBtn");
  if (copyButton) copyButton.onclick = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shareText(entry));
      setCeremonyStatus("Share text copied.", "success");
      showToast("Hall of Fame share text copied.");
    } catch {
      setCeremonyStatus("Copy failed. Select the share text above and copy it manually.", "error");
      showToast("Could not copy Hall of Fame text.");
    }
  };
  const downloadButton = document.getElementById("hofCeremonyDownloadBtn");
  if (downloadButton) downloadButton.onclick = () => {
    try {
      if (!cardReady || !canvas?.toDataURL) throw new Error("Card canvas unavailable");
      const link = document.createElement("a");
      const safeName = String(entry.player || "legend").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "legend";
      link.download = `franchise-architect-hof-${safeName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setCeremonyStatus("Ceremony card downloaded.", "success");
      showToast("Hall of Fame card downloaded.");
    } catch {
      setCeremonyStatus("Download failed. The share text remains available.", "error");
      showToast("Could not download Hall of Fame card.");
    }
  };
}

export function hallOfFameCeremonyButton(entry) {
  return `<button type="button" data-hof-ceremony="${escapeHtml(entry.playerId || entry.player)}">Share Ceremony</button>`;
}

