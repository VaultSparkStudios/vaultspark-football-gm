import { state, api } from "./appState.js";
import { escapeHtml } from "./appCore.js";

let mentorshipAuthority = null;

export async function renderVeteranMentorshipPanel() {
  const el = document.getElementById("mentorshipPanel");
  if (!el) return;
  const teamId = (document.getElementById("rosterTeamSelect")?.value
    || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const data = await api("/api/mentorship?team=" + encodeURIComponent(teamId));
  mentorshipAuthority = data;
  state.mentorships = data.pairs || [];
  const pairs = data.pairs || [];
  const mentorOptions = (data.eligibleMentors || []).map((player) =>
    `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)} · ${escapeHtml(player.position)} · OVR ${player.overall}</option>`
  ).join("");
  const menteeOptions = (data.eligibleMentees || []).map((player) =>
    `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)} · ${escapeHtml(player.position)} · age ${player.age}</option>`
  ).join("");
  const focusOptions = (data.focuses || []).map((focus) =>
    `<option value="${escapeHtml(focus.id)}">${escapeHtml(focus.label)} — ${escapeHtml(focus.description)}</option>`
  ).join("");
  const canAssign = data.editable && mentorOptions && menteeOptions && Number(data.budget?.maximumPairs || 0) > 0;
  const latestDissolution = (data.dissolutions || []).at(-1);
  el.innerHTML = `
    ${pairs.length ? `
      <div class="mentorship-list">
        ${pairs.map((pair) => `
          <div class="mentorship-pair">
            <div class="mp-mentor">
              <span class="mp-pos-chip">${escapeHtml(pair.position || "?")}</span>
              <span class="mp-name">${escapeHtml(pair.mentorName)}</span>
              <span class="mp-ovr muted">OVR ${pair.mentorOvr}</span>
            </div>
            <div class="mp-arrow">→</div>
            <div class="mp-mentee">
              <span class="mp-name">${escapeHtml(pair.menteeName)}</span>
              <span class="mp-age muted">Age ${pair.menteeAge}</span>
            </div>
            <div class="mp-bonus">+${pair.projectedBonus} OVR · ${escapeHtml(pair.focusLabel)} · ${escapeHtml(pair.source)}</div>
            ${data.editable && pair.assignmentId
              ? `<button type="button" class="btn btn-sm" data-mentorship-clear="${escapeHtml(pair.assignmentId)}">Clear covenant</button>`
              : ""}
          </div>`).join("")}
      </div>`
      : `<div class="narrative-empty">No eligible mentorship pairings on this roster.</div>`}
    ${canAssign ? `
      <div class="mentorship-editor">
        <label>Mentor <select id="mentorshipMentorSelect">${mentorOptions}</select></label>
        <label>Mentee <select id="mentorshipMenteeSelect">${menteeOptions}</select></label>
        <label>Focus <select id="mentorshipFocusSelect">${focusOptions}</select></label>
        <button type="button" class="btn btn-sm" data-mentorship-assign>Assign covenant</button>
      </div>`
      : data.editable
        ? `<div class="mentorship-note small muted">This roster has no compatible mentorship slot.</div>`
        : `<div class="mentorship-note small muted">Rival mentorship plans are view-only.</div>`}
    <div class="mentorship-note small muted">
      ${escapeHtml(data.budget?.disclosure || "Mentorship bonuses apply once during training camp each offseason.")}
      Maximum ${Number(data.budget?.maximumPairs || 0)} pair(s), ${Number(data.budget?.totalOvr || 0)} total OVR.
    </div>
    ${latestDissolution ? `
      <div class="mentorship-note small muted">Latest dissolved covenant: ${escapeHtml(latestDissolution.reasonCode)}.</div>`
      : ""}
  `;
}

export async function assignMentorshipFromPanel() {
  if (!mentorshipAuthority?.editable) throw new Error("This mentorship plan is view-only.");
  const mentorId = document.getElementById("mentorshipMentorSelect")?.value;
  const menteeId = document.getElementById("mentorshipMenteeSelect")?.value;
  const focus = document.getElementById("mentorshipFocusSelect")?.value;
  if (!mentorId || !menteeId || !focus) throw new Error("Choose an eligible mentor, mentee, and focus.");
  const result = await api("/api/mentorship", {
    method: "POST",
    body: {
      action: "assign",
      teamId: mentorshipAuthority.teamId,
      mentorId,
      menteeId,
      focus,
      expectedRevision: mentorshipAuthority.revision,
      expectedFingerprint: mentorshipAuthority.fingerprint
    }
  });
  mentorshipAuthority = result.state;
  await renderVeteranMentorshipPanel();
  return result;
}

export async function clearMentorshipFromPanel(assignmentId) {
  if (!mentorshipAuthority?.editable) throw new Error("This mentorship plan is view-only.");
  const result = await api("/api/mentorship", {
    method: "POST",
    body: {
      action: "clear",
      teamId: mentorshipAuthority.teamId,
      assignmentId,
      expectedRevision: mentorshipAuthority.revision,
      expectedFingerprint: mentorshipAuthority.fingerprint
    }
  });
  mentorshipAuthority = result.state;
  await renderVeteranMentorshipPanel();
  return result;
}
