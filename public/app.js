import { createApiClient } from "./lib/api/createApiClient.js";

const state = {
  dashboard: null,
  roster: [],
  freeAgents: [],
  contractRoster: [],
  contractTeamId: null,
  contractCap: null,
  negotiationTargets: [],
  selectedContractPlayerId: null,
  tradeBlockIds: [],
  statsRows: [],
  statsPage: 1,
  statsPageSize: 40,
  statsSortKey: null,
  statsSortDir: "desc",
  statsCompanionRows: {},
  draftState: null,
  selectedDraftProspectId: null,
  depthChart: null,
  depthSnapShare: null,
  depthDefaultShares: {},
  depthManualShares: {},
  depthRoster: [],
  depthOrder: [],
  scheduleWeek: null,
  scheduleYear: null,
  scheduleCache: {},
  calendar: null,
  calendarWeek: 1,
  scouting: null,
  scoutingBoardDraft: [],
  txRows: [],
  saves: [],
  picks: [],
  newsRows: [],
  analytics: null,
  staffState: null,
  leagueSettings: null,
  ownerState: null,
  observability: null,
  persistence: null,
  calibrationJobs: [],
  realismVerification: null,
  pipeline: null,
  simJobs: [],
  comparePlayers: [],
  commandFilter: "",
  retiredPool: [],
  statsHiddenColumns: [],
  activePlayerId: null,
  recentBoxScores: [],
  activeBoxScoreId: null,
  simControl: {
    active: false,
    pauseRequested: false,
    mode: null
  },
  syncedControlledTeamId: null,
  contractTools: {
    expiring: [],
    tagEligible: [],
    optionEligible: []
  }
};

const DISPLAY_LABELS = {
  ovr: "OVR",
  pos: "Pos",
  tm: "Tm",
  pf: "PF",
  pa: "PA",
  pct: "Pct",
  yds: "Yds",
  td: "TD",
  tkl: "Tkl",
  rec: "Rec",
  tgt: "Tgt",
  ypr: "YPR",
  passYds: "Pass Yds",
  passTd: "Pass TD",
  rushYds: "Rush Yds",
  rushTd: "Rush TD",
  recYds: "Rec Yds",
  recTd: "Rec TD",
  fgm: "FGM",
  fga: "FGA",
  xpm: "XPM",
  xpa: "XPA",
  capHit: "Cap Hit",
  currCap: "Current Cap",
  tagCap: "Tag Cap",
  optionCap: "Option Cap",
  snapShare: "Snap Share",
  season: "Season",
  age: "Age",
  team: "Team",
  lg: "Lg",
  g: "G",
  gs: "GS",
  cmpPct: "Cmp%",
  tdPct: "TD%",
  intPct: "Int%",
  firstDowns: "1D",
  ypg: "Y/G",
  apg: "A/G",
  recPg: "R/G",
  tpg: "Tch/G",
  ypt: "Y/Tgt",
  touch: "Touch",
  yScr: "YScr",
  yTch: "Y/Tch",
  recYds: "Rec Yds",
  rushYds: "Rush Yds",
  rushYpa: "Y/A",
  av: "AV",
  awards: "Awards",
  comb: "Comb",
  pd: "PD",
  ff: "FF",
  fr: "FR",
  sk: "Sk",
  nya: "NY/A",
  anya: "ANY/A"
};

const GUIDE_SECTIONS = [
  {
    title: "League Setup",
    body:
      "Start a league from the Main Menu, choose `Drive` or `Play`, choose an era profile, then pick your controlled team. Drive is faster and resolves games by possession. Play resolves more play-level variance and produces richer box scores."
  },
  {
    title: "Era Profiles",
    body:
      "`Modern Pass` increases passing lean and offensive volatility. `Balanced` stays near a middle-ground NFL baseline. `Legacy` lowers tempo and pushes the league toward more rushing and lower passing volume."
  },
  {
    title: "Season Loop",
    body:
      "The long loop is regular season -> postseason -> retirements -> coaching carousel -> free agency negotiation -> combine -> pro day -> draft -> next regular season. Stage chips and the calendar tell you what the current step expects."
  },
  {
    title: "Core Team Screens",
    body:
      "Overview tracks standings, recent results, schedule, box scores, and league news. Roster handles active/practice moves and designations. Free Agents is the unsigned market. Depth Chart controls playing-time order. Transactions handles trades and overrides. Contracts handles cap, extensions, negotiation, restructures, trade block, and quick trade actions."
  },
  {
    title: "Scouting And Draft",
    body:
      "Scouting stays separate from Draft. You start with a capped board, spend weekly scouting points for progressive reveals, lock the board, then use one-click user draft actions while CPU picks stay locked to CPU control."
  },
  {
    title: "Ratings, Physicals, And Development",
    body:
      "Speed, acceleration, agility, route running, carrying, break tackle, coverage, pass rush, blocking, awareness, and other ratings all feed the sim. Height and weight influence positional frame and physical identity. Potential is seeded at player creation from development trait and ratings, then progression/regression follows age, potential, and seasonal development curves."
  },
  {
    title: "Stats And Profiles",
    body:
      "Statistics supports season, career, and team views with regular-season, playoff, and combined filters. Player profiles show season-by-season tables, career summaries, team splits, awards, and playoff context. Box scores archive the controlled team’s games with scoring summary and play-by-play."
  },
  {
    title: "Settings, History, And Saves",
    body:
      "Settings controls injuries, chemistry, narratives, comp picks, owner mode, offseason automation, and realism verification. History shows records, champions, awards, team history, and player timelines. Saves, backups, snapshot export/import, and client/server runtime support preserve league continuity."
  }
];

const api = createApiClient();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtMoney(value) {
  if (!Number.isFinite(value)) return "$0";
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function setStatus(text) {
  const el = document.getElementById("statusChip");
  if (el) el.textContent = text;
}

function toTitleCaseKey(key) {
  if (!key) return "";
  if (DISPLAY_LABELS[key]) return DISPLAY_LABELS[key];
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function shouldHideInternalColumn(column) {
  return column === "id" || column === "playerId";
}

function readStatsHiddenColumns() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("vsfgm:stats-hidden-columns") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStatsHiddenColumns(columns) {
  state.statsHiddenColumns = [...columns];
  try {
    window.localStorage.setItem("vsfgm:stats-hidden-columns", JSON.stringify(state.statsHiddenColumns));
  } catch {
    // Ignore persistence failures.
  }
}

function readTradeBlockIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("vsfgm:trade-block") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTradeBlockIds(ids) {
  state.tradeBlockIds = [...new Set(ids)];
  try {
    window.localStorage.setItem("vsfgm:trade-block", JSON.stringify(state.tradeBlockIds));
  } catch {
    // Ignore persistence failures.
  }
}

function formatHeight(heightInches) {
  if (!Number.isFinite(heightInches)) return "-";
  const feet = Math.floor(heightInches / 12);
  const inches = heightInches % 12;
  return `${feet}'${inches}"`;
}

function normalizeSeasonType(value, fallback = "regular") {
  if (value === "regular" || value === "playoffs" || value === "all") return value;
  return fallback;
}

function selectedSeasonType() {
  return normalizeSeasonType(document.getElementById("statsSeasonTypeFilter")?.value, "regular");
}

function showToast(message) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

function teamName(teamId) {
  return state.dashboard?.teams?.find((team) => team.id === teamId)?.name || teamId;
}

function teamDisplayLabel(team) {
  return `${team?.abbrev || team?.id || "-"} - ${team?.name || "-"}`;
}

function setSimControl(next) {
  state.simControl = { ...state.simControl, ...next };
  const pauseBtn = document.getElementById("pauseSimBtn");
  if (pauseBtn) {
    pauseBtn.disabled = !state.simControl.active;
    pauseBtn.textContent = state.simControl.pauseRequested ? "Pausing..." : "Pause Sim";
  }
}

function approximateValue(position, stats) {
  if (!stats) return 0;
  if (position === "QB") {
    return Math.round(
      (stats.passing?.yards || 0) / 165 +
        (stats.passing?.td || 0) * 0.8 -
        (stats.passing?.int || 0) * 0.6 +
        (stats.rushing?.yards || 0) / 120
    );
  }
  if (position === "RB") {
    return Math.round(
      (stats.rushing?.yards || 0) / 115 +
        (stats.rushing?.td || 0) * 0.7 +
        (stats.receiving?.yards || 0) / 180 +
        (stats.receiving?.td || 0) * 0.45
    );
  }
  if (position === "WR" || position === "TE") {
    return Math.round((stats.receiving?.yards || 0) / 125 + (stats.receiving?.td || 0) * 0.75);
  }
  if (position === "OL") {
    return Math.round((stats.snaps?.offense || 0) / 130 - (stats.blocking?.sacksAllowed || 0) * 1.5);
  }
  if (position === "K" || position === "P") {
    return Math.round((stats.kicking?.fgm || 0) * 0.45 + (stats.punting?.in20 || 0) * 0.2);
  }
  return Math.round(
    (stats.defense?.tackles || 0) / 6 +
      (stats.defense?.sacks || 0) * 1.2 +
      (stats.defense?.int || 0) * 1.5 +
      (stats.defense?.ff || 0) * 0.8
  );
}

function passerRateFromStats(stats) {
  const cmp = stats?.cmp || 0;
  const att = Math.max(1, stats?.att || 0);
  const yards = stats?.yards || 0;
  const td = stats?.td || 0;
  const int = stats?.int || 0;
  const a = Math.max(0, Math.min(2.375, cmp / att - 0.3)) * 5;
  const b = Math.max(0, Math.min(2.375, yards / att - 3)) * 0.25;
  const c = Math.max(0, Math.min(2.375, (td / att) * 20));
  const d = Math.max(0, Math.min(2.375, 2.375 - (int / att) * 25));
  return Number((((a + b + c + d) / 6) * 100).toFixed(1));
}

function formatAwards(awards = [], champion = false) {
  const tags = [...awards];
  if (champion) tags.unshift("SB");
  return tags.join(", ");
}

function buildProfileSeasonRows(profile) {
  const position = profile.player.position;
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
      team: entry.teamId,
      lg: "NFL",
      pos: entry.pos || position,
      g: stats.games || 0,
      gs: stats.gamesStarted || 0
    };
    if (position === "QB") {
      return {
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
        av: approximateValue(position, stats),
        awards: formatAwards(entry.awards, entry.champion)
      };
    }
    if (position === "RB") {
      const scrimmageYards = (rushing.yards || 0) + (receiving.yards || 0);
      const touches = (rushing.att || 0) + (receiving.rec || 0);
      return {
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
        av: approximateValue(position, stats),
        awards: formatAwards(entry.awards, entry.champion)
      };
    }
    if (position === "WR" || position === "TE") {
      const scrimmageYards = (rushing.yards || 0) + (receiving.yards || 0);
      const touches = (rushing.att || 0) + (receiving.rec || 0);
      return {
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
        av: approximateValue(position, stats),
        awards: formatAwards(entry.awards, entry.champion)
      };
    }
    if (position === "K" || position === "P") {
      const kicking = stats.kicking || {};
      const punting = stats.punting || {};
      return {
        ...common,
        fgm: kicking.fgm || 0,
        fga: kicking.fga || 0,
        fgPct: Number((((kicking.fgm || 0) / Math.max(1, kicking.fga || 0)) * 100).toFixed(1)),
        xpm: kicking.xpm || 0,
        xpa: kicking.xpa || 0,
        punts: punting.punts || 0,
        in20: punting.in20 || 0,
        av: approximateValue(position, stats),
        awards: formatAwards(entry.awards, entry.champion)
      };
    }
    return {
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
      av: approximateValue(position, stats),
      awards: formatAwards(entry.awards, entry.champion)
    };
  });
}

function buildProfileCareerRow(profile) {
  const player = profile.player;
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
    return [{
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
      sk: passing.sacks || 0,
      av: approximateValue(player.position, {
        passing: { yards: passing.yds || 0, td: passing.td || 0, int: passing.int || 0 },
        rushing: { yards: rushing.yds || 0 }
      })
    }];
  }
  if (player.position === "RB") {
    const touch = (rushing.att || 0) + (receiving.rec || 0);
    const yScr = (rushing.yds || 0) + (receiving.yds || 0);
    return [{
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
      fmb: rushing.fmb || 0,
      av: approximateValue(player.position, {
        rushing: { yards: rushing.yds || 0, td: rushing.td || 0 },
        receiving: { yards: receiving.yds || 0, td: receiving.td || 0 }
      })
    }];
  }
  if (player.position === "WR" || player.position === "TE") {
    const touch = (rushing.att || 0) + (receiving.rec || 0);
    const yScr = (rushing.yds || 0) + (receiving.yds || 0);
    return [{
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
      yScr,
      av: approximateValue(player.position, {
        rushing: { yards: rushing.yds || 0, td: rushing.td || 0 },
        receiving: { yards: receiving.yds || 0, td: receiving.td || 0 }
      })
    }];
  }
  if (player.position === "K" || player.position === "P") {
    const kicking = profile.career?.kicking || {};
    const punting = profile.career?.punting || {};
    return [{
      season: "Career",
      seasons,
      fgm: kicking.fgm || 0,
      fga: kicking.fga || 0,
      fgPct: kicking.fgPct || 0,
      xpm: kicking.xpm || 0,
      xpa: kicking.xpa || 0,
      punts: punting.punts || 0,
      in20: punting.in20 || 0
    }];
  }
  return [{
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
    qbHits: defense.qbHits || 0,
    av: approximateValue(player.position, {
      defense: { tackles: defense.tkl || 0, sacks: defense.sacks || 0, int: defense.int || 0, ff: defense.ff || 0 }
    })
  }];
}

