import { buildDecisionAnthology } from "./decisionAnthology.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function controlledTeamId(dashboard = {}) {
  const team = dashboard.controlledTeam || {};
  return dashboard.controlledTeamId || team.teamId || team.abbrev || null;
}

export function buildDecisionArchiveModel({ dashboard = {}, transactions = [], selectedYear = null, limit = 12 } = {}) {
  const anthology = buildDecisionAnthology({
    teamId: controlledTeamId(dashboard),
    throughYear: dashboard.currentYear,
    architectLedger: dashboard.architectLedger || [],
    transactions,
    draftHistory: dashboard.draftHistory || [],
    limit
  });
  const years = anthology.volumes.map((volume) => volume.seasonYear);
  const requested = Number(selectedYear);
  const activeYear = years.includes(requested) ? requested : years[0] ?? null;
  const volume = anthology.volumes.find((entry) => entry.seasonYear === activeYear) || null;
  return Object.freeze({
    schemaVersion: "1.0",
    kind: "decision-archive",
    status: anthology.status,
    seasonsObserved: anthology.seasonsObserved,
    years,
    activeYear,
    volume,
    disclaimer: anthology.disclaimer,
    disclosure: "Only stored weekly commands, completed trades, and draft receipts are shown. Missing sources stay missing."
  });
}

export function renderDecisionArchiveHtml(model = {}) {
  if (!model.volume) {
    return `<div class="history-empty">No receipted General Manager decisions are archived yet. Complete a weekly plan, trade, or draft call to open the first volume.</div>
      <p class="small muted">${escapeHtml(model.disclaimer || "Sparse seasons remain sparse; no result is inferred.")}</p>`;
  }
  const volume = model.volume;
  const missing = volume.missingSources?.length
    ? `<div class="history-chip-row">${volume.missingSources.map((source) => `<span class="history-chip">Missing ${escapeHtml(source)}</span>`).join("")}</div>`
    : `<div class="history-chip-row"><span class="history-chip">All four receipt families represented</span></div>`;
  const cards = volume.turningPoints?.length
    ? volume.turningPoints.map((point) => `<article class="history-card decision-archive-card">
        <div class="history-card-top">
          <div class="history-card-title">
            <strong>${escapeHtml(`#${point.rank} ${point.title}`)}</strong>
            <div class="history-card-meta">${escapeHtml(point.sourceLabel || point.source)}${point.week ? ` · Week ${escapeHtml(point.week)}` : " · Offseason"}</div>
          </div>
          <div class="history-number-plate">${escapeHtml(String(volume.seasonYear))}</div>
        </div>
        <div class="history-card-grid">
          <div class="history-card-stat"><strong>Declared</strong><div>${escapeHtml(point.declaredIntent)}</div></div>
          <div class="history-card-stat"><strong>Observed</strong><div>${escapeHtml(point.observedEvidence)}</div></div>
          <div class="history-card-stat"><strong>Next adaptation</strong><div>${escapeHtml(point.nextAdaptation)}</div></div>
          <div class="history-card-stat"><strong>Evidence</strong><div>${escapeHtml(point.evidenceState)} · ${escapeHtml(point.causalStatus)}</div></div>
        </div>
        <p class="small muted">${escapeHtml(point.whyRanked)} ${escapeHtml(point.limitations)}</p>
      </article>`).join("")
    : `<div class="history-empty">This volume has source rows but no bounded turning point.</div>`;
  return `<div class="history-spotlight">
      <div class="history-spotlight-mark">
        <div class="history-spotlight-label">${escapeHtml(`Volume ${volume.seasonYear} · ${volume.status}`)}</div>
        <div class="history-spotlight-meta">${escapeHtml(`${volume.turningPointCount} receipted turning point${volume.turningPointCount === 1 ? "" : "s"} · ${volume.sourceCoverage}/4 source families`)}</div>
      </div>
      ${missing}
    </div>
    <div class="history-gallery decision-archive-gallery">${cards}</div>
    <p class="small muted">${escapeHtml(model.disclosure)} ${escapeHtml(model.disclaimer)}</p>`;
}
