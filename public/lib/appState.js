import { createApiClient } from "./api/createApiClient.js";

export const state = {
  gmLegacy: null,
  prevGmLegacyTier: null,
  halftimeTacticChoice: null,
  mentorships: [],
  statLeaders: null,
  brandOverride: null,
  dashboard: null,
  hydrationAuthority: { epoch: 0, identity: "uninitialized", staleResponsesDiscarded: 0 },
  mobilePendingDecision: null,
  mobilePendingDecisionChoice: null,
  weeklyPlanReceipt: null,
  roster: [],
  rosterWindow: null,
  freeAgents: [],
  contractRoster: [],
  contractTeamId: null,
  contractCap: null,
  negotiationTargets: [],
  selectedContractPlayerId: null,
  selectedDesignationPlayerId: null,
  selectedRetirementOverridePlayerId: null,
  tradeBlockIds: [],
  tradeBlockScope: null,
  tradePlanFingerprint: null,
  tradeAssets: {
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    teamAPickIds: [],
    teamBPickIds: []
  },
  tradeTeamARoster: [],
  tradeTeamBRoster: [],
  tradeTeamAPicks: [],
  tradeTeamBPicks: [],
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
  comparePlayerIds: [],
  comparePlayers: [],
  compareSearchResults: [],
  commandFilter: "",
  retiredPool: [],
  historyView: "season-awards",
  selectedAwardsYear: null,
  selectedDecisionArchiveYear: null,
  decisionArchiveTransactions: [],
  teamHistory: null,
  historyTimeline: null,
  historyPlayerSearchResults: [],
  selectedHistoryPlayerId: null,
  activeTab: "overviewTab",
  statsHiddenColumns: [],
  activePlayerId: null,
  recentBoxScores: [],
  whatIfReplay: null,
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
  },
  rewindSnapshots: [],
  speedrunChallenge: null,
  speedrunLeaderboard: [],
  launchReadiness: {
    publicDomainStatus: null
  }
};

export const DISPLAY_LABELS = {
  ovr: "OVR", pot: "POT", pos: "Pos", tm: "Tm", pf: "PF", pa: "PA", pct: "Pct",
  yds: "Yds", td: "TD", tkl: "Tkl", rec: "Rec", tgt: "Tgt", ypr: "YPR",
  passYds: "Pass Yds", passTd: "Pass TD", rushYds: "Rush Yds", rushTd: "Rush TD",
  recYds: "Rec Yds", recTd: "Rec TD", fgm: "FGM", fga: "FGA", xpm: "XPM", xpa: "XPA",
  capHit: "Cap Hit", currCap: "Current Cap", tagCap: "Tag Cap", optionCap: "Option Cap",
  gap: "Need Gap", delta: "Change", snapShare: "Snap Share", season: "Season", age: "Age",
  team: "Team", g: "G", gs: "GS", cmpPct: "Cmp%", tdPct: "TD%", intPct: "Int%",
  firstDowns: "1D", ypg: "Y/G", apg: "A/G", recPg: "R/G", tpg: "Tch/G", ypt: "Y/Tgt",
  touch: "Touch", yScr: "YScr", yTch: "Y/Tch", rushYpa: "Y/A", av: "AV", awards: "Awards",
  comb: "Comb", pd: "PD", ff: "FF", fr: "FR", sk: "Sk", nya: "NY/A", anya: "ANY/A",
  rate: "Rate", ypa: "Y/A", catchPct: "Catch%", fgPct: "FG%", xpPct: "XP%",
  firstDownPct: "1D%", fmbRate: "Fum%", pressurePct: "Pressure%", penaltyPct: "Penalty%",
  tklPg: "Tkl/G", sackPg: "Sack/G", takeaways: "TA", in20Pct: "In20%", tbPct: "TB%",
  fgM40to49: "FGM 40–49", fgA40to49: "FGA 40–49",
  qbHits: "QB Hits", tfl: "TFL", brkTkl: "Brk Tkl", fmb: "Fum", lng: "Lng",
  offSn: "Off Sn", defSn: "Def Sn", stSn: "ST Sn", totalSn: "Total Sn",
  passBlkSn: "Pass Blk Sn", runBlkSn: "Run Blk Sn", sacksAllowed: "Sacks All",
  pressuresAllowed: "Pressures All", in20: "In 20", tb: "TB", blk: "Blk",
  thirdDown: "3rd Down", fourthDown: "4th Down", redZone: "Red Zone", top: "TOP",
  pass1D: "Pass 1D", rush1D: "Rush 1D"
};