function buildProfileTeamSplits(profile) {
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

function rowJoinKey(row) {
  return `${row.playerId || row.id || row.player}-${row.year || row.seasons || 0}`;
}

function shapeStatsRowsForDisplay(rows, { scope, category }) {
  if (scope === "team") return rows;
  const rushingCompanion = new Map((state.statsCompanionRows.receiving || []).map((row) => [rowJoinKey(row), row]));
  const receivingCompanion = new Map((state.statsCompanionRows.rushing || []).map((row) => [rowJoinKey(row), row]));
  return (rows || []).map((row) => {
    const common = {
      playerId: row.playerId,
      player: row.player,
      season: row.year ?? row.seasons,
      age: row.age ?? "",
      team: row.tm,
      lg: "NFL",
      pos: row.pos,
      g: row.g ?? row.seasons ?? 0,
      gs: row.gs ?? 0
    };
    if (category === "passing") {
      return {
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
      };
    }
    if (category === "rushing") {
      const receiving = rushingCompanion.get(rowJoinKey(row)) || {};
      const touch = (row.att || 0) + (receiving.rec || 0);
      const yScr = (row.yds || 0) + (receiving.yds || 0);
      return {
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
      };
    }
    if (category === "receiving") {
      const rushing = receivingCompanion.get(rowJoinKey(row)) || {};
      const touch = (rushing.att || 0) + (row.rec || 0);
      const yScr = (rushing.yds || 0) + (row.yds || 0);
      return {
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
      };
    }
    if (category === "defense") {
      return {
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
      };
    }
    return { ...common, ...row };
  });
}

function renderGuideContent() {
  const html = GUIDE_SECTIONS.map(
    (section) => `<div class="record"><strong>${escapeHtml(section.title)}</strong><div>${escapeHtml(section.body)}</div></div>`
  ).join("");
  const rules = document.getElementById("rulesGuideContent");
  const modal = document.getElementById("guideModalContent");
  if (rules) rules.innerHTML = html;
  if (modal) modal.innerHTML = html;
}

function setTableSkeleton(tableId, rows = 6) {
  const table = document.getElementById(tableId);
  if (!table) return;
  table.innerHTML = Array.from({ length: rows })
    .map(() => `<tr><td><div class="skeleton"></div></td></tr>`)
    .join("");
}

function valueAsNumber(row, key) {
  const raw = row?.[key];
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIds(text) {
  return String(text || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function fmtDeltaMoney(value) {
  if (!Number.isFinite(value)) return "$0";
  const abs = fmtMoney(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function formatTradeList(rows = []) {
  if (!rows.length) return "none";
  return rows.map((row) => `${row.player || row.playerId} (${fmtMoney(row.capHit || 0)})`).join(", ");
}

function formatTransactionDetails(entry) {
  const d = entry.details || {};
  if (entry.type === "signing") return `from ${d.from || "FA"} | cap ${fmtMoney(d.capHit)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "release") {
    const wire = d.toWaivers ? "waivers" : d.destination || "FA";
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
  if (entry.type === "retirement-override") return `team ${d.teamId || "FA"} | min win ${Math.round((d.minWinningPct || 0.55) * 100)}%`;
  if (entry.type === "championship") return `beat ${d.runnerUp || "-"} | ${d.score || ""}`;
  const text = JSON.stringify(d);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function setTradeEvalText(text) {
  const el = document.getElementById("tradeEvalText");
  if (el) el.textContent = text;
}

function renderTable(
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
          .map((col) => `<td>${row[col] == null ? "" : escapeHtml(row[col])}</td>`)
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

function setSelectOptions(selectId, options, preferredValue = null) {
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

function syncTeamSelects() {
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
  setSelectOptions("tradeTeamA", teamOptions);
  setSelectOptions("tradeTeamB", teamOptions);
  setSelectOptions("teamHistorySelect", teamOptions);
  setSelectOptions("depthTeamSelect", teamOptions, controlledChanged ? controlled : null);
  setSelectOptions("retirementOverrideTeamSelect", teamOptions, controlled);
  setSelectOptions("analyticsTeamFilter", [{ value: "", label: "ALL Teams" }, ...teamOptions]);
  setSelectOptions("staffTeamSelect", teamOptions, controlled);
  setSelectOptions("ownerTeamSelect", teamOptions, controlled);

  ["rosterTeamSelect", "contractsTeamSelect", "tradeTeamA", "teamHistorySelect", "depthTeamSelect", "retirementOverrideTeamSelect"].forEach((id) => {
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
}

function updateTopMeta() {
  const d = state.dashboard;
  if (!d) return;
  document.getElementById("topMetaText").textContent =
    `${d.currentYear} W${d.currentWeek} | ${d.phase} | Team: ${d.controlledTeam?.abbrev || d.controlledTeamId}`;
  const stageChip = document.getElementById("stageChip");
  if (stageChip) {
    const draftStage = d.draft?.completed === false ? `Draft Pick ${d.draft.currentPick}` : null;
    const offseasonStage = d.offseasonPipeline?.currentStage?.replaceAll("-", " ") || null;
    stageChip.textContent = `Stage: ${draftStage || offseasonStage || d.phase}`;
  }
}

function renderOverview() {
  const d = state.dashboard;
  if (!d) return;
  document.getElementById("phaseCard").textContent = d.phase;
  document.getElementById("yearCard").textContent = `${d.currentYear} / W${d.currentWeek}`;
  document.getElementById("seasonsCard").textContent = String(d.seasonsSimulated || 0);
  document.getElementById("capCard").textContent = fmtMoney(d.cap?.capSpace || 0);
  document.getElementById("deadCapCard").textContent = fmtMoney(d.cap?.deadCap || 0);
  document.getElementById("ovrCard").textContent = d.controlledTeam?.overallRating ?? "-";
}

function renderRosterNeeds() {
  const needs = (state.dashboard?.rosterNeeds || [])
    .slice()
    .sort((a, b) => a.delta - b.delta || a.position.localeCompare(b.position))
    .map((entry) => ({
      pos: entry.position,
      target: entry.target,
      current: entry.current,
      delta: entry.delta,
      status: entry.delta < 0 ? `Need ${Math.abs(entry.delta)}` : entry.delta === 0 ? "On target" : `+${entry.delta}`
    }));
  renderTable("needsTable", needs);
}

function renderLeaders() {
  const category = document.getElementById("leadersCategory")?.value || "passing";
  const source = state.dashboard?.leaders?.[category] || [];
  const rows = source.slice(0, 20).map((row, index) => {
    if (category === "passing") {
      return {
        rk: index + 1,
        player: row.player,
        tm: row.tm,
        pos: row.pos,
        yds: row.yds,
        td: row.td,
        int: row.int,
        ypa: row.ypa,
        rate: row.rate
      };
    }
    if (category === "rushing") {
      return {
        rk: index + 1,
        player: row.player,
        tm: row.tm,
        pos: row.pos,
        yds: row.yds,
        td: row.td,
        att: row.att,
        ypa: row.ypa,
        lng: row.lng
      };
    }
    return {
      rk: index + 1,
      player: row.player,
      tm: row.tm,
      pos: row.pos,
      yds: row.yds,
      td: row.td,
      rec: row.rec,
      tgt: row.tgt,
      ypr: row.ypr
    };
  });
  renderTable("leadersTable", rows);
  decoratePlayerColumnByIds(
    "leadersTable",
    source.map((row) => row.playerId),
    1
  );
}

function renderSchedule() {
  const week = state.scheduleWeek || state.dashboard?.currentWeek || 1;
  const schedule = state.scheduleCache[week] || null;
  const weekText = document.getElementById("scheduleWeekText");
  if (!schedule) {
    weekText.textContent = `Week ${week}`;
    renderTable("scheduleTable", []);
    return;
  }
  weekText.textContent = `Week ${schedule.week} (${schedule.played ? "Played" : "Upcoming"})`;
  const rows = (schedule.games || []).map((game) => ({
    away: game.awayTeamId,
    home: game.homeTeamId,
    score: game.played ? `${game.awayScore}-${game.homeScore}` : "-",
    winner: game.played ? (game.isTie ? "TIE" : game.winnerId || "") : "TBD"
  }));
  renderTable("scheduleTable", rows);
}

function decoratePlayerColumnFromRows(tableId, rows, { nameKey = "player", idKeys = ["playerId", "id"] } = {}) {
  if (!rows?.length) return;
  const columns = Object.keys(rows[0]);
  const nameIndex = columns.indexOf(nameKey);
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

function decoratePlayerColumnByIds(tableId, playerIds, playerColumnIndex = 1) {
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

function renderStandings() {
  const rows = (state.dashboard?.latestStandings || []).map((row) => ({
    tm: row.team,
    team: row.teamName,
    w: row.wins,
    l: row.losses,
    t: row.ties,
    pct: row.winPct,
    pf: row.pf,
    pa: row.pa,
    conf: row.conference,
    div: row.division
  }));
  renderTable("standingsTable", rows);
}

function renderWeekResults() {
  const week = state.dashboard?.latestWeekResults;
  const games = (week?.games || []).map((game) => ({
    week: week.week,
    away: game.awayTeamId,
    home: game.homeTeamId,
    score: `${game.awayScore}-${game.homeScore}`,
    winner: game.winnerId || "TIE"
  }));
  renderTable("weekTable", games);

  const injuries = (state.dashboard?.injuryReport || []).map((entry) => ({
    player: entry.player,
    team: entry.teamId,
    pos: entry.pos,
    status: entry.injury?.type || "",
    weeks: entry.injury?.weeksRemaining || 0
  }));

  const suspensions = (state.dashboard?.suspensionReport || []).map((entry) => ({
    player: entry.player,
    team: entry.teamId,
    pos: entry.pos,
    status: "Suspension",
    weeks: entry.suspensionWeeks
  }));

  renderTable("injuryTable", [...injuries, ...suspensions].slice(0, 100));
}

function renderBoxScoreTicker() {
  const ticker = document.getElementById("boxScoreTicker");
  if (!ticker) return;
  if (!state.recentBoxScores.length) {
    ticker.innerHTML = `<span class="small">No user-team games played yet.</span>`;
    return;
  }
  ticker.innerHTML = state.recentBoxScores
    .map(
      (game) => `
        <button class="ticker-item" data-boxscore-id="${escapeHtml(game.gameId)}">
          <span>W${escapeHtml(game.week)} ${escapeHtml(game.seasonType === "playoffs" ? "PO" : "REG")}</span>
          <span>${escapeHtml(game.awayTeamId)} ${escapeHtml(game.awayScore)}</span>
          <strong>@</strong>
          <span>${escapeHtml(game.homeTeamId)} ${escapeHtml(game.homeScore)}</span>
        </button>`
    )
    .join("");
}

async function loadBoxScore(gameId) {
  state.activeBoxScoreId = gameId;
  const payload = await api(`/api/boxscore?gameId=${encodeURIComponent(gameId)}`);
  const boxScore = payload.boxScore;
  document.getElementById("boxScoreModalTitle").textContent =
    `${boxScore.awayTeamName} at ${boxScore.homeTeamName}`;
  document.getElementById("boxScoreModalMeta").textContent =
    `${boxScore.year} | Week ${boxScore.week || "-"} | ${boxScore.seasonType}`;
  document.getElementById("boxScoreAwayTitle").textContent = `${boxScore.awayTeamName} Player Stats`;
  document.getElementById("boxScoreHomeTitle").textContent = `${boxScore.homeTeamName} Player Stats`;

  renderTable("boxScoreTeamStatsTable", [
    {
      team: boxScore.awayTeamName,
      score: boxScore.awayTeam.score,
      yds: boxScore.awayTeam.totalYards,
      passYds: boxScore.awayTeam.passingYards,
      rushYds: boxScore.awayTeam.rushingYards,
      firstDowns: boxScore.awayTeam.firstDowns,
      turnovers: boxScore.awayTeam.turnovers
    },
    {
      team: boxScore.homeTeamName,
      score: boxScore.homeTeam.score,
      yds: boxScore.homeTeam.totalYards,
      passYds: boxScore.homeTeam.passingYards,
      rushYds: boxScore.homeTeam.rushingYards,
      firstDowns: boxScore.homeTeam.firstDowns,
      turnovers: boxScore.homeTeam.turnovers
    }
  ]);

  renderTable(
    "boxScoreScoringTable",
    (boxScore.scoringSummary || []).map((entry) => ({
      qtr: entry.quarterLabel,
      clock: entry.clock,
      team: entry.teamId,
      type: entry.type,
      summary: entry.description
    }))
  );

  renderTable(
    "boxScorePlayTable",
    (boxScore.playByPlay || []).map((entry) => ({
      qtr: entry.quarterLabel,
      clock: entry.clock,
      offense: entry.offenseTeamId,
      play: entry.description
    }))
  );

  const renderSide = (prefix, groups = {}) => {
    renderTable(`${prefix}PassingTable`, groups.passing || []);
    renderTable(`${prefix}RushingTable`, groups.rushing || []);
    renderTable(`${prefix}ReceivingTable`, groups.receiving || []);
    renderTable(`${prefix}DefenseTable`, groups.defense || []);
    renderTable(`${prefix}KickingTable`, groups.kicking || []);
    ["Passing", "Rushing", "Receiving", "Defense", "Kicking"].forEach((suffix) => {
      decoratePlayerColumnFromRows(`${prefix}${suffix}Table`, groups[suffix.toLowerCase()] || [], { idKeys: ["playerId"] });
    });
  };
  renderSide("boxScoreAway", boxScore.playerStats?.away);
  renderSide("boxScoreHome", boxScore.playerStats?.home);
  document.getElementById("boxScoreModal").classList.remove("hidden");
}

function closeBoxScoreModal() {
  state.activeBoxScoreId = null;
  document.getElementById("boxScoreModal").classList.add("hidden");
}

function openGuideModal() {
  document.getElementById("guideModal")?.classList.remove("hidden");
}

function closeGuideModal() {
  document.getElementById("guideModal")?.classList.add("hidden");
}

function renderRoster() {
  const rows = state.roster.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    fit: player.schemeFit ?? "-",
    morale: player.morale,
    slot: player.rosterSlot,
    designations: Object.entries(player.designations || {})
      .filter(([, value]) => value === true)
      .map(([name]) => name)
      .join(","),
    injury: player.injury ? `${player.injury.type} (${player.injury.weeksRemaining})` : "",
    suspension: player.suspensionWeeks || 0,
    capHit: fmtMoney(player.contract?.capHit || 0),
    action: ""
  }));

  renderTable("rosterTable", rows);

  const table = document.getElementById("rosterTable");
  const tr = table.querySelectorAll("tr");
  for (let i = 1; i < tr.length; i += 1) {
    const player = rows[i - 1];
    const actions = [
      `<button data-act="release" data-id="${escapeHtml(player.id)}" class="warn">Release</button>`
    ];
    if (player.slot === "active") actions.push(`<button data-act="ps" data-id="${escapeHtml(player.id)}">To PS</button>`);
    if (player.slot === "practice") actions.push(`<button data-act="active" data-id="${escapeHtml(player.id)}">To Active</button>`);
    tr[i].lastElementChild.innerHTML = actions.join(" ");
  }
  decoratePlayerColumnFromRows("rosterTable", rows, { idKeys: ["id"] });
}

function renderFreeAgency() {
  const rows = state.freeAgents.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    fit: player.schemeFit ?? "-",
    dev: player.devTrait,
    source: player.source,
    action: ""
  }));
  renderTable("faTable", rows);

  const table = document.getElementById("faTable");
  const tr = table.querySelectorAll("tr");
  for (let i = 1; i < tr.length; i += 1) {
    const row = rows[i - 1];
    tr[i].lastElementChild.innerHTML =
      row.source === "waiver"
        ? `<button data-act="claim" data-id="${escapeHtml(row.id)}">Claim</button>`
        : `<button data-act="sign" data-id="${escapeHtml(row.id)}">Sign</button> <button data-act="offer" data-id="${escapeHtml(row.id)}">Offer</button>`;
  }

  const waiverRows = (state.dashboard?.waiverWire || []).map((entry) => ({
    playerId: entry.playerId,
    releasedBy: entry.releasedBy,
    week: entry.week,
    expires: entry.expiresWeek
  }));
  renderTable("waiverTable", waiverRows);
  decoratePlayerColumnFromRows("faTable", rows, { idKeys: ["id"] });
}

function renderExpiringContracts() {
  const expiring = state.contractTools?.expiring || [];
  const tagEligible = state.contractTools?.tagEligible || [];
  const optionEligible = state.contractTools?.optionEligible || [];

  const expiringRows = expiring.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    ovr: player.overall,
    yearsLeft: player.contract?.yearsRemaining,
    capHit: fmtMoney(player.contract?.capHit || 0),
    action: ""
  }));
  renderTable("expiringTable", expiringRows);
  document.getElementById("expiringTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = expiringRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-contract-select="${escapeHtml(row.id)}">Select</button>`;
  });

  const tagRows = tagEligible.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    ovr: player.overall,
    currCap: fmtMoney(player.contract?.capHit || 0),
    tagCap: fmtMoney(player.projectedCapHit || 0),
    delta: fmtDeltaMoney(player.capDelta || 0),
    choose: ""
  }));
  renderTable("tagEligibleTable", tagRows);

  const tagTable = document.getElementById("tagEligibleTable");
  tagTable?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = tagRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-contract-fill="tag" data-player-id="${escapeHtml(row.id)}">Select</button>`;
  });

  const optionRows = optionEligible.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    exp: player.experience,
    ovr: player.overall,
    currCap: fmtMoney(player.contract?.capHit || 0),
    optionCap: fmtMoney(player.projectedCapHit || 0),
    delta: fmtDeltaMoney(player.capDelta || 0),
    choose: ""
  }));
  renderTable("optionEligibleTable", optionRows);

  const optionTable = document.getElementById("optionEligibleTable");
  optionTable?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = optionRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-contract-fill="option" data-player-id="${escapeHtml(row.id)}">Select</button>`;
  });

  decoratePlayerColumnFromRows("expiringTable", expiringRows, { idKeys: ["id"] });
  decoratePlayerColumnFromRows("tagEligibleTable", tagRows, { idKeys: ["id"] });
  decoratePlayerColumnFromRows("optionEligibleTable", optionRows, { idKeys: ["id"] });
  updateContractPreview();
}

function lookupContractCandidate(kind, playerId = state.selectedContractPlayerId) {
  if (!playerId) return null;
  if (kind === "tag") return (state.contractTools?.tagEligible || []).find((row) => row.id === playerId) || null;
  if (kind === "option") return (state.contractTools?.optionEligible || []).find((row) => row.id === playerId) || null;
  return null;
}

function getSelectedContractPlayer() {
  return state.contractRoster.find((player) => player.id === state.selectedContractPlayerId) || null;
}

function setSelectedContractPlayer(playerId, { preserveInputs = false } = {}) {
  state.selectedContractPlayerId = playerId || null;
  const player = getSelectedContractPlayer();
  const label = document.getElementById("contractsSelectedPlayerText");
  if (label) {
    label.textContent = player ? `Selected: ${player.name} (${player.pos})` : "Selected: None";
  }
  if (!preserveInputs) {
    const demand = state.negotiationTargets.find((entry) => entry.id === playerId)?.demand || null;
    const yearsInput = document.getElementById("contractYearsInput");
    const salaryInput = document.getElementById("contractSalaryInput");
    if (yearsInput) yearsInput.value = String(demand?.years || player?.contract?.yearsRemaining || 3);
    if (salaryInput) salaryInput.value = demand?.salary || "";
  }
  updateContractPreview();
}

