<!-- generated-by: /audit skill v1.0 -->
<!-- generated-at: 2026-06-15 -->
<!-- project: vaultspark-football-gm · type: game -->

# Project Audit — VaultSpark Football GM

> One ranked improvement plan covering 9 axes. Top items first.
> Run `/implement` to execute in optimal order.
> Session 20 audit — all Session 19 items shipped; this plan is net-new.

## Top-line

- Total items: 8
- Combined Priority (axis-weighted): 1,022.0
- Top 3: veteran-farewell-legacy · gm-reputation-league-awareness · miracle-run-comeback-arc

## Ranked Plan

| # | Tier | Axis | Effort | Impact | Innov. | Priority | Item |
|---|:-:|---|---|:-:|:-:|:-:|---|
| 1 | 🔥 | gamification/engagement/immersion | 2h | 8 | 8 | 32.0 | **veteran-farewell-legacy** — When a LEGEND_FAREWELL narrative event resolves into actual retirement, the player quietly disappears into the retired pool — a franchise-defining moment treated as a database row. Generating a 3-sentence legacy blurb and persisting it to a Franchise Legends archive creates the emotional payoff that keeps GMs playing for decades, not seasons. **Recipe:** Add `buildVeteranLegacyBlurb(player, gmLegacy, league)` in `seasonEpilogue.js` using career stats; call when LEGEND_FAREWELL triggers; push to `league.franchiseLore[]`; surface in Season Review modal and History tab. |
| 2 | 🔥 | gamification/engagement/immersion | 4h | 9 | 9 | 31.3 | **gm-reputation-league-awareness** — CPU teams treat every trade identically regardless of your 20-season history — a known aggressive buyer faces the same ask as a patient rebuilder. `gmLegacy` already tracks `tradeNetAV`, `capGrade`, and playoff rate: everything needed for a reputation profile CPU teams react to. When the league has memory, every GM decision carries permanent meta-game weight. **Recipe:** Add `buildGmReputationProfile(gmLegacy)` in `gmLegacyScore.js`; wire a `reputationMultiplier()` into CPU trade logic in `aiTeamStrategy.js`; surface 'Market knows you as: [label]' on the GM Identity Card and Trade Workspace. |
| 3 | ⚡ | gamification/engagement/immersion | 2h | 8 | 7 | 28.0 | **miracle-run-comeback-arc** — The season epilogue knows four outcome types but nothing for a team at 2-5 week 9 that clawed into the playoffs — the most emotionally resonant arc in sports. Without recognition, a Miracle Run looks identical to a boring 9-8 wild-card entry. `outcomeKey()` in `seasonEpilogue.js` is one function change away. **Recipe:** Add `isMiracleRun(team, week, league)` helper; add 'miracle-run' to `QUOTE_BANK`; update `outcomeKey()`; add 'MIRACLE RUN' badge in Season Review and '★ Miracle' indicator on Dynasty Timeline node. |
| 4 | ⚡ | gamification/engagement/immersion | 4h | 7 | 8 | 21.7 | **draft-sleeper-reveal** — Every user sees the same draft board in the same order — no discovery. One seeded sleeper per class (deterministic per draft year + seed, matching challenge-code duels) whose hidden potential unlocks only via scouting investment creates the 'I found him first' moment that defines franchise sims. **Recipe:** In `ScoutingService.js`, on `getScoutReport()` for draft prospects, flag the year's designated sleeper with `{ sleeperFlag: true, hiddenPotentialBoost }` (seeded index). Render 'SLEEPER' badge + potential indicator in `draftWarRoom.js`. |
| 5 | ⚡ | ui/ux/user-experience | 4h | 9 | 6 | 20.9 | **post-week-digest-card** — Advancing a week triggers a full dashboard re-render across 10+ tabs but gives no summary moment — users must navigate manually to find results, narrative events, and critical inbox items. The mobile decision deck (S19) proved that a compressed priority surface retains attention; the post-week transition is when most users tab away. **Recipe:** Add `renderWeekDigestBanner(newState, prevState)` in `gameFlow.js`, called from `applyDashboard()`: game result, top performer, 1 CRITICAL inbox item, 'Next Best Move' from `buildMobileDecisionDeck()`. Dismisses via sessionStorage. |
| 6 | ⚡ | ui/ux/user-experience | 2h | 8 | 5 | 20.0 | **inbox-action-deeplinks** — The Priority Inbox surfaces CRITICAL items but offers no path to resolution — users see a cap alert and must manually navigate to the contracts tab. Every extra navigation step is a drop-off risk for beta testers. **Recipe:** Update `renderInboxModal()` in `engagementFeatures.js` to add `data-action-tab` attributes; add 'Take Action →' pill button on CRITICAL tier items routing to the resolution tab via `activateTab()`. Cover all CRITICAL type mappings with focused tests. |
| 7 | ⚡ | ai/intelligence-integration | 2h | 8 | 8 | 32.0 | **ai-rival-coach-intel** — The AI GM archetype system gives every CPU team a personality and rivalryDNA tracks heat — but this intelligence is never surfaced before a game. A pre-game rival coach intel card turns advance-week into a strategic decision with real stakes. No backend required. **Recipe:** Add `buildRivalCoachIntel(rivalTeam, myTeam, narrativeLog, rivalryHeat)` in new `public/lib/rivalCoachIntel.js` using `TEAM_STRATEGY_PRESETS`; render 3 tendency lines adjacent to the next matchup in `tabOverview.js`. |
| 8 | 💡 | speed/organization/efficiency | 30m | 4 | 2 | 6.1 | **narrative-deterministic-ids** — Line 25 of `narrativeEvents.js` uses `Date.now() + Math.random()` for event IDs — the same non-deterministic pattern replaced everywhere else in Sessions 11 and 14. Challenge-code replay scenarios produce different narrative log IDs on each run. **Recipe:** Replace the ID template in `pushEvent()` with `narr-${year}-${week}-${type}-${playerIds?.[0] || teamIds?.[0] || 'gen'}` — deterministic per (year, week, type, subject). One-line change. |

