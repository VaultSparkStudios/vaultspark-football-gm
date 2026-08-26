/**
 * Usage: node scripts/responsive-evidence.mjs
 *        EVIDENCE_VIEWPORT=mobile node scripts/responsive-evidence.mjs
 *        node scripts/responsive-evidence.mjs --help
 */

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { resolveVisualGameReceipt } from "./lib/visual-game-receipt.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const staticDir = path.join(rootDir, "static");
const outputRoot = path.join(rootDir, "output", "playwright");
const host = "127.0.0.1";
const configuredViewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 }
];
const evidenceThemes = ["dark", "light"];
const evidenceTabs = [
  ["overviewTab", "overview"],
  ["rosterTab", "roster"],
  ["faTab", "free-agency"],
  ["contractsTab", "contracts"],
  ["scoutingTab", "scouting"],
  ["draftTab", "draft"],
  ["historyTab", "history"],
  ["statsTab", "stats"],
  ["boardroomTab", "boardroom"],
  ["settingsTab", "settings"]
];
const viewports = process.env.EVIDENCE_VIEWPORT
  ? configuredViewports.filter((viewport) => viewport.name === process.env.EVIDENCE_VIEWPORT)
  : configuredViewports;
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml"
};

async function exists(target) {
  try { await fs.access(target); return true; } catch { return false; }
}

async function sourceIdentity() {
  const manifest = JSON.parse(await fs.readFile(path.join(staticDir, "deploy-manifest.json"), "utf8"));
  if (!/^[a-f0-9]{40}$/i.test(manifest.sourceRevision || "")) throw new Error("Static manifest lacks an immutable source revision.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.artifactFingerprint?.digest || "")) throw new Error("Static manifest lacks an immutable artifact fingerprint.");
  return { sourceRevision: manifest.sourceRevision, artifactFingerprint: manifest.artifactFingerprint };
}

async function sourceRevision() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    const head = (await fs.readFile(path.join(rootDir, ".git", "HEAD"), "utf8")).trim();
    const hash = head.startsWith("ref:")
      ? (await fs.readFile(path.join(rootDir, ".git", head.slice(5)), "utf8")).trim()
      : head;
    return `${hash.slice(0, 12)}-worktree`;
  } catch {
    return "local-worktree";
  }
}

async function createServer() {
  if (!(await exists(path.join(staticDir, "index.html")))) throw new Error("Missing static artifact. Run npm run build:pages first.");
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}`);
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      const target = path.resolve(staticDir, relative);
      const safeTarget = target.startsWith(`${staticDir}${path.sep}`) ? target : path.join(staticDir, "404.html");
      const file = await exists(safeTarget) ? safeTarget : path.join(staticDir, "404.html");
      const data = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": contentTypes[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error.message || "Static artifact server failed.");
    }
  });
  await new Promise((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  return { server, baseUrl: `http://${host}:${address.port}/` };
}

async function setTheme(page, theme) {
  await page.evaluate((value) => {
    localStorage.setItem("franchise-architect-theme", value);
    document.documentElement.dataset.theme = value;
    if (document.body) document.body.dataset.theme = value;
  }, theme);
  await page.waitForTimeout(150);
}

