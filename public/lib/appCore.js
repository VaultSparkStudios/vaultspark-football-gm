import { browserStorage } from "./browserStorage.js";
import { state, api, DISPLAY_LABELS, GUIDE_SECTIONS, STATS_BENCHMARK_HINTS, TEAM_THEME_MAP } from "./appState.js";
import { buildPlayerProfileNarrative } from "./playerProfileNarrative.js";
import { actionCoordinator } from "./actionCoordinator.js";
import { getClientDiagnosticsSnapshot, recordClientDiagnostic, subscribeClientDiagnostics } from "./clientDiagnostics.js";
import { franchiseScopeFromDashboard, franchiseStorageKey } from "./franchiseScope.js";
import { buildMentorshipBadge } from "./engagementFeatures.js";
import { orientWinnerFirst } from "./scoreline.js";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function humanizeId(value) {
  const words = String(value ?? "").trim().replace(/[_-]+/g, " ").toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

export function fmtMoney(value) {
  if (!Number.isFinite(value)) return "$0";
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

export function hashStringLocal(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function portraitChoice(seed, items, offset = 0) {
  const index = Math.abs((seed + offset) % items.length);
  return items[index];
}

export function playerBodyTypeLabel(player) {
  const position = String(player?.position || "").toUpperCase();
  const height = Number(player?.heightInches || 75);
  const weight = Number(player?.weightLbs || 225);
  if (position === "OL") return weight >= 325 ? "Massive edge-protector frame" : "Athletic interior line frame";
  if (position === "DL") return weight >= 295 ? "Power trench frame" : "Long-limbed edge rusher frame";
  if (position === "LB") return weight >= 245 ? "Downhill stack linebacker build" : "Sideline pursuit linebacker build";
  if (position === "TE") return weight >= 255 ? "In-line tight end frame" : "Detached move tight end frame";
  if (position === "RB") return weight >= 220 ? "Dense power-back build" : "Compact acceleration-back build";
  if (position === "WR") return height >= 75 ? "Boundary X-receiver build" : "Lean space-creator build";
  if (position === "DB") return weight >= 205 ? "Press-corner safety frame" : "Lean recovery-speed frame";
  if (position === "QB") return height >= 76 ? "Tall pocket-passer frame" : "Compact movement-passer frame";
  return "Pro-caliber frame";
}

let portraitRenderer;
let physiqueRenderer;
let movementControls;
let mountMovement;
let playerMovementCleanup=null;
let portraitRendererPromise;
async function ensurePortraitRenderer() {
  portraitRendererPromise ||= import("./playerPortrait.js");
  const module = await portraitRendererPromise;
  portraitRenderer = module.buildPlayerPortraitSvg;
  physiqueRenderer = module.buildPlayerPhysiqueSvg;
  movementControls = module.buildPlayerMovementControls;
  mountMovement = module.mountPlayerMovement;
}

export function buildPlayerPortraitSvg(player) {
  return portraitRenderer ? portraitRenderer(player) : '<div class="portrait-unavailable">Loading portrait…</div>';
}

function renderPlayerPhysique(player) {
  const record = player.bodyMeasurements || { values: {}, provenance: {} };
  const rows = [["Height", "heightInches"], ["Weight", "weightLbs"], ["Arm length", "armLengthInches"], ["Wingspan", "wingspanInches"], ["Hand span", "handSizeInches"]];
  if (record.values.handLengthInches != null) rows.push(["Hand length", "handLengthInches"]);
  for (const [label, key] of [["Hip joint spacing", "hipJointSpanInches"], ["Foot length", "footLengthInches"], ["Foot width", "footWidthInches"]]) {
    if (record.values[key] != null) rows.push([label, key]);
  }
  return `<details class="player-physique"><summary>Physique &amp; measurables</summary>
    <div class="player-body-comparisons">
    <div class="player-physique-front"><strong class="player-body-view-label">Front silhouette</strong>${physiqueRenderer ? physiqueRenderer(player) : ""}</div>
    <details class="player-physique-side"><summary>Side silhouette</summary>${physiqueRenderer ? physiqueRenderer(player, { view: "side", idSuffix: "-dossier-side" }) : ""}</details>
    ${movementControls ? movementControls(player) : ""}
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

function renderPotentialRevision(revision) {
  if (!revision || !Array.isArray(revision.reasons) || !revision.reasons.length) return "";
  const signed = Number(revision.change) > 0 ? `+${revision.change}` : String(revision.change);
  return `<div class="player-potential-revision"><strong>${escapeHtml(revision.year)} ceiling update: ${escapeHtml(revision.before)} → ${escapeHtml(revision.after)} (${escapeHtml(signed)})</strong>
    <ul>${revision.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>`;
}

export function buildProfileLatestSeasonSummary(position, entry) {
  if (!entry) return "No season production recorded yet.";
  const stats = entry.stats || {};
  const games = stats.games || 0;
  if (position === "QB") {
    return `${entry.year}: ${stats.passing?.yards || 0} pass yds, ${stats.passing?.td || 0} TD, ${stats.passing?.int || 0} INT in ${games} G.`;
  }
  if (position === "RB") {
    return `${entry.year}: ${stats.rushing?.yards || 0} rush yds, ${stats.rushing?.td || 0} rush TD, ${stats.receiving?.yards || 0} rec yds in ${games} G.`;
  }
  if (position === "WR" || position === "TE") {
    return `${entry.year}: ${stats.receiving?.rec || 0} rec, ${stats.receiving?.yards || 0} yds, ${stats.receiving?.td || 0} TD in ${games} G.`;
  }
  if (position === "OL") {
    return `${entry.year}: ${stats.gamesStarted || 0} starts across ${games} games played.`;
  }
  if (position === "K" || position === "P") {
    return `${entry.year}: ${stats.kicking?.fgm || 0}/${stats.kicking?.fga || 0} FG, ${stats.kicking?.xpm || 0}/${stats.kicking?.xpa || 0} XP, ${stats.punting?.in20 || 0} punts inside the 20.`;
  }
  return `${entry.year}: ${stats.defense?.tackles || 0} tackles, ${stats.defense?.sacks || 0} sacks, ${stats.defense?.int || 0} INT in ${games} G.`;
}

export function renderPlayerProfileHero(profile) {
  const player = profile.player || {};
  const outlook = profile.developmentOutlook || {};
  const careerSummary = buildProfileCareerRow(profile)?.[0] || {};
  const awardsCount = (profile.awardsHistory || []).length;
  const latestSeason = (profile.timeline || []).slice().sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
  const latestSeasonRow = buildProfileSeasonRows(profile).slice().sort((a, b) => (b.season || 0) - (a.season || 0))[0] || null;
  const latestAv = latestSeasonRow?.av ?? 0;
  const contract = player.contract || {};
  const injury = player.injury?.type ? `${player.injury.type}${player.injury.weeksRemaining ? ` (${player.injury.weeksRemaining}w)` : ""}` : "Healthy";
  const contractLabel = contract.yearsRemaining
    ? `${fmtMoney(contract.salary || 0)} salary | ${contract.yearsRemaining} yrs left`
    : "No active long-term deal";
  const latestSeasonSummary = buildProfileLatestSeasonSummary(player.position, latestSeason);
  const narrative = buildPlayerProfileNarrative(profile);
  const identity = player.profile?.identity;
  const identityFacts = identity ? [
    identity.birthCountry ? `Born in ${identity.birthCountry}` : null,
    identity.footballUpbringing ? `Football upbringing: ${identity.footballUpbringing}` : null,
    identity.heritage?.length ? `Family heritage: ${identity.heritage.join(" · ")}` : "Family heritage not disclosed"
  ].filter(Boolean) : [];
  const badges = [
    `${teamCode(player.teamId)} ${player.position}`,
    `#${player.jerseyNumber ?? "--"}`,
    `OVR ${player.overall ?? "-"}${player.overallIsEstimate ? " (scouted)" : ""}`,
    `Potential ${player.potential ?? "-"}${player.isDraftProspect || (player.teamId && player.teamId !== state.dashboard?.controlledTeamId && player.status !== "retired") ? " (scouted)" : ""}`,
    `${player.developmentTrait || "Steady"} Dev`,
    player.isDraftProspect ? "Unsigned Prospect" : `${player.rosterSlot || "active"} Slot`
  ];

  return `
    <div class="player-hero">
      <div class="player-visuals"><div class="player-portrait-card">${buildPlayerPortraitSvg(player)}</div></div>
      <div class="player-overview">
        <div class="player-nameplate">
          <div class="brand-kicker">Player Dossier</div>
          <strong>${escapeHtml(player.name || "Player")}</strong>
          <div>${escapeHtml(teamDisplayFromId(player.teamId) || player.teamName || player.teamId || "-")} | ${escapeHtml(player.position || "-")} | Experience ${escapeHtml(player.experience || 0)}</div>
        </div>
        <div class="profile-badge-row">
          ${badges.map((badge) => `<span class="profile-badge">${escapeHtml(badge)}</span>`).join("")}
        </div>
        <div class="player-meta-grid">
          <div class="player-meta-card">
            <strong>Frame</strong>
            <div>${escapeHtml(formatHeight(player.heightInches))} / ${escapeHtml(player.weightLbs || "-")} lbs</div>
            <div class="small">${escapeHtml(playerBodyTypeLabel(player))} | Scheme fit ${escapeHtml(outlook.fitLabel || "-")} (${escapeHtml(outlook.fit ?? "-")})</div>
          </div>
          <div class="player-meta-card">
            <strong>Contract</strong>
            <div>${escapeHtml(contractLabel)}</div>
            <div class="small">Cap ${escapeHtml(fmtMoney(contract.capHit || 0))} | Guaranteed ${escapeHtml(fmtMoney(contract.guaranteed || 0))}</div>
          </div>
          <div class="player-meta-card">
            <strong>Development</strong>
            <div>${escapeHtml(outlook.trajectory || "steady")}</div>
            <div class="small">Weekly focus ${escapeHtml(outlook.weeklyPlan || "-")}</div>
            ${renderPotentialRevision(player.potentialRevision)}
          </div>
          <div class="player-meta-card">
            <strong>Availability</strong>
            <div>${escapeHtml(injury)}</div>
            <div class="small">Status ${escapeHtml(player.status || player.rosterSlot || "active")} | Morale ${escapeHtml(player.morale || "-")}</div>
          </div>
          <div class="player-meta-card">
            <strong>Career Resume</strong>
            <div>Seasons ${escapeHtml(profile.timeline?.length || 0)} | Awards ${escapeHtml(awardsCount)}</div>
            <div class="small">Career AV ${escapeHtml(careerSummary.av ?? 0)} | Latest AV ${escapeHtml(latestAv)}</div>
          </div>
          <div class="player-meta-card">
            <strong>Latest Season</strong>
            <div class="player-statline">${escapeHtml(latestSeasonSummary)}</div>
            <div class="small">${escapeHtml(profile.seasonType === "playoffs" ? "Filtered to playoffs" : "Regular-season lens with career context below")}</div>
          </div>
        </div>
        <div class="player-story-grid">
          <article class="player-story-card player-story-card--bio">
            <div class="brand-kicker">Identity</div>
            <h3>${escapeHtml(narrative.headline)}</h3>
            <p>${escapeHtml(narrative.bio)}</p>
            <div class="profile-signature-row">
              ${narrative.signature.map((trait) => `<span><strong>${escapeHtml(trait.value)}</strong> ${escapeHtml(trait.name)}</span>`).join("")}
            </div>
          </article>
          <article class="player-story-card">
            <div class="brand-kicker">Personal File</div>
            <ul>${[...identityFacts, ...narrative.facts].map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>
          </article>
          <article class="player-story-card player-story-card--achievements">
            <div class="brand-kicker">Achievements</div>
            <ul>${narrative.achievements.map((achievement) => `<li>★ ${escapeHtml(achievement)}</li>`).join("")}</ul>
            <div class="profile-milestone-stack">
              ${narrative.milestones.map((milestone) => `
                <div class="profile-milestone">
                  <div><strong>${escapeHtml(milestone.label)}</strong><span>${escapeHtml(milestone.current)} / ${escapeHtml(milestone.target)}</span></div>
                  <div class="profile-milestone-track" aria-label="${escapeHtml(milestone.label)} ${escapeHtml(milestone.progress)} percent">
                    <span style="width: ${escapeHtml(milestone.progress)}%"></span>
                  </div>
                </div>`).join("")}
            </div>
          </article>
        </div>
        <div class="player-note">
          Morale ${escapeHtml(player.morale || "-")} | Motivation ${escapeHtml(player.motivation || "-")} | Owner pressure ${escapeHtml(outlook.ownerPressure ?? "-")} | Legacy score ${escapeHtml(outlook.legacyScore ?? "-")}<br />
          Focus ratings: ${escapeHtml((outlook.focusRatings || []).map((rating) => toTitleCaseKey(rating)).join(", ") || "-")}
        </div>
      </div>
      ${renderPlayerPhysique(player)}
    </div>
  `;
}

export function setStatus(text) {
  const el = document.getElementById("statusChip");
  if (!el) return;
  el.textContent = text;
  const tone =
    /^error/i.test(text) ? "negative"
      : /^blocked/i.test(text) ? "warning"
        : /loading|simulating|working|retiring|saving|updating|starting|searching|refreshing|advancing/i.test(text) ? "info"
          : /ready|done/i.test(text) ? "positive"
            : null;
  setElementTone(el, tone);
  syncClientDiagnosticsStatus();
}

export function syncClientDiagnosticsStatus(snapshot = getClientDiagnosticsSnapshot()) {
  if (typeof globalThis.document?.getElementById !== "function") return; // headless (S109)
  const el = document.getElementById("statusChip");
  if (!el) return;
  const degraded = snapshot.unresolved > 0;
  el.dataset.clientHealth = degraded ? "degraded" : "healthy";
  el.title = degraded
    ? `${snapshot.unresolved} panel${snapshot.unresolved === 1 ? "" : "s"} failed to load. Open Settings > System Health to retry.`
    : "All panels loaded.";
  if (/^ready(?:\s*·\s*(?:degraded\s+\d+|\d+\s+panels?\s+to\s+retry))?$/i.test(el.textContent || "")) {
    el.textContent = degraded ? `Ready · ${snapshot.unresolved} panel${snapshot.unresolved === 1 ? "" : "s"} to retry` : "Ready";
    setElementTone(el, degraded ? "warning" : "positive");
  }
}

subscribeClientDiagnostics(syncClientDiagnosticsStatus);

export function appendAvLast(row, av) {
  return { ...row, av: av ?? 0 };
}

export function toTitleCaseKey(key) {
  if (!key) return "";
  if (DISPLAY_LABELS[key]) return DISPLAY_LABELS[key];
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function shouldHideInternalColumn(column) {
  return column === "id" || column === "playerId";
}

export function readStatsHiddenColumns() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("vsfgm:stats-hidden-columns") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStatsHiddenColumns(columns) {
  state.statsHiddenColumns = [...columns];
  try {
    window.localStorage.setItem("vsfgm:stats-hidden-columns", JSON.stringify(state.statsHiddenColumns));
  } catch {
    // Ignore persistence failures.
  }
}

const TRADE_BLOCK_STORAGE_PREFIX = "vsfgm:trade-block:v2";

export function readTradeBlockIds(dashboard = state.dashboard || {}, storage = browserStorage()) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(franchiseStorageKey(TRADE_BLOCK_STORAGE_PREFIX, dashboard)) || "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.map(String).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

export function syncTradeBlockScope(dashboard = state.dashboard || {}, storage = browserStorage()) {
  const scope = franchiseScopeFromDashboard(dashboard);
  if (state.tradeBlockScope === scope) return false;
  state.tradeBlockScope = scope;
  state.tradeBlockIds = readTradeBlockIds(dashboard, storage);
  return true;
}

export function saveTradeBlockIds(ids, dashboard = state.dashboard || {}, storage = browserStorage()) {
  const scope = franchiseScopeFromDashboard(dashboard);
  state.tradeBlockScope = scope;
  state.tradeBlockIds = [...new Set((ids || []).map(String).filter(Boolean))];
  try {
    storage?.setItem?.(franchiseStorageKey(TRADE_BLOCK_STORAGE_PREFIX, scope), JSON.stringify(state.tradeBlockIds));
  } catch {
    // Ignore persistence failures.
  }
  return state.tradeBlockIds;
}

export function formatHeight(heightInches) {
  if (!Number.isFinite(heightInches)) return "-";
  const feet = Math.floor(heightInches / 12);
  const inches = heightInches % 12;
  return `${feet}'${inches}"`;
}

export function normalizeSeasonType(value, fallback = "regular") {
  if (value === "regular" || value === "playoffs" || value === "all") return value;
  return fallback;
}

export function selectedSeasonType() {
  return normalizeSeasonType(document.getElementById("statsSeasonTypeFilter")?.value, "regular");
}

export function showToast(message) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

export function metricNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/[^0-9.+-]/g, "");
  if (!text || text === "+" || text === "-" || text === ".") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyTone(column, value) {
  const key = String(column || "").toLowerCase();
  const text = String(value ?? "").trim();
  const lower = text.toLowerCase();
  const number = metricNumber(value);

  if (!text) return null;
  if (lower.includes("error") || lower.includes("blocked")) return "negative";
  if (lower.includes("warning") || lower.includes("watch") || lower.includes("pressure")) return "warning";
  if (lower.includes("healthy") || lower.includes("ready") || lower.includes("won") || lower.includes("surplus")) return "positive";
  if (lower.includes("locked")) return "warning";

  if (["delta", "change", "swing"].some((token) => key.includes(token)) && number != null) {
    return number > 0 ? "positive" : number < 0 ? "negative" : null;
  }
  if (["capspace", "space", "cash", "wins", "projectedwins", "confidence", "fit", "chemistry"].some((token) => key.includes(token)) && number != null) {
    return number > 0 ? "positive" : number < 0 ? "negative" : null;
  }
  if (["deadcap", "losses", "heat", "pressure", "injury", "risk"].some((token) => key.includes(token)) && number != null) {
    return number > 0 ? "warning" : null;
  }
  if (["ovr", "av", "grade", "potential"].some((token) => key === token || key.includes(token)) && number != null) {
    if (number >= 85) return "positive";
    if (number <= 65) return "warning";
    return "accent";
  }
  if (key === "status") {
    if (/(healthy|ready|active|available)/i.test(text)) return "positive";
    if (/(inj|suspended|out|inactive)/i.test(text)) return "warning";
  }
  return null;
}

export function setElementTone(elementOrId, tone) {
  const el = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
  if (!el) return;
  el.classList.remove("tone-positive", "tone-negative", "tone-warning", "tone-info", "tone-accent");
  if (tone) el.classList.add(`tone-${tone}`);
}

export function setMetricCardValue(elementId, value, tone = null) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = value;
  setElementTone(el, tone);
}

export function formatActionError(error) {
  const reasonCode = error?.reasonCode || error?.payload?.reasonCode;
  if (reasonCode === "challenge-free-agency") {
    return "Challenge mode blocks free-agent adds, waiver claims, and forced comeback signings for this franchise.";
  }
  if (reasonCode === "challenge-top10-picks") {
    return "Challenge mode blocks your team from acquiring or using top-10 draft picks.";
  }
  if (reasonCode === "history-retired-number-active") {
    return "This league requires a player to be retired before a team can retire that jersey number.";
  }
  if (reasonCode === "history-retired-number-hof") {
    return "This league requires Hall of Fame induction before a jersey number can be retired.";
  }
  if (reasonCode === "history-retired-number-av") {
    return "This player does not clear the league's retired-number legacy floor.";
  }
  return error?.message || "Unexpected error.";
}

export function presentActionError(error) {
  const message = formatActionError(error);
  const reasonCode = error?.reasonCode || error?.payload?.reasonCode || "";
  const prefix = reasonCode.startsWith("challenge-") ? "Blocked" : "Error";
  if (prefix === "Error") {
    recordClientDiagnostic({
      surface: "action",
      operation: reasonCode || "unclassified",
      error: message,
      severity: "error"
    });
  }
  setStatus(`${prefix}: ${message}`);
  showToast(`${prefix}: ${message}`);
}


export function renderPanelError(targetId, label, error, { onRetry = null } = {}) {
  const target = typeof targetId === "string" ? document.getElementById(targetId) : targetId;
  const message = formatActionError(error);
  recordClientDiagnostic({
    surface: "panel",
    operation: label,
    error: message,
    retry: onRetry
  });
  if (!target) {
    presentActionError(error);
    return;
  }
  const retryId = `retry-${String(target.id || label).replace(/[^a-z0-9_-]/gi, "-")}`;
  const panelHtml = `
    <div class="panel-error-state" role="status">
      <strong>${escapeHtml(label)} could not load.</strong>
      <span>${escapeHtml(message)}</span>
      ${onRetry ? `<button id="${escapeHtml(retryId)}" class="btn btn-sm">Retry</button>` : ""}
    </div>
  `;
  const retryHtml = `<div class="narrative-empty">Retrying ${escapeHtml(label)}...</div>`;
  const renderHtml = (html) => {
    if (target.tagName === "TABLE") {
      target.innerHTML = `<tbody><tr><td colspan="8">${html}</td></tr></tbody>`;
      return;
    }
    target.innerHTML = html;
  };
  renderHtml(panelHtml);
  if (onRetry) {
    document.getElementById(retryId)?.addEventListener("click", () => {
      renderHtml(retryHtml);
      onRetry();
    });
  }
  setStatus(`${label} failed: ${message}`);
}
export function teamName(teamId) {
  return state.dashboard?.teams?.find((team) => team.id === teamId)?.name || teamId;
}

export function teamByCode(teamId) {
  return state.dashboard?.teams?.find((team) => team.id === teamId) || null;
}

export function teamCode(teamId) {
  if (!teamId || ["FA", "WAIVER", "TIE", "TBD", "ALL"].includes(teamId)) return teamId || "-";
  return teamByCode(teamId)?.abbrev || teamId;
}

export function teamDisplayFromId(teamId) {
  const team = teamByCode(teamId);
  return team ? `${team.abbrev || team.id} - ${team.name}` : teamId || "-";
}

export function teamDisplayLabel(team) {
  return `${team?.abbrev || team?.id || "-"} - ${team?.name || "-"}`;
}

export function hexToRgbTriplet(hex, fallback = "70, 182, 154") {
  const safe = String(hex || "").trim().replace("#", "");
  if (![3, 6].includes(safe.length)) return fallback;
  const normalized = safe.length === 3 ? safe.split("").map((part) => `${part}${part}`).join("") : safe;
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) return fallback;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `${r}, ${g}, ${b}`;
}

export function getActiveTeamTheme() {
  const controlledTeamId = state.dashboard?.controlledTeam?.id || state.dashboard?.controlledTeamId || "BUF";
  return TEAM_THEME_MAP[controlledTeamId] || TEAM_THEME_MAP.BUF;
}

export function applyShellTheme() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;
  const theme = getActiveTeamTheme();
  root.style.setProperty("--team-primary", theme.primary);
  root.style.setProperty("--team-secondary", theme.secondary);
  root.style.setProperty("--team-tertiary", theme.tertiary);
  root.style.setProperty("--team-primary-rgb", hexToRgbTriplet(theme.primary, "0, 51, 141"));
  root.style.setProperty("--team-secondary-rgb", hexToRgbTriplet(theme.secondary, "198, 12, 48"));
  root.style.setProperty("--team-tertiary-rgb", hexToRgbTriplet(theme.tertiary, "91, 194, 231"));
  body.dataset.activeTab = state.activeTab || "overviewTab";
}

