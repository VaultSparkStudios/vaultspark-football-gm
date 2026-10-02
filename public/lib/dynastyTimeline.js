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
 * Whether a keydown event should trigger the same activation the click
 * handler does. Pure so the keyboard-parity contract is directly testable
 * without a DOM (Enter and Space are the standard `role="button"` keys).
 */
export function isActivationKey(event) {
  return event?.key === "Enter" || event?.key === " " || event?.key === "Spacebar";
}

/**
 * Build the season-node markup for the timeline ribbon. Pure/exported so the
 * keyboard-accessibility contract (role, tabindex, aria-expanded,
 * aria-controls) can be asserted directly against the generated markup
 * without a DOM — this repo has no jsdom dependency.
 */
export function renderNodesHTML(data, activeIdx, teamColor, detailPanelId) {
  return data.map((season, i) => {
    const isActive = i === activeIdx;
    const cls = nodeClass(season) + (isActive ? " tl-active" : "");
    const rec = recordLabel(season);
    const crown = season.champion ? `<span class="tl-crown" title="Champion">&#9813;</span>` : "";
    const label = `Season ${esc(season.year)}${season.champion ? ", Champion" : ""}${rec ? `, ${esc(rec)}` : ""}`;
    return `
        <div class="${cls}" data-idx="${i}" style="--tl-color:${teamColor}" role="button" tabindex="0" aria-expanded="${isActive}" aria-controls="${detailPanelId}" aria-label="${label}">
          <div class="tl-year">${esc(season.year)}${crown}</div>
          <div class="tl-rec">${esc(rec)}</div>
        </div>`;
  }).join("");
}

/**
 * Build a timeline data array from raw history.
 */
export function buildTimelineData(historySeasons = [], controlledTeamId) {
  return historySeasons.map((s) => ({
    year: s.year,
    record: s.teams?.[controlledTeamId]?.record ?? s.record ?? `${s.wins ?? 0}-${s.losses ?? 0}${s.ties ? `-${s.ties}` : ""}`,
    wins: s.teams?.[controlledTeamId]?.wins ?? s.wins ?? 0,
    losses: s.teams?.[controlledTeamId]?.losses ?? s.losses ?? 0,
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
let mountCount = 0;

export function mount(container, { seasons, teamId, teamColor = "#4a8fb5" }) {
  if (!container || !seasons?.length) {
    container.innerHTML = `<div class="tl-empty">No franchise history yet. Simulate seasons to build your dynasty timeline.</div>`;
    return;
  }

  const data = seasons;
  const totalW = data.length * (NODE_W + 12) + PADDING_X * 2;
  const detailPanelId = `tl-detail-panel-${mountCount++}`;

  let activeIdx = -1;

  function toggle(idx) {
    activeIdx = activeIdx === idx ? -1 : idx;
    render();
    if (activeIdx >= 0) {
      container.querySelector(".tl-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function render() {
    const nodesHTML = renderNodesHTML(data, activeIdx, teamColor, detailPanelId);
    const detail = activeIdx >= 0 ? renderDetail(data[activeIdx]) : "";

    container.innerHTML = `
      <div class="dynasty-timeline">
        <div class="tl-scroll-wrapper">
          <div class="tl-track" style="min-width:${totalW}px">
            <div class="tl-connector" style="background:${teamColor}20"></div>
            <div class="tl-nodes">${nodesHTML}</div>
          </div>
        </div>
        <div class="tl-detail-panel" id="${detailPanelId}">${detail}</div>
      </div>`;

    // Bind click + keyboard handlers. Focus order across nodes follows DOM
    // (== visual left-to-right) order automatically since nodesHTML is built
    // from `data` in order and no tabindex other than 0 is ever set.
    container.querySelectorAll("[data-idx]").forEach((el) => {
      const idx = parseInt(el.dataset.idx, 10);
      el.addEventListener("click", () => toggle(idx));
      el.addEventListener("keydown", (event) => {
        if (!isActivationKey(event)) return;
        event.preventDefault?.();
        toggle(idx);
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
    ["Championship", season.champion ? `<span class="tone-positive">Champion</span>` : (season.playoffRound ? `Eliminated: ${esc(season.playoffRound)}` : "Missed playoffs")],
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
 * Compatibility export; timeline rules are delivered by the app stylesheet.
 */
export function injectStyles() { /* Styles ship in styles.css. */ }