function updateContractPreview() {
  const preview = document.getElementById("contractPreviewText");
  const player = getSelectedContractPlayer();
  const tag = lookupContractCandidate("tag");
  const option = lookupContractCandidate("option");
  const tagBtn = document.getElementById("franchiseTagBtn");
  const optionBtn = document.getElementById("fifthOptionBtn");
  const resignBtn = document.getElementById("contractsResignBtn");
  const negotiateBtn = document.getElementById("contractsNegotiateBtn");
  const restructureBtn = document.getElementById("contractsRestructureBtn");
  const tradeBtn = document.getElementById("contractsTradeBtn");
  const blockBtn = document.getElementById("contractsTradeBlockBtn");
  const capSpace = state.contractCap?.capSpace || 0;

  if (tagBtn) tagBtn.disabled = !tag;
  if (optionBtn) optionBtn.disabled = !option;
  if (resignBtn) resignBtn.disabled = !player;
  if (negotiateBtn) negotiateBtn.disabled = !player;
  if (restructureBtn) restructureBtn.disabled = !player;
  if (tradeBtn) tradeBtn.disabled = !player;
  if (blockBtn) blockBtn.disabled = !player;

  if (!preview) return;
  if (!player) {
    preview.textContent = "Select a player row to stage a contract action or queue a trade package.";
    return;
  }

  const demand = state.negotiationTargets.find((entry) => entry.id === player.id)?.demand || null;

  if (tag) {
    const resultingCap = capSpace + (tag.contract?.capHit || 0) - (tag.projectedCapHit || 0);
    preview.textContent =
      `Tag Preview: ${tag.name} (${tag.pos}) ${fmtMoney(tag.contract?.capHit || 0)} -> ${fmtMoney(tag.projectedCapHit || 0)} (${fmtDeltaMoney(tag.capDelta || 0)}). Remaining cap: ${fmtMoney(resultingCap)}.`;
    return;
  }

  if (option) {
    const resultingCap = capSpace + (option.contract?.capHit || 0) - (option.projectedCapHit || 0);
    preview.textContent =
      `Option Preview: ${option.name} (${option.pos}) ${fmtMoney(option.contract?.capHit || 0)} -> ${fmtMoney(option.projectedCapHit || 0)} (${fmtDeltaMoney(option.capDelta || 0)}). Remaining cap: ${fmtMoney(resultingCap)}.`;
    return;
  }

  preview.textContent =
    `${player.name} | Salary ${fmtMoney(player.contract?.salary || 0)} | Cap ${fmtMoney(player.contract?.capHit || 0)} | Years ${player.contract?.yearsRemaining || 0}` +
    (demand ? ` | Ask ${demand.years}y / ${fmtMoney(demand.salary || 0)}` : "");
}

function renderContractsPage() {
  const roster = state.contractRoster || [];
  const totalSalary = roster.reduce((sum, player) => sum + Number(player.contract?.salary || 0), 0);
  const totalYears = roster.reduce((sum, player) => sum + Number(player.contract?.yearsRemaining || 0), 0);
  document.getElementById("contractsCapSpaceCard").textContent = fmtMoney(state.contractCap?.capSpace || 0);
  document.getElementById("contractsActiveCapCard").textContent = fmtMoney(state.contractCap?.activeCap || 0);
  document.getElementById("contractsDeadCapCard").textContent = fmtMoney(state.contractCap?.deadCapCurrentYear || 0);
  document.getElementById("contractsAvgSalaryCard").textContent = roster.length ? fmtMoney(totalSalary / roster.length) : "$0";
  document.getElementById("contractsAvgYearsCard").textContent = roster.length ? (totalYears / roster.length).toFixed(1) : "0.0";
  document.getElementById("contractsTradeBlockCard").textContent = `${roster.filter((player) => state.tradeBlockIds.includes(player.id)).length}`;

  const demandById = new Map((state.negotiationTargets || []).map((entry) => [entry.id, entry.demand || null]));
  const rows = roster.map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    morale: player.morale,
    motivation: player.motivation ?? "-",
    salary: fmtMoney(player.contract?.salary || 0),
    capHit: fmtMoney(player.contract?.capHit || 0),
    guaranteed: fmtMoney(player.contract?.guaranteed || 0),
    years: player.contract?.yearsRemaining || 0,
    ask: demandById.get(player.id) ? fmtMoney(demandById.get(player.id).salary || 0) : "-",
    block: state.tradeBlockIds.includes(player.id) ? "Yes" : "",
    action: ""
  }));
  renderTable("contractsRosterTable", rows);
  decoratePlayerColumnFromRows("contractsRosterTable", rows, { idKeys: ["id"] });
  document.getElementById("contractsRosterTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isBlocked = state.tradeBlockIds.includes(row.id);
    cell.innerHTML = [
      `<button data-contract-select="${escapeHtml(row.id)}">Select</button>`,
      `<button data-contract-action="trade" data-player-id="${escapeHtml(row.id)}">Trade</button>`,
      `<button data-contract-action="block" data-player-id="${escapeHtml(row.id)}">${isBlocked ? "Unblock" : "Block"}</button>`
    ].join(" ");
  });

  const tradeBlockRows = roster
    .filter((player) => state.tradeBlockIds.includes(player.id))
    .map((player) => ({
      id: player.id,
      player: player.name,
      pos: player.pos,
      ovr: player.overall,
      capHit: fmtMoney(player.contract?.capHit || 0),
      years: player.contract?.yearsRemaining || 0,
      action: ""
    }));
  renderTable("tradeBlockTable", tradeBlockRows);
  decoratePlayerColumnFromRows("tradeBlockTable", tradeBlockRows, { idKeys: ["id"] });
  document.getElementById("tradeBlockTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = tradeBlockRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-contract-action="trade" data-player-id="${escapeHtml(row.id)}">Trade</button> <button data-contract-action="block" data-player-id="${escapeHtml(row.id)}">Unblock</button>`;
  });

  updateContractPreview();
}

function setContractActionText(text) {
  const el = document.getElementById("contractActionText");
  if (el) el.textContent = text;
}

function toggleTradeBlockPlayer(playerId) {
  const next = state.tradeBlockIds.includes(playerId)
    ? state.tradeBlockIds.filter((id) => id !== playerId)
    : [...state.tradeBlockIds, playerId];
  saveTradeBlockIds(next);
  renderContractsPage();
}

function queueTradePlayer(playerId) {
  const teamId = state.contractTeamId || state.dashboard?.controlledTeamId || "BUF";
  document.getElementById("tradeTeamA").value = teamId;
  document.getElementById("tradeAIds").value = playerId;
  activateTab("transactionsTab");
  const player = state.contractRoster.find((entry) => entry.id === playerId);
  setTradeEvalText(`${player?.name || playerId} queued for Team A. Add players or picks, then evaluate or execute.`);
}

function deriveContractToolsFromRoster(roster, expiringPlayers) {
  const expiringMap = new Map((expiringPlayers || []).map((player) => [player.id, player]));
  const expiring = roster
    .filter((player) => expiringMap.has(player.id) || (player.contract?.yearsRemaining || 0) <= 1)
    .map((player) => ({
      id: player.id,
      name: player.name,
      pos: player.pos,
      overall: player.overall,
      contract: player.contract || {}
    }));

  const tagEligible = roster
    .filter((player) => (player.contract?.yearsRemaining || 0) <= 1)
    .map((player) => {
      const capHit = Number(player.contract?.capHit || 0);
      const salary = Number(player.contract?.salary || capHit);
      const projectedCapHit = Math.max(salary * 1.2, capHit * 1.35, 18_000_000);
      return {
        id: player.id,
        name: player.name,
        pos: player.pos,
        overall: player.overall,
        contract: player.contract || {},
        projectedCapHit,
        capDelta: projectedCapHit - capHit
      };
    })
    .sort((a, b) => b.overall - a.overall || a.capDelta - b.capDelta);

  const optionEligible = roster
    .filter((player) => {
      const exp = Number(player.experience || 0);
      return exp >= 3 && exp <= 5 && (player.contract?.yearsRemaining || 0) <= 2 && player.contract?.optionYear !== true;
    })
    .map((player) => {
      const capHit = Number(player.contract?.capHit || 0);
      const salary = Number(player.contract?.salary || capHit);
      const projectedCapHit = Math.max(salary * 1.15, capHit * 1.2, 7_500_000);
      return {
        id: player.id,
        name: player.name,
        pos: player.pos,
        overall: player.overall,
        experience: player.experience || 0,
        contract: player.contract || {},
        projectedCapHit,
        capDelta: projectedCapHit - capHit
      };
    })
    .sort((a, b) => b.overall - a.overall || a.capDelta - b.capDelta);

  return { expiring, tagEligible, optionEligible };
}

function depthManualShareMap(position) {
  return state.depthManualShares?.[position] || {};
}

function depthDefaultShares(position) {
  return state.depthDefaultShares?.[position] || [];
}

function formatDepthSharePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${Math.round(numeric * 100)}%`;
}

function updateDepthShare(position, playerId, rawValue) {
  if (!state.depthManualShares[position]) state.depthManualShares[position] = {};
  const defaultShare = depthDefaultShares(position)[state.depthOrder.indexOf(playerId)] ?? 0.02;
  if (rawValue == null || rawValue === "") {
    delete state.depthManualShares[position][playerId];
    return;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return;
  const normalized = Math.max(0, Math.min(100, parsed)) / 100;
  if (Math.abs(normalized - defaultShare) < 0.001) {
    delete state.depthManualShares[position][playerId];
    return;
  }
  state.depthManualShares[position][playerId] = Number(normalized.toFixed(3));
}

function renderDepthChart() {
  const position = document.getElementById("depthPositionSelect")?.value;
  const ids = state.depthOrder?.length ? state.depthOrder : state.depthChart?.[position] || [];
  const shareRows = state.depthSnapShare?.[position] || [];
  const rosterById = new Map(state.depthRoster.map((player) => [player.id, player]));
  const defaults = depthDefaultShares(position);
  const manualShares = depthManualShareMap(position);
  const table = document.getElementById("depthTable");
  if (!table) return;
  if (!ids.length) {
    table.innerHTML = "<tr><td>No players loaded for this position</td></tr>";
    document.getElementById("depthStatusText").textContent = "No players loaded for this position";
    return;
  }
  table.innerHTML = `
    <tr>
      <th>Rank</th>
      <th>Role</th>
      <th>Player</th>
      <th>Pos</th>
      <th>OVR</th>
      <th>Mode</th>
      <th>Snap Share</th>
      <th>Default</th>
      <th>Move</th>
    </tr>
    ${ids
      .map((playerId, index) => {
        const player = rosterById.get(playerId);
        const defaultShare = defaults[index] ?? shareRows[index]?.defaultSnapShare ?? shareRows[index]?.snapShare ?? 0.02;
        const manualShare = manualShares[playerId];
        const effectiveShare = Number.isFinite(manualShare) ? manualShare : defaultShare;
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(shareRows[index]?.role || `${position}${index + 1}`)}</td>
            <td><button class="link-btn" data-player-id="${escapeHtml(playerId)}">${escapeHtml(player?.name || "Unknown")}</button></td>
            <td>${escapeHtml(player?.pos || position)}</td>
            <td>${escapeHtml(player?.overall ?? "")}</td>
            <td>${Number.isFinite(manualShare) ? "Manual" : "Auto"}</td>
            <td>
              <div class="depth-share-cell">
                <input
                  class="depth-share-input"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value="${escapeHtml(Math.round(effectiveShare * 100))}"
                  data-depth-share-input="${escapeHtml(playerId)}"
                />
                <span class="small">%</span>
                <button data-depth-share-reset="${escapeHtml(playerId)}">Auto</button>
              </div>
            </td>
            <td>${escapeHtml(formatDepthSharePercent(defaultShare))}</td>
            <td>
              <div class="depth-action-group">
                <button data-depth-move="up" data-depth-player-id="${escapeHtml(playerId)}" ${index === 0 ? "disabled" : ""}>Up</button>
                <button data-depth-move="down" data-depth-player-id="${escapeHtml(playerId)}" ${index === ids.length - 1 ? "disabled" : ""}>Down</button>
              </div>
            </td>
          </tr>`;
      })
      .join("")}
  `;
  document.getElementById("depthStatusText").textContent = ids.length
    ? `Adjusting ${position} for ${document.getElementById("depthTeamSelect")?.value || state.dashboard?.controlledTeamId || "BUF"}`
    : "No players loaded for this position";
}

function renderRetiredPool() {
  const rows = (state.retiredPool || []).map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    retiredYear: player.retiredYear,
    maxAge: player.maxAge,
    seasons: player.seasonsPlayed,
    eligible: player.canOverride ? "Yes" : "No",
    action: ""
  }));
  renderTable("retiredTable", rows);
  const table = document.getElementById("retiredTable");
  table?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    if (!row) return;
    const cell = tr.lastElementChild;
    if (!cell) return;
    cell.innerHTML = row.eligible === "Yes"
      ? `<button data-retired-override-id="${escapeHtml(row.id)}">Use</button>`
      : "";
  });
  decoratePlayerColumnFromRows("retiredTable", rows, { idKeys: ["id"] });
}

function renderRealismVerification() {
  const report = state.realismVerification;
  if (!report) {
    renderTable("realismVerifySummaryTable", []);
    renderTable("realismVerifySeasonTable", []);
    renderTable("realismVerifyCareerTable", []);
    return;
  }

  renderTable("realismVerifySummaryTable", [
    {
      years: (report.simulatedYears || []).join(", "),
      seasonOnTarget: report.statusSummary?.season?.onTarget || 0,
      seasonWatch: report.statusSummary?.season?.watch || 0,
      seasonOut: report.statusSummary?.season?.outOfRange || 0,
      careerOnTarget: report.statusSummary?.career?.onTarget || 0,
      careerWatch: report.statusSummary?.career?.watch || 0,
      careerOut: report.statusSummary?.career?.outOfRange || 0
    }
  ]);

  const flattenBlock = (block) =>
    Object.entries(block || {}).flatMap(([position, details]) =>
      Object.entries(details.metrics || {}).map(([metric, data]) => ({
        pos: position,
        metric,
        target: data.target,
        actual: data.actual,
        driftPct: `${data.driftPct}%`,
        status: data.status
      }))
    );

  renderTable("realismVerifySeasonTable", flattenBlock(report.seasonByPosition));
  renderTable("realismVerifyCareerTable", flattenBlock(report.careerByPosition));
}

function renderRulesTab() {
  const coreRows = [
    { area: "League Structure", rule: "32 teams, 17-game regular season, NFL playoff format, division/conference standings." },
    { area: "Simulation Engine", rule: "Drive/possession simulation with rating, coaching, chemistry, and scheme effects." },
    { area: "Team Identity", rule: "Every new league draws one real U.S. city plus one nickname per team for a single randomized team identity." },
    { area: "Depth Chart Usage", rule: "Each depth slot has position-specific snap-share targets; game snaps and touches are role-weighted." },
    { area: "Stats Model", rule: "PFR-inspired season/career tables, player profiles, playoffs filters, and archived controlled-team box scores." },
    { area: "Contracts & Cap", rule: "Cap hits, dead cap, restructures, tags, options, waivers, and rollover modeled in team cap ledger." },
    { area: "Career & Retirement", rule: "Position max ages (QB 45, RB 40, etc), age curve progression/decline, and override comeback logic." },
    { area: "Retirement Override", rule: "You can bring retired players back while age-eligible; winning teams can suppress retirement chance." },
    { area: "Realism Verification", rule: "Runs 10-20 year verification against season and career PFR-based position targets with drift flags." },
    { area: "Persistence", rule: "Save/load slots and rolling backups preserve full league state, history, and transaction timeline." }
  ];
  renderTable("rulesCoreTable", coreRows);

  const actionRows = [
    { tab: "Overview", feature: "Advance Week/Season", behavior: "Simulates schedule, updates standings, stats, transactions, and events. Multi-week sims can be paused." },
    { tab: "Overview", feature: "Header Box Scores", behavior: "Tracks the controlled team’s recent games with clickable scoring summary, play-by-play, team stats, and player stats." },
    { tab: "Roster & FA", feature: "Release / PS / Active", behavior: "Moves players between active/practice/waiver/free-agent pools with eligibility checks." },
    { tab: "Depth Chart", feature: "Order + Snap Share", behavior: "Reorders role priority and lets you set manual snap-share targets per player; saved values feed the live game rotation." },
    { tab: "Transactions", feature: "Trade + Evaluate", behavior: "Validates package fairness/cap before executing asset swaps." },
    { tab: "Contracts", feature: "Extensions + Negotiation", behavior: "Shows cap context, expiring deals, negotiation targets, restructures, tag/option tools, quick trade, and trade block actions." },
    { tab: "Transactions", feature: "Retirement Overrides", behavior: "Loads retired pool and applies comeback override with team + win threshold." },
    { tab: "Draft", feature: "Scouting + Draft", behavior: "Allocates scouting points, locks board, runs user/CPU picks, and tracks selections." },
    { tab: "Statistics", feature: "Player/Team Filters", behavior: "PFR-style filtered tables by scope, year, team, position, and category." },
    { tab: "Calendar", feature: "Year/Week Browser", behavior: "Displays regular season schedule + playoff bracket snapshots." },
    { tab: "League Log", feature: "Transaction Filters", behavior: "Filters transaction events by team, type, year, and limit." },
    { tab: "History", feature: "Records + Timelines", behavior: "Shows records, awards, champions, player timelines, and team history." },
    { tab: "Settings", feature: "Realism Verify", behavior: "Runs multi-year season/career drift check against target profiles." },
    { tab: "Settings", feature: "League Settings", behavior: "Controls injuries, offseason automation, comp picks, chemistry, and retirement retention." },
    { tab: "Footer", feature: "Game Guide Button", behavior: "Opens the guide in a modal submenu instead of keeping the full help text permanently visible." }
  ];
  renderTable("rulesActionsTable", actionRows);
  renderGuideContent();
}

