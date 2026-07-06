import { escapeHtml, teamCode } from "./appCore.js";

function normalizeNeed(entry) {
  if (!entry) return null;
  const position = String(entry.position || entry.pos || entry.role || entry || "depth").toUpperCase();
  const delta = Number(entry.delta ?? entry.gap ?? -1);
  return { position, delta: Number.isFinite(delta) ? delta : -1 };
}

function contenderScore(entry = {}) {
  return Number(entry.wins || 0) - Number(entry.losses || 0) + Number(entry.winPct || 0) * 4;
}

function teamLabel(teamId) {
  const code = teamCode(teamId);
  return code && code !== "undefined" ? code : "Rival";
}

function capTier(capSpace) {
  if (capSpace < 0) return "red";
  if (capSpace < 8_000_000) return "tight";
  if (capSpace > 28_000_000) return "flex";
  return "normal";
}

function buildOffer({ tag, partner, headline, detail, targetNeed, assetAsk, capImpact, constraint, risk, action }) {
  return {
    tag,
    partner: teamLabel(partner?.team || partner?.teamId || partner),
    headline,
    detail,
    targetNeed,
    assetAsk,
    capImpact,
    constraint,
    risk,
    action
  };
}

export function buildTradeDeadlineFrenzy(dashboard = {}) {
  const week = Number(dashboard.currentWeek || 0);
  const standings = dashboard.latestStandings || [];
  const team = dashboard.controlledTeam || {};
  const myCode = team.abbrev || team.teamId || dashboard.controlledTeamId || "";
  const row = standings.find((entry) => entry.team === myCode || entry.teamName === team.name) || {};
  const games = Math.max(1, Number(row.wins || 0) + Number(row.losses || 0) + Number(row.ties || 0));
  const pct = Number(row.wins || 0) / games;
  const needs = (dashboard.rosterNeeds || []).map(normalizeNeed).filter(Boolean).sort((a, b) => a.delta - b.delta);
  const capSpace = Number(dashboard.cap?.capSpace ?? dashboard.capSpace ?? 0);
  const capStatus = capTier(capSpace);
  const challengeMode = String(dashboard.challengeMode || dashboard.rules?.challengeMode || "").toLowerCase();
  const role = pct >= 0.56 ? "buyer" : pct <= 0.4 ? "seller" : "swing";
  const topNeed = needs[0]?.position || "DEPTH";
  const rivals = standings
    .filter((entry) => entry.team && entry.team !== myCode)
    .slice()
    .sort((a, b) => contenderScore(b) - contenderScore(a) || String(a.team).localeCompare(String(b.team)));
  const contender = rivals[0] || {};
  const bubble = rivals[Math.min(1, rivals.length - 1)] || contender;
  const seller = rivals.slice().reverse()[0] || bubble;
  const challengeConstraint = challengeMode
    ? `Challenge mode ${challengeMode}: no rental-only shortcut; preserve the stated run condition.`
    : "No challenge override: deal must still clear cap, fairness, and roster-depth checks.";
  const capConstraint = capStatus === "red"
    ? "Cap is negative: incoming salary must be offset before any buy action."
    : capStatus === "tight"
      ? "Cap is tight: prefer expiring money or salary-neutral swaps."
      : "Cap room available: avoid multi-year dead-money traps.";

  const buyerOffers = [
    buildOffer({
      tag: capStatus === "red" ? "Salary-match buy" : "Targeted buy",
      partner: seller,
      headline: `Call ${teamLabel(seller.team)} about a ${topNeed} starter`,
      detail: `Patch the ${topNeed} room only if the contract fits the next two seasons.`,
      targetNeed: topNeed,
      assetAsk: capStatus === "flex" ? "Day 2 pick + fringe prospect" : "Day 3 pick + salary match",
      capImpact: capStatus === "red" ? "must be neutral or cap-positive" : capStatus === "tight" ? "max +$3.0M 2026 cap" : "max +$8.0M 2026 cap",
      constraint: capConstraint,
      risk: capStatus === "red" ? "high" : "medium",
      action: "open-trade-desk"
    }),
    buildOffer({
      tag: "Market heat",
      partner: contender,
      headline: `${teamLabel(contender.team)} is bidding into the same tier`,
      detail: "If you wait a week, the model expects the price to climb or the player to disappear.",
      targetNeed: topNeed,
      assetAsk: "Set a walk-away price before opening talks",
      capImpact: "no blind escalation",
      constraint: challengeConstraint,
      risk: "medium",
      action: "set-walk-away"
    }),
    buildOffer({
      tag: "Board guard",
      partner: myCode,
      headline: "Protect one premium pick",
      detail: "The model endorses one pressure move, not a full-board drain.",
      targetNeed: "draft capital",
      assetAsk: "keep Round 1 locked unless the player is core-age",
      capImpact: "future flexibility protected",
      constraint: "Do not move young starters or the top pick in the same package.",
      risk: "low",
      action: "protect-board"
    })
  ];

  const sellerOffers = [
    buildOffer({
      tag: "Reset sale",
      partner: contender,
      headline: `Make ${teamLabel(contender.team)} pay for veteran help`,
      detail: "Contenders need certainty now; price expiring money before the market thins.",
      targetNeed: "future picks",
      assetAsk: capStatus === "red" ? "cap relief + Day 3 pick" : "Day 2 pick or young depth",
      capImpact: "must improve next-year flexibility",
      constraint: "Do not include controllable starters under age 27.",
      risk: "medium",
      action: "shop-veteran"
    }),
    buildOffer({
      tag: "Desperation tax",
      partner: bubble,
      headline: `${teamLabel(bubble.team)} is a bubble buyer`,
      detail: "Ask for the higher pick tier first; urgency is on their sideline.",
      targetNeed: "leverage",
      assetAsk: "start one pick tier above fair value",
      capImpact: "salary-out preferred",
      constraint: challengeConstraint,
      risk: "low",
      action: "raise-price"
    }),
    buildOffer({
      tag: "Core guard",
      partner: myCode,
      headline: "Keep the rebuild identity intact",
      detail: "Selling is correct only if the locker room still has a spine next week.",
      targetNeed: "young core",
      assetAsk: "block offers on rookie-contract starters",
      capImpact: "no dead-money self-inflicted wounds",
      constraint: "No youth-for-cash deal unless it fixes a severe cap breach.",
      risk: "low",
      action: "protect-core"
    })
  ];

  const swingOffers = [
    buildOffer({
      tag: "Conditional buy",
      partner: seller,
      headline: `Float a conditional ${topNeed} offer`,
      detail: "Buy only if the next two-week window stays alive and the price remains salary-neutral.",
      targetNeed: topNeed,
      assetAsk: "late pick that escalates only with playoff berth",
      capImpact: capStatus === "tight" || capStatus === "red" ? "salary-neutral required" : "short-term money only",
      constraint: capConstraint,
      risk: capStatus === "red" ? "high" : "medium",
      action: "conditional-buy"
    }),
    buildOffer({
      tag: "Seller board",
      partner: contender,
      headline: `Prepare a fallback sale to ${teamLabel(contender.team)}`,
      detail: "If the next result goes badly, have the expiring-contract call ready.",
      targetNeed: "optionality",
      assetAsk: "future pick + cap relief",
      capImpact: "positive next-year flexibility",
      constraint: "Execute only after the next result confirms the slide.",
      risk: "medium",
      action: "prepare-sale"
    }),
    buildOffer({
      tag: "Hold line",
      partner: myCode,
      headline: "No panic package",
      detail: "The franchise is between lanes; a bad deal costs more than waiting.",
      targetNeed: "discipline",
      assetAsk: "no Round 1, no young core",
      capImpact: "preserve offseason options",
      constraint: challengeConstraint,
      risk: "low",
      action: "hold"
    })
  ];

  const offersByRole = { buyer: buyerOffers, seller: sellerOffers, swing: swingOffers };
  return { week, role, capStatus, capSpace, topNeed, offers: offersByRole[role] || swingOffers };
}

