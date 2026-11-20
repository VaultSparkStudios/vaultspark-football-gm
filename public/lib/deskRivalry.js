/**
 * deskRivalry.js — the rivalry strip and rival-coach intel beside the Desk schedule.
 *
 * Split out of tabOverview.js so the boot graph does not carry it: the schedule
 * lives in the Desk's collapsed "The league" group, and this module (with its
 * two API requests) loads the first time that group is opened.
 */
import { state, api } from "./appState.js";
import { escapeHtml, teamCode } from "./appCore.js";
import { buildRivalCoachIntel } from "./rivalCoachIntel.js";
import { recordClientDiagnostic } from "./clientDiagnostics.js";

// ── Rivalry DNA strip (engine: src/engine/rivalryDNA.js via /api/rivalry) ────
export async function renderRivalryStrip(schedule, controlledTeamId) {
  const strip = document.getElementById("rivalryStrip");
  if (!strip) return;
  const game = controlledTeamId
    ? (schedule.games || []).find(
        (g) => g.awayTeamId === controlledTeamId || g.homeTeamId === controlledTeamId
      )
    : null;
  if (!game) {
    strip.hidden = true;
    const ic = document.getElementById("rivalCoachIntelContainer");
    if (ic) ic.hidden = true;
    return;
  }
  const opponentId = game.awayTeamId === controlledTeamId ? game.homeTeamId : game.awayTeamId;
  let ctx = null;
  try {
    const res = await api(
      `/api/rivalry?teamA=${encodeURIComponent(controlledTeamId)}&teamB=${encodeURIComponent(opponentId)}`
    );
    ctx = res?.rivalry || null;
  } catch (error) {
    ctx = null;
    strip.hidden = true;
    const intelContainer = document.getElementById("rivalCoachIntelContainer");
    if (intelContainer) intelContainer.hidden = true;
    throw error;
  }
  if (!ctx || !ctx.totalMeetings) {
    strip.hidden = true;
    const ic2 = document.getElementById("rivalCoachIntelContainer");
    if (ic2) ic2.hidden = true;
    return;
  }
  const heat = Math.max(0, Math.min(100, ctx.heat || 0));
  const heatTone = heat >= 80 ? "rs-bitter" : heat >= 60 ? "rs-heated" : heat >= 40 ? "rs-competitive" : "rs-mild";
  const streakText = ctx.streak?.count > 1
    ? `${teamCode(ctx.streak.team)} has won ${ctx.streak.count} straight`
    : "";
  strip.hidden = false;
  strip.innerHTML = `
    <div class="rivalry-strip ${heatTone}">
      ${heat >= 60 ? `<span class="rivalry-week-badge">RIVALRY WEEK</span>` : ""}
      <span class="rivalry-label">${escapeHtml(ctx.heatLabel || "Series")}</span>
      <span class="rivalry-matchup">${escapeHtml(teamCode(controlledTeamId))} vs ${escapeHtml(teamCode(opponentId))}</span>
      <span class="rivalry-series">Series ${ctx.teamAWins}-${ctx.teamBWins} (${ctx.totalMeetings} meetings)</span>
      ${streakText ? `<span class="rivalry-streak">${escapeHtml(streakText)}</span>` : ""}
      <span class="rivalry-heat-meter" title="Rivalry heat ${heat}/100"><span class="rivalry-heat-fill" style="width:${heat}%"></span></span>
    </div>`;

  // Rival coach intel card
  try {
    const res = await api(`/api/team-archetypes?team=${encodeURIComponent(opponentId)}`);
    const rival = (res?.archetypes || []).find((a) => a.teamId === opponentId);
    const intel = buildRivalCoachIntel(rival?.archetype?.label, heat, rival?.ovr);
    const intelContainer = document.getElementById("rivalCoachIntelContainer");
    if (intelContainer) {
      intelContainer.hidden = false;
      const gm = rival?.gm || null;
      intelContainer.innerHTML = `
        <div class="rival-coach-intel">
          <div class="rci-header">${intel.icon} Coach Intel: ${escapeHtml(rival?.name || teamCode(opponentId))} <span class="rci-archetype">[${escapeHtml(intel.archetype)}]</span></div>
          ${gm?.persona ? `<div class="rci-gm-line"><strong>${escapeHtml(gm.persona.name)}</strong>, GM — ${escapeHtml(gm.persona.traits?.join("; ") || "")}${gm.memory?.length ? `<br /><em>${escapeHtml(gm.line)}</em>` : ""}</div>` : ""}
          <ul class="rci-tendencies">
            ${intel.tendencies.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
          </ul>
          ${intel.heatNote ? `<div class="rci-alert rci-alert-${intel.alertLevel}">${escapeHtml(intel.heatNote)}</div>` : ""}
          ${intel.ovrNote ? `<div class="rci-alert rci-alert-high">${escapeHtml(intel.ovrNote)}</div>` : ""}
        </div>`;
    }
  } catch (error) {
    const intelContainer = document.getElementById("rivalCoachIntelContainer");
    if (intelContainer) intelContainer.hidden = true;
    recordClientDiagnostic({
      surface: "overview",
      operation: "rival-coach-intel",
      error,
      authorityKey: [
        state.dashboard?.currentYear || "",
        state.dashboard?.currentWeek || "",
        controlledTeamId || ""
      ].join(":")
    });
  }
}