function renderDraft() {
  const draft = state.draftState;
  if (!draft) {
    state.selectedDraftProspectId = null;
    document.getElementById("draftStatusText").textContent = "No active draft";
    document.getElementById("draftStageText").textContent = "-";
    document.getElementById("draftOnClockText").textContent = "-";
    document.getElementById("draftUserWindowText").textContent = "-";
    document.getElementById("draftSelectedText").textContent = "Selected Prospect: None";
    renderTable("draftTable", []);
    renderTable("draftAvailableTable", []);
    return;
  }

  const currentTeam = draft.order?.[(draft.currentPick - 1) % 32] || "-";
  const isUserPick = currentTeam === state.dashboard?.controlledTeamId;
  const availableProspects = (draft.available || []).slice(0, 60);
  if (state.selectedDraftProspectId && !availableProspects.some((prospect) => prospect.id === state.selectedDraftProspectId)) {
    state.selectedDraftProspectId = null;
  }
  document.getElementById("draftStatusText").textContent = draft.completed
    ? "Draft Complete"
    : `Pick ${draft.currentPick} / ${draft.totalPicks}`;
  document.getElementById("draftStageText").textContent = draft.completed ? "Completed" : "Draft In Progress";
  document.getElementById("draftOnClockText").textContent = currentTeam;
  document.getElementById("draftUserWindowText").textContent = isUserPick ? "User On Clock" : "CPU On Clock";

  const latestSelections = (draft.selections || []).slice(-50).reverse();
  const rows = latestSelections.length
    ? latestSelections.map((selection) => ({
        pick: selection.pick,
        round: selection.round,
        team: selection.teamId,
        player: selection.player,
        pos: selection.pos
      }))
    : (draft.mockDraft || []).map((selection) => ({
        pick: selection.pick,
        round: Math.floor((selection.pick - 1) / 32) + 1,
        team: selection.teamId,
        player: selection.player,
        pos: selection.pos
      }));

  renderTable("draftTable", rows);

  const availableRows = availableProspects.map((prospect, index) => ({
    id: prospect.id,
    rank: prospect.scouting?.rank || index + 1,
    player: prospect.name,
    pos: prospect.position,
    age: prospect.age,
    height: formatHeight(prospect.heightInches),
    weight: prospect.weightLbs || "-",
    ovr: prospect.overall,
    projRnd: prospect.scouting?.projectedRound || "-",
    board: state.scoutingBoardDraft.indexOf(prospect.id) >= 0 ? state.scoutingBoardDraft.indexOf(prospect.id) + 1 : "-",
    action: isUserPick && !draft.completed ? "Select / Draft" : ""
  }));
  renderTable("draftAvailableTable", availableRows);
  decoratePlayerColumnFromRows("draftAvailableTable", availableRows, { idKeys: ["id"] });
  const selectedProspect = availableProspects.find((prospect) => prospect.id === state.selectedDraftProspectId) || null;
  document.getElementById("draftSelectedText").textContent = selectedProspect
    ? `Selected Prospect: ${selectedProspect.name} (${selectedProspect.position})`
    : "Selected Prospect: None";
  document.getElementById("draftAvailableTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const prospect = availableRows[index - 1];
    const cell = tr.lastElementChild;
    if (!prospect || !cell) return;
    cell.innerHTML = isUserPick && !draft.completed
      ? `<button data-draft-select-id="${escapeHtml(prospect.id)}">Select</button> <button data-draft-player-id="${escapeHtml(prospect.id)}">Draft</button>`
      : "";
  });
}

function renderScouting() {
  const scouting = state.scouting;
  if (!scouting) {
    state.scoutingBoardDraft = [];
    document.getElementById("scoutingPointsText").textContent = "Points: 0";
    document.getElementById("scoutingLockText").textContent = "Board: Unlocked";
    document.getElementById("scoutingBoardText").textContent = "Board: 0 / 20";
    renderTable("scoutingTable", []);
    renderTable("scoutingReportTable", []);
    return;
  }

  const availableSet = new Set((scouting.prospects || []).map((prospect) => prospect.playerId));
  state.scoutingBoardDraft = (scouting.locked ? scouting.board || [] : state.scoutingBoardDraft || [])
    .filter((playerId) => availableSet.has(playerId))
    .slice(0, 20);
  if (!scouting.locked && !state.scoutingBoardDraft.length && Array.isArray(scouting.board) && scouting.board.length) {
    state.scoutingBoardDraft = scouting.board.filter((playerId) => availableSet.has(playerId)).slice(0, 20);
  }

  document.getElementById("scoutingPointsText").textContent = `Points: ${scouting.points || 0}`;
  document.getElementById("scoutingLockText").textContent = scouting.locked ? "Board: Locked" : "Board: Unlocked";
  document.getElementById("scoutingBoardText").textContent = `Board: ${state.scoutingBoardDraft.length} / 20`;
  const rows = (scouting.prospects || []).slice(0, 140).map((prospect) => ({
    id: prospect.playerId,
    playerId: prospect.playerId,
    player: prospect.player,
    pos: prospect.pos,
    age: prospect.age,
    rank: prospect.rank,
    projRnd: prospect.projectedRound,
    forty: prospect.combine40,
    scoutOvr: prospect.scoutedOverall ?? "-",
    baseline: prospect.baselineScout ?? "-",
    confidence: `${prospect.confidence ?? 0}%`,
    board: state.scoutingBoardDraft.indexOf(prospect.playerId) >= 0 ? state.scoutingBoardDraft.indexOf(prospect.playerId) + 1 : "-",
    action: scouting.locked ? "Locked" : "Scout / Board"
  }));
  renderTable("scoutingTable", rows);
  decoratePlayerColumnFromRows("scoutingTable", rows, { idKeys: ["playerId"] });
  document.getElementById("scoutingTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const prospect = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!prospect || !cell) return;
    const onBoard = state.scoutingBoardDraft.includes(prospect.playerId);
    if (scouting.locked) {
      cell.textContent = "Locked";
      return;
    }
    const boardButtons = onBoard
      ? [
          `<button data-board-move="up" data-player-id="${escapeHtml(prospect.playerId)}">Up</button>`,
          `<button data-board-move="down" data-player-id="${escapeHtml(prospect.playerId)}">Down</button>`,
          `<button data-board-toggle="remove" data-player-id="${escapeHtml(prospect.playerId)}">Remove</button>`
        ]
      : [`<button data-board-toggle="add" data-player-id="${escapeHtml(prospect.playerId)}">Add To Board</button>`];
    cell.innerHTML = [
      `<button data-scout-player-id="${escapeHtml(prospect.playerId)}">Scout</button>`,
      ...boardButtons
    ].join(" ");
  });

  const reportRows = (scouting.weeklyReports || [])
    .slice(0, 20)
    .flatMap((report) =>
      (report.evaluations || []).map((evaluation) => ({
        year: report.year,
        week: report.week,
        playerId: evaluation.playerId,
        player: evaluation.player,
        pos: evaluation.pos,
        revealed: evaluation.revealed,
        delta: evaluation.delta,
        confidence: `${evaluation.confidence ?? 0}%`,
        points: evaluation.pointsSpent
      }))
    )
    .slice(0, 120);
  renderTable("scoutingReportTable", reportRows);
  decoratePlayerColumnFromRows("scoutingReportTable", reportRows, { idKeys: ["playerId"] });
}

function moveIdWithinList(list, playerId, delta) {
  const index = list.indexOf(playerId);
  if (index < 0) return list;
  const nextIndex = Math.max(0, Math.min(list.length - 1, index + delta));
  if (nextIndex === index) return list;
  const next = [...list];
  const [row] = next.splice(index, 1);
  next.splice(nextIndex, 0, row);
  return next;
}

function renderRecordsAndHistory() {
  const box = document.getElementById("recordsBox");
  const records = state.dashboard?.records;

  if (!records) {
    box.innerHTML = "<div class='record'>No record data</div>";
  } else {
    const leaders = [
      ["Career Pass Yards", "passingYards"],
      ["Career Rush Yards", "rushingYards"],
      ["Career Rec Yards", "receivingYards"],
      ["Career Sacks", "sacks"],
      ["Career INT", "interceptions"],
      ["Career FG Made", "fieldGoalsMade"]
    ];

    box.innerHTML = leaders
      .map(([title, key]) => {
        const row = records[key]?.[0];
        if (!row) return `<div class="record"><strong>${escapeHtml(title)}</strong><div>None</div></div>`;
        return (
          `<div class="record"><strong>${escapeHtml(title)}</strong>` +
          `<div>${escapeHtml(row.player)} (${escapeHtml(row.pos)}) - ${escapeHtml(row.value)}</div>` +
          `<div class="small">${escapeHtml(row.status || "")}</div></div>`
        );
      })
      .join("");
  }

  renderTable(
    "awardsTable",
    (state.dashboard?.awards || []).slice().reverse().map((award) => ({
      year: award.year,
      MVP: award.MVP?.player || "",
      OPOY: award.OPOY?.player || "",
      DPOY: award.DPOY?.player || "",
      OROY: award.OROY?.player || "",
      DROY: award.DROY?.player || ""
    }))
  );

  renderTable(
    "championsTable",
    (state.dashboard?.champions || []).slice().reverse().map((champion) => ({
      year: champion.year,
      champion: champion.championTeamId,
      runnerUp: champion.runnerUpTeamId,
      score: champion.score
    }))
  );
}

function renderCalendar() {
  const calendar = state.calendar;
  if (!calendar) {
    renderTable("calendarWeeksTable", []);
    renderTable("calendarGamesTable", []);
    renderTable("afcBracketTable", []);
    renderTable("nfcBracketTable", []);
    renderTable("sbBracketTable", []);
    return;
  }

  const yearOptions = (calendar.availableYears || [calendar.year]).map((year) => ({
    value: String(year),
    label: String(year)
  }));
  setSelectOptions("calendarYearFilter", yearOptions, String(calendar.year));

  const weekOptions = (calendar.weeks || []).map((week) => ({ value: String(week.week), label: `Week ${week.week}` }));
  setSelectOptions("calendarWeekFilter", weekOptions, String(state.calendarWeek || calendar.currentWeek || 1));

  const weekRows = (calendar.weeks || []).map((week) => ({
    week: week.week,
    games: week.games?.length || 0,
    completed: week.games?.filter((game) => game.played).length || 0,
    points: week.games?.reduce((sum, game) => sum + (game.homeScore || 0) + (game.awayScore || 0), 0) || 0
  }));
  renderTable("calendarWeeksTable", weekRows);

  const selectedWeek = Number(state.calendarWeek || calendar.currentWeek || 1);
  const selected = (calendar.weeks || []).find((week) => week.week === selectedWeek) || calendar.weeks?.[0];
  if (selected) state.calendarWeek = selected.week;
  const gameRows = (selected?.games || []).map((game) => ({
    away: game.awayTeamId,
    home: game.homeTeamId,
    score: game.played ? `${game.awayScore}-${game.homeScore}` : "-",
    winner: game.played ? (game.isTie ? "TIE" : game.winnerId || "") : "TBD"
  }));
  renderTable("calendarGamesTable", gameRows);

  const toBracketRows = (conf, bracket) =>
    ["wildcard", "divisional", "conference"].flatMap((round) =>
      (bracket?.[round] || []).map((game) => ({
        conf,
        round,
        away: game.awayTeamId,
        home: game.homeTeamId,
        score: `${game.awayScore}-${game.homeScore}`,
        winner: game.winnerId
      }))
    );
  renderTable("afcBracketTable", toBracketRows("AFC", calendar.postseason?.AFC));
  renderTable("nfcBracketTable", toBracketRows("NFC", calendar.postseason?.NFC));
  const sb = calendar.superBowl || calendar.postseason?.superBowl;
  renderTable(
    "sbBracketTable",
    sb
      ? [
          {
            away: sb.awayTeamId,
            home: sb.homeTeamId,
            score: `${sb.awayScore}-${sb.homeScore}`,
            winner: sb.championTeamId || sb.winnerId
          }
        ]
      : []
  );
}

function renderTransactionLog() {
  const rows = state.txRows.map((entry) => ({
    seq: entry.seq,
    year: entry.year,
    week: entry.week,
    phase: entry.phase,
    type: entry.type,
    team: entry.teamId || `${entry.teamA || ""}${entry.teamB ? `/${entry.teamB}` : ""}`,
    player: entry.playerName || entry.playerId || "",
    details: formatTransactionDetails(entry)
  }));
  renderTable("txTable", rows);
}

function renderNews() {
  const rows = (state.newsRows || []).map((entry) => ({
    year: entry.year,
    week: entry.week,
    phase: entry.phase,
    headline: entry.headline
  }));
  renderTable("newsTable", rows);
}

function renderPickAssets() {
  const rows = (state.picks || []).map((pick) => ({
    id: pick.id,
    yr: pick.year,
    rnd: pick.round,
    orig: pick.originalTeamId,
    owner: pick.ownerTeamId,
    value: pick.value
  }));
  renderTable("pickAssetsTable", rows);
}

function renderNegotiationTargets(rows) {
  state.negotiationTargets = rows || [];
  const tableRows = (rows || []).map((entry) => ({
    id: entry.id,
    player: entry.name,
    pos: entry.pos,
    ovr: entry.overall,
    askYears: entry.demand?.years || "-",
    askSalary: fmtMoney(entry.demand?.salary || 0),
    askCap: fmtMoney(entry.demand?.askCapHit || 0),
    use: ""
  }));
  renderTable("negotiationTable", tableRows);
  const table = document.getElementById("negotiationTable");
  table?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = tableRows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-negotiate-id="${escapeHtml(row.id)}">Select</button>`;
  });
  decoratePlayerColumnFromRows("negotiationTable", tableRows, { idKeys: ["id"] });
  renderContractsPage();
}

function renderAnalytics() {
  const analytics = state.analytics;
  if (!analytics) {
    renderTable("analyticsSummaryTable", []);
    renderTable("analyticsPlaymakersTable", []);
    return;
  }
  renderTable("analyticsSummaryTable", [
    {
      year: analytics.year,
      team: analytics.teamId || "ALL",
      ppg: analytics.teamAverages?.pointsPerGame || 0,
      ppgAllowed: analytics.teamAverages?.pointsAllowedPerGame || 0,
      sackRate: analytics.efficiency?.sackRate || 0,
      intRate: analytics.efficiency?.interceptionRate || 0,
      rushYpa: analytics.efficiency?.rushYardsPerAttempt || 0,
      avgTicket: analytics.ownerEconomy?.avgTicketPrice || 0,
      fanInterest: analytics.ownerEconomy?.avgFanInterest || 0
    }
  ]);
  const playmakers = (analytics.defensivePlaymakers || []).map((row) => ({
    playerId: row.playerId,
    player: row.player,
    tm: row.tm,
    pos: row.pos,
    sacks: row.sacks || 0,
    int: row.int || 0,
    tkl: row.tkl || 0
  }));
  renderTable("analyticsPlaymakersTable", playmakers);
  decoratePlayerColumnFromRows("analyticsPlaymakersTable", playmakers, { idKeys: ["playerId"] });
  renderAnalyticsChart();
}

function renderStaff() {
  const s = state.staffState;
  if (!s?.staff) {
    renderTable("staffTable", []);
    return;
  }
  const rows = Object.entries(s.staff).map(([role, staff]) => ({
    role,
    name: staff.name,
    playcalling: staff.playcalling,
    development: staff.development,
    discipline: staff.discipline,
    years: staff.yearsRemaining
  }));
  renderTable("staffTable", rows);
}

function renderRosterBoard() {
  const rows = (state.roster || []).map((player, index) => ({
    order: index + 1,
    id: player.id,
    player: player.name,
    pos: player.pos,
    ovr: player.overall,
    fit: player.schemeFit ?? "-",
    morale: player.morale,
    action: ""
  }));
  renderTable("rosterBoardTable", rows);
  decoratePlayerColumnFromRows("rosterBoardTable", rows, { idKeys: ["id"] });
  document.getElementById("rosterBoardTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-roster-board-move="up" data-player-id="${escapeHtml(row.id)}">Up</button> <button data-roster-board-move="down" data-player-id="${escapeHtml(row.id)}">Down</button>`;
  });
}

