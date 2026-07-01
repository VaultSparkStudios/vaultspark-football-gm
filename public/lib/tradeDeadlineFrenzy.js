import { escapeHtml, teamCode } from "./appCore.js";

export function buildTradeDeadlineFrenzy(dashboard = {}) {
  const week = Number(dashboard.currentWeek || 0);
  const standings = dashboard.latestStandings || [];
  const team = dashboard.controlledTeam || {};
  const myCode = team.abbrev || team.teamId || dashboard.controlledTeamId || "";
  const row = standings.find((entry) => entry.team === myCode || entry.teamName === team.name) || {};
  const games = Math.max(1, Number(row.wins || 0) + Number(row.losses || 0) + Number(row.ties || 0));
  const pct = Number(row.wins || 0) / games;
  const needs = (dashboard.rosterNeeds || []).slice().sort((a, b) => a.delta - b.delta);
  const role = pct >= 0.56 ? "buyer" : pct <= 0.4 ? "seller" : "swing";
  const topNeed = needs[0]?.position || "depth";
  const rivals = standings
    .filter((entry) => entry.team && entry.team !== myCode)
    .slice()
    .sort((a, b) => Math.abs((Number(b.wins || 0) - Number(b.losses || 0))) - Math.abs((Number(a.wins || 0) - Number(a.losses || 0))))
    .slice(0, 3);
  const plans = {
    buyer: [
      { tag: "Aggressive", headline: `Call on a starting ${topNeed}`, detail: "Spend future draft value only if the contract fits the next two seasons." },
      { tag: "Market", headline: `${teamCode(rivals[0]?.team)} is shopping veterans`, detail: "Contenders are bidding. Waiting one week may make the price worse." },
      { tag: "Protect", headline: "Keep one premium pick untouched", detail: "The model flags one all-in move, not a full board drain." }
    ],
    seller: [
      { tag: "Reset", headline: "Move expiring veterans", detail: "Prioritize cap relief and Day 2 picks over short-term depth." },
      { tag: "Market", headline: `${teamCode(rivals[1]?.team)} needs injury cover`, detail: "Use desperation windows to ask for a higher pick tier." },
      { tag: "Keep", headline: "Do not sell young starters", detail: "The rebuild loses identity if controllable core players leave." }
    ],
    swing: [
      { tag: "Conditional", headline: "Set a win-now price", detail: "Buy only if the player solves a top-three need without hurting next year's cap." },
      { tag: "Market", headline: `${teamCode(rivals[2]?.team)} can be pressured`, detail: "Float a pick-for-player framework before the deadline closes." },
      { tag: "Fallback", headline: "Prepare a seller board", detail: "If the next result goes badly, flip expiring money immediately." }
    ]
  };
  return { week, role, offers: plans[role] || plans.swing };
}

export function renderTradeDeadlineFrenzy(containerId, dashboard = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const frenzy = buildTradeDeadlineFrenzy(dashboard);
  el.innerHTML = `
    <div class="trade-frenzy-grid">
      ${frenzy.offers.map((offer) => `
        <article class="trade-frenzy-card">
          <div class="trade-frenzy-head">
            <strong>${escapeHtml(offer.headline)}</strong>
            <span class="trade-frenzy-chip">${escapeHtml(offer.tag)}</span>
          </div>
          <div class="small">${escapeHtml(offer.detail)}</div>
          <button type="button" data-tab-jump="transactionsTab">Open Trade Desk</button>
        </article>
      `).join("")}
    </div>
  `;
  el.querySelectorAll("[data-tab-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`[data-tab="${button.dataset.tabJump}"]`)?.click();
    });
  });
}
