import { COMMUNITY_ENDPOINT, getCommunityParticipation, getLocalCommunityLedger, setCommunityParticipation } from "./lib/communityTelemetry.js";

const PERIOD_LABELS = { "24h": "24 hours", "7d": "7 days", "30d": "30 days" };
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
  const share = stat.share != null ? `<span class="community-stat-share">${number(stat.share)}% of eligible receipts</span>` : "";
  return `<article class="community-stat ${compact ? "community-stat--compact" : ""}" data-state="${escapeHtml(stat.status)}">
    <span class="community-stat-label">${escapeHtml(stat.label)}</span>
    <strong class="community-stat-value">${escapeHtml(labelValue(stat))}</strong>
    ${share}<p>${escapeHtml(stat.interpretation)}</p>
    <small>${escapeHtml(stat.period)} · n=${number(stat.sampleSize)}</small>
  </article>`;
}

function freshness(snapshot) {
  if (!snapshot?.computedAt) return "Live aggregate unavailable";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(snapshot.computedAt)) / 1000));
  if (snapshot.status === "stale") return `Last verified snapshot ${Math.max(1, Math.round(seconds / 60))}m ago`;
  if (seconds < 75) return "Live · refreshed within a minute";
  return `Updated ${Math.max(1, Math.round(seconds / 60))}m ago`;
}

function participationMarkup() {
  const participating = getCommunityParticipation();
  return `<div class="community-consent" data-participating="${participating}">
    <div><strong>${participating ? "You're in the huddle" : "Make your receipts count"}</strong><span>${participating ? "Anonymous, allowlisted game receipts are contributing. Your saves remain local." : "Optional. Share bounded game outcomes—never saves, names, free text, credentials, or hidden ratings."}</span></div>
    <button type="button" class="${participating ? "btn-ghost" : "btn-primary"}" data-community-consent>${participating ? "Stop & delete" : "Participate anonymously"}</button>
  </div>`;
}

function renderPulse(snapshot) {
  const root = document.querySelector("[data-community-pulse]");
  if (!root) return;
  const period = snapshot?.periods?.[activePeriod];
  if (!period) { root.dataset.state = "unavailable"; root.querySelector("[data-community-pulse-content]").innerHTML = `<p class="community-empty">The live huddle is temporarily unavailable. Your franchise still plays entirely in this browser.</p>${participationMarkup()}`; bindConsent(root); return; }
  root.dataset.state = snapshot.status;
  const headline = period.headline.slice(0, 4);
  root.querySelector("[data-community-freshness]").textContent = freshness(snapshot);
  root.querySelector("[data-community-pulse-content]").innerHTML = `
    <div class="community-pulse-grid">${headline.map((stat) => statCard(stat, true)).join("")}</div>
    <div class="community-insight"><span aria-hidden="true">↗</span><p>${escapeHtml(period.insights[0] || "The live community baseline is forming.")}</p></div>
    ${participationMarkup()}`;
  bindConsent(root);
}

function percentileMessage(value, distribution) {
  if (!distribution) return "A community comparison will appear when the eligible cohort is large enough.";
  if (value >= distribution.p90) return "Top 10% of participating browsers in this period";
  if (value >= distribution.p75) return "Top quarter of participating browsers in this period";
  if (value >= distribution.p50) return "Above the community median in this period";
  if (value >= distribution.p25) return "Inside the community's middle range in this period";
  return "Your local ledger is still early compared with the current cohort";
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
  root.innerHTML = rows.map(([key, label, value]) => `<article class="community-comparison"><span>${escapeHtml(label)}</span><strong>${number(value)}</strong><p>${escapeHtml(percentileMessage(value, period.comparisons?.[key]))}</p></article>`).join("");
}

function renderAtlas(snapshot) {
  const root = document.querySelector("[data-community-atlas]");
  if (!root) return;
  const period = snapshot?.periods?.[activePeriod];
  const consentShell = document.querySelector("[data-community-consent-shell]");
  if (consentShell) { consentShell.innerHTML = participationMarkup(); bindConsent(consentShell); }
  document.querySelectorAll("[data-community-period]").forEach((button) => { const active = button.dataset.communityPeriod === activePeriod; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
  const status = document.querySelector("[data-community-atlas-status]");
  if (status) status.textContent = snapshot ? `${freshness(snapshot)} · ${period?.label || "No period"}` : "Live aggregate unavailable";
  if (!period) { root.innerHTML = `<div class="community-empty"><h2>The Stats Atlas is offline</h2><p>No franchise data is affected. This page will reconnect automatically.</p></div>`; return; }
  root.innerHTML = period.categories.map((category, index) => `<section class="community-category" id="${escapeHtml(category.id)}">
    <div class="community-category-head"><span>${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(category.label)}</h2></div>
    <div class="community-atlas-grid">${category.stats.map((stat) => statCard(stat)).join("")}</div>
  </section>`).join("");
  renderComparisons(period);
  const insight = document.querySelector("[data-community-atlas-insight]");
  if (insight) insight.textContent = period.insights.join(" ");
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