function renderOwner() {
  const owner = state.ownerState?.owner;
  if (!owner) {
    renderTable("ownerTable", []);
    return;
  }
  renderTable("ownerTable", [
    {
      market: owner.marketSize,
      fanInterest: owner.fanInterest,
      ticketPrice: owner.ticketPrice,
      staffBudget: fmtMoney(owner.staffBudget),
      cash: fmtMoney(owner.cash),
      revenueYtd: fmtMoney(owner.finances?.revenueYtd || 0),
      expensesYtd: fmtMoney(owner.finances?.expensesYtd || 0),
      training: owner.facilities?.training,
      rehab: owner.facilities?.rehab,
      analytics: owner.facilities?.analytics
    }
  ]);
}

function renderObservability() {
  const obs = state.observability;
  if (!obs) {
    renderTable("observabilityTable", []);
    return;
  }
  const rows = [
    { metric: "serverRequests", value: obs.server?.requests ?? 0 },
    { metric: "apiRequests", value: obs.server?.apiRequests ?? 0 },
    { metric: "uptimeSeconds", value: obs.server?.uptimeSeconds ?? 0 },
    { metric: "runtimeCounters", value: Object.keys(obs.runtime?.counters || {}).length }
  ];
  renderTable("observabilityTable", rows);
}

function renderPersistence() {
  const p = state.persistence;
  if (!p) {
    renderTable("persistenceTable", []);
    return;
  }
  renderTable("persistenceTable", [
    {
      kind: p.kind,
      available: p.available,
      notes: p.notes
    }
  ]);
}

function renderPipeline() {
  const pipeline = state.pipeline || state.dashboard?.offseasonPipeline;
  if (!pipeline) {
    renderTable("pipelineTable", []);
    return;
  }
  const rows = (pipeline.history || []).slice().reverse().slice(0, 12).map((entry) => ({
    stage: entry.stage,
    year: entry.year,
    week: entry.week,
    message: entry.result?.message || "-"
  }));
  if (!rows.length) {
    rows.push({
      stage: pipeline.stage,
      year: pipeline.year,
      week: state.dashboard?.currentWeek || 0,
      message: pipeline.completed ? "Completed" : "Waiting"
    });
  }
  renderTable("pipelineTable", rows);
}

function renderCalibrationJobs() {
  renderTable(
    "calibrationJobsTable",
    (state.calibrationJobs || []).map((job) => ({
      id: job.id,
      year: job.year,
      era: job.eraProfile,
      samples: job.samples,
      label: job.label,
      created: new Date(job.createdAt).toLocaleString()
    }))
  );
}

function renderSimJobs() {
  renderTable(
    "simJobsTable",
    (state.simJobs || []).map((job) => ({
      id: job.id,
      status: job.status,
      completed: `${job.completedSeasons}/${job.totalSeasons}`,
      progress: `${job.progress}%`,
      updated: new Date(job.updatedAt).toLocaleTimeString()
    }))
  );
}

function renderComparePlayers() {
  renderTable(
    "comparePlayersTable",
    (state.comparePlayers || []).map((player) => ({
      id: player.id,
      name: player.name,
      tm: player.teamId,
      pos: player.position,
      ovr: player.overall,
      fit: player.schemeFit ?? "-",
      age: player.age,
      dev: player.developmentTrait
    }))
  );
}

function renderCommandPalette() {
  const commands = [
    { id: "overview", label: "Open Overview", run: () => activateTab("overviewTab") },
    { id: "roster", label: "Open Roster", run: () => activateTab("rosterTab") },
    { id: "transactions", label: "Open Transactions", run: () => activateTab("transactionsTab") },
    { id: "stats", label: "Open Stats", run: () => activateTab("statsTab") },
    { id: "rules", label: "Open Rules", run: () => activateTab("rulesTab") },
    { id: "guide", label: "Open Game Guide", run: () => openGuideModal() },
    { id: "settings", label: "Open Settings", run: () => activateTab("settingsTab") },
    { id: "advance-week", label: "Advance Week", run: () => document.getElementById("advanceWeekBtn").click() },
    { id: "refresh", label: "Refresh All", run: () => document.getElementById("refreshBtn").click() }
  ];
  const needle = (state.commandFilter || "").trim().toLowerCase();
  const rows = commands
    .filter((cmd) => (!needle ? true : cmd.label.toLowerCase().includes(needle) || cmd.id.includes(needle)))
    .map((cmd) => ({ id: cmd.id, command: cmd.label, run: "Run" }));
  renderTable("commandTable", rows);
  const table = document.getElementById("commandTable");
  table?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    cell.innerHTML = `<button data-command-id="${escapeHtml(row.id)}">Run</button>`;
  });
}

function renderAnalyticsChart() {
  const canvas = document.getElementById("analyticsChart");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const data = state.analytics;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const metrics = [
    { label: "PPG", value: Number(data?.teamAverages?.pointsPerGame || 0), max: 40 },
    { label: "PA/G", value: Number(data?.teamAverages?.pointsAllowedPerGame || 0), max: 40 },
    { label: "Sack%", value: Number(data?.efficiency?.sackRate || 0) * 100, max: 12 },
    { label: "INT%", value: Number(data?.efficiency?.interceptionRate || 0) * 100, max: 6 },
    { label: "Rush YPA", value: Number(data?.efficiency?.rushYardsPerAttempt || 0), max: 8 }
  ];
  const width = canvas.width || canvas.clientWidth || 420;
  const height = canvas.height || 160;
  const barW = Math.max(24, Math.floor(width / (metrics.length * 1.8)));
  metrics.forEach((metric, index) => {
    const x = 24 + index * (barW + 20);
    const barHeight = Math.round((Math.min(metric.value, metric.max) / metric.max) * (height - 42));
    const y = height - barHeight - 20;
    ctx.fillStyle = "#49b3a1";
    ctx.fillRect(x, y, barW, barHeight);
    ctx.fillStyle = "#d8e6e2";
    ctx.font = "11px Bahnschrift";
    ctx.fillText(metric.label, x, height - 4);
  });
}

function applySettingsControls() {
  const settings = state.leagueSettings || state.dashboard?.settings;
  if (!settings) return;
  const allowInjuries = document.getElementById("settingAllowInjuries");
  const autoOffseason = document.getElementById("settingAutoOffseason");
  const ownerMode = document.getElementById("settingEnableOwnerMode");
  const narratives = document.getElementById("settingEnableNarratives");
  const compPicks = document.getElementById("settingEnableCompPicks");
  const chemistry = document.getElementById("settingEnableChemistry");
  const retirementRetention = document.getElementById("settingRetirementWinningRetention");
  const era = document.getElementById("settingEraProfile");
  if (allowInjuries) allowInjuries.checked = settings.allowInjuries !== false;
  if (autoOffseason) autoOffseason.checked = settings.autoProgressOffseason === true;
  if (ownerMode) ownerMode.checked = settings.enableOwnerMode !== false;
  if (narratives) narratives.checked = settings.enableNarratives !== false;
  if (compPicks) compPicks.checked = settings.enableCompPicks !== false;
  if (chemistry) chemistry.checked = settings.enableChemistry !== false;
  if (retirementRetention) retirementRetention.checked = settings.retirementWinningRetention !== false;
  if (era) era.value = settings.eraProfile || "modern";
  document.getElementById("settingInjuryRate").value = settings.injuryRateMultiplier ?? 1;
  document.getElementById("settingCapGrowth").value = settings.capGrowthRate ?? 0.045;
  document.getElementById("settingTradeAggression").value = settings.cpuTradeAggression ?? 0.5;
  document.getElementById("settingRetirementMinWinPct").value = settings.retirementOverrideMinWinningPct ?? 0.55;
}

async function loadPlayerModal(playerId) {
  state.activePlayerId = playerId;
  const seasonType = normalizeSeasonType(document.getElementById("playerSeasonTypeFilter")?.value, selectedSeasonType());
  const payload = await api(
    `/api/player?playerId=${encodeURIComponent(playerId)}&seasonType=${encodeURIComponent(seasonType)}`
  );
  const profile = payload.profile;
  const player = profile.player;
  document.getElementById("playerSeasonTypeFilter").value = profile.seasonType || seasonType;

  document.getElementById("playerModalTitle").textContent = `${player.name} (${player.position})`;
  document.getElementById("playerModalMeta").textContent =
    `${player.teamId} | OVR ${player.overall} | Age ${player.age} | ${formatHeight(player.heightInches)} ${player.weightLbs || "-"} lbs | Dev ${player.developmentTrait}`;
  document.getElementById("playerProfileSummary").innerHTML = [
    `<div><strong>${escapeHtml(player.name)}</strong></div>`,
    `<div>Team: ${escapeHtml(player.teamName || player.teamId)} | Position: ${escapeHtml(player.position)} | Experience: ${escapeHtml(player.experience || 0)}</div>`,
    `<div>Height / Weight: ${escapeHtml(formatHeight(player.heightInches))} / ${escapeHtml(player.weightLbs || "-")} lbs | Potential: ${escapeHtml(player.potential || "-")} | Morale: ${escapeHtml(player.morale || "-")} | Motivation: ${escapeHtml(player.motivation || "-")}</div>`,
    `<div>Physical frame matters to the sim through positional body ranges, while ratings drive role quality, efficiency, usage, and development outcomes.</div>`
  ].join("");

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

function closePlayerModal() {
  state.activePlayerId = null;
  document.getElementById("playerModal").classList.add("hidden");
}

function updateStatsControls() {
  const scope = document.getElementById("scopeFilter").value;
  const category = document.getElementById("categoryFilter");
  const position = document.getElementById("positionFilter");
  const year = document.getElementById("yearFilter");
  const seasonType = document.getElementById("statsSeasonTypeFilter");

  if (scope === "team") {
    category.disabled = true;
    position.disabled = true;
    year.disabled = false;
    if (seasonType) seasonType.disabled = true;
    return;
  }

  if (scope === "career") {
    category.disabled = false;
    position.disabled = false;
    year.disabled = true;
    if (seasonType) seasonType.disabled = false;
    return;
  }

  category.disabled = false;
  position.disabled = false;
  year.disabled = false;
  if (seasonType) seasonType.disabled = false;
}

function applyStatsSort() {
  const virtualized = document.getElementById("statsVirtualizedToggle")?.checked !== false;
  state.statsPageSize = virtualized ? 80 : 40;
  const rows = [...state.statsRows];
  if (state.statsSortKey) {
    rows.sort((a, b) => {
      const av = valueAsNumber(a, state.statsSortKey);
      const bv = valueAsNumber(b, state.statsSortKey);
      let cmp = 0;
      if (av != null && bv != null) cmp = av - bv;
      else cmp = String(a[state.statsSortKey] ?? "").localeCompare(String(b[state.statsSortKey] ?? ""));
      return state.statsSortDir === "asc" ? cmp : -cmp;
    });
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / state.statsPageSize));
  state.statsPage = Math.min(totalPages, Math.max(1, state.statsPage));

  const start = (state.statsPage - 1) * state.statsPageSize;
  const pageRows = rows.slice(start, start + state.statsPageSize);

  renderTable("statsTable", pageRows, {
    sortable: true,
    onSort: (key) => {
      if (state.statsSortKey === key) {
        state.statsSortDir = state.statsSortDir === "asc" ? "desc" : "asc";
      } else {
        state.statsSortKey = key;
        state.statsSortDir = "desc";
      }
      applyStatsSort();
    },
    sortKey: state.statsSortKey,
    sortDir: state.statsSortDir,
    maxRows: virtualized ? 80 : null,
    hiddenColumns: state.statsHiddenColumns
  });
  decoratePlayerColumnFromRows("statsTable", pageRows, { idKeys: ["playerId"] });

  document.getElementById("statsPageText").textContent = `Page ${state.statsPage}/${totalPages} (${rows.length} rows)`;
  renderStatsColumnFilters(rows[0] ? Object.keys(rows[0]).filter((key) => !shouldHideInternalColumn(key)) : []);
}

function renderStatsColumnFilters(columns) {
  const container = document.getElementById("statsColumnFilters");
  if (!container) return;
  if (!columns.length) {
    container.innerHTML = "<span class=\"small\">No columns loaded</span>";
    return;
  }
  container.innerHTML = columns
    .map((column) => {
      const checked = !state.statsHiddenColumns.includes(column);
      return `<label><input type="checkbox" data-stats-column="${escapeHtml(column)}" ${checked ? "checked" : ""} /> ${escapeHtml(toTitleCaseKey(column))}</label>`;
    })
    .join("");
}

function applyDashboard(newState) {
  const previous = state.dashboard;
  state.dashboard = newState;
  state.leagueSettings = newState.settings || state.leagueSettings;
  state.contractTools = {
    expiring: newState.contractTools?.expiring || [],
    tagEligible: newState.contractTools?.tagEligible || [],
    optionEligible: newState.contractTools?.optionEligible || []
  };
  state.pipeline = newState.offseasonPipeline || state.pipeline;
  state.calibrationJobs = newState.calibrationJobs || state.calibrationJobs;
  state.observability = newState.observability ? { ...(state.observability || {}), runtime: newState.observability } : state.observability;
  state.depthSnapShare = newState.depthChartSnapShare || state.depthSnapShare;
  state.realismVerification = newState.lastRealismVerificationReport || state.realismVerification;
  state.recentBoxScores = newState.recentBoxScores || state.recentBoxScores;

  if (!previous || previous.currentYear !== newState.currentYear) {
    state.scheduleYear = newState.currentYear;
    state.scheduleWeek = newState.currentWeek;
    state.scheduleCache = {};
  } else if (previous.currentWeek !== newState.currentWeek) {
    state.scheduleCache = {};
    if (state.scheduleWeek === previous.currentWeek || !Number.isFinite(state.scheduleWeek)) {
      state.scheduleWeek = newState.currentWeek;
    }
  }

  if (newState.currentWeekSchedule) {
    state.scheduleCache[newState.currentWeekSchedule.week] = newState.currentWeekSchedule;
  }
  if (newState.nextWeekSchedule) {
    state.scheduleCache[newState.nextWeekSchedule.week] = newState.nextWeekSchedule;
  }
  if (!Number.isFinite(state.scheduleWeek)) {
    state.scheduleWeek = newState.currentWeek;
  }

  updateTopMeta();
  syncTeamSelects();
  renderOverview();
  renderRosterNeeds();
  renderLeaders();
  renderSchedule();
  renderStandings();
  renderWeekResults();
  renderBoxScoreTicker();
  renderFreeAgency();
  renderExpiringContracts();
  state.newsRows = newState.news || state.newsRows;
  state.picks = newState.draftPickAssets || state.picks;
  renderNews();
  renderPickAssets();
  renderPipeline();
  renderCalibrationJobs();
  renderRealismVerification();
  renderRulesTab();
  applySettingsControls();
  renderRecordsAndHistory();

  const yearInput = document.getElementById("yearFilter");
  if (yearInput && (!yearInput.value || !previous || previous.currentYear !== newState.currentYear)) {
    yearInput.value = String(state.dashboard.currentYear);
  }
  const txYearInput = document.getElementById("txYearFilter");
  if (txYearInput && (!txYearInput.value || !previous || previous.currentYear !== newState.currentYear)) {
    txYearInput.value = String(state.dashboard.currentYear);
  }
  const analyticsYearInput = document.getElementById("analyticsYearFilter");
  if (analyticsYearInput && (!analyticsYearInput.value || !previous || previous.currentYear !== newState.currentYear)) {
    analyticsYearInput.value = String(state.dashboard.currentYear);
  }
}

function activateTab(tabId) {
  document.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
  if (tabId === "contractsTab") {
    loadContractsTeam().catch((error) => {
      setStatus(`Error: ${error.message}`);
      showToast(`Error: ${error.message}`);
    });
  }
}

async function loadState() {
  const data = await api("/api/state");
  applyDashboard(data);
}

async function loadScheduleWeek(week) {
  const safeWeek = Math.max(1, Number(week) || state.dashboard?.currentWeek || 1);
  state.scheduleWeek = safeWeek;
  if (!state.scheduleCache[safeWeek]) {
    const payload = await api(`/api/schedule?week=${safeWeek}`);
    state.scheduleCache[safeWeek] = payload.schedule || null;
  }
  renderSchedule();
}

async function loadCalendar() {
  const selectedYear = Number(document.getElementById("calendarYearFilter").value || state.dashboard?.currentYear);
  const payload = await api(`/api/calendar?year=${selectedYear}`);
  state.calendar = payload.calendar || null;
  const selectedWeek = Number(document.getElementById("calendarWeekFilter").value || state.dashboard?.currentWeek || 1);
  state.calendarWeek = selectedWeek;
  renderCalendar();
}