## Depth Ladders

All items carry L1/L2/L3 rungs. `/implement` picks the rung that fits remaining session budget and climbs on shipped items when budget remains.

| Slug | L1 (minimal) | L2 (solid) | L3 (genius) |
|---|---|---|---|
| veteran-farewell-legacy | blurb in Season Review modal | persist to franchiseLore + History tab section | full Legends Archive with filter, wall-of-fame layout |
| gm-reputation-league-awareness | reputation labels on GM Identity Card | wire CPU trade ask multipliers | full FA preferences + narrative events + 5-category tracking |
| miracle-run-comeback-arc | badge + quote in epilogue | Dynasty Timeline node + narrative arc | multi-season Perennial Underdog label + fan/owner events |
| draft-sleeper-reveal | sleeper badge on full scout | progressive confidence meter reveal | rivals discover sleepers; multi-year GM sleeper hit rate |
| post-week-digest-card | collapsible banner (no animation) | full modal with action button | animated sequence + Franchise Moment integration |
| inbox-action-deeplinks | tab-level 'Take Action' button | sub-panel deep-link routing | inline triage mode in inbox drawer |
| ai-rival-coach-intel | 3-line tendency card in Schedule | Rivalry Edition card + sim-watch header | full coach scouting surface, persistent across season |
| narrative-deterministic-ids | one-line pushEvent() fix | n/a | n/a |

## Innovation Reserve (Innovation ≥ 8 — execute these even when busy)

- **veteran-farewell-legacy** (8) — emotional franchise memory; nobody does this in browser sims
- **gm-reputation-league-awareness** (9) — CPU adapts to human GM patterns without backend; genuinely novel
- **draft-sleeper-reveal** (8) — discovery mechanic tied to seeded RNG; extends challenge-code duel depth
- **ai-rival-coach-intel** (8) — pre-game AI personality surfacing from existing archetype data

## Skipped (Priority < 1.5 or blocked)

- **cloudflare-remediation** — Agent-attemptable but requires Cloudflare/org-root capability missing from this repo; existing TASK_BOARD runbook is the live path
- **ai-scouting-standalone** — AI intelligence now incorporated into `ai-rival-coach-intel` + `draft-sleeper-reveal` using existing data; still lacks real beta decision traces for standalone model

---
*Generated by `/audit` v1.0 · Session 20 · 2026-06-15 · ready for `/implement`*