export function setSimControl(next) {
  state.simControl = { ...state.simControl, ...next };
  const pauseBtn = document.getElementById("pauseSimBtn");
  if (pauseBtn) {
    pauseBtn.disabled = !state.simControl.active;
    pauseBtn.textContent = state.simControl.pauseRequested ? "Pausing..." : "Pause Sim";
  }
}

export function buildProfileSeasonAvMap(profile) {
  const category =
    profile.player.position === "QB"
      ? "passing"
      : profile.player.position === "RB"
        ? "rushing"
        : profile.player.position === "WR" || profile.player.position === "TE"
          ? "receiving"
          : profile.player.position === "K"
            ? "kicking"
            : profile.player.position === "P"
              ? "punting"
              : profile.player.position === "OL"
                ? "blocking"
                : "defense";
  return new Map((profile.seasonRows?.[category] || []).map((row) => [row.year, row.av ?? 0]));
}

// The browser's copy of src/sport/football/statSchema.js passerRating, held
// equal by test/passer-rating.test.js: scale each term, then clamp it, and a
// passer with no attempts has no rating (this read 39.6 before S119).
export function passerRateFromStats(stats) {
  const att = Number(stats?.att || 0);
  if (!att) return 0;
  const term = (value) => Math.max(0, Math.min(2.375, value));
  const a = term((Number(stats?.cmp || 0) / att - 0.3) * 5);
  const b = term((Number(stats?.yards || 0) / att - 3) * 0.25);
  const c = term((Number(stats?.td || 0) / att) * 20);
  const d = term(2.375 - (Number(stats?.int || 0) / att) * 25);
  return Number((((a + b + c + d) / 6) * 100).toFixed(1));
}