export function renderTradeDeadlineFrenzy(containerId, dashboard = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const frenzy = buildTradeDeadlineFrenzy(dashboard);
  el.innerHTML = `
    <div class="trade-frenzy-grid" data-role="${escapeHtml(frenzy.role)}" data-cap-status="${escapeHtml(frenzy.capStatus)}">
      ${frenzy.offers.map((offer) => `
        <article class="trade-frenzy-card">
          <div class="trade-frenzy-head">
            <strong>${escapeHtml(offer.headline)}</strong>
            <span class="trade-frenzy-chip">${escapeHtml(offer.tag)}</span>
          </div>
          <div class="small">${escapeHtml(offer.detail)}</div>
          <dl class="trade-frenzy-terms">
            <div><dt>Partner</dt><dd>${escapeHtml(offer.partner)}</dd></div>
            <div><dt>Need</dt><dd>${escapeHtml(offer.targetNeed)}</dd></div>
            <div><dt>Ask</dt><dd>${escapeHtml(offer.assetAsk)}</dd></div>
            <div><dt>Cap</dt><dd>${escapeHtml(offer.capImpact)}</dd></div>
            <div><dt>Rule</dt><dd>${escapeHtml(offer.constraint)}</dd></div>
            <div><dt>Risk</dt><dd>${escapeHtml(offer.risk)}</dd></div>
          </dl>
          <button type="button" data-tab-jump="transactionsTab" data-deadline-action="${escapeHtml(offer.action)}" aria-label="${escapeHtml(`Open Trade Desk for ${offer.headline}`)}">Open Trade Desk</button>
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