export const GUIDE_SECTIONS = [
  {
    title: "League Setup",
    body: "Pick a team and an era on the start screen, or press Start Your Franchise for a random club. Drive mode resolves games by possession and is faster; Play mode simulates play by play and produces richer box scores. Era profiles set the league's style: Modern Pass throws more, Balanced sits in the middle, and Legacy runs more at a slower tempo."
  },
  {
    title: "Your Week",
    body: "Each week has one rhythm. 1) Read the Desk: the Front Office Advisor names the most important call and why. 2) Make that call: set the depth chart, answer a GM decision, review a trade or contract. 3) Pick a game plan and press Advance Week. Anything that must be settled first is flagged before you can advance."
  },
  {
    title: "Your Season",
    body: "Regular season, trade deadline, playoffs, then awards and retirements. The offseason follows: the coaching carousel, re-signing your own players, free agency, the combine and pro days, and the draft. The calendar and stage chips always show what the current step expects."
  },
  {
    title: "Where Things Live",
    body: "Desk: this week's calls, results and news. Team: roster, depth chart and contracts. Market: free agents and trades. Draft: scouting and the draft room. League: standings, statistics, the league log and your Dynasty history. Club: the Boardroom (owner, facilities, staff) and Settings."
  },
  {
    title: "Scouting And Draft",
    body: "Draft prospects start as estimates. Spend weekly scouting points to sharpen your read, lock your board, then make your picks on the clock. CPU clubs draft on their own boards."
  },
  {
    title: "Ratings And Development",
    body: "Speed, agility, route running, coverage, pass rush, blocking, awareness and the rest all feed the simulation. Height and weight shape a player's frame. Young players grow toward their potential, and veterans decline with age; the offseason development report shows who moved."
  },
  {
    title: "Stats, History, And Saves",
    body: "Statistics covers season, career and team views with regular-season and playoff filters. Dynasty keeps records, champions, awards, the Hall of Fame and player timelines. Your league saves in this browser; Settings has named saves, backups, export and optional cloud sync."
  }
];
export const STATS_BENCHMARK_HINTS = {
  passing: {
    QB: "Starter-qualified QB baseline: QB1 sample, regular season, about 520 att, 3,725 yds, 25 TD, 11 INT, plus 48 rush att. That is roughly 30.6 att/g, 219.1 yds/g, and 1.5 pass TD/g over 17 games.",
    default: "Passing pro averages here are starter-qualified QB baselines, not all-player averages. Select QB for the clearest apples-to-apples comparison."
  },
  rushing: {
    QB: "QB rushing baseline: primary starters average about 44 att, 218 yds, and 2 TD over a regular season, or about 2.6 att/g and 12.8 yds/g.",
    RB: "Starter-qualified RB baseline: top two backs per team average about 162 att, 708 rush yds, 6 rush TD, plus 43 targets and 241 rec yds. That is roughly 9.5 carries/g and 41.6 rush yds/g.",
    WR: "WR rushing usage is situational, so pro rushing baselines are not especially meaningful for this view.",
    TE: "TE rushing usage is situational, so pro rushing baselines are not especially meaningful for this view.",
    default: "Rushing pro averages vary hard by position. For true benchmark comparisons, use QB or RB rather than all-player rushing rows."
  },
  receiving: {
    RB: "Receiving RB baseline: starter-qualified backs average about 42 targets, 32 catches, 244 yds, and 2 TD, or about 2.5 targets/g and 14.4 rec yds/g.",
    WR: "Starter-qualified WR baseline: top three receivers per team average about 92 targets, 58 catches, 732 yds, and 5 TD, or about 5.4 targets/g and 43.1 rec yds/g.",
    TE: "Starter-qualified TE baseline: TE1 sample averages about 82 targets, 54 catches, 620 yds, and 5 TD, or about 4.8 targets/g and 36.5 rec yds/g.",
    default: "Receiving pro averages depend on role. Select WR, TE, or RB for a position-specific starter-qualified benchmark."
  },
  defense: {
    DL: "Starter-qualified DL baseline: top four linemen per team average about 30 tackles, 5.1 sacks, 1.9 pass breakups, and 0.1 INT, or about 1.8 tackles/g and 0.3 sacks/g.",
    LB: "Starter-qualified LB baseline: top three linebackers per team average about 64 tackles, 2.8 sacks, 4 pass breakups, and 0.8 INT, or about 3.8 tackles/g.",
    DB: "Starter-qualified DB baseline: top four defensive backs per team average about 60 tackles, 0.8 sacks, 8.9 pass breakups, and 1.9 INT, or about 3.5 tackles/g and 0.5 pass breakups/g.",
    default: "Defensive pro averages vary by room. Select DL, LB, or DB to compare against a starter-qualified baseline."
  },
  blocking: {
    OL: "Starter-qualified OL baseline: five starters per team average about 14.4 starts in a regular season.",
    default: "Blocking baselines are only meaningful for OL starter samples."
  },
  kicking: {
    K: "Starter-qualified K baseline: regular-season K1 sample averages about 35 FGA, 30 FGM, 38 XPA, and 36 XPM, or about 2.1 FGA/g and 2.2 XPA/g.",
    default: "Kicking baselines are based on one primary kicker per team over the regular season."
  },
  punting: {
    P: "Starter-qualified P baseline: regular-season P1 sample averages about 60 punts, 2,853 yds, and 23 inside-the-20 punts, or about 3.5 punts/g.",
    default: "Punting baselines are based on one primary punter per team over the regular season."
  },
  snaps: {
    default: "Snap tables are usage views, not pro-average production baselines. Use them to compare workload, not starter output."
  },
  team: {
    default: "Team tables are not starter-qualified player baselines. Use QA and analytics panels for league-level scoring and efficiency averages."
  }
};