export function formatAwards(awards = [], champion = false) {
  const tags = [...awards];
  if (champion) tags.unshift("Champ");
  return tags.join(", ");
}

export function buildProfileSeasonRows(profile) {
  const position = profile.player.position;
  const avByYear = buildProfileSeasonAvMap(profile);
  return (profile.timeline || []).map((entry) => {
    const stats = entry.stats || {};
    const passing = stats.passing || {};
    const rushing = stats.rushing || {};
    const receiving = stats.receiving || {};
    const defense = stats.defense || {};
    const games = Math.max(1, stats.games || 0);
    const common = {
      season: entry.year,
      age: profile.player.age - ((state.dashboard?.currentYear || entry.year) - entry.year),
      team: teamCode(entry.teamId),
      pos: entry.pos || position,
      g: stats.games || 0,
      gs: stats.gamesStarted || 0
    };
    if (position === "QB") {
      return appendAvLast({
        ...common,
        cmp: passing.cmp || 0,
        att: passing.att || 0,
        cmpPct: Number((((passing.cmp || 0) / Math.max(1, passing.att || 0)) * 100).toFixed(1)),
        yds: passing.yards || 0,
        td: passing.td || 0,
        tdPct: Number((((passing.td || 0) / Math.max(1, passing.att || 0)) * 100).toFixed(1)),
        int: passing.int || 0,
        intPct: Number((((passing.int || 0) / Math.max(1, passing.att || 0)) * 100).toFixed(1)),
        firstDowns: passing.firstDowns || 0,
        ypa: Number(((passing.yards || 0) / Math.max(1, passing.att || 0)).toFixed(1)),
        ypc: Number(((passing.yards || 0) / Math.max(1, passing.cmp || 0)).toFixed(1)),
        ypg: Number(((passing.yards || 0) / games).toFixed(1)),
        rate: passerRateFromStats(passing),
        sk: passing.sacks || 0,
        nya: Number((((passing.yards || 0) - (passing.sackYards || 0)) / Math.max(1, (passing.att || 0) + (passing.sacks || 0))).toFixed(2)),
        anya: Number((((passing.yards || 0) + (passing.td || 0) * 20 - (passing.int || 0) * 45 - (passing.sackYards || 0)) / Math.max(1, (passing.att || 0) + (passing.sacks || 0))).toFixed(2)),
        awards: formatAwards(entry.awards, entry.champion)
      }, avByYear.get(entry.year));
    }
    if (position === "RB") {
      const scrimmageYards = (rushing.yards || 0) + (receiving.yards || 0);
      const touches = (rushing.att || 0) + (receiving.rec || 0);
      return appendAvLast({
        ...common,
        att: rushing.att || 0,
        yds: rushing.yards || 0,
        td: rushing.td || 0,
        firstDowns: rushing.firstDowns || 0,
        ypa: Number(((rushing.yards || 0) / Math.max(1, rushing.att || 0)).toFixed(1)),
        ypg: Number(((rushing.yards || 0) / games).toFixed(1)),
        apg: Number(((rushing.att || 0) / games).toFixed(1)),
        tgt: receiving.targets || 0,
        rec: receiving.rec || 0,
        recYds: receiving.yards || 0,
        ypr: Number(((receiving.yards || 0) / Math.max(1, receiving.rec || 0)).toFixed(1)),
        recPg: Number(((receiving.rec || 0) / games).toFixed(1)),
        catchPct: Number((((receiving.rec || 0) / Math.max(1, receiving.targets || 0)) * 100).toFixed(1)),
        ypt: Number(((receiving.yards || 0) / Math.max(1, receiving.targets || 0)).toFixed(1)),
        touch: touches,
        yTch: Number((scrimmageYards / Math.max(1, touches)).toFixed(1)),
        yScr: scrimmageYards,
        fmb: rushing.fumbles || 0,
        awards: formatAwards(entry.awards, entry.champion)
      }, avByYear.get(entry.year));
    }
    if (position === "WR" || position === "TE") {
      const scrimmageYards = (rushing.yards || 0) + (receiving.yards || 0);
      const touches = (rushing.att || 0) + (receiving.rec || 0);
      return appendAvLast({
        ...common,
        tgt: receiving.targets || 0,
        rec: receiving.rec || 0,
        yds: receiving.yards || 0,
        ypr: Number(((receiving.yards || 0) / Math.max(1, receiving.rec || 0)).toFixed(1)),
        td: receiving.td || 0,
        firstDowns: receiving.firstDowns || 0,
        recPg: Number(((receiving.rec || 0) / games).toFixed(1)),
        ypg: Number(((receiving.yards || 0) / games).toFixed(1)),
        catchPct: Number((((receiving.rec || 0) / Math.max(1, receiving.targets || 0)) * 100).toFixed(1)),
        ypt: Number(((receiving.yards || 0) / Math.max(1, receiving.targets || 0)).toFixed(1)),
        att: rushing.att || 0,
        rushYds: rushing.yards || 0,
        rushYpa: Number(((rushing.yards || 0) / Math.max(1, rushing.att || 0)).toFixed(1)),
        touch: touches,
        yTch: Number((scrimmageYards / Math.max(1, touches)).toFixed(1)),
        yScr: scrimmageYards,
        fmb: rushing.fumbles || 0,
        awards: formatAwards(entry.awards, entry.champion)
      }, avByYear.get(entry.year));
    }
    if (position === "K" || position === "P") {
      const kicking = stats.kicking || {};
      const punting = stats.punting || {};
      return appendAvLast({
        ...common,
        fgm: kicking.fgm || 0,
        fga: kicking.fga || 0,
        fgPct: Number((((kicking.fgm || 0) / Math.max(1, kicking.fga || 0)) * 100).toFixed(1)),
        xpm: kicking.xpm || 0,
        xpa: kicking.xpa || 0,
        punts: punting.punts || 0,
        in20: punting.in20 || 0,
        awards: formatAwards(entry.awards, entry.champion)
      }, avByYear.get(entry.year));
    }
    return appendAvLast({
      ...common,
      int: defense.int || 0,
      pd: defense.passDefended || 0,
      ff: defense.ff || 0,
      fr: defense.fr || 0,
      sk: defense.sacks || 0,
      comb: defense.tackles || 0,
      solo: defense.solo || 0,
      ast: defense.ast || 0,
      tfl: defense.tfl || 0,
      qbHits: defense.qbHits || 0,
      awards: formatAwards(entry.awards, entry.champion)
    }, avByYear.get(entry.year));
  });
}

