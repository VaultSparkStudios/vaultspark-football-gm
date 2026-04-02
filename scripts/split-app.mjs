/**
 * Split public/app.js into modular files.
 * Run: node scripts/split-app.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "public", "app.js");
const libDir = path.join(root, "public", "lib");

const source = fs.readFileSync(appPath, "utf8");
const lines = source.split("\n");

// ── Parse function boundaries ──────────────────────────────────
// Detects top-level function declarations and their end lines
function parseFunctions(lines) {
  const fns = [];
  let braceDepth = 0;
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Detect top-level function start (depth 0)
    if (braceDepth === 0) {
      const fnMatch = trimmed.match(/^(async\s+)?function\s+(\w+)\s*\(/);
      const constMatch = trimmed.match(/^const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
      const arrowMatch = trimmed.match(/^const\s+(\w+)\s*=\s*(?:async\s*)?\(.*\)\s*=>/);

      if (fnMatch) {
        current = { name: fnMatch[2], startLine: i, async: !!fnMatch[1] };
      } else if (constMatch && !arrowMatch) {
        // const fn = (params) => { or const fn = function
      } else if (arrowMatch) {
        current = { name: arrowMatch[1], startLine: i, async: trimmed.includes("async") };
      }
    }

    // Count braces
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      if (ch === "}") {
        braceDepth--;
        if (braceDepth === 0 && current) {
          current.endLine = i;
          fns.push(current);
          current = null;
        }
      }
    }
  }
  return fns;
}

const functions = parseFunctions(lines);
console.log(`Parsed ${functions.length} top-level functions from app.js`);

// ── Module assignments ─────────────────────────────────────────
// Maps function names to target modules

const moduleMap = {
  // appCore.js — utilities + shared UI helpers
  appCore: [
    "escapeHtml", "fmtMoney", "hashStringLocal", "portraitChoice", "playerBodyTypeLabel",
    "buildPlayerPortraitSvg", "buildProfileLatestSeasonSummary", "renderPlayerProfileHero",
    "setStatus", "appendAvLast", "toTitleCaseKey", "shouldHideInternalColumn",
    "readStatsHiddenColumns", "saveStatsHiddenColumns", "readTradeBlockIds", "saveTradeBlockIds",
    "formatHeight", "normalizeSeasonType", "selectedSeasonType", "showToast", "metricNumber",
    "classifyTone", "setElementTone", "setMetricCardValue", "formatActionError", "presentActionError",
    "teamName", "teamByCode", "teamCode", "teamDisplayFromId", "teamDisplayLabel",
    "hexToRgbTriplet", "getActiveTeamTheme", "applyShellTheme", "setSimControl",
    "buildProfileSeasonAvMap", "passerRateFromStats", "formatAwards",
    "buildProfileSeasonRows", "buildProfileCareerRow", "buildProfileTeamSplits",
    "rowJoinKey", "shapeStatsRowsForDisplay",
    "renderGuideContent", "setTableSkeleton", "valueAsNumber",
    "createEmptyTradeAssets", "tradeAssetKeys", "uniqueIds",
    "fmtDeltaMoney", "formatTradeList", "formatTransactionDetails",
    "setTradeEvalText", "renderTable", "setSelectOptions",
    "syncTeamSelects", "updateTopMeta", "renderPulseChips", "setBoxScoreTab",
    "decoratePlayerColumnFromRows", "decoratePlayerColumnByIds",
    "loadPlayerModal", "closePlayerModal", "bindMenuTabs", "runAction"
  ],

  // tabOverview.js — overview tab
  tabOverview: [
    "renderOverview", "renderNarrativePanel", "renderTradeDeadlineAlert",
    "renderOverviewSpotlight", "renderRosterNeeds", "renderLeaders",
    "renderSchedule", "renderStandings", "renderWeekResults",
    "renderBoxScoreTicker", "loadBoxScore", "closeBoxScoreModal",
    "openGuideModal", "closeGuideModal",
    "renderNewsTicker", "renderGmLegacyScore", "showPersonaTierToast",
    "renderSeasonPreviewPanel", "renderCapAlertBanner",
    "renderFanSentimentCard", "renderInjuryOverlayCard", "renderStatLeadersStrip",
    "renderOwnerUltimatum"
  ],

  // tabRoster.js — roster, free agency, depth, retired
  tabRoster: [
    "renderRoster", "renderFreeAgency", "renderRetiredPool",
    "depthManualShareMap", "depthDefaultShares", "formatDepthSharePercent",
    "roundDepthShare", "totalDepthShares", "resolveDepthShareValues",
    "updateDepthShare", "renderDepthChart", "moveIdWithinList",
    "renderVeteranMentorshipPanel"
  ],

  // tabContracts.js — contracts, trade, negotiations
  tabContracts: [
    "renderExpiringContracts", "lookupContractCandidate", "getSelectedContractPlayer",
    "setSelectedContractPlayer", "getSelectedDesignationPlayer", "setSelectedDesignationPlayer",
    "getSelectedRetirementOverridePlayer", "setSelectedRetirementOverridePlayer",
    "updateContractPreview", "renderContractsPage", "renderContractsSpotlight",
    "setContractActionText", "toggleTradeBlockPlayer",
    "getTradeTeamId", "setTradeEvalCards", "clearTradePackages",
    "getTradePlayersForSide", "getTradePicksForSide", "setTradePackageText",
    "toggleTradeAsset", "queueTradePlayer", "renderTradeRosterTable",
    "renderTradeWorkspace", "deriveContractToolsFromRoster",
    "renderCapCasualtyPanel", "renderCapProjectionPanel",
    "openAgentModal", "closeAgentModal", "renderAgentModal",
    "submitAgentOffer", "signalCompetingOffer"
  ],

  // tabDraft.js — draft + scouting
  tabDraft: [
    "renderDraft", "renderScouting", "renderScoutingSpotlight",
    "renderCombineResults", "pickAnalystLine", "showDraftPickReveal"
  ],

  // tabStats.js — stats + compare
  tabStats: [
    "updateStatsControls", "renderStatsBenchmarkHint", "applyStatsSort",
    "renderStatsColumnFilters", "renderComparePlayers", "renderCompareSearchResults",
    "renderAnalyticsChart"
  ],

  // tabHistory.js — history, awards, HoF, calendar
  tabHistory: [
    "setHistoryView", "formatAwardList", "hallOfFameCareerLine", "awardCountLine",
    "hallOfFamePolicyLine", "retiredNumberPolicyLine", "setSelectedHistoryPlayerFromAwardEntry",
    "renderAwardGallery", "renderSeasonAwardsShowcase", "timelineEntrySummary",
    "renderPlayerHistoryArchive", "renderHistorySpotlight", "renderHallOfFameGallery",
    "renderTeamHistorySpotlight", "renderRecordsAndHistory",
    "renderCalendar", "setSelectedHistoryPlayer",
    "renderPlayerTimelineSearchResults"
  ],

  // tabSettings.js — settings, admin, staff, owner, rewind, gist, etc.
  tabSettings: [
    "renderTransactionLog", "renderNews", "renderPickAssets", "renderNegotiationTargets",
    "renderAnalytics", "renderStaff", "renderOwner", "renderObservability",
    "renderPersistence", "renderPipeline", "renderCalibrationJobs", "renderSimJobs",
    "renderCommandPalette", "applySettingsControls", "renderRealismVerification",
    "renderRulesTab", "renderSettingsSpotlight", "renderOwnerSpotlight",
    "loadRewindHistory", "renderRewindTimeline", "renderCoachingDnaCard",
    "renderCommissionerLobby", "openShortcutsModal", "closeShortcutsModal",
    "shareDynastyTimeline", "renderGistSyncStatus", "renderGistList", "initGistSyncUI",
    "applyBrandIdentity"
  ],

  // gameFlow.js — simulation control, state loading, dashboard
  gameFlow: [
    "applyDashboard", "activateTab", "loadState", "loadScheduleWeek", "loadCalendar",
    "loadTransactionLog", "loadNews", "loadPickAssets", "loadNegotiations",
    "loadContractsTeam", "loadAnalytics", "loadSettings", "loadStaff", "loadOwner",
    "loadObservability", "loadPersistence", "loadPipeline", "loadCalibrationJobs",
    "runRealismVerification", "loadSimJobs", "loadComparePlayers", "searchComparePlayers",
    "loadRoster", "loadFreeAgency", "loadRetiredPool", "loadStats",
    "exportSnapshot", "importSnapshot", "loadDraftState", "loadScouting",
    "loadDepthChart", "loadSaves", "loadQa", "loadTeamHistory", "loadPlayerTimeline",
    "retireSelectedJersey", "searchHistoryPlayers", "syncBootFilters",
    "loadCoreDashboard", "loadSecondaryPanels", "refreshEverything",
    "queueStartupHydration", "refreshPostSimulation",
    "advanceWeeksSequential", "advanceSeasonSequential",
    "checkSeasonEndReview", "showSeasonEndReview", "showHalftimeAdjustModal"
  ]
};

// ── Build module name -> function name reverse map ─────────────
const fnToModule = new Map();
for (const [mod, fns] of Object.entries(moduleMap)) {
  for (const fn of fns) fnToModule.set(fn, mod);
}

// Check for unmapped functions
const mapped = new Set([...fnToModule.keys()]);
const unmapped = functions.filter(f => !mapped.has(f.name));
if (unmapped.length > 0) {
  console.log(`Unmapped functions (will stay in app.js): ${unmapped.map(f => f.name).join(", ")}`);
}

// ── Collect lines for each module ──────────────────────────────
const moduleLines = {};
for (const mod of Object.keys(moduleMap)) moduleLines[mod] = [];

const fnMap = new Map(functions.map(f => [f.name, f]));

for (const [mod, fnNames] of Object.entries(moduleMap)) {
  for (const fnName of fnNames) {
    const fn = fnMap.get(fnName);
    if (!fn) {
      console.warn(`  WARNING: function '${fnName}' not found in app.js`);
      continue;
    }
    const fnLines = lines.slice(fn.startLine, fn.endLine + 1);
    moduleLines[mod].push("");
    moduleLines[mod].push(...fnLines);
  }
}

// ── Determine imports for each module ──────────────────────────
// Scan each module's code for references to functions in other modules

function findReferencedFunctions(code, ownFunctions) {
  const refs = new Map(); // module -> set of function names
  for (const [fnName, mod] of fnToModule) {
    if (ownFunctions.has(fnName)) continue;
    // Check if this function name appears in the code (as a word boundary)
    const regex = new RegExp(`\\b${fnName}\\b`);
    if (regex.test(code)) {
      if (!refs.has(mod)) refs.set(mod, new Set());
      refs.get(mod).add(fnName);
    }
  }
  return refs;
}

// ── Write module files ─────────────────────────────────────────

const moduleImports = {
  appCore: 'import { state, api, DISPLAY_LABELS, GUIDE_SECTIONS, STATS_BENCHMARK_HINTS, TEAM_THEME_MAP } from "./appState.js";',
  tabOverview: 'import { state, api, STATS_BENCHMARK_HINTS } from "./appState.js";',
  tabRoster: 'import { state, api } from "./appState.js";',
  tabContracts: 'import { state, api } from "./appState.js";',
  tabDraft: 'import { state, api } from "./appState.js";',
  tabStats: 'import { state, api, STATS_BENCHMARK_HINTS } from "./appState.js";',
  tabHistory: 'import { state, api } from "./appState.js";',
  tabSettings: 'import { state, api } from "./appState.js";',
  gameFlow: 'import { state, api } from "./appState.js";'
};

for (const [mod, bodyLines] of Object.entries(moduleLines)) {
  const ownFnNames = new Set(moduleMap[mod]);
  const code = bodyLines.join("\n");
  const refs = findReferencedFunctions(code, ownFnNames);

  const importLines = [moduleImports[mod]];
  for (const [refMod, refFns] of refs) {
    if (refMod === mod) continue;
    const fnList = [...refFns].sort().join(", ");
    importLines.push(`import { ${fnList} } from "./${refMod}.js";`);
  }

  // Add export to each function definition
  const exportedBody = bodyLines.map(line => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("async function ") || trimmed.startsWith("function ")) {
      const indent = line.length - trimmed.length;
      if (indent === 0) {
        return `export ${line}`;
      }
    }
    return line;
  });

  const content = importLines.join("\n") + "\n" + exportedBody.join("\n") + "\n";
  const outPath = path.join(libDir, `${mod}.js`);
  fs.writeFileSync(outPath, content, "utf8");
  console.log(`  Wrote ${mod}.js (${bodyLines.length} lines, ${ownFnNames.size} functions)`);
}

// ── Rewrite app.js ─────────────────────────────────────────────
// Keep: imports, state init call, bindEvents, init

// Collect all exported function names per module
const allModuleExports = {};
for (const [mod, fnNames] of Object.entries(moduleMap)) {
  allModuleExports[mod] = fnNames.filter(fn => fnMap.has(fn));
}

// Build the new app.js
const newAppLines = [];

// Original external imports (lines 1-7 from original)
newAppLines.push('import { mountTutorial } from "./lib/tutorialCampaign.js";');
newAppLines.push('import {');
newAppLines.push('  getSavedToken, saveToken, getSavedGistId, saveGistId,');
newAppLines.push('  exportToGist, importFromGist, listGists');
newAppLines.push('} from "./lib/gistSync.js";');
newAppLines.push('');

// Import state
newAppLines.push('import { state, api } from "./lib/appState.js";');
newAppLines.push('');

// Import from each module
for (const [mod, fnNames] of Object.entries(allModuleExports)) {
  if (!fnNames.length) continue;
  const importList = fnNames.join(",\n  ");
  newAppLines.push(`import {`);
  newAppLines.push(`  ${importList}`);
  newAppLines.push(`} from "./lib/${mod}.js";`);
  newAppLines.push('');
}

// Add bindEvents and init (which stay in app.js)
// Find bindEvents and init in the original
const bindEventsFn = fnMap.get("bindEvents");
const initFn = fnMap.get("init");

if (bindEventsFn) {
  newAppLines.push('');
  newAppLines.push(...lines.slice(bindEventsFn.startLine, bindEventsFn.endLine + 1));
}

if (initFn) {
  newAppLines.push('');
  newAppLines.push(...lines.slice(initFn.startLine, initFn.endLine + 1));
  newAppLines.push('');
  newAppLines.push('init();');
}

const newAppContent = newAppLines.join("\n") + "\n";
fs.writeFileSync(appPath, newAppContent, "utf8");
console.log(`\n  Rewrote app.js (${newAppLines.length} lines)`);

console.log("\nDone! Module split complete.");
