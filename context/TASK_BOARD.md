# Task Board

## Completed This Session (Session 6 — 2026-03-27)
- **Full project audit** — audits/2026-03-27-session6.html; 77/100 B; 10 category scores, 30-item brainstorm with scores
- **Fan Sentiment System** — src/engine/fanSentiment.js; approval 0–100; wired in GameSession weekly hook; /api/fan-sentiment; fanSentimentCard on Overview
- **Veteran Mentorship System** — src/engine/veteranMentorship.js; veteran+young pairs; +1-2 OVR offseason bonus; mentorshipPanel on Roster tab
- **Owner Ultimatum System** — buildOwnerExpectation() now returns ultimatum field when heat ≥ 75 + patience ≤ 0.35; ownerUltimatumBanner on game.html
- **Halftime Adjustment / Pre-Game Tactical Brief** — showHalftimeAdjustModal(); 4 tactic options; weeklyTacticOverride param to /api/advance-week
- **End-of-Season GM Review Screen** — checkSeasonEndReview(); showSeasonEndReview(); seasonReviewModal on game.html
- **Draft Day Radio Feel** — showDraftPickReveal(); DRAFT_ANALYST_LINES[]; draftPickRevealModal on game.html
- **Franchise Brand Builder** — POST /api/brand-identity; applyBrandIdentity(); brand builder panel in Settings tab; new league form fields
- **Persona Tier Unlock Toast** — showPersonaTierToast(); personaTierToast on game.html; tier change detection in renderGmLegacyScore()
- **Active Injury Overlay Card** — getAugmentedState() injects activeInjuries; renderInjuryOverlayCard(); injuryOverlayCard on Overview
- **Stat Leaders Strip** — /api/stat-leaders; renderStatLeadersStrip(); statLeadersStrip on Overview
- **Beta Landing Page** — public/landing.html; static dark-themed splash; hero + stats bar + 9-feature grid + CTA
- **app.js syntax fix** — draftAvailableTable listener missing `async` keyword; corrected

## Completed This Session (Session 5 — 2026-03-27)
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

## Completed This Session (Session 3+4 — 2026-03-27)
- **Franchise Story narrative panel** — live event feed on Overview tab
- **Trade Deadline Alert panel** — week 9–11 banner; auto-detects BUYER/SELLER/NEUTRAL
- **Rewind Timeline panel** — Settings tab; auto-snapshots; restore/delete; max 10 slots
- **Competitive analysis HTML report** — audits/competitive-analysis-2026-03-26.html

## Now
- **Run tests + build:pages** — Verify npm test passes and Pages bundle builds after Session 6 changes (fan sentiment, mentorship, app.js async fix)
- **Setup.js brand builder wire** — setupBrandNameInput / setupBrandCityInput / setupBrandAbbrevInput / setupBrandPrimaryInput fields in public/setup.js need to be passed to the create-league API
- **Session 6 SIL closeout** — Score all 5 SIL categories, append to SELF_IMPROVEMENT_LOOP.md, commit
- **Deploy** to GitHub Pages (Sessions 3–6 are still local-only)
- **Community Hub Launch** — Enable GitHub Discussions or Discord; no code needed

## Next — Session 7 Candidates (from Session 6 Brainstorm)
Items not yet implemented, sorted by potential impact:

### Draft System Gap (Score 7–9)
- **Player Comparison Tool** — Side-by-side prospect or player comparison modal (score 8, +3 pts)
- **Draft Prospect Comp Cards** — "Comps to X" card for each draft prospect based on PFR similarity (score 8, +3 pts)
- **Draft Grade System** — Immediate post-pick letter grade A–F based on need/fit (score 7, +2 pts)

### Narrative + Immersion (Score 7–8)
- **Offseason Storylines Engine** — Drama events extending narrativeEvents.js into dead period (score 8, +3 pts)
- **Weekly Power Rankings Feed** — Simulated AP/Coaches poll with brief AI movement commentary (score 7, +2 pts)
- **Rivalry Week Big Game Mode** — Special pre-game briefing + tactical options for heat > 60 games (score 8, +3 pts)
- **Practice Squad Story Arc** — PS player development narrative; CPU poaching; roster tension (score 7, +2 pts)

### Depth / Strategy (Score 7–9)
- **Salary Arbitration Mini-Game** — Pick argument in agent negotiation; partial win/loss resolution (score 9, +3 pts)
- **Coach Personality Conflict System** — OC/DC clashes reduce chemistry; mid-season fire ripple (score 8, +3 pts)
- **AI GM Tendency Visible** — Show REBUILD/WIN-NOW/DEVELOP posture in trade builder (score 7, +2 pts)
- **Player Regression Cliff Warning** — Aging star 30+ decline chip in dossier + contract flag (score 7, +2 pts)
- **3-Way Trade Builder** — Extend trade builder to support 3-team asset flows (score 7, +2 pts)
- **Cross-Tab Quick-Add Actions** — Floating pill: sign/release/offer from Roster/Stats/Scouting (score 6, +2 pts)

### Technical / Community (Score 5–8)
- **Speedrun Challenge Mode** — Reach Super Bowl in fewest seasons; leaderboard via Gist (score 8, +3 pts)
- **Save Size Indicator** — Show save size and quota pressure in Settings (score 6, +1 pt)
- **GameSession Modular Refactor** — Split 5,130-LOC GameSession into sub-managers (score 5, +2 pts)

## Later
- Add deeper runtime/backend rollout docs once production infra exists
- Extend project-memory files with system specs and recurring operational checklists
- Promote the client beta to a fuller Studio launch checklist when backend rollout is ready
- Reconcile the separate Studio repo deployment docs/templates to the direct-Pages model