export function buildProfileCareerRow(profile) {
  const player = profile.player;
  const category =
    player.position === "QB"
      ? "passing"
      : player.position === "RB"
        ? "rushing"
        : player.position === "WR" || player.position === "TE"
          ? "receiving"
          : player.position === "K"
            ? "kicking"
            : player.position === "P"
              ? "punting"
              : player.position === "OL"
                ? "blocking"
                : "defense";
  const careerAv = profile.career?.[category]?.av ?? 0;
  const passing = profile.career?.passing || {};
  const rushing = profile.career?.rushing || {};
  const receiving = profile.career?.receiving || {};
  const defense = profile.career?.defense || {};
  const seasons = profile.timeline?.length || 0;
  const games = Math.max(
    1,
    passing.g || rushing.g || receiving.g || defense.g || profile.timeline?.reduce((sum, row) => sum + (row.stats?.games || 0), 0) || 1
  );
  if (player.position === "QB") {
    return [appendAvLast({
      season: "Career",
      seasons,
      cmp: passing.cmp || 0,
      att: passing.att || 0,
      cmpPct: passing.cmpPct || 0,
      yds: passing.yds || 0,
      td: passing.td || 0,
      int: passing.int || 0,
      ypa: passing.ypa || 0,
      rate: passing.rate || 0,
      sk: passing.sacks || 0
    }, careerAv)];
  }
  if (player.position === "RB") {
    const touch = (rushing.att || 0) + (receiving.rec || 0);
    const yScr = (rushing.yds || 0) + (receiving.yds || 0);
    return [appendAvLast({
      season: "Career",
      seasons,
      att: rushing.att || 0,
      yds: rushing.yds || 0,
      td: rushing.td || 0,
      ypa: rushing.ypa || 0,
      tgt: receiving.tgt || 0,
      rec: receiving.rec || 0,
      recYds: receiving.yds || 0,
      ypr: receiving.ypr || 0,
      touch,
      yTch: Number((yScr / Math.max(1, touch)).toFixed(1)),
      yScr,
      fmb: rushing.fmb || 0
    }, careerAv)];
  }
  if (player.position === "WR" || player.position === "TE") {
    const touch = (rushing.att || 0) + (receiving.rec || 0);
    const yScr = (rushing.yds || 0) + (receiving.yds || 0);
    return [appendAvLast({
      season: "Career",
      seasons,
      tgt: receiving.tgt || 0,
      rec: receiving.rec || 0,
      yds: receiving.yds || 0,
      ypr: receiving.ypr || 0,
      td: receiving.td || 0,
      catchPct: receiving.catchPct || 0,
      att: rushing.att || 0,
      rushYds: rushing.yds || 0,
      touch,
      yTch: Number((yScr / Math.max(1, touch)).toFixed(1)),
      yScr
    }, careerAv)];
  }
  if (player.position === "K" || player.position === "P") {
    const kicking = profile.career?.kicking || {};
    const punting = profile.career?.punting || {};
    return [appendAvLast({
      season: "Career",
      seasons,
      fgm: kicking.fgm || 0,
      fga: kicking.fga || 0,
      fgPct: kicking.fgPct || 0,
      xpm: kicking.xpm || 0,
      xpa: kicking.xpa || 0,
      punts: punting.punts || 0,
      in20: punting.in20 || 0
    }, careerAv)];
  }
  return [appendAvLast({
    season: "Career",
    seasons,
    int: defense.int || 0,
    pd: defense.pd || 0,
    ff: defense.ff || 0,
    fr: defense.fr || 0,
    sk: defense.sacks || 0,
    comb: defense.tkl || 0,
    solo: defense.solo || 0,
    ast: defense.ast || 0,
    tfl: defense.tfl || 0,
    qbHits: defense.qbHits || 0
  }, careerAv)];
}