async function loadTransactionLog() {
  const team = document.getElementById("txTeamFilter").value;
  const type = document.getElementById("txTypeFilter").value;
  const year = document.getElementById("txYearFilter").value;
  const limit = Number(document.getElementById("txLimitFilter").value || 300);

  const query = new URLSearchParams();
  if (team) query.set("team", team);
  if (type) query.set("type", type);
  if (year) query.set("year", year);
  query.set("limit", String(limit));

  const payload = await api(`/api/transactions?${query.toString()}`);
  state.txRows = payload.transactions || [];
  renderTransactionLog();
}

async function loadNews() {
  const payload = await api("/api/news?limit=120");
  state.newsRows = payload.news || [];
  renderNews();
}

async function loadPickAssets() {
  const controlledTeam = state.dashboard?.controlledTeamId || document.getElementById("tradeTeamA").value;
  const payload = await api(`/api/picks?team=${encodeURIComponent(controlledTeam)}`);
  state.picks = payload.picks || [];
  renderPickAssets();
}

async function loadNegotiations(teamId = null) {
  const safeTeamId = teamId || state.contractTeamId || state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/contracts/negotiations?team=${encodeURIComponent(safeTeamId)}`);
  renderNegotiationTargets(payload.targets || []);
}

async function loadContractsTeam() {
  const teamId = (document.getElementById("contractsTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const [rosterPayload, expiringPayload] = await Promise.all([
    api(`/api/roster?team=${encodeURIComponent(teamId)}`),
    api(`/api/contracts/expiring?team=${encodeURIComponent(teamId)}`)
  ]);
  state.contractTeamId = teamId;
  state.contractRoster = rosterPayload.roster || [];
  state.contractCap = rosterPayload.cap || null;
  const derived = deriveContractToolsFromRoster(state.contractRoster, expiringPayload.players || []);
  state.contractTools = {
    expiring: expiringPayload.players || derived.expiring,
    tagEligible: derived.tagEligible,
    optionEligible: derived.optionEligible
  };
  if (state.selectedContractPlayerId && !state.contractRoster.some((player) => player.id === state.selectedContractPlayerId)) {
    state.selectedContractPlayerId = null;
  }
  renderExpiringContracts();
  await loadNegotiations(teamId);
  renderContractsPage();
}

async function loadAnalytics() {
  const year = document.getElementById("analyticsYearFilter").value || state.dashboard?.currentYear;
  const teamId = document.getElementById("analyticsTeamFilter").value;
  const query = new URLSearchParams({ year: String(year) });
  if (teamId) query.set("team", teamId);
  const payload = await api(`/api/analytics?${query.toString()}`);
  state.analytics = payload.analytics || null;
  renderAnalytics();
  renderAnalyticsChart();
}

async function loadSettings() {
  const payload = await api("/api/settings");
  state.leagueSettings = payload.settings || null;
  applySettingsControls();
}

async function loadStaff() {
  const teamId = document.getElementById("staffTeamSelect").value || state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/staff?team=${encodeURIComponent(teamId)}`);
  state.staffState = payload.staff || null;
  renderStaff();
}

