import { COMMUNITY_ENDPOINT, getCommunityParticipation, getLocalCommunityLedger, setCommunityParticipation } from "./lib/communityTelemetry.js";

const PERIOD_LABELS = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };
const PLAYER_STAT_LABELS = Object.freeze({
  "participating-browsers": "Community contributors",
  "top-era": "Most-played era",
  "top-archetype": "Most-played franchise challenge",
  "top-difficulty": "Most-played difficulty",
  "top-mode": "Most-played simulation mode",
  "top-tactic": "Most-used weekly approach",
  "gm-decisions": "GM decisions",
  "top-contract-band": "Most common contract range",
  "top-staff-role": "Most-changed coaching role",
  "playoff-berths": "Playoff-level seasons"
});
const PLAYER_STAT_DESCRIPTIONS = Object.freeze({
  "participating-browsers": "Players who chose to share anonymous game stats during this period.",
  "franchises-founded": "New franchises started by community contributors.",
  "weeks-managed": "In-game weeks completed across shared franchises.",
  "seasons-completed": "Full seasons completed across shared franchises.",
  "gm-decisions": "Weekly plans that included a General Manager decision.",
  "trades-completed": "Trades completed by community contributors.",
  "draft-picks": "Draft selections made by community contributors.",
  "free-agents-signed": "Free agents signed by community contributors.",
  "contracts-completed": "Re-signings, negotiations, restructures, tags, and fifth-year options.",
  "staff-moves": "Coaching changes made by community contributors.",
  "wins": "Wins earned by community-controlled teams.",
  "championships": "Championship seasons completed by community contributors.",
  "playoff-berths": "Seasons with at least nine regular-season wins, used here as a simple playoff-level benchmark.",
  "challenges-completed": "Speedruns and structured challenges completed by the community.",
  "rare-feats": "Big achievements such as championships and undefeated seasons.",
  "top-team": "The team chosen most often by community contributors.",
  "top-era": "The era selected most often when starting a franchise.",
  "top-archetype": "The opening franchise challenge selected most often.",
  "top-difficulty": "The difficulty selected most often across shared franchises.",
  "top-mode": "The simulation style selected most often.",
  "top-tactic": "The weekly game plan used most often.",
  "top-position": "The position drafted most often by community contributors.",
  "top-challenge": "The structured challenge completed most often.",
  "top-feat": "The rare achievement reached most often.",
  "top-contract-band": "The yearly salary range used most often in contract moves.",
  "top-staff-role": "The coaching role changed most often."
});
let activePeriod = "30d";
let latestSnapshot = null;
let refreshTimer = null;

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function number(value) { return Number(value || 0).toLocaleString("en-US"); }
function labelValue(stat) {
  if (stat.status === "warming") return "Warming up";
  if (stat.status === "suppressed") return "Private for now";
  if (stat.status === "unavailable") return "Unavailable";
  if (stat.unit === "category") return stat.value ? String(stat.value).replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not measured";
  return stat.value == null ? "Not measured" : number(stat.value);
}

function statCard(stat, compact = false) {
  const share = stat.share != null ? `<span class="community-stat-share">${number(stat.share)}% of shared choices</span>` : "";
  const detail = compact ? "" : `<p>${escapeHtml(PLAYER_STAT_DESCRIPTIONS[stat.id] || "Community activity during this period.")}</p>`;
  const contributorLabel = `${number(stat.sampleSize)} contributor${Number(stat.sampleSize) === 1 ? "" : "s"}`;
  const footnote = compact ? stat.period : `${stat.period} · ${contributorLabel}`;
  return `<article class="community-stat ${compact ? "community-stat--compact" : ""}" data-state="${escapeHtml(stat.status)}">
    <span class="community-stat-label">${escapeHtml(PLAYER_STAT_LABELS[stat.id] || stat.label)}</span>
    <strong class="community-stat-value">${escapeHtml(labelValue(stat))}</strong>
    ${share}${detail}
    <small>${escapeHtml(footnote)}</small>
  </article>`;
}

function playerInsight(period) {
  if (!period || period.status === "warming") return "Community trends will appear as more players choose to share their game activity.";
  if (period.status === "suppressed") return "More players need to share before a trend appears. Individual activity always stays private.";
  const popularChoice = period.categories
    ?.flatMap((category) => category.stats || [])
    .find((stat) => stat.status === "live" && stat.unit === "category" && stat.share != null);
  if (popularChoice) {
    return `${labelValue(popularChoice)} is the community's ${String(PLAYER_STAT_LABELS[popularChoice.id] || popularChoice.label).toLowerCase()} at ${number(popularChoice.share)}% of shared choices.`;
  }
  return "The latest community trends are taking shape.";
}

function freshness(snapshot) {
  if (!snapshot?.computedAt) return "Stats unavailable";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(snapshot.computedAt)) / 1000));
  if (snapshot.status === "stale") return `Last updated ${Math.max(1, Math.round(seconds / 60))}m ago`;
  if (seconds < 75) return "Updated just now";
  return `Updated ${Math.max(1, Math.round(seconds / 60))}m ago`;
}