export function buildProfileTeamSplits(profile) {
  const splitMap = new Map();
  for (const entry of profile.timeline || []) {
    if (!splitMap.has(entry.teamId)) {
      splitMap.set(entry.teamId, { team: entry.teamId, seasons: 0, g: 0, championships: 0, awards: [] });
    }
    const current = splitMap.get(entry.teamId);
    current.seasons += 1;
    current.g += entry.stats?.games || 0;
    current.championships += entry.champion ? 1 : 0;
    current.awards.push(...(entry.awards || []));
  }
  return [...splitMap.values()].map((entry) => ({
    team: entry.team,
    seasons: entry.seasons,
    g: entry.g,
    championships: entry.championships,
    awards: [...new Set(entry.awards)].join(", ")
  }));
}

export function rowJoinKey(row) {
  return `${row.playerId || row.id || row.player}-${row.year || row.seasons || 0}`;
}

export function shapeStatsRowsForDisplay(rows, { scope, category }) {
  if (scope === "team") return rows;
  const rushingCompanion = new Map((state.statsCompanionRows.receiving || []).map((row) => [rowJoinKey(row), row]));
  const receivingCompanion = new Map((state.statsCompanionRows.rushing || []).map((row) => [rowJoinKey(row), row]));
  return (rows || []).map((row) => {
    const common = {
      playerId: row.playerId,
      player: row.player,
      season: row.year ?? row.seasons,
      age: row.age ?? "",
      team: teamCode(row.tm),
      pos: row.pos,
      g: row.g ?? row.seasons ?? 0,
      gs: row.gs ?? 0
    };
    if (category === "passing") {
      return appendAvLast({
        ...common,
        cmp: row.cmp,
        att: row.att,
        cmpPct: row.cmpPct,
        yds: row.yds,
        td: row.td,
        tdPct: Number(((row.td || 0) / Math.max(1, row.att || 0) * 100).toFixed(1)),
        int: row.int,
        intPct: Number(((row.int || 0) / Math.max(1, row.att || 0) * 100).toFixed(1)),
        firstDowns: row.firstDowns,
        ypa: row.ypa,
        ypc: row.ypc,
        ypg: Number(((row.yds || 0) / Math.max(1, row.g || 0)).toFixed(1)),
        rate: row.rate,
        sk: row.sacks,
        nya: Number((((row.yds || 0) - (row.sackYds || 0)) / Math.max(1, (row.att || 0) + (row.sacks || 0))).toFixed(2)),
        anya: Number((((row.yds || 0) + (row.td || 0) * 20 - (row.int || 0) * 45 - (row.sackYds || 0)) / Math.max(1, (row.att || 0) + (row.sacks || 0))).toFixed(2))
      }, row.av);
    }
    if (category === "rushing") {
      const receiving = rushingCompanion.get(rowJoinKey(row)) || {};
      const touch = (row.att || 0) + (receiving.rec || 0);
      const yScr = (row.yds || 0) + (receiving.yds || 0);
      return appendAvLast({
        ...common,
        att: row.att,
        yds: row.yds,
        td: row.td,
        firstDowns: row.firstDowns,
        ypa: row.ypa,
        ypg: Number(((row.yds || 0) / Math.max(1, row.g || 0)).toFixed(1)),
        apg: Number(((row.att || 0) / Math.max(1, row.g || 0)).toFixed(1)),
        tgt: receiving.tgt || 0,
        rec: receiving.rec || 0,
        recYds: receiving.yds || 0,
        ypr: receiving.ypr || 0,
        catchPct: receiving.catchPct || 0,
        ypt: receiving.ypt || 0,
        touch,
        yTch: Number((yScr / Math.max(1, touch)).toFixed(1)),
        yScr,
        fmb: row.fmb || 0
      }, row.av);
    }
    if (category === "receiving") {
      const rushing = receivingCompanion.get(rowJoinKey(row)) || {};
      const touch = (rushing.att || 0) + (row.rec || 0);
      const yScr = (rushing.yds || 0) + (row.yds || 0);
      return appendAvLast({
        ...common,
        tgt: row.tgt,
        rec: row.rec,
        yds: row.yds,
        ypr: row.ypr,
        td: row.td,
        firstDowns: row.firstDowns,
        recPg: Number(((row.rec || 0) / Math.max(1, row.g || 0)).toFixed(1)),
        ypg: Number(((row.yds || 0) / Math.max(1, row.g || 0)).toFixed(1)),
        catchPct: row.catchPct,
        ypt: row.ypt,
        att: rushing.att || 0,
        rushYds: rushing.yds || 0,
        rushYpa: rushing.ypa || 0,
        touch,
        yTch: Number((yScr / Math.max(1, touch)).toFixed(1)),
        yScr,
        fmb: rushing.fmb || 0
      }, row.av);
    }
    if (category === "defense") {
      return appendAvLast({
        ...common,
        int: row.int,
        pd: row.pd,
        ff: row.ff,
        fr: row.fr,
        sk: row.sacks,
        comb: row.tkl,
        solo: row.solo,
        ast: row.ast,
        tfl: row.tfl,
        qbHits: row.qbHits
      }, row.av);
    }
    return appendAvLast({ ...common, ...row }, row.av);
  });
}