async function inspectSurface(page, selectors) {
  return page.evaluate((criticalSelectors) => {
    const parseRgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (rgb) => {
      const channels = rgb.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrast = (foreground, background) => {
      const lighter = Math.max(luminance(parseRgb(foreground)), luminance(parseRgb(background)));
      const darker = Math.min(luminance(parseRgb(foreground)), luminance(parseRgb(background)));
      return (lighter + 0.05) / (darker + 0.05);
    };
    const bodyStyle = getComputedStyle(document.body);
    const controls = criticalSelectors.flatMap((selector) => [...document.querySelectorAll(selector)]).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    }).map((element) => {
      const rect = element.getBoundingClientRect();
      return { selector: element.id ? `#${element.id}` : element.tagName, width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      bodyContrast: Number(contrast(bodyStyle.color, bodyStyle.backgroundColor).toFixed(2)),
      overflowElements: [...document.querySelectorAll("body *")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { element, rect };
        })
          .filter(({ rect, element }) => rect.width > 0 && (rect.right > innerWidth + 1 || element.scrollWidth > Math.max(element.clientWidth + 1, innerWidth + 1)))
          .sort((a, b) => Math.max(b.rect.right, b.element.scrollWidth) - Math.max(a.rect.right, a.element.scrollWidth))
          .slice(0, 20)
        .map(({ element, rect }) => ({
          selector: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${[...element.classList].slice(0, 2).join(".")}`,
          width: Math.round(rect.width),
          right: Math.round(rect.right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth
        })),
      controls,
      undersizedControls: controls.filter((control) => control.width < 44 || control.height < 44)
    };
  }, selectors);
}

async function capture(page, outputDir, name, selectors, records) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(50);
  const audit = await inspectSurface(page, selectors);
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(outputDir, file), fullPage: true });
  records.push({ name, file, url: page.url(), ...audit });
}

async function captureViewport(page, outputDir, name, selectors, records) {
  const audit = await inspectSurface(page, selectors);
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(outputDir, file), fullPage: false });
  records.push({ name, file, url: page.url(), viewportCapture: true, ...audit });
}

async function captureElement(page, outputDir, name, selector, records) {
  const audit = await inspectSurface(page, []);
  const file = `${name}.png`;
  const element = page.locator(selector).first();
  await element.waitFor({ state: "visible" });
  await element.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "nearest" });
    const target = node.getBoundingClientRect();
    for (const candidate of document.querySelectorAll("body *")) {
      if (candidate === node || node.contains(candidate) || candidate.contains(node)) continue;
      const style = getComputedStyle(candidate);
      if (style.position !== "sticky" && style.position !== "fixed") continue;
      const rect = candidate.getBoundingClientRect();
      const intersects = rect.left < target.right && rect.right > target.left
        && rect.top < target.bottom && rect.bottom > target.top;
      if (!intersects || rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden") continue;
      candidate.dataset.evidencePriorVisibility = candidate.style.visibility || "__unset__";
      candidate.dataset.evidenceCaptureHidden = "true";
      candidate.style.setProperty("visibility", "hidden", "important");
    }
  });
  await page.waitForTimeout(100);
  try {
    await element.screenshot({ path: path.join(outputDir, file) });
  } finally {
    await page.evaluate(() => document.querySelectorAll("[data-evidence-capture-hidden]").forEach((candidate) => {
      const prior = candidate.dataset.evidencePriorVisibility;
      if (prior === "__unset__") candidate.style.removeProperty("visibility");
      else candidate.style.visibility = prior;
      delete candidate.dataset.evidencePriorVisibility;
      delete candidate.dataset.evidenceCaptureHidden;
    }));
  }
  records.push({ name, file, url: page.url(), elementCapture: selector, ...audit });
}

async function main() {
  const identity = await sourceIdentity();
  const revision = identity.sourceRevision;
  const outputDir = path.join(outputRoot, `responsive-${revision.replace(/[^a-z0-9._-]/gi, "-")}`);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const { server, baseUrl } = await createServer();
  const browser = await chromium.launch({ headless: true });
  const records = [];
  const runtimeErrors = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.on("pageerror", (error) => runtimeErrors.push({ viewport: viewport.name, type: "pageerror", message: error.message }));
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForSelector("#createLeagueBtn");
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await capture(page, outputDir, `${viewport.name}-setup-${theme}`, ["#createLeagueBtn", "#themeToggleBtn"], records);
      }

      await setTheme(page, "dark");
      await page.evaluate(() => {
        document.getElementById("seedInput").value = "20260306";
      });
      await page.click("#createLeagueBtn");
      await page.waitForURL("**/game.html", { timeout: 90_000 });
      await page.waitForSelector("#statusChip");
      await page.waitForFunction(() => !/loading/i.test(document.getElementById("topMetaText")?.textContent || "Loading"));
      await page.waitForFunction(() => /^ready/i.test(document.getElementById("statusChip")?.textContent || ""));
      const tutorialVisible = await page.locator(".tutorial-overlay").isVisible().catch(() => false);
      if (!tutorialVisible) throw new Error(`First-run tutorial is not visible at ${viewport.name}`);
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await capture(page, outputDir, `${viewport.name}-game-dialog-${theme}`, ["#tutSkipBtn"], records);
      }
      const skip = page.locator("#tutSkipBtn");
      if (await skip.isVisible().catch(() => false)) await skip.click();

      await page.evaluate(async () => {
        const [{ state }, overview] = await Promise.all([
          import("./lib/appState.js"),
          import("./lib/tabOverview.js")
        ]);
        state.dashboard.gmLegacy = {
          ...(state.dashboard.gmLegacy || {}),
          mastery: {
            focus: {
              pathId: "stewardship",
              label: "Franchise Stewardship",
              source: "player-authored",
              reason: "You selected this path from the canonical mastery portfolio.",
              nextMilestone: "Raise cap discipline at season close."
            }
          }
        };
        overview.renderOverview();
      });

      if (viewport.name === "mobile") {
        await page.evaluate(async () => {
          const [{ state }, mobile] = await Promise.all([
            import("./lib/appState.js"),
            import("./lib/mobileLoop.js")
          ]);
          state.dashboard.gmLegacy = {
            ...(state.dashboard.gmLegacy || {}),
            mastery: {
              focus: {
                pathId: "stewardship",
                label: "Franchise Stewardship",
                source: "player-authored",
                reason: "You selected this path from the canonical mastery portfolio.",
                nextMilestone: "Raise cap discipline at season close."
              }
            }
          };
          mobile.renderMobileOverlay(state, () => {});
        });
        for (const theme of evidenceThemes) {
          await setTheme(page, theme);
          await captureElement(page, outputDir, viewport.name + "-architect-objective-" + theme, ".ml-architect-objective", records);
          await capture(page, outputDir, `${viewport.name}-game-loop-${theme}`, ["#mlAdvanceWeekBtn", "#mlFullViewBtn", ".ml-pressure-card"], records);
        }
        await page.locator("#mlFullViewBtn").click();
        await page.waitForFunction(() => document.getElementById("mobileLoopOverlay")?.classList.contains("hidden"));
      }

      if (viewport.name !== "desktop") {
        const navToggle = page.locator("#mobileNavToggle");
        for (const theme of evidenceThemes) {
          await setTheme(page, theme);
          await navToggle.click();
          await page.waitForFunction(() => document.body.classList.contains("mobile-nav-open"));
          await capture(
            page,
            outputDir,
            `${viewport.name}-nav-drawer-${theme}`,
            ["#mobileNavToggle", "#sideMenu .menu-btn"],
            records
          );
          await page.keyboard.press("Escape");
          await page.waitForFunction(() => !document.body.classList.contains("mobile-nav-open"));
          await page.waitForTimeout(320);
        }
      }

      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        for (const [tabId, label] of evidenceTabs) {
          const tab = page.locator(`[data-tab="${tabId}"]`).first();
          if (await tab.count() !== 1) throw new Error(`Missing responsive-evidence tab authority: ${tabId}`);
          // CANON-041: below 980px the section nav is an off-canvas drawer that
          // is closed and `inert` by default, so reaching a tab means opening it
          // first — exactly what a real tablet user does. The drawer closes
          // itself on selection, so each tab needs its own open.
          const navToggle = page.locator("#mobileNavToggle");
          if (await navToggle.isVisible().catch(() => false)) {
            await navToggle.click();
            await page.waitForFunction(
              () => document.body.classList.contains("mobile-nav-open")
            );
          }
          await tab.click();
          if (await navToggle.isVisible().catch(() => false)) {
            await page.waitForFunction(() => !document.body.classList.contains("mobile-nav-open"));
            await page.waitForTimeout(320);
          }
          await page.waitForFunction((id) => document.getElementById(id)?.classList.contains("active"), tabId);
          await page.waitForFunction((id) => !document.getElementById(id)?.hasAttribute("aria-busy"), tabId);
          if (tabId === "draftTab") {
            await page.evaluate(async () => {
              const [{ state }, draftUi] = await Promise.all([
                import("./lib/appState.js"),
                import("./lib/tabDraft.js")
              ]);
              const teamId = state.dashboard?.controlledTeamId || "BUF";
              state.draftState = {
                currentPick: 18,
                totalPicks: 224,
                completed: false,
                order: Array.from({ length: 224 }, (_, index) => index === 17 ? teamId : "MIA"),
                slots: Array.from({ length: 224 }, (_, index) => ({ round: Math.floor(index / 32) + 1, teamId: index === 17 ? teamId : "MIA" })),
                selections: [{ pick: 17, round: 1, teamId: "MIA", player: "Jordan Vale", pos: "WR" }],
                available: [{ id: "visual-edge", name: "Malik North", position: "EDGE", age: 21, heightInches: 76, weightLbs: 251, overall: 77, potential: 92, scouting: { rank: 8, projectedRound: 1 } }],
                onClockTradeMarket: {
                  active: true,
                offers: [{ id: "visual-offer", fingerprint: "visual-boundary", teamName: "Seattle Orcas", targetPosition: "EDGE", rationale: "Seattle will move up for its top pressure defender.", incomingPicks: [{ year: 2028, round: 1 }, { year: 2029, round: 3 }], incomingValue: 970, livePick: { year: 2028, round: 1, value: 900 }, valueDelta: 70, counterAvailable: true }]
                }
              };
              draftUi.renderDraft();
            });
            await page.waitForSelector(".on-clock-offer-card", { state: "visible" });
            await page.evaluate(async () => {
              const [{ state }, panel, modalManager] = await Promise.all([
                import("./lib/appState.js"),
                import("./lib/onClockTradeMarketPanel.js"),
                import("./lib/modalManager.js")
              ]);
              const market = state.draftState.onClockTradeMarket;
              const review = panel.buildOnClockTradeReview({ action: "accept", offer: market.offers[0], marketFingerprint: market.offers[0].fingerprint });
              document.getElementById("onClockTradeReviewContent").innerHTML = panel.renderOnClockTradeReview(review);
              const modal = document.getElementById("onClockTradeReviewModal");
              modal.classList.remove("hidden");
              modalManager.openModal(modal);
            });
            await captureElement(page, outputDir, viewport.name + "-draft-trade-review-" + theme, "#onClockTradeReviewModal .modal-card", records);
            await page.evaluate(async () => {
              const modalManager = await import("./lib/modalManager.js");
              const modal = document.getElementById("onClockTradeReviewModal");
              modal.classList.add("hidden");
              modalManager.closeModal(modal, { restoreFocus: false });
            });
            await captureElement(page, outputDir, `${viewport.name}-draft-market-${theme}`, ".on-clock-market", records);
          }
          if (tabId === "faTab") {
            await page.evaluate(async () => {
              const [{ state }, rosterUi] = await Promise.all([
                import("./lib/appState.js"),
                import("./lib/tabRoster.js")
              ]);
              const player = state.freeAgents?.[0] || state.roster?.[0];
              if (!player) throw new Error("Waiver visual evidence requires a player authority");
              state.dashboard.waiverWire = [{
                id: player.id,
                playerId: player.id,
                player: player.name,
                pos: player.pos,
                overall: player.overall,
                releasedBy: "MIA",
                year: state.dashboard.currentYear,
                week: state.dashboard.currentWeek,
                expiresWeek: Number(state.dashboard.currentWeek || 0) + 1
              }];
              rosterUi.renderFreeAgency();
            });
          }
          const selectors = tabId === "overviewTab"
            ? ["#advanceWeekBtn", "#advance4WeeksBtn", "#advanceSeasonBtn", "#themeToggleBtn", "#gmPersonaTier"]
            : ["#themeToggleBtn"];
          await capture(page, outputDir, `${viewport.name}-game-${label}-${theme}`, selectors, records);
          if (tabId === "overviewTab") {
            await captureElement(page, outputDir, `${viewport.name}-cap-pressure-${theme}`, ".overview-summary-cards", records);
          }
          if (tabId === "overviewTab" && viewport.name !== "mobile") {
            await captureElement(page, outputDir, viewport.name + "-architect-objective-" + theme, "[data-blueprint-target-id='franchiseArchitecture']", records);
          }
          if (tabId === "overviewTab") {
            await page.evaluate(async () => {
              const [{ state }, predictions, panel] = await Promise.all([
                import("./lib/appState.js"),
                import("./lib/spreadPredictions.js"),
                import("./lib/predictionPanel.js")
              ]);
              const leagueId = state.dashboard?.franchiseId || "visual-franchise";
              const game = { awayTeamId: "BUF", homeTeamId: "MIA", played: false };
              predictions.submitPrediction(leagueId, 2099, 1, game, { winnerId: "BUF", margin: 7 });
              const resolved = { ...game, played: true, awayScore: 27, homeScore: 20, winnerId: "BUF", isTie: false };
              predictions.resolveWeekPredictions(leagueId, 2099, 1, [resolved]);
              panel.renderPredictionPanel({ leagueId, year: 2099, week: 1, games: [resolved] });
            });
            await captureElement(page, outputDir, `${viewport.name}-prediction-receipt-${theme}`, "#weeklyPredictionsPanel", records);
          }
          if (tabId === "rosterTab") {
            await captureElement(page, outputDir, `${viewport.name}-roster-window-${theme}`, "#rosterWindowTable", records);
            await captureElement(page, outputDir, `${viewport.name}-mentorship-${theme}`, "#mentorshipPanel", records);
          }
          if (tabId === "faTab") {
            await captureElement(page, outputDir, `${viewport.name}-waiver-identity-${theme}`, "#waiverTable", records);
          }
          if (tabId === "contractsTab") {
            const agentButton = page.locator("#negotiationTable [data-agent-player-id]").first();
            await agentButton.waitFor({ state: "visible" });
            await agentButton.click();
            try {
              await page.waitForSelector("#agentNegotiationModal", { state: "visible", timeout: 5_000 });
            } catch {
              const diagnostic = await page.evaluate(async () => {
                const [islands, diagnostics] = await Promise.all([
                  import("./lib/uiIslands.js"),
                  import("./lib/clientDiagnostics.js")
                ]);
                return {
                  modalClass: document.getElementById("agentNegotiationModal")?.className || null,
                  islandLoaded: Boolean(islands.getLoadedUiIsland("contracts")),
                  clientDiagnostics: diagnostics.getClientDiagnosticsSnapshot()
                };
              });
              throw new Error(`Agent modal did not open: ${JSON.stringify({ diagnostic, runtimeErrors })}`);
            }
            await captureViewport(page, outputDir, `${viewport.name}-agent-negotiation-${theme}`, ["#agentNegotiationModal .agent-modal-card", "#closeAgentModalBtn"], records);
            await page.locator("#closeAgentModalBtn").click();
          }
          if (tabId === "historyTab") {
            await page.locator(`[data-history-view="hall-of-fame"]`).click();
            await page.waitForFunction(() => !document.getElementById("historyHallOfFamePanel")?.classList.contains("hidden"));
            await page.evaluate(async () => {
              const [{ state }, historyUi] = await Promise.all([
                import("./lib/appState.js"),
                import("./lib/tabHistory.js")
              ]);
              state.dashboard.franchiseLore = [{
                playerId: "visual-legend",
                playerName: "Avery Stone",
                position: "QB",
                year: 2034,
                teamId: state.dashboard.controlledTeamId || "BUF",
                blurb: "A defining architect of the franchise era, remembered from live dynasty authority."
              }];
              historyUi.renderRecordsAndHistory();
              historyUi.setHistoryView("hall-of-fame");
            });
            await captureElement(page, outputDir, `${viewport.name}-hall-ballot-${theme}`, "#hallOfFameBallotTable", records);
            await captureElement(page, outputDir, `${viewport.name}-franchise-legends-${theme}`, "#franchiseLegendsContainer", records);
            await page.locator(`[data-history-view="decision-archive"]`).click();
            await page.waitForFunction(() => !document.getElementById("historyDecisionArchivePanel")?.classList.contains("hidden"));
            await captureElement(page, outputDir, `${viewport.name}-decision-archive-${theme}`, "#historyDecisionArchivePanel", records);
            await page.evaluate(async () => {
              const ceremony = await import("./lib/hallOfFameCeremony.js");
              ceremony.openHallOfFameCeremony({
                playerId: "visual-hof",
                player: "A.J. Legend",
                pos: "QB",
                retiredYear: 2037,
                teams: ["BUF"],
                careerAv: 188,
                championships: 3,
                legacyScore: 97,
                jerseyNumber: 12,
                careerStats: { passing: { yards: 58214, td: 431 } },
                awardCounts: { MVP: 2, AllPro1: 5, ProBowl: 9 }
              });
            });
            await captureViewport(page, outputDir, `${viewport.name}-hof-ceremony-${theme}`, ["#hofCeremonyOverlay .hof-ceremony-card", "#hofCeremonyCloseBtn"], records);
            await page.locator("#hofCeremonyCloseBtn").click();
          }
        }
      }
      await page.locator("#openGuideBtn").click();
      await page.waitForSelector("#guideModal", { state: "visible" });
      await page.waitForFunction(() => /League Setup/.test(document.getElementById("guideModalContent")?.textContent || ""));
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await captureElement(page, outputDir, `${viewport.name}-guide-modal-${theme}`, "#guideModal .modal-card", records);
      }
      await page.locator("#closeGuideModalBtn").click();

      // S94: the coaching staff sheet lives in the Boardroom with the rest of
      // the owner economy, not in Settings.
      const boardroomTab = page.locator(`[data-tab="boardroomTab"]`).first();
      const boardroomNavToggle = page.locator("#mobileNavToggle");
      if (await boardroomNavToggle.isVisible().catch(() => false)) {
        await boardroomNavToggle.click();
        await page.waitForFunction(() => document.body.classList.contains("mobile-nav-open"));
      }
      await boardroomTab.click();
      if (await boardroomNavToggle.isVisible().catch(() => false)) {
        await page.waitForFunction(() => !document.body.classList.contains("mobile-nav-open"));
        await page.waitForTimeout(320);
      }
      await page.waitForSelector("#staffTeamSelect", { state: "visible", timeout: 30_000 });

      const controlledStaffTeam = await page.locator("#staffTeamSelect").inputValue();
      const rivalStaffTeam = await page.locator("#staffTeamSelect option").evaluateAll(
        (options, controlled) => options.map((option) => option.value).find((value) => value && value !== controlled),
        controlledStaffTeam
      );
      if (!rivalStaffTeam) throw new Error("Rival coaching visual evidence could not find another team");
      await page.selectOption("#staffTeamSelect", rivalStaffTeam);
      await page.waitForFunction(
        (teamId) => document.querySelector("#coachingMarketPanel .coaching-market-empty")?.textContent?.includes(teamId)
          && document.querySelectorAll("#coachingMarketPanel .cm-hire, #coachingMarketPanel .cm-fire").length === 0,
        rivalStaffTeam
      );
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await captureElement(page, outputDir, `${viewport.name}-rival-coaching-${theme}`, "#coachingMarketPanel", records);
      }
      await page.selectOption("#staffTeamSelect", controlledStaffTeam);
      await page.waitForSelector("#coachingMarketPanel .coaching-market-head", { state: "visible" });
      await page.waitForSelector("#facilitiesMarket .control-spotlight-grid", { state: "visible" });
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await captureElement(page, outputDir, `${viewport.name}-facility-capital-${theme}`, "#facilitiesMarket", records);
      }
      // Exercise the verifier once so CANON-053 evidence proves the rendered
      // progression and finite-number receipts with source-derived data.
      const settingsTab = page.locator(`[data-tab="settingsTab"]`).first();
      const verifierNavToggle = page.locator("#mobileNavToggle");
      if (await verifierNavToggle.isVisible().catch(() => false)) {
        await verifierNavToggle.click();
        await page.waitForFunction(() => document.body.classList.contains("mobile-nav-open"));
      }
      await settingsTab.click();
      if (await verifierNavToggle.isVisible().catch(() => false)) {
        await page.waitForFunction(() => !document.body.classList.contains("mobile-nav-open"));
        await page.waitForTimeout(320);
      }
      // S94: developer diagnostics ship hidden and open only for ?dev=1. The
      // evidence run is the intended caller of that flag; a player is not.
      await page.evaluate(async () => {
        const module = await import("./lib/devSurfaces.js");
        module.applyDeveloperSurfaceVisibility(document, "?dev=1");
      });
      await page.waitForSelector("#realismVerifyYearsInput", { state: "visible", timeout: 30_000 });
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await captureElement(page, outputDir, `${viewport.name}-gist-authentication-${theme}`, ".cloud-sync-panel", records);
      }
      await page.locator("#realismVerifyYearsInput").fill("1");
      await page.locator("#runRealismVerifyBtn").click();
      await page.waitForFunction(() => document.querySelectorAll("#realismVerifyProgressionTable tr").length > 1, null, { timeout: 120_000 });
      await page.waitForFunction(() => document.querySelectorAll("#realismVerifyIntegrityTable tr").length === 3, null, { timeout: 120_000 });
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await captureElement(page, outputDir, `${viewport.name}-progression-receipt-${theme}`, "#realismVerifyProgressionTable", records);
        await captureElement(page, outputDir, `${viewport.name}-room-watch-${theme}`, "#realismRoomWatch", records);
        await captureElement(page, outputDir, `${viewport.name}-integrity-receipt-${theme}`, "#realismVerifyIntegrityTable", records);
      }
      const overviewTab = page.locator(`[data-tab="overviewTab"]`).first();
      const returnNavToggle = page.locator("#mobileNavToggle");
      if (await returnNavToggle.isVisible().catch(() => false)) {
        await returnNavToggle.click();
        await page.waitForFunction(() => document.body.classList.contains("mobile-nav-open"));
      }
      await overviewTab.click();
      if (await returnNavToggle.isVisible().catch(() => false)) {
        await page.waitForFunction(() => !document.body.classList.contains("mobile-nav-open"));
        await page.waitForTimeout(320);
      }
      await page.waitForFunction(() => document.getElementById("overviewTab")?.classList.contains("active"));
      await page.evaluate(async () => {
        const [{ state }, overview] = await Promise.all([
          import("./lib/appState.js"),
          import("./lib/tabOverview.js")
        ]);
        const existing = state.gmLegacy?.mastery || state.dashboard?.gmLegacy?.mastery || {};
        const strongest = (existing.paths || []).find((path) => path.evidenceCount > 0) || {
          id: "identity",
          label: "Football Identity",
          score: 16,
          maxScore: 25,
          evidenceCount: 3,
          status: "established",
          evidence: "Visual fixture: three committed weekly identity receipts.",
          breakdown: { summary: "3 source receipts" }
        };
        const paths = existing.paths?.length ? existing.paths : [strongest];
        const mastery = {
          ...existing,
          label: existing.label || "Architect Mastery",
          score: existing.score ?? strongest.score,
          maxScore: existing.maxScore || 100,
          paths,
          signature: {
            pathId: strongest.id,
            label: strongest.label,
            score: strongest.score,
            maxScore: strongest.maxScore || 25,
            evidenceCount: strongest.evidenceCount,
            status: strongest.status
          },
          disclaimer: existing.disclaimer || "Mastery is a source-derived portfolio, not a causal claim or hidden gameplay bonus."
        };
        state.gmLegacy = { ...(state.gmLegacy || {}), mastery };
        state.dashboard = {
          ...(state.dashboard || {}),
          currentWeek: 9,
          cap: { ...(state.dashboard?.cap || {}), capSpace: -2_000_000 },
          injuryReport: [{ teamId: state.dashboard?.controlledTeamId || "BUF", playerId: "visual-injury" }],
          rosterNeeds: [{ pos: "OT" }],
          draft: {
            ...(state.dashboard?.draft || {}),
            available: [{ id: "visual-prospect" }],
            controlledTeamOnClock: true,
            userActionRequired: true
          }
        };
        overview.renderGmReputation({ labels: ["Cap Architect", "Locker-Room Steward"] });
        overview.renderFranchiseCommandCenter();
        overview.renderFranchiseArchitecture();
        const review = document.querySelector("details.architecture-review");
        if (review) review.open = true;
      });
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await captureElement(page, outputDir, `${viewport.name}-gm-persona-${theme}`, "#gmLegacyCardWrap", records);
        await captureElement(page, outputDir, `${viewport.name}-trophy-road-${theme}`, "#trophyRoadPanel", records);
        await captureElement(page, outputDir, `${viewport.name}-co-gm-brief-${theme}`, "#coGmBriefPanel", records);
        await captureElement(page, outputDir, `${viewport.name}-architect-signature-${theme}`, ".architecture-review", records);
        await captureElement(page, outputDir, `${viewport.name}-exact-command-center-${theme}`, "#franchiseCommandCenter", records);
        await page.locator('#franchiseCommandCenter [data-target-id="contractsSpotlight"]').click();
        await page.waitForFunction(() => document.getElementById("contractsTab")?.classList.contains("active"));
        await page.waitForFunction(() => document.activeElement?.id === "contractsSpotlight");
        await captureElement(page, outputDir, `${viewport.name}-exact-command-target-${theme}`, "#contractsSpotlight", records);
        await page.evaluate(async () => (await import("./lib/gameFlow.js")).activateTab("overviewTab"));
        await page.waitForFunction(() => document.getElementById("overviewTab")?.classList.contains("active"));
        const review = page.locator("details.architecture-review");
        if (!(await review.getAttribute("open"))) await review.evaluate((element) => { element.open = true; });
      }
      const simWatchReceipt = await resolveVisualGameReceipt({
        advance: () => page.evaluate(async () => {
          const { api } = await import("./lib/appState.js");
          const response = await api("/api/advance-week", { method: "POST", body: {} });
          globalThis.__VS_FA_APPLY_DASHBOARD__?.(response.state);
          return response;
        }),
        loadBoxScore: (gameId) => page.evaluate(async (id) => {
          const { api } = await import("./lib/appState.js");
          return api(`/api/boxscore?gameId=${encodeURIComponent(id)}`);
        }, gameId),
        maxAttempts: 8
      });
      records.push({
        name: `${viewport.name}-sim-watch-authority`,
        url: page.url(),
        visualGameReceipt: simWatchReceipt,
        viewport: { width: viewport.width, height: viewport.height },
        documentWidth: viewport.width,
        overflowX: false,
        bodyContrast: 99,
        controls: [],
        undersizedControls: []
      });
      await page.evaluate(
        async (gameId) => (await import("./lib/simWatchDirector.js")).runSimWatch(gameId),
        simWatchReceipt.gameId
      );
      await page.waitForSelector("#simWatchOverlay", { state: "visible" });
      await page.locator("#simWatchReelBtn").click();
      await page.waitForFunction(() => /Final Reel/.test(document.getElementById("simWatchProgressLabel")?.textContent || ""));
      await page.waitForFunction(() => Number(document.getElementById("simWatchProgress")?.value || 0) > 0);      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await captureElement(page, outputDir, `${viewport.name}-sim-watch-reel-${theme}`, "#simWatchOverlay", records);
      }
      await page.locator("#simWatchCloseBtn").click();
      await page.evaluate(async () => {
        const [{ state }, digestModule] = await Promise.all([
          import("./lib/appState.js"),
          import("./lib/returnDigest.js")
        ]);
        const key = Object.keys(localStorage).find((entry) => entry.startsWith("franchise-architect-session-boundary:v3"));
        if (!key || !state.dashboard) throw new Error("Live return authority missing after game boot");
        const prior = JSON.parse(localStorage.getItem(key));
        prior.timestamp = Date.now() - (8 * 60 * 60 * 1000);
        prior.week = Number(prior.week || 0) - 1;
        prior.chapterId = "visual-qa-prior-chapter";
        const digest = digestModule.buildReturnDigest(state.dashboard, prior);
        if (!digest) throw new Error("Live dashboard did not produce a visual return digest");
        digestModule.renderReturnDigest(digest, null, {});
      });
      await page.waitForSelector(".return-digest-overlay", { state: "visible" });
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await captureElement(page, outputDir, `${viewport.name}-return-digest-${theme}`, ".return-digest-card", records);
      }
      await page.locator(`.return-digest-actions button[data-action="dismiss"]`).click();
      await page.evaluate(async () => {
        const { appendSeasonEpilogue } = await import("./lib/seasonEpilogue.js");
        const body = document.querySelector(".season-review-body");
        if (!body) throw new Error("Season review body is missing");
        body.innerHTML = "";
        await appendSeasonEpilogue(body, {
          currentYear: 2028,
          currentWeek: 1,
          controlledTeamId: "BUF",
          controlledTeam: { teamId: "BUF", abbrev: "BUF" },
          latestStandings: [{ team: "BUF", wins: 11, losses: 6, playoffSeed: 3 }],
          architectLedger: [
            { id: "visual-2027-9", teamId: "BUF", year: 2027, week: 9, intent: { tactic: { label: "Attack the edges" }, gmDecision: { label: "Hold the line" } }, outcome: { result: "win", score: "27-20", observed: "Explosive runs improved", aligned: true }, nextAdaptation: "Carry the package into the divisional rematch." },
            { id: "visual-2026-7", teamId: "BUF", year: 2026, week: 7, intent: { tactic: { label: "Protect the middle" } }, outcome: { result: "loss", score: "17-24" }, nextAdaptation: "Add a pressure answer." }
          ],
          draftHistory: [{ year: 2027, selections: [{ pick: 18, round: 1, teamId: "BUF", playerId: "visual-rookie", player: "A. Corner", pos: "DB", overall: 76, potential: 91, userSelected: true }] }]
        });
        const modal = document.getElementById("seasonReviewModal");
        modal.hidden = false;
        modal.classList.add("active");
      });
      await page.waitForSelector(".ep-architect-cut", { state: "visible" });
      for (const theme of evidenceThemes) {
        await setTheme(page, theme);
        await captureElement(page, outputDir, `${viewport.name}-architect-cut-${theme}`, ".season-epilogue", records);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  const requiredCaptureNames = viewports.flatMap((viewport) => [
    ...evidenceThemes.map((theme) => `${viewport.name}-game-dialog-${theme}`),
    ...evidenceThemes.map((theme) => viewport.name + "-draft-trade-review-" + theme),
    ...evidenceThemes.map((theme) => viewport.name + "-architect-objective-" + theme),
    ...evidenceThemes.map((theme) => `${viewport.name}-setup-${theme}`),
    ...(viewport.name === "mobile" ? evidenceThemes.map((theme) => `${viewport.name}-game-loop-${theme}`) : []),
    ...(viewport.name !== "desktop" ? evidenceThemes.map((theme) => `${viewport.name}-nav-drawer-${theme}`) : []),
    ...evidenceThemes.map((theme) => `${viewport.name}-return-digest-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-gm-persona-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-cap-pressure-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-trophy-road-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-sim-watch-reel-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-progression-receipt-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-room-watch-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-integrity-receipt-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-architect-cut-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-guide-modal-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-rival-coaching-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-roster-window-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-waiver-identity-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-mentorship-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-draft-market-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-hall-ballot-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-franchise-legends-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-decision-archive-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-co-gm-brief-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-architect-signature-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-exact-command-center-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-exact-command-target-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-prediction-receipt-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-agent-negotiation-${theme}`),
    ...evidenceThemes.map((theme) => `${viewport.name}-hof-ceremony-${theme}`),
    ...evidenceThemes.flatMap((theme) => evidenceTabs.map(([, label]) => `${viewport.name}-game-${label}-${theme}`))
  ]);
  const capturedNames = new Set(records.map((record) => record.name));
  const failures = [
    ...requiredCaptureNames.filter((name) => !capturedNames.has(name)).map((name) => `${name}: required capture missing`),
    ...records.filter((record) => record.overflowX).map((record) => `${record.name}: horizontal overflow (${record.documentWidth}px > ${record.viewport.width}px); suspects ${record.overflowElements.map((item) => item.selector).join(", ")}`),
    ...records.filter((record) => record.bodyContrast < 4.5).map((record) => `${record.name}: body contrast ${record.bodyContrast}:1`),
    ...records.flatMap((record) => record.undersizedControls.map((control) => `${record.name}: ${control.selector} is ${control.width}x${control.height}, below 44x44`)),
    ...runtimeErrors.map((error) => `${error.viewport}: ${error.type}: ${error.message}`)
  ];
  const report = {
    schemaVersion: "1.0",
    sourceRevision: revision,
    artifact: "static",
    artifactFingerprint: identity.artifactFingerprint,
    generatedAt: new Date().toISOString(),
    viewports,
    coverage: {
      themes: evidenceThemes,
      tabs: evidenceTabs.map(([id, label]) => ({ id, label })),
      requiredCaptures: requiredCaptureNames.length,
      completedRequiredCaptures: requiredCaptureNames.filter((name) => capturedNames.has(name)).length
    },
    captures: records,
    runtimeErrors,
    status: failures.length ? "failed" : "passed",
    failures
  };
  await fs.writeFile(path.join(outputDir, "responsive-evidence.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (failures.length) throw new Error(`Responsive evidence failed:\n- ${failures.join("\n- ")}\nReport: ${path.join(outputDir, "responsive-evidence.json")}`);
  console.log(`Responsive evidence passed: ${records.length} captures in ${outputDir}`);
}

if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/responsive-evidence.mjs (optional EVIDENCE_VIEWPORT=mobile|tablet|desktop)");
} else {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