function participationMarkup() {
  const participating = getCommunityParticipation();
  return `<div class="community-consent" data-participating="${participating}">
    <div><strong>${participating ? "You're contributing" : "Help bring these numbers to life"}</strong><span>${participating ? "Thanks—only game choices and results are shared. Your save stays on this device." : "Share game choices and results without sharing your save, names, notes, or private details."}</span></div>
    <button type="button" class="${participating ? "btn-ghost" : "btn-primary"}" data-community-consent>${participating ? "Stop sharing & delete mine" : "Share anonymous game stats"}</button>
  </div>`;
}

function renderPulse(snapshot) {
  const root = document.querySelector("[data-community-pulse]");
  if (!root) return;
  const period = snapshot?.periods?.[activePeriod];
  if (!period) { root.dataset.state = "unavailable"; root.querySelector("[data-community-freshness]").textContent = "Temporarily unavailable"; root.querySelector("[data-community-pulse-content]").innerHTML = `<p class="community-empty">Community stats are taking a timeout. Your franchise is unaffected.</p>${participationMarkup()}`; bindConsent(root); return; }
  root.dataset.state = snapshot.status;
  const headline = period.headline.slice(0, 4);
  root.querySelector("[data-community-freshness]").textContent = freshness(snapshot);
  root.querySelector("[data-community-pulse-content]").innerHTML = `
    <div class="community-pulse-grid">${headline.map((stat) => statCard(stat, true)).join("")}</div>
    <div class="community-insight"><span aria-hidden="true">↗</span><p>${escapeHtml(playerInsight(period))}</p></div>
    ${participationMarkup()}`;
  bindConsent(root);
}

function percentileMessage(value, distribution, periodStatus) {
  if (periodStatus !== "live" || !distribution) return "A comparison will appear once enough players are sharing.";
  if (value >= distribution.p90) return "Top 10% of community contributors in this period";
  if (value >= distribution.p75) return "Top quarter of community contributors in this period";
  if (value >= distribution.p50) return "Above the community median in this period";
  if (value >= distribution.p25) return "Inside the community's middle range in this period";
  return "Your franchise is still getting started";
}

function renderComparisons(period) {
  const ledger = getLocalCommunityLedger();
  const root = document.querySelector("[data-community-comparisons]");
  if (!root) return;
  const rows = [
    ["weeks", "Weeks managed", ledger.totals.weeks],
    ["trades", "Trades completed", ledger.totals.trades],
    ["draftPicks", "Draft picks made", ledger.totals.draftPicks],
    ["championships", "Championships", ledger.totals.championships],
    ["decisions", "GM decisions", ledger.totals.decisions]
  ];
  root.innerHTML = rows.map(([key, label, value]) => `<article class="community-comparison"><span>${escapeHtml(label)}</span><strong>${number(value)}</strong><p>${escapeHtml(percentileMessage(value, period.comparisons?.[key], period.status))}</p></article>`).join("");
}

function renderAtlas(snapshot) {
  const root = document.querySelector("[data-community-atlas]");
  if (!root) return;
  const period = snapshot?.periods?.[activePeriod];
  const consentShell = document.querySelector("[data-community-consent-shell]");
  if (consentShell) { consentShell.innerHTML = participationMarkup(); bindConsent(consentShell); }
  document.querySelectorAll("[data-community-period]").forEach((button) => { const active = button.dataset.communityPeriod === activePeriod; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
  const status = document.querySelector("[data-community-atlas-status]");
  if (status) status.textContent = snapshot ? `${freshness(snapshot)} · ${period?.label || "No period"}` : "Stats unavailable";
  if (!period) { root.innerHTML = `<div class="community-empty"><h2>Community stats are taking a timeout</h2><p>We will keep trying. Your franchise is unaffected.</p></div>`; return; }
  root.innerHTML = period.categories.map((category, index) => `<section class="community-category" id="${escapeHtml(category.id)}">
    <div class="community-category-head"><span>${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(category.label)}</h2></div>
    <div class="community-atlas-grid">${category.stats.map((stat) => statCard(stat)).join("")}</div>
  </section>`).join("");
  renderComparisons(period);
  const insight = document.querySelector("[data-community-atlas-insight]");
  if (insight) insight.textContent = playerInsight(period);
}

function bindConsent(scope = document) {
  scope.querySelectorAll("[data-community-consent]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      await setCommunityParticipation(!getCommunityParticipation());
      if (latestSnapshot) { renderPulse(latestSnapshot); renderAtlas(latestSnapshot); }
    }, { once: true });
  });
}

async function loadSnapshot() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${COMMUNITY_ENDPOINT}/snapshot`, { headers: { Accept: "application/json" }, cache: "no-cache", credentials: "omit", signal: controller.signal });
    if (!response.ok && response.status !== 503) throw new Error(`status ${response.status}`);
    latestSnapshot = await response.json();
  } catch {
    if (!latestSnapshot) latestSnapshot = null;
  } finally { clearTimeout(timeout); }
  renderPulse(latestSnapshot); renderAtlas(latestSnapshot);
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (document.visibilityState === "visible" && !navigator.connection?.saveData) void loadSnapshot(); }, 30_000);
}

function init() {
  document.querySelectorAll("[data-community-period]").forEach((button) => button.addEventListener("click", () => { activePeriod = button.dataset.communityPeriod; if (latestSnapshot) renderAtlas(latestSnapshot); }));
  window.addEventListener("fa:community-participation", () => { if (latestSnapshot) { renderPulse(latestSnapshot); renderAtlas(latestSnapshot); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void loadSnapshot(); });
  bindConsent(); void loadSnapshot(); scheduleRefresh();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
}