export function renderGuideContent() {
  const html = GUIDE_SECTIONS.map(
    (section) => `<div class="record"><strong>${escapeHtml(section.title)}</strong><div>${escapeHtml(section.body)}</div></div>`
  ).join("");
  const rules = document.getElementById("rulesGuideContent");
  const modal = document.getElementById("guideModalContent");
  if (rules) rules.innerHTML = html;
  if (modal) modal.innerHTML = html;
}

export function setTableSkeleton(tableId, rows = 6) {
  const table = document.getElementById(tableId);
  if (!table) return;
  table.innerHTML = Array.from({ length: rows })
    .map(() => `<tr><td><div class="skeleton"></div></td></tr>`)
    .join("");
}

export function valueAsNumber(row, key) {
  const raw = row?.[key];
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createEmptyTradeAssets() {
  return {
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    teamAPickIds: [],
    teamBPickIds: []
  };
}

export function tradeAssetKeys(side) {
  return side === "A"
    ? { playerKey: "teamAPlayerIds", pickKey: "teamAPickIds", rosterKey: "tradeTeamARoster", picksKey: "tradeTeamAPicks" }
    : { playerKey: "teamBPlayerIds", pickKey: "teamBPickIds", rosterKey: "tradeTeamBRoster", picksKey: "tradeTeamBPicks" };
}

export function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter(Boolean))];
}

