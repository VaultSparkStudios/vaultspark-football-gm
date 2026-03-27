# Task Board

## Completed This Session (Session 4 — 2026-03-27)
- **Full project audit** — audits/2026-03-27.html; 83/100 B+; 10 category scores, 28-item brainstorm with scores
- **GM Legacy Score** — src/engine/gmLegacyScore.js; /api/gm-legacy; overview hero card
- **Rivalry DNA System** — src/engine/rivalryDNA.js; heat metric 0–100; /api/rivalry route
- **Injury System** — src/engine/injurySystem.js; position contact rates, severity 0–8 weeks, reinjury risk
- **Draft Combine** — src/engine/draftCombine.js; position events; /api/combine/run + /api/combine/results; combine results table in Draft tab
- **IndexedDB Save Store** — src/adapters/persistence/indexedDbSaveStore.js; 250MB capacity; /api/storage/estimate
- **Mobile Core Loop** — public/lib/mobileLoop.js; #mobileLoopOverlay; shows record/cap/next game/needs/actions
- **Agent Negotiation Modal** — #agentNegotiationModal; openAgentModal/renderAgentModal/submitAgentOffer/signalCompetingOffer; /api/agent/offer + competing-offer routes
- **Beat Reporter News Ticker** — #newsTicker; renderNewsTicker(); seamless scroll animation; called in applyDashboard
- **Season Preview Hype Panel** — #seasonPreviewPanel; shows on preseason/offseason/draft phase; renderSeasonPreviewPanel()
- **Cap Casualty Predictor** — #capCasualtyPanel; cut risk bar per contract; renderCapCasualtyPanel()
- **Cap Projection Panel** — 3-year cap outlook bars; renderCapProjectionPanel()
- **Coaching DNA Card** — #coachingDnaCard; coaching lineage; auto-called from renderStaff()
- **Commissioner Lobby (async)** — src/runtime/multiplayerSession.js; 6 API routes; #commissionerPanel
- **Keyboard shortcuts extended** — W=advance, N=ticker, 1–9=tab jump, ?=shortcuts modal
- **Dynasty Timeline Share** — shareDynastyTimeline() print window
- **Rewind architecture cleanup** — rewindManager.js @deprecated; canonical = localApiRuntime.js
- **getAugmentedState()** — injects narrativeLog/newsLog/coachingTree/gmLegacy/rivalries/combineResults
- **~450 lines new CSS** — all new components in styles.css

## Completed This Session (Session 3 — 2026-03-27)
- **Franchise Story narrative panel** — live event feed on Overview tab (renderNarrativePanel); reads narrativeLog from dashboard state; icon/tone mapping per event type
- **Trade Deadline Alert panel** — week 9–11 banner on Overview; auto-detects BUYER/SELLER/NEUTRAL role from standings win%
- **Rewind Timeline panel** — Settings tab; auto-snapshots before trades, pre-deadline (wk 9), season-start; restore/delete via UI; manual snapshot button; max 10 slots with oldest-first pruning (localApiRuntime.js)
- **War Room board CSS + all component styles** — war-room-board, wrb-*, clock-bar, trade-call, narrative-feed, rewind-timeline, small-btn in styles.css
- **Mobile 375px fix** — @media max-width:420px collapses war room board to 3 cols, drops .wrb-need, stacks rewind actions, forces history galleries to 1 col
- **Competitive analysis HTML report** — audits/competitive-analysis-2026-03-26.html (full feature matrix vs Football-GM/ZenGM, SWOT, differentiation strategy)
- **[SIL] Fill out all context files** — complete (SOUL, TASK_BOARD, LATEST_HANDOFF, SELF_IMPROVEMENT_LOOP all populated)

## Now
- **Live smoke test at 375px** — all new Session 4+5 panels: news ticker, season preview hype, agent modal, cap casualty, cap projection, draft combine, coaching DNA card, commissioner lobby, shortcuts modal, mobile loop overlay, cap alert banner, persona tier dots, newsletter button, cloud sync panel
- **Deploy** to GitHub Pages after smoke test passes (Sessions 3–5 are local only)
- **[SIL] CURRENT_STATE.md full refresh** — stale since Session 2; update to reflect Sessions 3–5 additions (13+ new systems)
- **[SIL] Persona tier unlock toast** — notify when GM crosses a tier threshold mid-session (Engage ↑↑)

~~- **Wire engine hooks into GameSession.js** — DONE Session 5~~
~~- **[SIL] Tutorial mission board** — DONE Session 5 (mountTutorial wired in init())~~

## Next
- Add more player-profile richness if the new dossier surface lands well:
  - trait chips
  - comparison callouts
  - cleaner mobile stat stacking
  - explicit retired-number / Hall-of-Fame honor chips in the dossier
- Carry the command-deck treatment into the remaining lower-priority management tabs so the shell feels consistent end to end
- Consider using the same subtab pattern anywhere else long content blocks force users to scroll past the primary data
- Use the new setup diagnostics to decide whether any remaining setup cost is now dominated by save listing, backup listing, or client-side render work
- Add UI hints for weekly plan/scouting-fit outputs where they matter most beyond the new overview/scouting summaries
- Add setup/settings UI hints for the challenge-rule failures that now have frontend error formatting
- Decide whether to add ceremony surfacing or richer archive storytelling on top of the new Hall-of-Fame / jersey-retirement commissioner controls
- Decide whether to restore the parked realism/runtime stash onto a separate branch or continue keeping it isolated
- Add more targeted startup observability only if the new setup diagnostics still leave startup bottlenecks unclear
- Add UI affordances for pruning old browser backups if live Pages usage still hits quota pressure after the automatic recovery changes
- Reconcile the separate Studio repo deployment docs/templates to the direct-Pages model once that repo is safe to edit

## Later
- Add deeper runtime/backend rollout docs once production infra exists
- Extend project-memory files with system specs and recurring operational checklists
- Promote the client beta to a fuller Studio launch checklist when backend rollout is ready