async function loadOwner() {
  const teamId = document.getElementById("ownerTeamSelect").value || state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/owner?team=${encodeURIComponent(teamId)}`);
  state.ownerState = payload.owner || null;
  const owner = state.ownerState?.owner;
  if (owner) {
    document.getElementById("ownerTicketPriceInput").value = owner.ticketPrice ?? "";
    document.getElementById("ownerStaffBudgetInput").value = owner.staffBudget ?? "";
    document.getElementById("ownerTrainingInput").value = owner.facilities?.training ?? "";
    document.getElementById("ownerRehabInput").value = owner.facilities?.rehab ?? "";
    document.getElementById("ownerAnalyticsInput").value = owner.facilities?.analytics ?? "";
  }
  renderOwner();
}

async function loadObservability() {
  const payload = await api("/api/observability");
  state.observability = payload || null;
  renderObservability();
}

async function loadPersistence() {
  const payload = await api("/api/system/persistence");
  state.persistence = payload.persistence || null;
  renderPersistence();
}

async function loadPipeline() {
  const payload = await api("/api/offseason/pipeline");
  state.pipeline = payload.pipeline || null;
  renderPipeline();
}

async function loadCalibrationJobs() {
  const payload = await api("/api/calibration/jobs?limit=60");
  state.calibrationJobs = payload.jobs || [];
  renderCalibrationJobs();
}

async function runRealismVerification() {
  const years = Number(document.getElementById("realismVerifyYearsInput").value || 12);
  const safeYears = Math.max(1, Math.min(30, Math.floor(years)));
  const payload = await api(`/api/realism/verify?seasons=${encodeURIComponent(safeYears)}`);
  state.realismVerification = payload.report || null;
  renderRealismVerification();
}

async function loadSimJobs() {
  const payload = await api("/api/jobs/simulate");
  state.simJobs = payload.jobs || [];
  renderSimJobs();
}

async function loadComparePlayers() {
  const ids = parseIds(document.getElementById("comparePlayerIdsInput").value);
  if (!ids.length) {
    state.comparePlayers = [];
    renderComparePlayers();
    return;
  }
  const payload = await api(`/api/compare/players?ids=${encodeURIComponent(ids.join(","))}`);
  state.comparePlayers = payload.players || [];
  renderComparePlayers();
}

async function loadRoster() {
  const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const query = new URLSearchParams({ team: teamId });
  const pos = document.getElementById("rosterPosFilter").value;
  const minOverall = document.getElementById("rosterMinOverallFilter").value;
  const minAge = document.getElementById("rosterMinAgeFilter").value;
  const maxAge = document.getElementById("rosterMaxAgeFilter").value;
  if (pos) query.set("position", pos);
  if (minOverall) query.set("minOverall", minOverall);
  if (minAge) query.set("minAge", minAge);
  if (maxAge) query.set("maxAge", maxAge);
  const data = await api(`/api/roster?${query.toString()}`);
  state.roster = data.roster || [];
  renderRoster();
  renderRosterBoard();
  if (!state.contractTeamId || state.contractTeamId === teamId) {
    state.contractTeamId = teamId;
    state.contractRoster = data.roster || [];
    state.contractCap = data.cap || null;
  }
}

async function loadFreeAgency() {
  const position = document.getElementById("faPositionFilter").value;
  const query = new URLSearchParams({ limit: "220" });
  if (position) query.set("position", position);
  const minOverall = document.getElementById("faMinOverallFilter").value;
  const minAge = document.getElementById("faMinAgeFilter").value;
  const maxAge = document.getElementById("faMaxAgeFilter").value;
  if (minOverall) query.set("minOverall", minOverall);
  if (minAge) query.set("minAge", minAge);
  if (maxAge) query.set("maxAge", maxAge);
  const data = await api(`/api/free-agents?${query.toString()}`);
  state.freeAgents = data.freeAgents || [];
  renderFreeAgency();
}

async function loadRetiredPool() {
  const query = new URLSearchParams({ limit: "300" });
  const position = document.getElementById("retiredPosFilter").value;
  const minOverall = document.getElementById("retiredMinOverallFilter").value;
  const minAge = document.getElementById("retiredMinAgeFilter").value;
  const maxAge = document.getElementById("retiredMaxAgeFilter").value;
  if (position) query.set("position", position);
  if (minOverall) query.set("minOverall", minOverall);
  if (minAge) query.set("minAge", minAge);
  if (maxAge) query.set("maxAge", maxAge);
  const payload = await api(`/api/retired?${query.toString()}`);
  state.retiredPool = payload.retired || [];
  renderRetiredPool();
}

async function loadStats() {
  const scope = document.getElementById("scopeFilter").value;
  const category = document.getElementById("categoryFilter").value;
  const position = document.getElementById("positionFilter").value;
  const teamFilter = document.getElementById("statsTeamFilter").value;
  const seasonType = selectedSeasonType();
  let year = document.getElementById("yearFilter").value;

  if (scope !== "career" && !year) {
    year = String(state.dashboard?.currentYear || new Date().getFullYear());
    document.getElementById("yearFilter").value = year;
  }

  let payload;
  state.statsCompanionRows = {};
  if (scope === "season") {
    const query = new URLSearchParams({ category });
    if (year) query.set("year", year);
    if (position) query.set("position", position);
    if (teamFilter && teamFilter !== "ALL") query.set("team", teamFilter);
    query.set("seasonType", seasonType);
    payload = await api(`/api/tables/player-season?${query.toString()}`);
    if (category === "rushing" || category === "receiving") {
      const companionQuery = new URLSearchParams(query);
      companionQuery.set("category", category === "rushing" ? "receiving" : "rushing");
      const companion = await api(`/api/tables/player-season?${companionQuery.toString()}`);
      state.statsCompanionRows[category === "rushing" ? "receiving" : "rushing"] = companion.rows || [];
    }
  } else if (scope === "career") {
    const query = new URLSearchParams({ category });
    if (position) query.set("position", position);
    if (teamFilter && teamFilter !== "ALL") query.set("team", teamFilter);
    query.set("seasonType", seasonType);
    payload = await api(`/api/tables/player-career?${query.toString()}`);
    if (category === "rushing" || category === "receiving") {
      const companionQuery = new URLSearchParams(query);
      companionQuery.set("category", category === "rushing" ? "receiving" : "rushing");
      const companion = await api(`/api/tables/player-career?${companionQuery.toString()}`);
      state.statsCompanionRows[category === "rushing" ? "receiving" : "rushing"] = companion.rows || [];
    }
  } else {
    const query = new URLSearchParams();
    if (year) query.set("year", year);
    if (teamFilter && teamFilter !== "ALL") query.set("team", teamFilter);
    payload = await api(`/api/tables/team-season?${query.toString()}`);
  }

  state.statsRows = shapeStatsRowsForDisplay(payload.rows || [], { scope, category });
  state.statsPage = 1;
  if (state.statsRows[0] && (!state.statsSortKey || !(state.statsSortKey in state.statsRows[0]))) {
    const preferred = ["yds", "td", "tkl", "sacks", "offSn", "defSn", "fgm", "pf", "wins"];
    state.statsSortKey = preferred.find((col) => col in state.statsRows[0]) || Object.keys(state.statsRows[0])[0];
  }
  applyStatsSort();
}

async function exportSnapshot() {
  const payload = await api("/api/snapshot/export");
  const blob = new Blob([`${JSON.stringify(payload.snapshot, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = payload.fileName || "vsfgm-snapshot.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importSnapshot(file) {
  if (!file) throw new Error("Choose a snapshot file first.");
  let snapshot = null;
  try {
    snapshot = JSON.parse(await file.text());
  } catch {
    throw new Error("Invalid snapshot JSON.");
  }
  const payload = await api("/api/snapshot/import", { method: "POST", body: { snapshot } });
  applyDashboard(payload.state);
  await refreshEverything();
}

async function loadDraftState() {
  const data = await api("/api/draft");
  state.draftState = data.draft || null;
  renderDraft();
}

async function loadScouting() {
  const teamId = state.dashboard?.controlledTeamId || "BUF";
  const payload = await api(`/api/scouting?team=${encodeURIComponent(teamId)}&limit=140`);
  state.scouting = payload.scouting || null;
  renderScouting();
}

async function loadDepthChart() {
  const teamId = (document.getElementById("depthTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
  const position = document.getElementById("depthPositionSelect").value;
  const [payload, rosterPayload] = await Promise.all([
    api(`/api/depth-chart?team=${encodeURIComponent(teamId)}`),
    api(`/api/roster?team=${encodeURIComponent(teamId)}`)
  ]);
  state.depthChart = payload.depthChart || null;
  state.depthSnapShare = payload.snapShare || null;
  state.depthDefaultShares = Object.fromEntries(
    Object.entries(payload.snapShare || {}).map(([sharePosition, rows]) => [
      sharePosition,
      (rows || []).map((row) => Number(row.defaultSnapShare ?? row.snapShare ?? 0.02))
    ])
  );
  state.depthManualShares = Object.fromEntries(
    Object.entries(payload.snapShare || {}).map(([sharePosition, rows]) => [
      sharePosition,
      Object.fromEntries(
        (rows || [])
          .filter((row) => row.manual)
          .map((row) => [row.playerId, Number(row.snapShare ?? 0)])
      )
    ])
  );
  state.depthRoster = rosterPayload.roster || [];
  state.depthOrder = [...(state.depthChart?.[position] || [])];
  renderDepthChart();
}

async function loadSaves() {
  const payload = await api("/api/saves");
  state.saves = payload.slots || [];
  const text = state.saves.length
    ? state.saves.map((slot) => `${slot.slot} (${new Date(slot.updatedAt).toLocaleString()})`).join(" | ")
    : "No save slots yet.";
  document.getElementById("saveListText").textContent = text;
}

async function loadQa() {
  const year = state.dashboard?.currentYear || new Date().getFullYear();
  const payload = await api(`/api/qa/season?year=${year}`);
  const rows = Object.entries(payload.report.actual || {}).map(([metric, actual]) => ({
    metric,
    target: payload.report.target?.[metric],
    actual,
    delta: payload.report.deltas?.[metric]
  }));
  renderTable("qaTable", rows);
}

async function loadTeamHistory() {
  const teamId = document.getElementById("teamHistorySelect").value || state.dashboard?.controlledTeamId;
  const payload = await api(`/api/history/team?team=${encodeURIComponent(teamId)}`);
  renderTable(
    "teamHistoryTable",
    (payload.history?.seasons || []).map((season) => ({
      year: season.year,
      w: season.wins,
      l: season.losses,
      t: season.ties,
      pf: season.pf,
      pa: season.pa
    }))
  );
}

async function loadPlayerTimeline() {
  const playerId = document.getElementById("playerTimelineId").value.trim();
  if (!playerId) return;
  const payload = await api(`/api/history/player?playerId=${encodeURIComponent(playerId)}`);
  const rows = (payload.timeline?.timeline || []).map((entry) => ({
    year: entry.year,
    passYds: entry.stats?.passing?.yards || 0,
    passTd: entry.stats?.passing?.td || 0,
    rushYds: entry.stats?.rushing?.yards || 0,
    rushTd: entry.stats?.rushing?.td || 0,
    recYds: entry.stats?.receiving?.yards || 0,
    recTd: entry.stats?.receiving?.td || 0,
    tackles: entry.stats?.defense?.tackles || 0,
    sacks: entry.stats?.defense?.sacks || 0,
    ints: entry.stats?.defense?.int || 0
  }));
  renderTable("playerTimelineTable", rows);
}

async function refreshEverything() {
  await loadState();
  updateStatsControls();
  document.getElementById("analyticsYearFilter").value = String(state.dashboard?.currentYear || new Date().getFullYear());
  await Promise.all([
    loadRoster(),
    loadContractsTeam(),
    loadFreeAgency(),
    loadRetiredPool(),
    loadStats(),
    loadDraftState(),
    loadScouting(),
    loadDepthChart(),
    loadSaves(),
    loadQa(),
    loadTeamHistory(),
    loadCalendar(),
    loadTransactionLog(),
    loadNews(),
    loadPickAssets(),
    loadNegotiations(),
    loadAnalytics(),
    loadSettings(),
    loadStaff(),
    loadOwner(),
    loadObservability(),
    loadPersistence(),
    loadPipeline(),
    loadCalibrationJobs(),
    loadSimJobs()
  ]);
  renderCommandPalette();
  renderRulesTab();
  renderAnalyticsChart();
  renderRealismVerification();
}

async function runAction(fn, statusText = "Working...") {
  try {
    setStatus(statusText);
    await fn();
    setStatus("Ready");
    showToast("Done");
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    showToast(`Error: ${error.message}`);
  }
}

async function refreshPostSimulation() {
  await Promise.all([
    loadRoster(),
    loadFreeAgency(),
    loadRetiredPool(),
    loadStats(),
    loadDraftState(),
    loadScouting(),
    loadQa(),
    loadTeamHistory(),
    loadCalendar(),
    loadTransactionLog(),
    loadNews(),
    loadOwner(),
    loadPipeline(),
    loadSimJobs()
  ]);
}

async function advanceWeeksSequential(totalWeeks) {
  const safeWeeks = Math.max(1, Number(totalWeeks) || 1);
  setSimControl({ active: true, pauseRequested: false, mode: "weeks" });
  let completed = 0;
  try {
    while (completed < safeWeeks) {
      if (state.simControl.pauseRequested) break;
      setStatus(`Simulating week ${completed + 1}/${safeWeeks}...`);
      const response = await api("/api/advance-week", { method: "POST", body: { count: 1 } });
      applyDashboard(response.state);
      completed += 1;
    }
    await refreshPostSimulation();
    showToast(state.simControl.pauseRequested ? `Paused after ${completed} week(s)` : "Done");
  } finally {
    setSimControl({ active: false, pauseRequested: false, mode: null });
    setStatus("Ready");
  }
}

async function advanceSeasonSequential() {
  const startYear = state.dashboard?.currentYear || new Date().getFullYear();
  setSimControl({ active: true, pauseRequested: false, mode: "season" });
  let steps = 0;
  try {
    while (steps < 64) {
      if (state.simControl.pauseRequested) break;
      const done =
        state.dashboard &&
        state.dashboard.currentYear > startYear &&
        state.dashboard.phase === "regular-season" &&
        state.dashboard.currentWeek === 1;
      if (done) break;
      setStatus(`Advancing season step ${steps + 1}...`);
      const response = await api("/api/advance-week", { method: "POST", body: { count: 1 } });
      applyDashboard(response.state);
      steps += 1;
    }
    await refreshPostSimulation();
    showToast(state.simControl.pauseRequested ? `Season sim paused after ${steps} step(s)` : "Done");
  } finally {
    setSimControl({ active: false, pauseRequested: false, mode: null });
    setStatus("Ready");
  }
}

function bindMenuTabs() {
  document.querySelectorAll(".menu-btn").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
}

function bindEvents() {
  bindMenuTabs();

  document.getElementById("backSetupBtn").addEventListener("click", () => {
    window.location.href = new URL("./", document.baseURI).toString();
  });

  document.getElementById("teamSelect").addEventListener("change", (event) =>
    runAction(async () => {
      const response = await api("/api/control-team", { method: "POST", body: { teamId: event.target.value } });
      applyDashboard(response.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadRetiredPool(),
        loadStats(),
        loadDepthChart(),
        loadDraftState(),
        loadScouting(),
        loadTeamHistory(),
        loadCalendar(),
        loadTransactionLog(),
        loadNews(),
        loadPickAssets(),
        loadNegotiations(),
        loadStaff(),
        loadOwner(),
        loadPipeline(),
        loadObservability()
      ]);
    }, "Switching team...")
  );

  document.getElementById("advanceWeekBtn").addEventListener("click", () =>
    runAction(async () => {
      const response = await api("/api/advance-week", { method: "POST", body: { count: 1 } });
      applyDashboard(response.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadRetiredPool(),
        loadStats(),
        loadDraftState(),
        loadScouting(),
        loadQa(),
        loadTeamHistory(),
        loadCalendar(),
        loadTransactionLog(),
        loadNews(),
        loadOwner(),
        loadPipeline(),
        loadSimJobs()
      ]);
    }, "Advancing week...")
  );

  document.getElementById("advance4WeeksBtn").addEventListener("click", () =>
    advanceWeeksSequential(4).catch((error) => {
      setStatus(`Error: ${error.message}`);
      showToast(`Error: ${error.message}`);
      setSimControl({ active: false, pauseRequested: false, mode: null });
    })
  );

  document.getElementById("advanceSeasonBtn").addEventListener("click", () =>
    advanceSeasonSequential().catch((error) => {
      setStatus(`Error: ${error.message}`);
      showToast(`Error: ${error.message}`);
      setSimControl({ active: false, pauseRequested: false, mode: null });
    })
  );

  document.getElementById("pauseSimBtn").addEventListener("click", () => {
    if (!state.simControl.active) return;
    setSimControl({ pauseRequested: true });
  });

  document.getElementById("refreshBtn").addEventListener("click", () => runAction(refreshEverything, "Refreshing..."));

  document.getElementById("loadRosterBtn").addEventListener("click", () => runAction(loadRoster, "Loading roster..."));
  document.getElementById("loadFaBtn").addEventListener("click", () => runAction(loadFreeAgency, "Loading pool..."));
  document.getElementById("loadStatsBtn").addEventListener("click", () => runAction(loadStats, "Loading stats..."));
  document.getElementById("rosterTeamSelect").addEventListener("change", () => runAction(loadRoster, "Loading roster..."));
  ["rosterPosFilter", "rosterMinOverallFilter", "rosterMinAgeFilter", "rosterMaxAgeFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadRoster, "Filtering roster..."));
  });
  ["faMinOverallFilter", "faMinAgeFilter", "faMaxAgeFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadFreeAgency, "Filtering pool..."));
  });
  document.getElementById("loadRetiredBtn").addEventListener("click", () =>
    runAction(loadRetiredPool, "Loading retired pool...")
  );
  ["retiredPosFilter", "retiredMinOverallFilter", "retiredMinAgeFilter", "retiredMaxAgeFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadRetiredPool, "Filtering retired pool..."));
  });

  document.getElementById("rosterTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;
    const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
    const playerId = button.dataset.id;
    const act = button.dataset.act;

    runAction(async () => {
      if (act === "release") await api("/api/release", { method: "POST", body: { teamId, playerId } });
      if (act === "ps") await api("/api/practice-squad", { method: "POST", body: { teamId, playerId, moveToPractice: true } });
      if (act === "active") await api("/api/practice-squad", { method: "POST", body: { teamId, playerId, moveToPractice: false } });
      await Promise.all([loadState(), loadRoster(), loadFreeAgency(), loadDepthChart(), loadCalendar(), loadTransactionLog()]);
    }, "Applying roster move...");
  });

  document.getElementById("faTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (!button) return;

    runAction(async () => {
      const teamId = state.dashboard?.controlledTeamId;
      const playerId = button.dataset.id;
      if (button.dataset.act === "sign") {
        await api("/api/sign", { method: "POST", body: { teamId, playerId } });
      } else if (button.dataset.act === "offer") {
        await api("/api/free-agency/offer", { method: "POST", body: { teamId, playerId, years: 2 } });
      } else {
        await api("/api/waiver-claim", { method: "POST", body: { teamId, playerId } });
      }
      await Promise.all([loadState(), loadRoster(), loadFreeAgency(), loadDepthChart(), loadTransactionLog(), loadNews()]);
    }, "Processing transaction...");
  });

  document.getElementById("boxScoreTicker").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-boxscore-id]");
    if (!button) return;
    runAction(() => loadBoxScore(button.dataset.boxscoreId), "Loading box score...");
  });

  document.getElementById("retiredTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-retired-override-id]");
    if (!button) return;
    document.getElementById("retirementOverridePlayerId").value = button.dataset.retiredOverrideId || "";
  });

  document.getElementById("retirementOverrideBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamId = (document.getElementById("retirementOverrideTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/retirement/override", {
        method: "POST",
        body: {
          playerId: document.getElementById("retirementOverridePlayerId").value.trim(),
          teamId,
          minWinningPct: Number(document.getElementById("retirementOverrideWinPct").value || 0.55),
          forceSign: true
        }
      });
      await Promise.all([loadState(), loadRoster(), loadRetiredPool(), loadTransactionLog(), loadNews()]);
    }, "Applying retirement override...")
  );

  document.getElementById("applyDesignationBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/roster/designation", {
        method: "POST",
        body: {
          teamId,
          playerId: document.getElementById("designationPlayerId").value.trim(),
          designation: document.getElementById("designationType").value,
          active: true
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Applying designation...")
  );

  document.getElementById("clearDesignationBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/roster/designation", {
        method: "POST",
        body: {
          teamId,
          playerId: document.getElementById("designationPlayerId").value.trim(),
          designation: document.getElementById("designationType").value,
          active: false
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Clearing designation...")
  );

  const moveRosterBoard = (playerId, direction) => {
    if (!playerId) return;
    const index = state.roster.findIndex((player) => player.id === playerId);
    if (index < 0) return;
    const swapWith = direction < 0 ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= state.roster.length) return;
    const copy = [...state.roster];
    [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
    state.roster = copy;
    renderRosterBoard();
  };
  document.getElementById("boardPlayerId")?.closest(".row")?.classList.add("hidden");
  document.getElementById("rosterBoardTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-roster-board-move]");
    if (!button) return;
    moveRosterBoard(button.dataset.playerId, button.dataset.rosterBoardMove === "up" ? -1 : 1);
  });

  document.getElementById("tradeBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamA = document.getElementById("tradeTeamA").value;
      const teamB = document.getElementById("tradeTeamB").value;
      const payload = {
        teamA,
        teamB,
        teamAPlayerIds: parseIds(document.getElementById("tradeAIds").value),
        teamBPlayerIds: parseIds(document.getElementById("tradeBIds").value),
        teamAPickIds: parseIds(document.getElementById("tradeAPickIds").value),
        teamBPickIds: parseIds(document.getElementById("tradeBPickIds").value)
      };
      const result = await api("/api/trade", {
        method: "POST",
        body: payload
      });
      const aDelta = result.valuation?.[teamA]?.delta || 0;
      const bDelta = result.valuation?.[teamB]?.delta || 0;
      setTradeEvalText(`Trade accepted. ${teamA} delta ${aDelta}, ${teamB} delta ${bDelta}`);
      await Promise.all([loadState(), loadRoster(), loadFreeAgency(), loadDepthChart(), loadTransactionLog()]);
    }, "Executing trade...")
  );

  document.getElementById("tradeTeamA").addEventListener("change", () =>
    runAction(async () => {
      const teamId = document.getElementById("tradeTeamA").value;
      const payload = await api(`/api/picks?team=${encodeURIComponent(teamId)}`);
      state.picks = payload.picks || [];
      renderPickAssets();
    }, "Loading pick assets...")
  );

  document.getElementById("evaluateTradeBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamA = document.getElementById("tradeTeamA").value;
      const teamB = document.getElementById("tradeTeamB").value;
      const payload = {
        teamA,
        teamB,
        teamAPlayerIds: parseIds(document.getElementById("tradeAIds").value),
        teamBPlayerIds: parseIds(document.getElementById("tradeBIds").value),
        teamAPickIds: parseIds(document.getElementById("tradeAPickIds").value),
        teamBPickIds: parseIds(document.getElementById("tradeBPickIds").value)
      };
      const result = await api("/api/trade/evaluate", { method: "POST", body: payload });
      const a = result.valuation?.[teamA];
      const b = result.valuation?.[teamB];
      setTradeEvalText(
        `${teamA}: in ${a?.incomingValue ?? 0} / out ${a?.outgoingValue ?? 0} | ${teamB}: in ${b?.incomingValue ?? 0} / out ${b?.outgoingValue ?? 0}`
      );
    }, "Evaluating trade...")
  );

  document.getElementById("tradeWizardEvaluateBtn").addEventListener("click", () =>
    runAction(async () => {
      const teamA = document.getElementById("tradeTeamA").value;
      const teamB = document.getElementById("tradeTeamB").value;
      const parseWizardAssets = (text) => {
        const ids = parseIds(text);
        return {
          players: ids.filter((id) => !id.startsWith("PICK-") && !id.startsWith("COMP-")),
          picks: ids.filter((id) => id.startsWith("PICK-") || id.startsWith("COMP-"))
        };
      };
      const aAssets = parseWizardAssets(document.getElementById("tradeWizardA").value);
      const bAssets = parseWizardAssets(document.getElementById("tradeWizardB").value);
      const result = await api("/api/trade/evaluate", {
        method: "POST",
        body: {
          teamA,
          teamB,
          teamAPlayerIds: aAssets.players,
          teamBPlayerIds: bAssets.players,
          teamAPickIds: aAssets.picks,
          teamBPickIds: bAssets.picks
        }
      });
      const a = result.valuation?.[teamA] || {};
      const b = result.valuation?.[teamB] || {};
      const fairness = Math.max(0, 100 - Math.abs((a.delta || 0) - (b.delta || 0)) * 4);
      document.getElementById("tradeFairnessScore").textContent = `${fairness.toFixed(0)} / 100`;
      document.getElementById("tradeCapDeltaA").textContent = fmtDeltaMoney(a.capDelta || 0);
      document.getElementById("tradeCapDeltaB").textContent = fmtDeltaMoney(b.capDelta || 0);
    }, "Evaluating trade wizard...")
  );

  document.getElementById("loadContractsBtn").addEventListener("click", () =>
    runAction(loadContractsTeam, "Loading contracts...")
  );
  document.getElementById("contractsTeamSelect").addEventListener("change", () =>
    runAction(loadContractsTeam, "Loading contracts...")
  );

  document.getElementById("contractsResignBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      await api("/api/contracts/resign", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id,
          years: Number(document.getElementById("contractYearsInput").value || 3)
        }
      });
      setContractActionText(`${player.name} re-signed successfully.`);
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog()]);
    }, "Re-signing...")
  );

  document.getElementById("contractsRestructureBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      await api("/api/contracts/restructure", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id
        }
      });
      setContractActionText(`${player.name} restructured the current deal.`);
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog()]);
    }, "Restructuring...")
  );

  document.getElementById("franchiseTagBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      await api("/api/contracts/franchise-tag", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id
        }
      });
      setContractActionText(`${player.name} was franchise tagged.`);
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog()]);
    }, "Applying franchise tag...")
  );

  document.getElementById("fifthOptionBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      await api("/api/contracts/fifth-year-option", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id
        }
      });
      setContractActionText(`${player.name}'s fifth-year option was exercised.`);
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog()]);
    }, "Applying fifth-year option...")
  );

  document.getElementById("contractsNegotiateBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedContractPlayer();
      if (!player) throw new Error("Select a player first.");
      const response = await api("/api/contracts/negotiate", {
        method: "POST",
        body: {
          teamId: state.contractTeamId || state.dashboard?.controlledTeamId,
          playerId: player.id,
          years: Number(document.getElementById("contractYearsInput").value || 0) || null,
          salary: Number(document.getElementById("contractSalaryInput").value || 0) || null
        }
      });
      if (response.countered) {
        document.getElementById("contractYearsInput").value = response.counterOffer?.years || "";
        document.getElementById("contractSalaryInput").value = response.counterOffer?.salary || "";
        setContractActionText(
          `${player.name} countered at ${response.counterOffer?.years}y / ${fmtMoney(response.counterOffer?.salary || 0)}. Morale ${response.morale}, motivation ${response.motivation}.`
        );
      } else {
        setContractActionText(`${player.name} accepted the offer. Morale ${response.morale}, motivation ${response.motivation}.`);
      }
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadTransactionLog(), loadNegotiations(state.contractTeamId)]);
    }, "Negotiating contract...")
  );

  document.getElementById("negotiationTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-negotiate-id]");
    if (!button) return;
    setSelectedContractPlayer(button.dataset.negotiateId || "");
  });

  document.getElementById("tagEligibleTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-contract-fill]");
    if (!button) return;
    const playerId = button.dataset.playerId || "";
    setSelectedContractPlayer(playerId);
    updateContractPreview();
  });

  document.getElementById("optionEligibleTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-contract-fill]");
    if (!button) return;
    const playerId = button.dataset.playerId || "";
    setSelectedContractPlayer(playerId);
    updateContractPreview();
  });
  document.getElementById("expiringTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-contract-select]");
    if (!button) return;
    setSelectedContractPlayer(button.dataset.contractSelect || "");
  });
  document.getElementById("contractsRosterTable").addEventListener("click", (event) => {
    const selectButton = event.target.closest("button[data-contract-select]");
    if (selectButton) {
      setSelectedContractPlayer(selectButton.dataset.contractSelect || "");
      return;
    }
    const actionButton = event.target.closest("button[data-contract-action]");
    if (!actionButton) return;
    const playerId = actionButton.dataset.playerId || "";
    setSelectedContractPlayer(playerId, { preserveInputs: true });
    if (actionButton.dataset.contractAction === "trade") {
      queueTradePlayer(playerId);
      return;
    }
    if (actionButton.dataset.contractAction === "block") {
      toggleTradeBlockPlayer(playerId);
      setContractActionText(state.tradeBlockIds.includes(playerId) ? "Added to trade block." : "Removed from trade block.");
    }
  });
  document.getElementById("tradeBlockTable").addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-contract-action]");
    if (!actionButton) return;
    const playerId = actionButton.dataset.playerId || "";
    if (actionButton.dataset.contractAction === "trade") {
      queueTradePlayer(playerId);
      return;
    }
    toggleTradeBlockPlayer(playerId);
    setContractActionText("Removed from trade block.");
  });
  document.getElementById("contractsTradeBtn").addEventListener("click", () => {
    const player = getSelectedContractPlayer();
    if (!player) return;
    queueTradePlayer(player.id);
  });
  document.getElementById("contractsTradeBlockBtn").addEventListener("click", () => {
    const player = getSelectedContractPlayer();
    if (!player) return;
    toggleTradeBlockPlayer(player.id);
    setContractActionText(state.tradeBlockIds.includes(player.id) ? `${player.name} added to the trade block.` : `${player.name} removed from the trade block.`);
  });

  document.getElementById("loadDepthBtn").addEventListener("click", () => runAction(loadDepthChart, "Loading depth chart..."));
  ["depthTeamSelect", "depthPositionSelect"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadDepthChart, "Loading depth chart..."));
  });
  document.getElementById("saveDepthBtn").addEventListener("click", () =>
    runAction(async () => {
      const position = document.getElementById("depthPositionSelect").value;
      await api("/api/depth-chart", {
        method: "POST",
        body: {
          teamId: document.getElementById("depthTeamSelect").value,
          position,
          playerIds: state.depthOrder,
          snapShares: state.depthOrder.reduce((acc, playerId) => {
            const manualShare = state.depthManualShares?.[position]?.[playerId];
            if (Number.isFinite(manualShare)) acc[playerId] = manualShare;
            return acc;
          }, {})
        }
      });
      await loadDepthChart();
    }, "Saving depth chart...")
  );
  document.getElementById("depthTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-depth-move]");
    if (button) {
      const playerId = button.dataset.depthPlayerId;
      const delta = button.dataset.depthMove === "up" ? -1 : 1;
      state.depthOrder = moveIdWithinList(state.depthOrder, playerId, delta);
      renderDepthChart();
      return;
    }
    const resetButton = event.target.closest("button[data-depth-share-reset]");
    if (!resetButton) return;
    const position = document.getElementById("depthPositionSelect").value;
    delete state.depthManualShares?.[position]?.[resetButton.dataset.depthShareReset];
    renderDepthChart();
  });
  document.getElementById("depthTable").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-depth-share-input]");
    if (!input) return;
    const position = document.getElementById("depthPositionSelect").value;
    updateDepthShare(position, input.dataset.depthShareInput, input.value);
    renderDepthChart();
  });

  document.getElementById("prepareDraftBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/prepare", { method: "POST", body: {} });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadCalendar()]);
    }, "Preparing draft...")
  );

  document.getElementById("cpuDraftBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/cpu", { method: "POST", body: { picks: 224, untilUserPick: true } });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Running CPU draft...")
  );

  document.getElementById("cpuDraftAllBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/cpu", { method: "POST", body: { picks: 224, untilUserPick: false } });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Finishing draft...")
  );

  document.getElementById("cpuDraftOneBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/draft/cpu", { method: "POST", body: { picks: 1, untilUserPick: false } });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Simulating one pick...")
  );

  document.getElementById("userPickBtn").addEventListener("click", () =>
    runAction(async () => {
      if (!state.selectedDraftProspectId) throw new Error("Select a prospect first.");
      await api("/api/draft/user-pick", {
        method: "POST",
        body: { playerId: state.selectedDraftProspectId }
      });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Submitting user pick...")
  );

  document.getElementById("draftAvailableTable").addEventListener("click", (event) => {
    const selectButton = event.target.closest("button[data-draft-select-id]");
    if (selectButton) {
      state.selectedDraftProspectId = selectButton.dataset.draftSelectId || null;
      renderDraft();
      return;
    }
    const button = event.target.closest("button[data-draft-player-id]");
    if (!button) return;
    state.selectedDraftProspectId = button.dataset.draftPlayerId || null;
    runAction(async () => {
      await api("/api/draft/user-pick", {
        method: "POST",
        body: { playerId: button.dataset.draftPlayerId }
      });
      await Promise.all([loadState(), loadDraftState(), loadScouting(), loadRoster(), loadTransactionLog()]);
    }, "Drafting player...");
  });

  document.getElementById("loadScoutingBtn").addEventListener("click", () =>
    runAction(loadScouting, "Loading scouting board...")
  );

  document.getElementById("lockBoardBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/scouting/lock-board", {
        method: "POST",
        body: {
          teamId: state.dashboard?.controlledTeamId,
          playerIds: state.scoutingBoardDraft.slice(0, 20)
        }
      });
      await loadScouting();
    }, "Locking board...")
  );
  document.getElementById("scoutingTable").addEventListener("click", (event) => {
    const scoutButton = event.target.closest("button[data-scout-player-id]");
    if (scoutButton) {
      runAction(async () => {
        await api("/api/scouting/allocate", {
          method: "POST",
          body: {
            teamId: state.dashboard?.controlledTeamId,
            playerId: scoutButton.dataset.scoutPlayerId,
            points: Number(document.getElementById("scoutPointsInput").value || 10)
          }
        });
        await loadScouting();
      }, "Scouting prospect...");
      return;
    }

    const toggleButton = event.target.closest("button[data-board-toggle]");
    if (toggleButton) {
      const playerId = toggleButton.dataset.playerId;
      if (toggleButton.dataset.boardToggle === "add") {
        if (!state.scoutingBoardDraft.includes(playerId) && state.scoutingBoardDraft.length < 20) {
          state.scoutingBoardDraft = [...state.scoutingBoardDraft, playerId];
        }
      } else {
        state.scoutingBoardDraft = state.scoutingBoardDraft.filter((id) => id !== playerId);
      }
      renderScouting();
      return;
    }

    const moveButton = event.target.closest("button[data-board-move]");
    if (moveButton) {
      const delta = moveButton.dataset.boardMove === "up" ? -1 : 1;
      state.scoutingBoardDraft = moveIdWithinList(state.scoutingBoardDraft, moveButton.dataset.playerId, delta);
      renderScouting();
    }
  });

  document.getElementById("scopeFilter").addEventListener("change", () =>
    runAction(async () => {
      updateStatsControls();
      await loadStats();
    }, "Loading stats...")
  );
  ["categoryFilter", "positionFilter", "statsTeamFilter", "yearFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadStats, "Loading stats..."));
  });
  document.getElementById("statsSeasonTypeFilter").addEventListener("change", () => runAction(loadStats, "Loading stats..."));
  document.getElementById("playerSeasonTypeFilter").addEventListener("change", () => {
    if (!state.activePlayerId) return;
    runAction(() => loadPlayerModal(state.activePlayerId), "Loading player...");
  });
  document.getElementById("statsVirtualizedToggle").addEventListener("change", () => applyStatsSort());
  document.getElementById("statsColumnFilters").addEventListener("change", (event) => {
    const input = event.target.closest("input[data-stats-column]");
    if (!input) return;
    const column = input.dataset.statsColumn;
    const next = new Set(state.statsHiddenColumns);
    if (input.checked) next.delete(column);
    else next.add(column);
    saveStatsHiddenColumns([...next]);
    applyStatsSort();
  });
  document.getElementById("comparePlayersBtn").addEventListener("click", () =>
    runAction(loadComparePlayers, "Comparing players...")
  );

  document.getElementById("leadersCategory").addEventListener("change", () => {
    renderLeaders();
  });

  document.getElementById("prevScheduleWeekBtn").addEventListener("click", () =>
    runAction(() => loadScheduleWeek((state.scheduleWeek || state.dashboard?.currentWeek || 1) - 1), "Loading schedule...")
  );

  document.getElementById("nextScheduleWeekBtn").addEventListener("click", () =>
    runAction(() => loadScheduleWeek((state.scheduleWeek || state.dashboard?.currentWeek || 1) + 1), "Loading schedule...")
  );

  document.getElementById("loadCalendarBtn").addEventListener("click", () =>
    runAction(loadCalendar, "Loading calendar...")
  );

  document.getElementById("calendarYearFilter").addEventListener("change", () =>
    runAction(loadCalendar, "Loading calendar year...")
  );

  document.getElementById("calendarWeekFilter").addEventListener("change", () => {
    state.calendarWeek = Number(document.getElementById("calendarWeekFilter").value || 1);
    renderCalendar();
  });

  document.getElementById("loadTxBtn").addEventListener("click", () =>
    runAction(loadTransactionLog, "Loading transaction log...")
  );
  ["txTeamFilter", "txTypeFilter", "txYearFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => runAction(loadTransactionLog, "Loading transaction log..."));
  });

  document.getElementById("loadAnalyticsBtn").addEventListener("click", () =>
    runAction(loadAnalytics, "Loading analytics...")
  );

  document.getElementById("analyticsYearFilter").addEventListener("change", () =>
    runAction(loadAnalytics, "Loading analytics...")
  );
  document.getElementById("analyticsTeamFilter").addEventListener("change", () =>
    runAction(loadAnalytics, "Loading analytics...")
  );

  document.getElementById("saveSettingsBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = await api("/api/settings", {
        method: "POST",
        body: {
          allowInjuries: document.getElementById("settingAllowInjuries").checked,
          autoProgressOffseason: document.getElementById("settingAutoOffseason").checked,
          enableOwnerMode: document.getElementById("settingEnableOwnerMode").checked,
          enableNarratives: document.getElementById("settingEnableNarratives").checked,
          enableCompPicks: document.getElementById("settingEnableCompPicks").checked,
          enableChemistry: document.getElementById("settingEnableChemistry").checked,
          retirementWinningRetention: document.getElementById("settingRetirementWinningRetention").checked,
          retirementOverrideMinWinningPct: Number(document.getElementById("settingRetirementMinWinPct").value || 0.55),
          eraProfile: document.getElementById("settingEraProfile").value,
          injuryRateMultiplier: Number(document.getElementById("settingInjuryRate").value || 1),
          capGrowthRate: Number(document.getElementById("settingCapGrowth").value || 0.045),
          cpuTradeAggression: Number(document.getElementById("settingTradeAggression").value || 0.5)
        }
      });
      state.leagueSettings = payload.settings || state.leagueSettings;
      applySettingsControls();
      applyDashboard(payload.state);
    }, "Saving settings...")
  );

  document.getElementById("ownerTeamSelect").addEventListener("change", () =>
    runAction(loadOwner, "Loading owner...")
  );
  document.getElementById("loadOwnerBtn").addEventListener("click", () =>
    runAction(loadOwner, "Loading owner...")
  );
  document.getElementById("saveOwnerBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/owner", {
        method: "POST",
        body: {
          teamId: document.getElementById("ownerTeamSelect").value || state.dashboard?.controlledTeamId,
          ticketPrice: Number(document.getElementById("ownerTicketPriceInput").value || 0) || null,
          staffBudget: Number(document.getElementById("ownerStaffBudgetInput").value || 0) || null,
          training: Number(document.getElementById("ownerTrainingInput").value || 0) || null,
          rehab: Number(document.getElementById("ownerRehabInput").value || 0) || null,
          analytics: Number(document.getElementById("ownerAnalyticsInput").value || 0) || null
        }
      });
      await Promise.all([loadState(), loadOwner(), loadTransactionLog()]);
    }, "Saving owner settings...")
  );

  document.getElementById("loadObservabilityBtn").addEventListener("click", () =>
    runAction(loadObservability, "Loading metrics...")
  );
  document.getElementById("loadPersistenceBtn").addEventListener("click", () =>
    runAction(loadPersistence, "Loading persistence...")
  );
  document.getElementById("runCalibrationJobBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/calibration/jobs", {
        method: "POST",
        body: { year: state.dashboard?.currentYear, samples: 40, label: "ui-run" }
      });
      await loadCalibrationJobs();
    }, "Running calibration job...")
  );
  document.getElementById("runRealismVerifyBtn").addEventListener("click", () =>
    runAction(runRealismVerification, "Running 10-20 year realism verification...")
  );
  document.getElementById("loadPipelineBtn").addEventListener("click", () =>
    runAction(loadPipeline, "Loading pipeline...")
  );
  document.getElementById("advancePipelineBtn").addEventListener("click", () =>
    runAction(async () => {
      await api("/api/offseason/advance", { method: "POST", body: {} });
      await Promise.all([loadState(), loadPipeline(), loadRoster(), loadNews()]);
    }, "Advancing pipeline...")
  );

  document.getElementById("staffTeamSelect").addEventListener("change", () =>
    runAction(loadStaff, "Loading staff...")
  );

  document.getElementById("updateStaffBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = await api("/api/staff", {
        method: "POST",
        body: {
          teamId: document.getElementById("staffTeamSelect").value || state.dashboard?.controlledTeamId,
          role: document.getElementById("staffRoleSelect").value,
          name: document.getElementById("staffNameInput").value.trim() || null,
          playcalling: Number(document.getElementById("staffPlaycallingInput").value || 75),
          development: Number(document.getElementById("staffDevelopmentInput").value || 75),
          discipline: Number(document.getElementById("staffDisciplineInput").value || 75),
          yearsRemaining: Number(document.getElementById("staffYearsInput").value || 3)
        }
      });
      state.staffState = payload.team || state.staffState;
      renderStaff();
      applyDashboard(payload.state);
    }, "Updating staff...")
  );

  document.getElementById("startSimJobBtn").addEventListener("click", () =>
    runAction(async () => {
      const seasons = Number(document.getElementById("jobSeasonsInput").value || 10);
      await api("/api/jobs/simulate", { method: "POST", body: { seasons } });
      await loadSimJobs();
    }, "Starting simulation job...")
  );
  document.getElementById("refreshJobsBtn").addEventListener("click", () =>
    runAction(loadSimJobs, "Refreshing jobs...")
  );

  document.getElementById("prevStatsPageBtn").addEventListener("click", () => {
    state.statsPage = Math.max(1, state.statsPage - 1);
    applyStatsSort();
  });

  document.getElementById("nextStatsPageBtn").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.statsRows.length / state.statsPageSize));
    state.statsPage = Math.min(totalPages, state.statsPage + 1);
    applyStatsSort();
  });

  document.getElementById("loadPlayerTimelineBtn").addEventListener("click", () =>
    runAction(loadPlayerTimeline, "Loading player history...")
  );
  document.getElementById("loadTeamHistoryBtn").addEventListener("click", () => runAction(loadTeamHistory, "Loading team history..."));

  document.getElementById("saveBtn").addEventListener("click", () =>
    runAction(async () => {
      const slot = document.getElementById("saveSlotInput").value.trim();
      await api("/api/saves/save", { method: "POST", body: { slot } });
      await loadSaves();
    }, "Saving league...")
  );

  document.getElementById("loadBtn").addEventListener("click", () =>
    runAction(async () => {
      const slot = document.getElementById("saveSlotInput").value.trim();
      const payload = await api("/api/saves/load", { method: "POST", body: { slot } });
      applyDashboard(payload.state);
      await Promise.all([
        loadRoster(),
        loadFreeAgency(),
        loadStats(),
        loadDraftState(),
        loadScouting(),
        loadDepthChart(),
        loadQa(),
        loadTeamHistory(),
        loadSaves(),
        loadCalendar(),
        loadTransactionLog(),
        loadOwner(),
        loadPipeline(),
        loadObservability(),
        loadCalibrationJobs(),
        loadSimJobs()
      ]);
    }, "Loading save...")
  );

  document.getElementById("deleteSaveBtn").addEventListener("click", () =>
    runAction(async () => {
      const slot = document.getElementById("saveSlotInput").value.trim();
      await api("/api/saves/delete", { method: "POST", body: { slot } });
      await loadSaves();
    }, "Deleting save...")
  );

  document.getElementById("exportSnapshotBtn").addEventListener("click", () =>
    runAction(exportSnapshot, "Exporting snapshot...")
  );
  document.getElementById("importSnapshotBtn").addEventListener("click", () =>
    document.getElementById("snapshotImportInput").click()
  );
  document.getElementById("snapshotImportInput").addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    runAction(async () => {
      await importSnapshot(file);
      event.target.value = "";
    }, "Importing snapshot...");
  });

  document.getElementById("loadQaBtn").addEventListener("click", () => runAction(loadQa, "Loading QA report..."));

  const openCommandPalette = () => {
    document.getElementById("commandPalette").classList.remove("hidden");
    document.getElementById("commandInput").focus();
    renderCommandPalette();
  };
  const closeCommandPalette = () => {
    document.getElementById("commandPalette").classList.add("hidden");
  };
  document.getElementById("closeCommandPaletteBtn")?.addEventListener("click", closeCommandPalette);
  document.getElementById("openGuideBtn")?.addEventListener("click", openGuideModal);
  document.getElementById("closeGuideModalBtn")?.addEventListener("click", closeGuideModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCommandPalette();
      closePlayerModal();
      closeBoxScoreModal();
      closeGuideModal();
      return;
    }
    if (event.key.toLowerCase() === "r" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (document.activeElement?.tagName !== "INPUT") {
        document.getElementById("refreshBtn").click();
      }
    }
  });

  document.addEventListener("click", (event) => {
    const playerButton = event.target.closest("button[data-player-id]");
    if (playerButton) {
      runAction(() => loadPlayerModal(playerButton.dataset.playerId), "Loading player...");
      return;
    }
    const modal = document.getElementById("playerModal");
    if (event.target === modal) closePlayerModal();
    const boxScoreModal = document.getElementById("boxScoreModal");
    if (event.target === boxScoreModal) closeBoxScoreModal();
    const commandModal = document.getElementById("commandPalette");
    if (event.target === commandModal) closeCommandPalette();
    const guideModal = document.getElementById("guideModal");
    if (event.target === guideModal) closeGuideModal();
  });

  document.getElementById("closePlayerModalBtn").addEventListener("click", () => {
    closePlayerModal();
  });
  document.getElementById("closeBoxScoreModalBtn").addEventListener("click", () => {
    closeBoxScoreModal();
  });
}

async function init() {
  state.statsHiddenColumns = readStatsHiddenColumns();
  bindEvents();
  activateTab("overviewTab");
  await refreshEverything();
  setInterval(() => {
    loadSimJobs().catch(() => {});
  }, 8000);
  setStatus("Ready");
}

init();










