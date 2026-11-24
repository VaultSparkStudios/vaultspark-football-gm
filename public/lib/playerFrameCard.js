// S133 Frame Matters: the body as a scout reads it on the player dossier, plus
// the offseason body programme for the club's own players. Loaded with the
// portrait renderer (appCore.ensurePortraitRenderer), never at boot. The
// numbers come from the engine (src/domain/physicalProfile.js), measured
// against the league today, and the same model moves the games.
import { escapeHtml } from "./appCore.js";
import { state } from "./appState.js";
import { buildPlayerMovementControls as movementControls, buildPlayerPhysiqueSvg as physiqueRenderer } from "./playerPortrait.js";

const FRAME_HINTS = Object.freeze({
  long: "Long arms for his position: wins at the line and at the catch point.",
  power: "Heavy and compact: anchors, drives and breaks arm tackles.",
  tower: "Tall for his position: a big target and a long reach.",
  compact: "Short and solid: low leverage, hard to move off a spot.",
  lean: "Light for his position: quick, but every collision costs more.",
  thick: "Heavy for his position: holds the point, slower over distance.",
  prototype: "Built like the average starter at his position."
});

const PROGRAMS = Object.freeze([
  ["maintain", "Maintain", "Keep his current frame."],
  ["bulk", "Bulk up", "About +8 lb: more strength, a step slower."],
  ["lean", "Lean down", "About -8 lb: quicker off the mark, less power at contact."]
]);

export function renderFrameStrip(player, { controlledTeamId = state.dashboard?.controlledTeamId } = {}) {
  const card = player?.physicalCard;
  if (!card) return "";
  const ras = Number(card.ras);
  const rasTier = ras >= 8 ? "elite" : ras >= 6 ? "good" : ras >= 4 ? "average" : "poor";
  const hint = FRAME_HINTS[card.archetypeKey] || "";
  const cells = [
    `<div class="frame-cell frame-archetype" title="${escapeHtml(hint)}"><span>Frame</span><strong>${escapeHtml(card.archetype)}</strong></div>`,
    Number.isFinite(ras) ? `<div class="frame-cell frame-ras frame-ras-${rasTier}" title="Relative Athletic Score: size and workouts against his position, 0 to 10"><span>RAS</span><strong>${ras.toFixed(1)}</strong><i style="--ras:${Math.max(0, Math.min(10, ras)) * 10}%"></i></div>` : "",
    card.speedScore != null ? `<div class="frame-cell" title="Speed Score: weight × 200 ÷ forty⁴. About 100 is average for a back."><span>Speed Score</span><strong>${escapeHtml(card.speedScore)}</strong></div>` : "",
    card.catchRadiusInches != null && ["WR", "TE", "RB", "DB"].includes(player.position) ? `<div class="frame-cell" title="Highest point he can catch a ball: standing reach plus vertical jump"><span>Catch radius</span><strong>${escapeHtml(card.catchRadiusInches)}″</strong></div>` : ""
  ].filter(Boolean);
  const ownPlayer = player.teamId && player.teamId === controlledTeamId && !player.isDraftProspect && !["K", "P"].includes(player.position);
  const current = player.bodyProgram || "maintain";
  const programControl = ownPlayer
    ? `<div class="body-program" role="group" aria-label="Offseason body programme for ${escapeHtml(player.name || "this player")}"><span class="small">Offseason body programme</span>${PROGRAMS.map(([id, label, tip]) => `<button type="button" class="body-program-btn${current === id ? " active" : ""}" aria-pressed="${current === id}" data-player-id="${escapeHtml(player.id)}" data-program="${id}" title="${escapeHtml(tip)}">${label}</button>`).join("")}</div>`
    : "";
  return `<div class="player-frame-strip" aria-label="Frame and athletic profile">${cells.join("")}<p class="small muted">${escapeHtml(hint)}</p>${programControl}</div>`;
}

/** Set a body programme from a dossier button; the caller supplies api and UI hooks. */
export async function applyBodyProgramChoice(button, { api, applyDashboard, showToast }) {
  const payload = await api("/api/players/body-program", {
    method: "POST",
    body: { teamId: state.dashboard?.controlledTeamId, playerId: button.dataset.playerId, program: button.dataset.program }
  });
  applyDashboard(payload.state);
  for (const sibling of button.parentElement?.querySelectorAll(".body-program-btn") || []) {
    sibling.classList.toggle("active", sibling === button);
    sibling.setAttribute("aria-pressed", String(sibling === button));
  }
  showToast(`${payload.receipt?.label}: ${payload.receipt?.playerName} (applies this offseason)`);
}

// The dossier's physique section (moved out of the boot graph in S133).
export function renderPlayerPhysique(player) {
  const record = player.bodyMeasurements || { values: {}, provenance: {} };
  const rows = [["Height", "heightInches"], ["Weight", "weightLbs"], ["Arm length", "armLengthInches"], ["Wingspan", "wingspanInches"], ["Hand span", "handSizeInches"]];
  if (record.values.handLengthInches != null) rows.push(["Hand length", "handLengthInches"]);
  for (const [label, key] of [["Hip joint spacing", "hipJointSpanInches"], ["Foot length", "footLengthInches"], ["Foot width", "footWidthInches"]]) {
    if (record.values[key] != null) rows.push([label, key]);
  }
  return `<details class="player-physique"><summary>Physique &amp; measurables</summary>
    <div class="player-body-comparisons">
    <div class="player-physique-front"><strong class="player-body-view-label">Front silhouette</strong>${physiqueRenderer(player)}</div>
    <details class="player-physique-side"><summary>Side silhouette</summary>${physiqueRenderer(player, { view: "side", idSuffix: "-dossier-side" })}</details>
    ${movementControls(player)}
    </div>
    <dl>${rows.map(([label, key]) => {
      const value = record.values[key];
      const source = record.provenance[key] || {};
      const display = value == null ? "Not recorded" : `${value}${key === "weightLbs" ? " lb" : "″"}${source.kind === "fictional-estimate" ? " · estimated" : ""}`;
      const reconciliation = player.visualFrame?.measurementReconciliation?.find(row => row.measurement === key);
      const note = reconciliation?.status === 'incompatible-endpoint' ? ' · different measurement method; visual estimate used'
        : reconciliation?.status === 'outside-rendering-bounds' ? ' · outside supported visual range; estimate used'
          : reconciliation?.status === 'companion-dimension-missing' ? ' · companion foot dimension missing; visual estimate used' : '';
      return `<div><dt>${label}</dt><dd>${escapeHtml(display + note)}</dd></div>`;
    }).join("")}</dl>
    <p class="small">Training kit without pads. Front and side share a height scale. Body shape and missing limb measurements are visual estimates.</p>
  </details>`;
}