export function fmtDeltaMoney(value) {
  if (!Number.isFinite(value)) return "$0";
  const abs = fmtMoney(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

export function formatTradeList(rows = []) {
  if (!rows.length) return "none";
  return rows.map((row) => `${row.player || row.playerId} (${fmtMoney(row.capHit || 0)})`).join(", ");
}

export function formatTransactionDetails(entry) {
  const d = entry.details || {};
  if (entry.type === "signing") return `from ${teamCode(d.from || "FA")} | cap ${fmtMoney(d.capHit)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "release") {
    const wire = d.toWaivers ? "waivers" : teamCode(d.destination || "FA");
    return `to ${wire} | dead now ${fmtMoney(d.deadCapCurrentYear)} | dead next ${fmtMoney(d.deadCapNextYear)}`;
  }
  if (entry.type === "trade") return `A: ${formatTradeList(d.fromA)} | B: ${formatTradeList(d.fromB)}`;
  if (entry.type === "waiver-claim") return d.status || "submitted";
  if (entry.type === "waiver-award") return `cap ${fmtMoney(d.capHit)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "re-sign") return `${d.yearsRemaining || 0}y | cap ${fmtMoney(d.capHit)} | salary ${fmtMoney(d.salary)}`;
  if (entry.type === "restructure") return `${fmtMoney(d.capHitBefore)} -> ${fmtMoney(d.capHitAfter)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "franchise-tag") return `tag cap ${fmtMoney(d.capHit)}`;
  if (entry.type === "fifth-year-option") return `option cap ${fmtMoney(d.capHit)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "negotiation") return `${d.outcome || ""} | offer ${d.offerYears || 0}y ${fmtMoney(d.offerSalary || 0)}`;
  if (entry.type === "designation") return `${d.designation || ""} -> ${d.active ? "ON" : "OFF"}`;
  if (entry.type === "fa-offer") return `${d.years || 0}y ${fmtMoney(d.salary || 0)}`;
  if (entry.type === "fa-signing") return `${d.years || 0}y ${fmtMoney(d.salary || 0)}`;
  if (entry.type === "staff-update") return `${d.role || ""} ${d.name || ""}`;
  if (entry.type === "owner-update") return `ticket ${d.ticketPrice || "-"} | staff budget ${fmtMoney(d.staffBudget || 0)}`;
  if (entry.type === "practice-squad-move") return `${d.from || "active"} -> ${d.to || "active"}`;
  if (entry.type === 'standard-elevation') return `Game elevation · ${d.round || `Week ${d.week}`} · ${d.remainingRegular} regular uses left`;
  if (entry.type === "retirement-override") return `team ${teamCode(d.teamId || "FA")} | min win ${Math.round((d.minWinningPct || 0.55) * 100)}%`;
  if (entry.type === "championship") return `beat ${teamCode(d.runnerUp || "-")} | ${orientWinnerFirst(d.score || "")}`;
  const text = JSON.stringify(d);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

export function setTradeEvalText(text) {
  const el = document.getElementById("tradeEvalText");
  if (el) el.textContent = text;
}

export function renderTable(
  tableId,
  rows,
  { sortable = false, onSort = null, sortKey = null, sortDir = "desc", maxRows = null, hiddenColumns = [] } = {}
) {
  const table = document.getElementById(tableId);
  if (!table) return;
  if (!rows?.length) {
    table.innerHTML = "<tr><td>No rows</td></tr>";
    return;
  }

  const visibleRows = maxRows == null ? rows : rows.slice(0, Math.max(1, maxRows));
  const columns = Object.keys(visibleRows[0]).filter(
    (col) => !shouldHideInternalColumn(col) && !hiddenColumns.includes(col)
  );
  const head = `<tr>${columns
    .map((col) => {
      if (!sortable) return `<th>${escapeHtml(toTitleCaseKey(col))}</th>`;
      const marker = sortKey === col ? (sortDir === "asc" ? " ^" : " v") : "";
      return `<th data-sort-key="${escapeHtml(col)}">${escapeHtml(toTitleCaseKey(col))}${marker}</th>`;
    })
    .join("")}</tr>`;

  const body = visibleRows
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => {
            const tone = classifyTone(col, row[col]);
            const className = tone ? ` class="tone-${tone}"` : "";
            return `<td${className}>${row[col] == null ? "" : escapeHtml(row[col])}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  table.innerHTML = `${head}${body}`;

  if (sortable && typeof onSort === "function") {
    table.querySelectorAll("th[data-sort-key]").forEach((th) => {
      th.addEventListener("click", () => onSort(th.dataset.sortKey));
    });
  }
}

export function setSelectOptions(selectId, options, preferredValue = null) {
  const el = document.getElementById(selectId);
  if (!el) return;
  const previous = el.value;
  el.innerHTML = options.map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join("");

  if (preferredValue && options.some((opt) => opt.value === preferredValue)) {
    el.value = preferredValue;
    return;
  }
  if (options.some((opt) => opt.value === previous)) {
    el.value = previous;
  }
}

export function syncTeamSelects() {
  const teams = state.dashboard?.teams || [];
  const controlled = state.dashboard?.controlledTeamId || teams[0]?.id;
  const controlledChanged = state.syncedControlledTeamId !== controlled;
  const teamOptions = teams.map((team) => ({
    value: team.id,
    label: teamDisplayLabel(team)
  }));

  setSelectOptions("teamSelect", teamOptions, controlled);
  setSelectOptions("rosterTeamSelect", teamOptions, controlledChanged ? controlled : null);
  setSelectOptions("contractsTeamSelect", teamOptions, controlledChanged ? controlled : state.contractTeamId || controlled);
  // Team A opens on the controlled club, Team B on a different club, so the
  // builder never starts as a same-team trade.
  const tradeBPrevious = document.getElementById("tradeTeamB")?.value;
  setSelectOptions("tradeTeamA", teamOptions, controlledChanged ? controlled : null);
  const tradeA = document.getElementById("tradeTeamA")?.value || controlled;
  const tradeBReset = controlledChanged || !tradeBPrevious || tradeBPrevious === tradeA;
  setSelectOptions("tradeTeamB", teamOptions, tradeBReset ? teams.find((team) => team.id !== tradeA)?.id : null);
  setSelectOptions("teamHistorySelect", teamOptions);
  setSelectOptions("depthTeamSelect", teamOptions, controlledChanged ? controlled : null);
  setSelectOptions("retirementOverrideTeamSelect", teamOptions, controlled);
  setSelectOptions("analyticsTeamFilter", [{ value: "", label: "ALL Teams" }, ...teamOptions]);
  setSelectOptions("staffTeamSelect", teamOptions, controlled);
  setSelectOptions("ownerTeamSelect", teamOptions, controlled);
  // S101: both shipped permanently empty — the cap panel sat under copy telling
  // the player to choose a team, and the lobby select always fell back to the
  // controlled club.
  setSelectOptions("capCasualtyTeamSelect", teamOptions, controlledChanged ? controlled : state.contractTeamId || controlled);
  setSelectOptions("joinTeamSelect", teamOptions, controlled);

  ["rosterTeamSelect", "contractsTeamSelect", "tradeTeamA", "teamHistorySelect", "depthTeamSelect", "retirementOverrideTeamSelect", "capCasualtyTeamSelect", "joinTeamSelect"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value && controlled) el.value = controlled;
  });

  const statsSelect = document.getElementById("statsTeamFilter");
  const statsPrevious = statsSelect?.value;
  setSelectOptions(
    "statsTeamFilter",
    [{ value: "ALL", label: "ALL Teams" }, ...teamOptions],
    statsPrevious || "ALL"
  );

  const txSelect = document.getElementById("txTeamFilter");
  const txPrevious = txSelect?.value;
  setSelectOptions(
    "txTeamFilter",
    [{ value: "", label: "ALL Teams" }, ...teamOptions],
    txPrevious || ""
  );
  state.syncedControlledTeamId = controlled;
  applyShellTheme();
}

export function updateTopMeta() {
  const d = state.dashboard;
  if (!d) return;
  const settings = state.leagueSettings || d.settings || {};
  const difficulty = settings.difficultyPreset && settings.difficultyPreset !== "standard"
    ? ` | ${settings.difficultyPreset}${settings.adaptiveDifficulty ? " (adaptive)" : ""}`
    : settings.adaptiveDifficulty ? " | adaptive" : "";
  document.getElementById("topMetaText").textContent =
    `${d.currentYear} W${d.currentWeek} | ${d.phase} | Team: ${d.controlledTeam?.abbrev || d.controlledTeamId}${difficulty}`;
  const stageChip = document.getElementById("stageChip");
  if (stageChip) {
    const draftStage = d.draft?.completed === false ? `Draft Pick ${d.draft.currentPick}` : null;
    const offseasonStage = d.offseasonPipeline?.currentStage?.replaceAll("-", " ") || null;
    stageChip.textContent = `Stage: ${draftStage || offseasonStage || d.phase}`;
    setElementTone(
      stageChip,
      /playoff|super bowl|draft/i.test(stageChip.textContent) ? "accent" : /offseason/i.test(stageChip.textContent) ? "info" : "positive"
    );
  }
}

export function renderPulseChips(containerId, chips, emptyText) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const filtered = (chips || []).filter(Boolean);
  el.innerHTML = filtered.length
    ? filtered.map((chip) => `<span class="control-pulse-chip">${escapeHtml(chip)}</span>`).join("")
    : `<span class="control-pulse-chip">${escapeHtml(emptyText)}</span>`;
}

export function setBoxScoreTab(panelId = "boxScoreStatsPanel") {
  document.querySelectorAll("[data-boxscore-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.boxscoreTab === panelId);
  });
  document.querySelectorAll("#boxScoreModal .subtab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
}

export function decoratePlayerColumnFromRows(tableId, rows, { nameKey = "player", idKeys = ["playerId", "id"] } = {}) {
  if (!rows?.length) return;
  const columns = Object.keys(rows[0]);
  const visibleColumns = columns.filter((column) => !shouldHideInternalColumn(column));
  const nameIndex = visibleColumns.indexOf(nameKey);
  if (nameIndex < 0) return;
  const idKey = idKeys.find((key) => columns.includes(key));
  if (!idKey) return;

  const table = document.getElementById(tableId);
  if (!table) return;
  const tr = table.querySelectorAll("tr");
  for (let i = 1; i < tr.length; i += 1) {
    const row = rows[i - 1];
    const playerId = row?.[idKey];
    const playerName = row?.[nameKey];
    if (!playerId || !playerName) continue;
    const td = tr[i].children[nameIndex];
    if (!td) continue;
    td.innerHTML = `<button class="link-btn" data-player-id="${escapeHtml(playerId)}">${escapeHtml(playerName)}</button>`;
  }
}

export function decoratePlayerColumnByIds(tableId, playerIds, playerColumnIndex = 1) {
  const table = document.getElementById(tableId);
  if (!table || !playerIds?.length) return;
  const tr = table.querySelectorAll("tr");
  for (let i = 1; i < tr.length; i += 1) {
    const playerId = playerIds[i - 1];
    if (!playerId) continue;
    const td = tr[i].children[playerColumnIndex];
    if (!td) continue;
    const label = td.textContent || playerId;
    td.innerHTML = `<button class="link-btn" data-player-id="${escapeHtml(playerId)}">${escapeHtml(label)}</button>`;
  }
}

export async function loadPlayerModal(playerId) {
  state.activePlayerId = playerId;
  const seasonType = normalizeSeasonType(document.getElementById("playerSeasonTypeFilter")?.value, selectedSeasonType());
  const payload = await api(
    `/api/player?playerId=${encodeURIComponent(playerId)}&seasonType=${encodeURIComponent(seasonType)}`
  );
  const profile = payload.profile;
  const player = profile.player;
  await ensurePortraitRenderer();
  document.getElementById("playerSeasonTypeFilter").value = profile.seasonType || seasonType;

  document.getElementById("playerModalTitle").textContent = `${player.name} (${player.position})`;
  document.getElementById("playerModalMeta").textContent =
      `${teamCode(player.teamId)} | #${player.jerseyNumber ?? "--"} | OVR ${player.overall} | POT ${player.potential ?? "-"}${player.teamId && player.teamId !== state.dashboard?.controlledTeamId && player.status !== "retired" ? " (scouted)" : ""} | Age ${player.age} | ${formatHeight(player.heightInches)} ${player.weightLbs || "-"} lbs | Dev ${player.developmentTrait} | Injury ${player.injury?.type || "Healthy"}`;
  playerMovementCleanup?.();
  document.getElementById("playerProfileSummary").innerHTML = renderPlayerProfileHero(profile);
  playerMovementCleanup=mountMovement?.(document.getElementById("playerProfileSummary"), profile.player);
  attachPlayerMentorshipBadge(player);

  const ratingRows = Object.entries(player.ratings || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([rating, value]) => ({ rating: toTitleCaseKey(rating), value }));
  renderTable("playerRatingsTable", ratingRows);

  renderTable("playerContractTable", [
    {
      salary: fmtMoney(player.contract?.salary || 0),
      years: player.contract?.yearsRemaining || 0,
      capHit: fmtMoney(player.contract?.capHit || 0),
      guaranteed: fmtMoney(player.contract?.guaranteed || 0)
    }
  ]);

  renderTable("playerCareerTable", buildProfileCareerRow(profile));
  renderTable("playerSeasonTable", buildProfileSeasonRows(profile).slice().reverse());
  renderTable("playerTeamSplitTable", buildProfileTeamSplits(profile));
  renderTable(
    "playerAccoladesTable",
    (profile.awardsHistory || []).length
      ? profile.awardsHistory.map((entry) => ({ year: entry.year, award: entry.award }))
      : [{ year: "-", award: "No league awards recorded yet" }]
  );

  renderTable(
    "playerTxTable",
    (profile.transactionHistory || []).slice(0, 30).map((entry) => ({
      year: entry.year,
      week: entry.week,
      type: entry.type,
      team: entry.teamId || `${entry.teamA || ""}${entry.teamB ? `/${entry.teamB}` : ""}`,
      details: formatTransactionDetails(entry)
    }))
  );

  document.getElementById("playerModal").classList.remove("hidden");
}

// Mentorship badge on the player profile hero (S70): the built-but-unwired
// buildMentorshipBadge affordance finally renders where players are inspected.
let mentorshipBadgeCache = { authorityKey: null, pairs: [] };

async function attachPlayerMentorshipBadge(player) {
  const host = document.getElementById("playerProfileSummary");
  if (!host || !player?.id) return;
  try {
    const key = `${state.dashboard?.currentYear}-${state.dashboard?.currentWeek}-${state.dashboard?.controlledTeamId}`;
    if (mentorshipBadgeCache.authorityKey !== key) {
      const data = await api("/api/mentorship");
      mentorshipBadgeCache = {
        authorityKey: key,
        pairs: (data.pairs || []).map((pair) => ({ ...pair, statBonus: pair.projectedBonus }))
      };
    }
    const html = buildMentorshipBadge(player, mentorshipBadgeCache.pairs);
    if (!html) return;
    // The modal may already show a different player by the time the fetch lands.
    if (!document.getElementById("playerModalTitle")?.textContent?.startsWith(player.name)) return;
    if (host.querySelector(".mentorship-badge")) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    if (wrapper.firstElementChild) host.appendChild(wrapper.firstElementChild);
  } catch {
    // Non-critical enrichment; the roster mentorship panel remains the authority.
  }
}

export function closePlayerModal() {
  playerMovementCleanup?.();playerMovementCleanup=null;
  state.activePlayerId = null;
  document.getElementById("playerModal").classList.add("hidden");
}

/**
 * Mobile navigation drawer (CANON-041).
 *
 * Below the desktop breakpoint the 14-button `.side-menu` rendered as a static
 * grid *above* the content, so a phone or tablet user scrolled past the whole
 * nav before reaching any game. This turns it into a hamburger-triggered
 * off-canvas drawer.
 *
 * The drawer deliberately yields to the mobile decision deck: when
 * `body.mobile-loop-active` is set the deck is a full-screen replacement that
 * owns the viewport, so the toggle is hidden and any open drawer is closed. The
 * two mobile surfaces are never on screen together.
 *
 * @returns {(() => void)|null} a close function, so tab selection can dismiss it
 */
let navigationModulePromise;
function navigationModule() {
  return navigationModulePromise ||= import("./mobileNavigation.js");
}

export function bindMobileNav() {
  let closeNav = null;
  const toggle = document.getElementById("mobileNavToggle");
  const ready = navigationModule().then((module) => { closeNav ||= module.bindMobileNav(); });
  toggle?.addEventListener("click", (event) => {
    if (closeNav) return;
    event.stopImmediatePropagation();
    ready.then(() => toggle.click());
  }, { capture: true });
  return (options) => closeNav?.(options);
}

export function bindMenuTabs(activateTabFn, closeMobileNav) {
  navigationModule().then((module) => module.bindMenuTabs(activateTabFn, closeMobileNav));
}
function setActionControlsDisabled(controlIds, disabled) {
  for (const id of controlIds || []) {
    const element = document.getElementById(id);
    if (element) element.disabled = disabled;
  }
}

export async function runAction(fn, statusText = "Working...", { key = null, controls = [] } = {}) {
  const execute = async () => {
    setActionControlsDisabled(controls, true);
    try {
      setStatus(statusText);
      const result = await fn();
      if (result?.actionStatus === "deferred") {
        setStatus(result.statusText || "Deferred");
        return result;
      }
      if (result?.actionStatus === "committed-degraded") {
        setStatus("Ready · some panels will refresh");
        showToast(result.statusText || "Committed · some panels need refresh");
        return result;
      }
      if (result?.actionStatus === "committed") {
        setStatus("Ready");
        showToast(result.statusText || "Committed");
        return result;
      }
      setStatus("Ready");
      showToast("Done");
      return result;
    } catch (error) {
      presentActionError(error);
      return { actionStatus: "failed", error };
    } finally {
      setActionControlsDisabled(controls, false);
    }
  };
  if (key) return actionCoordinator.run(key, execute);
  return execute();
}
