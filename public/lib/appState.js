import { createApiClient } from "./api/createApiClient.js";

export const state = {
  prevGmLegacyTier: null,
  prevDashboardPhase: null,
  halftimeTacticChoice: null,
  mentorships: [],
  statLeaders: null,
  brandOverride: null,
  dashboard: null,
  roster: [],
  freeAgents: [],
  contractRoster: [],
  contractTeamId: null,
  contractCap: null,
  negotiationTargets: [],
  selectedContractPlayerId: null,
  selectedDesignationPlayerId: null,
  selectedRetirementOverridePlayerId: null,
  tradeBlockIds: [],
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
  teamHistory: null,
  historyTimeline: null,
  historyPlayerSearchResults: [],
  selectedHistoryPlayerId: null,
  activeTab: "overviewTab",
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
  },
  rewindSnapshots: [],
  speedrunChallenge: null,
  speedrunLeaderboard: []
};

export const DISPLAY_LABELS = {
  ovr: "OVR", pos: "Pos", tm: "Tm", pf: "PF", pa: "PA", pct: "Pct",
  yds: "Yds", td: "TD", tkl: "Tkl", rec: "Rec", tgt: "Tgt", ypr: "YPR",
  passYds: "Pass Yds", passTd: "Pass TD", rushYds: "Rush Yds", rushTd: "Rush TD",
  recYds: "Rec Yds", recTd: "Rec TD", fgm: "FGM", fga: "FGA", xpm: "XPM", xpa: "XPA",
  capHit: "Cap Hit", currCap: "Current Cap", tagCap: "Tag Cap", optionCap: "Option Cap",
  gap: "Need Gap", delta: "Change", snapShare: "Snap Share", season: "Season", age: "Age",
  team: "Team", lg: "Lg", g: "G", gs: "GS", cmpPct: "Cmp%", tdPct: "TD%", intPct: "Int%",
  firstDowns: "1D", ypg: "Y/G", apg: "A/G", recPg: "R/G", tpg: "Tch/G", ypt: "Y/Tgt",
  touch: "Touch", yScr: "YScr", yTch: "Y/Tch", rushYpa: "Y/A", av: "AV", awards: "Awards",
  comb: "Comb", pd: "PD", ff: "FF", fr: "FR", sk: "Sk", nya: "NY/A", anya: "ANY/A"
};

export const GUIDE_SECTIONS = [
  {
    title: "League Setup",
    body: "Start a league from the Main Menu, choose `Drive` or `Play`, choose an era profile, then pick your controlled team. Drive is faster and resolves games by possession. Play resolves more play-level variance and produces richer box scores."
  },
  {
    title: "Era Profiles",
    body: "`Modern Pass` increases passing lean and offensive volatility. `Balanced` stays near a middle-ground NFL baseline. `Legacy` lowers tempo and pushes the league toward more rushing and lower passing volume."
  },
  {
    title: "Season Loop",
    body: "The long loop is regular season -> postseason -> season awards -> retirements -> coaching carousel -> free agency negotiation -> combine -> pro day -> draft -> next regular season. Stage chips and the calendar tell you what the current step expects."
  },
  {
    title: "Core Team Screens",
    body: "Overview tracks standings, recent results, schedule, box scores, and league news. Roster handles active/practice moves and designations. Free Agents is the unsigned market. Depth Chart controls playing-time order. Transactions handles trades and overrides. Contracts handles cap, extensions, negotiation, restructures, trade block, and quick trade actions."
  },
  {
    title: "Scouting And Draft",
    body: "Scouting stays separate from Draft. You start with a capped board, spend weekly scouting points for progressive reveals, lock the board, then use one-click user draft actions while CPU picks stay locked to CPU control."
  },
  {
    title: "Ratings, Physicals, And Development",
    body: "Speed, acceleration, agility, route running, carrying, break tackle, coverage, pass rush, blocking, awareness, and other ratings all feed the sim. Height and weight influence positional frame and physical identity. Potential is seeded at player creation from development trait and ratings, then progression/regression follows age, potential, and seasonal development curves."
  },
  {
    title: "Stats And Profiles",
    body: "Statistics supports season, career, and team views with regular-season, playoff, and combined filters. Player profiles show season-by-season tables, career summaries, team splits, awards, and playoff context. Box scores archive the controlled team's games with scoring summary and play-by-play."
  },
  {
    title: "Settings, History, And Saves",
    body: "Settings controls injuries, chemistry, narratives, comp picks, owner mode, offseason automation, and realism verification. History shows records, champions, awards, team history, and player timelines. Saves, backups, snapshot export/import, and client/server runtime support preserve league continuity."
  }
];

export const STATS_BENCHMARK_HINTS = {
  passing: {
    QB: "Starter-qualified QB baseline: QB1 sample, regular season, about 520 att, 3,725 yds, 25 TD, 11 INT, plus 48 rush att. That is roughly 30.6 att/g, 219.1 yds/g, and 1.5 pass TD/g over 17 games.",
    default: "Passing NFL averages here are starter-qualified QB baselines, not all-player averages. Select QB for the clearest apples-to-apples comparison."
  },
  rushing: {
    QB: "QB rushing baseline: primary starters average about 44 att, 218 yds, and 2 TD over a regular season, or about 2.6 att/g and 12.8 yds/g.",
    RB: "Starter-qualified RB baseline: top two backs per team average about 162 att, 708 rush yds, 6 rush TD, plus 43 targets and 241 rec yds. That is roughly 9.5 carries/g and 41.6 rush yds/g.",
    WR: "WR rushing usage is situational, so NFL rushing baselines are not especially meaningful for this view.",
    TE: "TE rushing usage is situational, so NFL rushing baselines are not especially meaningful for this view.",
    default: "Rushing NFL averages vary hard by position. For true benchmark comparisons, use QB or RB rather than all-player rushing rows."
  },
  receiving: {
    RB: "Receiving RB baseline: starter-qualified backs average about 42 targets, 32 catches, 244 yds, and 2 TD, or about 2.5 targets/g and 14.4 rec yds/g.",
    WR: "Starter-qualified WR baseline: top three receivers per team average about 92 targets, 58 catches, 732 yds, and 5 TD, or about 5.4 targets/g and 43.1 rec yds/g.",
    TE: "Starter-qualified TE baseline: TE1 sample averages about 82 targets, 54 catches, 620 yds, and 5 TD, or about 4.8 targets/g and 36.5 rec yds/g.",
    default: "Receiving NFL averages depend on role. Select WR, TE, or RB for a position-specific starter-qualified benchmark."
  },
  defense: {
    DL: "Starter-qualified DL baseline: top four linemen per team average about 30 tackles, 5.1 sacks, 1.9 pass breakups, and 0.1 INT, or about 1.8 tackles/g and 0.3 sacks/g.",
    LB: "Starter-qualified LB baseline: top three linebackers per team average about 64 tackles, 2.8 sacks, 4 pass breakups, and 0.8 INT, or about 3.8 tackles/g.",
    DB: "Starter-qualified DB baseline: top four defensive backs per team average about 60 tackles, 0.8 sacks, 8.9 pass breakups, and 1.9 INT, or about 3.5 tackles/g and 0.5 pass breakups/g.",
    default: "Defensive NFL averages vary by room. Select DL, LB, or DB to compare against a starter-qualified baseline."
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
    default: "Snap tables are usage views, not NFL-average production baselines. Use them to compare workload, not starter output."
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