export const TEAM_THEME_MAP = {
  ARI: { primary: "#97233f", secondary: "#ffb612", tertiary: "#000000" },
  ATL: { primary: "#a71930", secondary: "#000000", tertiary: "#a5acaf" },
  BAL: { primary: "#241773", secondary: "#9e7c0c", tertiary: "#c60c30" },
  BUF: { primary: "#00338d", secondary: "#c60c30", tertiary: "#5bc2e7" },
  CAR: { primary: "#0085ca", secondary: "#101820", tertiary: "#bfc0bf" },
  CHI: { primary: "#0b162a", secondary: "#c83803", tertiary: "#a5acaf" },
  CIN: { primary: "#fb4f14", secondary: "#000000", tertiary: "#ffffff" },
  CLE: { primary: "#311d00", secondary: "#ff3c00", tertiary: "#ffffff" },
  DAL: { primary: "#003594", secondary: "#869397", tertiary: "#041e42" },
  DEN: { primary: "#fb4f14", secondary: "#002244", tertiary: "#ffffff" },
  DET: { primary: "#0076b6", secondary: "#b0b7bc", tertiary: "#000000" },
  GB: { primary: "#203731", secondary: "#ffb612", tertiary: "#ffffff" },
  HOU: { primary: "#03202f", secondary: "#a71930", tertiary: "#ffffff" },
  IND: { primary: "#002c5f", secondary: "#a2aaad", tertiary: "#ffffff" },
  JAX: { primary: "#006778", secondary: "#9f792c", tertiary: "#101820" },
  KC: { primary: "#e31837", secondary: "#ffb81c", tertiary: "#ffffff" },
  LAC: { primary: "#0080c6", secondary: "#ffc20e", tertiary: "#ffffff" },
  LAR: { primary: "#003594", secondary: "#ffd100", tertiary: "#ffffff" },
  LV: { primary: "#000000", secondary: "#a5acaf", tertiary: "#ffffff" },
  MIA: { primary: "#008e97", secondary: "#fc4c02", tertiary: "#005778" },
  MIN: { primary: "#4f2683", secondary: "#ffc62f", tertiary: "#ffffff" },
  NE: { primary: "#002244", secondary: "#c60c30", tertiary: "#b0b7bc" },
  NO: { primary: "#101820", secondary: "#d3bc8d", tertiary: "#ffffff" },
  NYG: { primary: "#0b2265", secondary: "#a71930", tertiary: "#ffffff" },
  NYJ: { primary: "#125740", secondary: "#000000", tertiary: "#ffffff" },
  PHI: { primary: "#004c54", secondary: "#a5acaf", tertiary: "#000000" },
  PIT: { primary: "#101820", secondary: "#ffb612", tertiary: "#ffffff" },
  SEA: { primary: "#002244", secondary: "#69be28", tertiary: "#a5acaf" },
  SF: { primary: "#aa0000", secondary: "#b3995d", tertiary: "#000000" },
  TB: { primary: "#d50a0a", secondary: "#34302b", tertiary: "#ff7900" },
  TEN: { primary: "#0c2340", secondary: "#4b92db", tertiary: "#c8102e" },
  WAS: { primary: "#5a1414", secondary: "#ffb612", tertiary: "#ffffff" }
};

export const api = createApiClient();
