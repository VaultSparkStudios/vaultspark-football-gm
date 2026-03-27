/**
 * Dynasty Timeline — Visual History Ribbon
 *
 * Builds an interactive SVG/HTML horizontal timeline from franchise history.
 * Each node is a season. Nodes expand on click to show season detail.
 *
 * Data shape expected (from league history):
 *   seasons: [
 *     { year, record, champion (bool), playoffRound, mvpName, draftPick1, keyTransaction, coachName }
 *   ]
 *
 * Usage:
 *   dynastyTimeline.mount(container, { seasons, teamId, teamColor });
 */

const NODE_W = 80;
const NODE_H = 60;
const CONNECTOR_H = 4;
const PADDING_X = 40;
const SVG_H = 200;

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nodeClass(season) {
  if (season.champion) return "tl-node tl-champion";
  if (season.playoffRound === "conference" || season.playoffRound === "divisional") return "tl-node tl-deep-run";
  if (season.playoffRound === "wildcard") return "tl-node tl-playoff";
  return "tl-node tl-regular";
}

function recordLabel(season) {
  if (!season.record) return "";
  return season.record;
}

/**
 * Build a timeline data array from raw history.
 */
export function buildTimelineData(historySeasons = [], controlledTeamId) {
  return historySeasons.map((s) => ({
    year: s.year,
    record: s.teams?.[controlledTeamId]?.record ?? s.record ?? "",
    wins: s.teams?.[controlledTeamId]?.wins ?? 0,
    losses: s.teams?.[controlledTeamId]?.losses ?? 0,
    champion: s.champion === controlledTeamId || s.superBowlWinner === controlledTeamId,
    playoffRound: s.teams?.[controlledTeamId]?.playoffExit ?? null,
    mvpName: s.awards?.mvp ?? "",
    draftPick1: s.draftClasses?.[controlledTeamId]?.[0]?.name ?? "",
    coachName: s.teams?.[controlledTeamId]?.headCoach ?? "",
    keyNote: s.teams?.[controlledTeamId]?.keyNote ?? s.superBowlNote ?? ""
  }));
}

/**
 * Mount the timeline into a DOM container.
 */
export function mount(container, { seasons, teamId, teamColor = "#4a8fb5" }) {
  if (!container || !seasons?.length) {
    container.innerHTML = `<div class="tl-empty">No franchise history yet. Simulate seasons to build your dynasty timeline.</div>`;
    return;
  }

  const data = seasons;
  const totalW = data.length * (NODE_W + 12) + PADDING_X * 2;

  let activeIdx = -1;

  function render() {
    const nodesHTML = data.map((season, i) => {
      const isActive = i === activeIdx;
      const cls = nodeClass(season) + (isActive ? " tl-active" : "");
      const rec = recordLabel(season);
      const crown = season.champion ? `<span class="tl-crown" title="Super Bowl Champion">&#9813;</span>` : "";
      return `
        <div class="${cls}" data-idx="${i}" style="--tl-color:${teamColor}">
          <div class="tl-year">${esc(season.year)}${crown}</div>
          <div class="tl-rec">${esc(rec)}</div>
        </div>`;
    }).join("");

    const detail = activeIdx >= 0 ? renderDetail(data[activeIdx]) : "";

    container.innerHTML = `
      <div class="dynasty-timeline">
        <div class="tl-scroll-wrapper">
          <div class="tl-track" style="min-width:${totalW}px">
            <div class="tl-connector" style="background:${teamColor}20"></div>
            <div class="tl-nodes">${nodesHTML}</div>
          </div>
        </div>
        <div class="tl-detail-panel">${detail}</div>
      </div>`;

    // Bind click handlers
    container.querySelectorAll("[data-idx]").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.idx, 10);
        activeIdx = activeIdx === idx ? -1 : idx;
        render();
        if (activeIdx >= 0) {
          container.querySelector(".tl-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    });
  }

  render();
}

function renderDetail(season) {
  if (!season) return "";
  const rows = [
    ["Season Record", esc(season.record || "—")],
    ["Head Coach", esc(season.coachName || "—")],
    ["Super Bowl", season.champion ? `<span class="tone-positive">Champion</span>` : (season.playoffRound ? `Eliminated: ${esc(season.playoffRound)}` : "Missed playoffs")],
    ["League MVP", esc(season.mvpName || "—")],
    ["Top Draft Pick", esc(season.draftPick1 || "—")],
    ["Key Note", esc(season.keyNote || "—")]
  ].map(([label, value]) =>
    `<div class="tl-detail-row"><span class="tl-detail-label">${label}</span><span class="tl-detail-value">${value}</span></div>`
  ).join("");

  return `
    <div class="tl-detail">
      <div class="tl-detail-title">Season ${esc(season.year)}</div>
      ${rows}
    </div>`;
}

/**
 * Inject timeline CSS into document head (idempotent).
 */
export function injectStyles() {
  if (document.getElementById("dynasty-timeline-styles")) return;
  const style = document.createElement("style");
  style.id = "dynasty-timeline-styles";
  style.textContent = `
    .dynasty-timeline { display: flex; flex-direction: column; gap: 1rem; }
    .tl-scroll-wrapper { overflow-x: auto; padding-bottom: .5rem; }
    .tl-track { position: relative; padding: 1.5rem 40px; }
    .tl-connector { position: absolute; top: 50%; left: 40px; right: 40px; height: 4px; transform: translateY(-50%); border-radius: 2px; }
    .tl-nodes { display: flex; gap: 12px; position: relative; z-index: 1; }
    .tl-node { width: 80px; min-width: 80px; padding: .5rem .25rem; border-radius: 8px; background: #1a2030; border: 2px solid #2a3040; cursor: pointer; text-align: center; transition: border-color .15s, background .15s; }
    .tl-node:hover, .tl-node.tl-active { border-color: var(--tl-color); background: #202838; }
    .tl-champion { border-color: #f0c040 !important; background: #1e1a08 !important; }
    .tl-champion:hover, .tl-champion.tl-active { background: #282208 !important; }
    .tl-deep-run { border-color: #4a8fb5; }
    .tl-playoff { border-color: #3a6080; }
    .tl-year { font-size: .75rem; font-weight: 700; color: #c8d4e0; }
    .tl-rec { font-size: .7rem; color: #8a9ab0; margin-top: 2px; }
    .tl-crown { color: #f0c040; font-size: .8rem; }
    .tl-empty { color: #6a7a8a; padding: 2rem; text-align: center; font-style: italic; font-size: .9rem; }
    .tl-detail { background: #111820; border: 1px solid #2a3a4a; border-radius: 8px; padding: 1rem 1.25rem; }
    .tl-detail-title { font-size: 1rem; font-weight: 700; color: #e8d5a0; margin-bottom: .75rem; }
    .tl-detail-row { display: flex; justify-content: space-between; padding: .35rem 0; border-bottom: 1px solid #1e2830; font-size: .85rem; }
    .tl-detail-row:last-child { border-bottom: none; }
    .tl-detail-label { color: #6a7a8a; }
    .tl-detail-value { color: #c8d4e0; text-align: right; }
  `;
  document.head.appendChild(style);
}
