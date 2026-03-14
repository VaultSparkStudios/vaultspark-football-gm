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
  historyPlayerSearchResults: [],
  selectedHistoryPlayerId: null,
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
  gap: "Need Gap",
  delta: "Change",
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
      "The long loop is regular season -> postseason -> season awards -> retirements -> coaching carousel -> free agency negotiation -> combine -> pro day -> draft -> next regular season. Stage chips and the calendar tell you what the current step expects."
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

const STATS_BENCHMARK_HINTS = {
  passing: {
    QB: "Starter-qualified QB baseline: QB1 sample, regular season, about 520 att, 3,725 yds, 25 TD, 11 INT, plus 48 rush att. That is roughly 30.6 att/g, 219.1 yds/g, and 1.5 pass TD/g over 17 games.",
    default:
      "Passing NFL averages here are starter-qualified QB baselines, not all-player averages. Select QB for the clearest apples-to-apples comparison."
  },
  rushing: {
    QB: "QB rushing baseline: primary starters average about 44 att, 218 yds, and 2 TD over a regular season, or about 2.6 att/g and 12.8 yds/g.",
    RB: "Starter-qualified RB baseline: top two backs per team average about 162 att, 708 rush yds, 6 rush TD, plus 43 targets and 241 rec yds. That is roughly 9.5 carries/g and 41.6 rush yds/g.",
    WR: "WR rushing usage is situational, so NFL rushing baselines are not especially meaningful for this view.",
    TE: "TE rushing usage is situational, so NFL rushing baselines are not especially meaningful for this view.",
    default:
      "Rushing NFL averages vary hard by position. For true benchmark comparisons, use QB or RB rather than all-player rushing rows."
  },
  receiving: {
    RB: "Receiving RB baseline: starter-qualified backs average about 42 targets, 32 catches, 244 yds, and 2 TD, or about 2.5 targets/g and 14.4 rec yds/g.",
    WR: "Starter-qualified WR baseline: top three receivers per team average about 92 targets, 58 catches, 732 yds, and 5 TD, or about 5.4 targets/g and 43.1 rec yds/g.",
    TE: "Starter-qualified TE baseline: TE1 sample averages about 82 targets, 54 catches, 620 yds, and 5 TD, or about 4.8 targets/g and 36.5 rec yds/g.",
    default:
      "Receiving NFL averages depend on role. Select WR, TE, or RB for a position-specific starter-qualified benchmark."
  },
  defense: {
    DL: "Starter-qualified DL baseline: top four linemen per team average about 30 tackles, 5.1 sacks, 1.9 pass breakups, and 0.1 INT, or about 1.8 tackles/g and 0.3 sacks/g.",
    LB: "Starter-qualified LB baseline: top three linebackers per team average about 64 tackles, 2.8 sacks, 4 pass breakups, and 0.8 INT, or about 3.8 tackles/g.",
    DB: "Starter-qualified DB baseline: top four defensive backs per team average about 60 tackles, 0.8 sacks, 8.9 pass breakups, and 1.9 INT, or about 3.5 tackles/g and 0.5 pass breakups/g.",
    default:
      "Defensive NFL averages vary by room. Select DL, LB, or DB to compare against a starter-qualified baseline."
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
    default:
      "Snap tables are usage views, not NFL-average production baselines. Use them to compare workload, not starter output."
  },
  team: {
    default:
      "Team tables are not starter-qualified player baselines. Use QA and analytics panels for league-level scoring and efficiency averages."
  }
};

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

function hashStringLocal(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function portraitChoice(seed, items, offset = 0) {
  const index = Math.abs((seed + offset) % items.length);
  return items[index];
}

function playerBodyTypeLabel(player) {
  const position = String(player?.position || "").toUpperCase();
  const height = Number(player?.heightInches || 75);
  const weight = Number(player?.weightLbs || 225);
  if (position === "OL") return weight >= 325 ? "Massive edge-protector frame" : "Athletic interior line frame";
  if (position === "DL") return weight >= 295 ? "Power trench frame" : "Long-limbed edge rusher frame";
  if (position === "LB") return weight >= 245 ? "Downhill stack linebacker build" : "Sideline pursuit linebacker build";
  if (position === "TE") return weight >= 255 ? "In-line tight end frame" : "Detached move tight end frame";
  if (position === "RB") return weight >= 220 ? "Dense power-back build" : "Compact acceleration-back build";
  if (position === "WR") return height >= 75 ? "Boundary X-receiver build" : "Lean space-creator build";
  if (position === "DB") return weight >= 205 ? "Press-corner safety frame" : "Lean recovery-speed frame";
  if (position === "QB") return height >= 76 ? "Tall pocket-passer frame" : "Compact movement-passer frame";
  return "NFL-caliber frame";
}

function buildPlayerPortraitSvg(player) {
  const seed = hashStringLocal(player?.profile?.faceSeed || `${player?.id || ""}-${player?.name || ""}`);
  const height = Number(player?.heightInches || 75);
  const weight = Number(player?.weightLbs || 225);
  const position = String(player?.position || "QB").toUpperCase();
  const skin = portraitChoice(seed, ["#f2d6bf", "#e6c1a1", "#d6a57f", "#b97d58", "#8c5a3d"]);
  const hair = portraitChoice(seed, ["#2a1e1a", "#3c2d25", "#5d4938", "#1f2528", "#5b5d61"], 7);
  const eyes = portraitChoice(seed, ["#2d3d4e", "#3f4b2f", "#5b422d", "#2b2a30"], 11);
  const jersey = portraitChoice(seed, ["#375e56", "#6d4b28", "#4d5b77", "#6b3535", "#34516f"], 17);
  const jerseyStripe = portraitChoice(seed, ["#f4c97a", "#7bc4d7", "#d8ede8", "#f5efe0"], 23);
  const shadowTone = "#081014";
  const sternSet = position === "OL" || position === "DL" || position === "LB";
  const mouth =
    sternSet
      ? "M86 157 Q110 155 134 157"
      : position === "DB" || position === "WR"
        ? "M88 156 Q110 152 132 156"
        : portraitChoice(seed, ["M85 156 Q110 158 135 156", "M87 157 Q110 154 133 157", "M88 155 Q110 153 132 155"], 29);
  const browTilt = sternSet ? -2 + (seed % 3) : (seed % 5) - 2;
  const jawWidth = 44 + (seed % 10) + Math.round((weight - 205) / 18) + (sternSet ? 4 : 0);
  const faceHeight = 56 + ((seed >> 3) % 8) + Math.max(0, Math.round((height - 74) / 3));
  const eyeY = 106 + ((seed >> 5) % 6);
  const noseY = 123 + ((seed >> 7) % 5);
  const hairVariant = seed % 4;
  const facialHairVariant = (seed >> 4) % 5;
  const portraitId = `portrait-${seed}`;
  const sizeBias =
    position === "OL" || position === "DL"
      ? 18
      : position === "LB" || position === "TE"
        ? 12
        : position === "RB"
          ? 8
          : position === "WR" || position === "DB"
            ? 2
            : 6;
  const shoulderWidth = Math.max(66, Math.min(92, Math.round(62 + (weight - 190) / 4 + sizeBias)));
  const chestWidth = Math.max(54, shoulderWidth - (position === "WR" || position === "DB" ? 12 : 8));
  const waistWidth = Math.max(42, chestWidth - (position === "OL" || position === "DL" ? 3 : position === "RB" || position === "LB" ? 8 : 12));
  const neckWidth = Math.max(22, Math.min(42, Math.round(22 + (weight - 190) / 9 + sizeBias / 5)));
  const trapRise = Math.max(8, Math.min(22, Math.round((weight - 185) / 10 + 8)));
  const chestY = 194;
  const waistY = 224;
  const torsoBottom = 252;
  const shoulderY = 170 - Math.max(0, Math.round((height - 74) / 2));
  const padRise = sternSet ? 15 : position === "RB" || position === "TE" ? 12 : 9;
  const torsoShadow = sternSet ? 0.38 : 0.28;
  const leftShoulder = 110 - shoulderWidth;
  const rightShoulder = 110 + shoulderWidth;
  const leftChest = 110 - chestWidth;
  const rightChest = 110 + chestWidth;
  const leftWaist = 110 - waistWidth;
  const rightWaist = 110 + waistWidth;
  const jerseyShadow = `${jersey}cc`;
  const eyeRx = sternSet ? 10.5 : position === "WR" || position === "DB" ? 12.5 : 11.5;
  const eyeRy = sternSet ? 5.4 : 7.4;
  const pupilRadius = sternSet ? 4.8 : 4;
  const noseStroke = sternSet ? "#7d4a35" : "#8c5e45";
  const hairPaths = [
    `<path d="M58 95 C66 48, 154 44, 162 96 C149 76, 132 68, 110 66 C88 68, 70 76, 58 95 Z" fill="${hair}" />`,
    `<path d="M52 101 C62 42, 158 40, 170 103 C146 84, 132 77, 111 75 C90 77, 73 86, 52 101 Z" fill="${hair}" />`,
    `<path d="M58 97 C70 54, 151 48, 164 98 C155 82, 143 71, 128 67 C102 59, 79 70, 58 97 Z" fill="${hair}" />`,
    `<path d="M50 101 C62 58, 160 49, 169 105 C156 89, 136 76, 110 74 C84 76, 66 87, 50 101 Z" fill="${hair}" />`
  ];
  const facialHair = [
    "",
    `<path d="M86 160 Q110 168 134 160" fill="none" stroke="${hair}" stroke-width="5" stroke-linecap="round" />`,
    `<path d="M85 164 Q110 186 135 164" fill="${hair}" opacity="0.92" />`,
    `<path d="M89 149 Q110 156 131 149" fill="none" stroke="${hair}" stroke-width="4" stroke-linecap="round" />`,
    `<path d="M82 161 Q110 173 138 161" fill="none" stroke="${hair}" stroke-width="6" stroke-linecap="round" opacity="0.84" />`
  ];
  const beard = sternSet && facialHairVariant === 0 ? facialHair[4] : facialHair[facialHairVariant];

  return `
    <svg class="player-portrait-svg" viewBox="0 0 220 260" aria-label="${escapeHtml(player?.name || "Player")} portrait">
      <defs>
        <linearGradient id="${portraitId}-bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#24343b" />
          <stop offset="100%" stop-color="#10181c" />
        </linearGradient>
        <linearGradient id="${portraitId}-skin" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${skin}" />
          <stop offset="100%" stop-color="${skin}dd" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="220" height="260" rx="28" fill="url(#${portraitId}-bg)" />
      <circle cx="46" cy="38" r="26" fill="${jersey}" opacity="0.1" />
      <circle cx="186" cy="52" r="18" fill="${jerseyStripe}" opacity="0.08" />
      <path d="M${leftShoulder - 8} ${shoulderY + padRise} Q110 ${shoulderY - 22} ${rightShoulder + 8} ${shoulderY + padRise} L${rightChest + 2} ${chestY - 6} Q110 ${chestY - 26} ${leftChest - 2} ${chestY - 6} Z" fill="${shadowTone}" opacity="0.45" />
      <path d="M${leftShoulder} ${shoulderY + trapRise} Q110 ${shoulderY - 12} ${rightShoulder} ${shoulderY + trapRise} L${rightChest} ${chestY} L${rightWaist} ${waistY} Q110 ${torsoBottom + 4} ${leftWaist} ${waistY} L${leftChest} ${chestY} Z" fill="${jersey}" />
      <path d="M${leftShoulder + 8} ${shoulderY + trapRise + 4} Q110 ${shoulderY - 4} ${rightShoulder - 8} ${shoulderY + trapRise + 4}" fill="none" stroke="${jerseyStripe}" stroke-width="9" opacity="0.95" stroke-linecap="round" />
      <path d="M${leftChest + 6} ${chestY + 4} Q110 ${chestY - 10} ${rightChest - 6} ${chestY + 4}" fill="none" stroke="${jerseyShadow}" stroke-width="18" opacity="${torsoShadow}" stroke-linecap="round" />
      <path d="M82 188 Q110 207 138 188" fill="none" stroke="${shadowTone}" stroke-width="9" opacity="0.28" stroke-linecap="round" />
      <rect x="${110 - neckWidth / 2}" y="154" width="${neckWidth}" height="34" rx="12" fill="${skin}" opacity="0.95" />
      <ellipse cx="110" cy="112" rx="${jawWidth}" ry="${faceHeight}" fill="url(#${portraitId}-skin)" />
      <ellipse cx="61" cy="118" rx="8" ry="14" fill="${skin}" opacity="0.92" />
      <ellipse cx="159" cy="118" rx="8" ry="14" fill="${skin}" opacity="0.92" />
      ${hairPaths[hairVariant]}
      <path d="M69 ${92 + browTilt} Q86 ${84 + browTilt} 98 ${91 + browTilt}" fill="none" stroke="${hair}" stroke-width="4" stroke-linecap="round" />
      <path d="M122 ${91 - browTilt} Q135 ${84 - browTilt} 151 ${92 - browTilt}" fill="none" stroke="${hair}" stroke-width="4" stroke-linecap="round" />
      <ellipse cx="86" cy="${eyeY}" rx="${eyeRx}" ry="${eyeRy}" fill="#f4f1eb" />
      <ellipse cx="134" cy="${eyeY}" rx="${eyeRx}" ry="${eyeRy}" fill="#f4f1eb" />
      <circle cx="86" cy="${eyeY}" r="${pupilRadius}" fill="${eyes}" />
      <circle cx="134" cy="${eyeY}" r="${pupilRadius}" fill="${eyes}" />
      <circle cx="84" cy="${eyeY - 2}" r="1.4" fill="#ffffff" opacity="0.85" />
      <circle cx="132" cy="${eyeY - 2}" r="1.4" fill="#ffffff" opacity="0.85" />
      <path d="M110 ${noseY} Q101 ${noseY + 17} 110 ${noseY + 23} Q119 ${noseY + 17} 110 ${noseY}" fill="none" stroke="${noseStroke}" stroke-width="3" stroke-linecap="round" />
      <path d="${mouth}" fill="none" stroke="#7d453f" stroke-width="3" stroke-linecap="round" />
      ${beard}
    </svg>
  `;
}

function buildProfileLatestSeasonSummary(position, entry) {
  if (!entry) return "No season production recorded yet.";
  const stats = entry.stats || {};
  const games = stats.games || 0;
  if (position === "QB") {
    return `${entry.year}: ${stats.passing?.yards || 0} pass yds, ${stats.passing?.td || 0} TD, ${stats.passing?.int || 0} INT in ${games} G.`;
  }
  if (position === "RB") {
    return `${entry.year}: ${stats.rushing?.yards || 0} rush yds, ${stats.rushing?.td || 0} rush TD, ${stats.receiving?.yards || 0} rec yds in ${games} G.`;
  }
  if (position === "WR" || position === "TE") {
    return `${entry.year}: ${stats.receiving?.rec || 0} rec, ${stats.receiving?.yards || 0} yds, ${stats.receiving?.td || 0} TD in ${games} G.`;
  }
  if (position === "OL") {
    return `${entry.year}: ${stats.gamesStarted || 0} starts across ${games} games played.`;
  }
  if (position === "K" || position === "P") {
    return `${entry.year}: ${stats.kicking?.fgm || 0}/${stats.kicking?.fga || 0} FG, ${stats.kicking?.xpm || 0}/${stats.kicking?.xpa || 0} XP, ${stats.punting?.in20 || 0} punts inside the 20.`;
  }
  return `${entry.year}: ${stats.defense?.tackles || 0} tackles, ${stats.defense?.sacks || 0} sacks, ${stats.defense?.int || 0} INT in ${games} G.`;
}

function renderPlayerProfileHero(profile) {
  const player = profile.player || {};
  const outlook = profile.developmentOutlook || {};
  const careerSummary = buildProfileCareerRow(profile)?.[0] || {};
  const awardsCount = (profile.awardsHistory || []).length;
  const latestSeason = (profile.timeline || []).slice().sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
  const latestSeasonRow = buildProfileSeasonRows(profile).slice().sort((a, b) => (b.season || 0) - (a.season || 0))[0] || null;
  const latestAv = latestSeasonRow?.av ?? 0;
  const contract = player.contract || {};
  const injury = player.injury?.type ? `${player.injury.type}${player.injury.weeksRemaining ? ` (${player.injury.weeksRemaining}w)` : ""}` : "Healthy";
  const contractLabel = contract.yearsRemaining
    ? `${fmtMoney(contract.salary || 0)} salary | ${contract.yearsRemaining} yrs left`
    : "No active long-term deal";
  const latestSeasonSummary = buildProfileLatestSeasonSummary(player.position, latestSeason);
  const badges = [
    `${teamCode(player.teamId)} ${player.position}`,
    `#${player.jerseyNumber ?? "--"}`,
    `OVR ${player.overall ?? "-"}`,
    `Potential ${player.potential ?? "-"}`,
    `${player.developmentTrait || "Steady"} Dev`,
    `${player.rosterSlot || "active"} Slot`
  ];

  return `
    <div class="player-hero">
      <div class="player-portrait-card">${buildPlayerPortraitSvg(player)}</div>
      <div class="player-overview">
        <div class="player-nameplate">
          <div class="brand-kicker">Player Dossier</div>
          <strong>${escapeHtml(player.name || "Player")}</strong>
          <div>${escapeHtml(teamDisplayFromId(player.teamId) || player.teamName || player.teamId || "-")} | ${escapeHtml(player.position || "-")} | Experience ${escapeHtml(player.experience || 0)}</div>
        </div>
        <div class="profile-badge-row">
          ${badges.map((badge) => `<span class="profile-badge">${escapeHtml(badge)}</span>`).join("")}
        </div>
        <div class="player-meta-grid">
          <div class="player-meta-card">
            <strong>Frame</strong>
            <div>${escapeHtml(formatHeight(player.heightInches))} / ${escapeHtml(player.weightLbs || "-")} lbs</div>
            <div class="small">${escapeHtml(playerBodyTypeLabel(player))} | Scheme fit ${escapeHtml(outlook.fitLabel || "-")} (${escapeHtml(outlook.fit ?? "-")})</div>
          </div>
          <div class="player-meta-card">
            <strong>Contract</strong>
            <div>${escapeHtml(contractLabel)}</div>
            <div class="small">Cap ${escapeHtml(fmtMoney(contract.capHit || 0))} | Guaranteed ${escapeHtml(fmtMoney(contract.guaranteed || 0))}</div>
          </div>
          <div class="player-meta-card">
            <strong>Development</strong>
            <div>${escapeHtml(outlook.trajectory || "steady")}</div>
            <div class="small">Weekly focus ${escapeHtml(outlook.weeklyPlan || "-")}</div>
          </div>
          <div class="player-meta-card">
            <strong>Availability</strong>
            <div>${escapeHtml(injury)}</div>
            <div class="small">Status ${escapeHtml(player.status || player.rosterSlot || "active")} | Morale ${escapeHtml(player.morale || "-")}</div>
          </div>
          <div class="player-meta-card">
            <strong>Career Resume</strong>
            <div>Seasons ${escapeHtml(profile.timeline?.length || 0)} | Awards ${escapeHtml(awardsCount)}</div>
            <div class="small">Career AV ${escapeHtml(careerSummary.av ?? 0)} | Latest AV ${escapeHtml(latestAv)}</div>
          </div>
          <div class="player-meta-card">
            <strong>Latest Season</strong>
            <div class="player-statline">${escapeHtml(latestSeasonSummary)}</div>
            <div class="small">${escapeHtml(profile.seasonType === "playoffs" ? "Filtered to playoffs" : "Regular-season lens with career context below")}</div>
          </div>
        </div>
        <div class="player-note">
          Morale ${escapeHtml(player.morale || "-")} | Motivation ${escapeHtml(player.motivation || "-")} | Owner pressure ${escapeHtml(outlook.ownerPressure ?? "-")} | Legacy score ${escapeHtml(outlook.legacyScore ?? "-")}<br />
          Focus ratings: ${escapeHtml((outlook.focusRatings || []).map((rating) => toTitleCaseKey(rating)).join(", ") || "-")}
        </div>
      </div>
    </div>
  `;
}

function setStatus(text) {
  const el = document.getElementById("statusChip");
  if (el) el.textContent = text;
}

function appendAvLast(row, av) {
  return { ...row, av: av ?? 0 };
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

function formatActionError(error) {
  const reasonCode = error?.reasonCode || error?.payload?.reasonCode;
  if (reasonCode === "challenge-free-agency") {
    return "Challenge mode blocks free-agent adds, waiver claims, and forced comeback signings for this franchise.";
  }
  if (reasonCode === "challenge-top10-picks") {
    return "Challenge mode blocks the controlled team from acquiring or using top-10 draft picks.";
  }
  return error?.message || "Unexpected error.";
}

function presentActionError(error) {
  const message = formatActionError(error);
  const reasonCode = error?.reasonCode || error?.payload?.reasonCode || "";
  const prefix = reasonCode.startsWith("challenge-") ? "Blocked" : "Error";
  setStatus(`${prefix}: ${message}`);
  showToast(`${prefix}: ${message}`);
}

function teamName(teamId) {
  return state.dashboard?.teams?.find((team) => team.id === teamId)?.name || teamId;
}

function teamByCode(teamId) {
  return state.dashboard?.teams?.find((team) => team.id === teamId) || null;
}

function teamCode(teamId) {
  if (!teamId || ["FA", "WAIVER", "TIE", "TBD", "ALL"].includes(teamId)) return teamId || "-";
  return teamByCode(teamId)?.abbrev || teamId;
}

function teamDisplayFromId(teamId) {
  const team = teamByCode(teamId);
  return team ? `${team.abbrev || team.id} - ${team.name}` : teamId || "-";
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

function buildProfileSeasonAvMap(profile) {
  const category =
    profile.player.position === "QB"
      ? "passing"
      : profile.player.position === "RB"
        ? "rushing"
        : profile.player.position === "WR" || profile.player.position === "TE"
          ? "receiving"
          : profile.player.position === "K"
            ? "kicking"
            : profile.player.position === "P"
              ? "punting"
              : profile.player.position === "OL"
                ? "blocking"
                : "defense";
  return new Map((profile.seasonRows?.[category] || []).map((row) => [row.year, row.av ?? 0]));
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
  const avByYear = buildProfileSeasonAvMap(profile);
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
      return appendAvLast({
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
        awards: formatAwards(entry.awards, entry.champion)
      }, avByYear.get(entry.year));
    }
    if (position === "RB") {
      const scrimmageYards = (rushing.yards || 0) + (receiving.yards || 0);
      const touches = (rushing.att || 0) + (receiving.rec || 0);
      return appendAvLast({
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
        awards: formatAwards(entry.awards, entry.champion)
      }, avByYear.get(entry.year));
    }
    if (position === "WR" || position === "TE") {
      const scrimmageYards = (rushing.yards || 0) + (receiving.yards || 0);
      const touches = (rushing.att || 0) + (receiving.rec || 0);
      return appendAvLast({
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
        awards: formatAwards(entry.awards, entry.champion)
      }, avByYear.get(entry.year));
    }
    if (position === "K" || position === "P") {
      const kicking = stats.kicking || {};
      const punting = stats.punting || {};
      return appendAvLast({
        ...common,
        fgm: kicking.fgm || 0,
        fga: kicking.fga || 0,
        fgPct: Number((((kicking.fgm || 0) / Math.max(1, kicking.fga || 0)) * 100).toFixed(1)),
        xpm: kicking.xpm || 0,
        xpa: kicking.xpa || 0,
        punts: punting.punts || 0,
        in20: punting.in20 || 0,
        awards: formatAwards(entry.awards, entry.champion)
      }, avByYear.get(entry.year));
    }
    return appendAvLast({
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
      awards: formatAwards(entry.awards, entry.champion)
    }, avByYear.get(entry.year));
  });
}

function buildProfileCareerRow(profile) {
  const player = profile.player;
  const category =
    player.position === "QB"
      ? "passing"
      : player.position === "RB"
        ? "rushing"
        : player.position === "WR" || player.position === "TE"
          ? "receiving"
          : player.position === "K"
            ? "kicking"
            : player.position === "P"
              ? "punting"
              : player.position === "OL"
                ? "blocking"
                : "defense";
  const careerAv = profile.career?.[category]?.av ?? 0;
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
    return [appendAvLast({
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
      sk: passing.sacks || 0
    }, careerAv)];
  }
  if (player.position === "RB") {
    const touch = (rushing.att || 0) + (receiving.rec || 0);
    const yScr = (rushing.yds || 0) + (receiving.yds || 0);
    return [appendAvLast({
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
      fmb: rushing.fmb || 0
    }, careerAv)];
  }
  if (player.position === "WR" || player.position === "TE") {
    const touch = (rushing.att || 0) + (receiving.rec || 0);
    const yScr = (rushing.yds || 0) + (receiving.yds || 0);
    return [appendAvLast({
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
      yScr
    }, careerAv)];
  }
  if (player.position === "K" || player.position === "P") {
    const kicking = profile.career?.kicking || {};
    const punting = profile.career?.punting || {};
    return [appendAvLast({
      season: "Career",
      seasons,
      fgm: kicking.fgm || 0,
      fga: kicking.fga || 0,
      fgPct: kicking.fgPct || 0,
      xpm: kicking.xpm || 0,
      xpa: kicking.xpa || 0,
      punts: punting.punts || 0,
      in20: punting.in20 || 0
    }, careerAv)];
  }
  return [appendAvLast({
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
    qbHits: defense.qbHits || 0
  }, careerAv)];
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
      return appendAvLast({
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
      }, row.av);
    }
    if (category === "rushing") {
      const receiving = rushingCompanion.get(rowJoinKey(row)) || {};
      const touch = (row.att || 0) + (receiving.rec || 0);
      const yScr = (row.yds || 0) + (receiving.yds || 0);
      return appendAvLast({
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
      }, row.av);
    }
    if (category === "receiving") {
      const rushing = receivingCompanion.get(rowJoinKey(row)) || {};
      const touch = (rushing.att || 0) + (row.rec || 0);
      const yScr = (rushing.yds || 0) + (row.yds || 0);
      return appendAvLast({
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
      }, row.av);
    }
    if (category === "defense") {
      return appendAvLast({
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
      }, row.av);
    }
    return appendAvLast({ ...common, ...row }, row.av);
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

function createEmptyTradeAssets() {
  return {
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    teamAPickIds: [],
    teamBPickIds: []
  };
}

function tradeAssetKeys(side) {
  return side === "A"
    ? { playerKey: "teamAPlayerIds", pickKey: "teamAPickIds", rosterKey: "tradeTeamARoster", picksKey: "tradeTeamAPicks" }
    : { playerKey: "teamBPlayerIds", pickKey: "teamBPickIds", rosterKey: "tradeTeamBRoster", picksKey: "tradeTeamBPicks" };
}

function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter(Boolean))];
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
  if (entry.type === "signing") return `from ${teamCode(d.from || "FA")} | cap ${fmtMoney(d.capHit)} | ${d.yearsRemaining || 0}y`;
  if (entry.type === "release") {
    const wire = d.toWaivers ? "waivers" : teamCode(d.destination || "FA");
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
  if (entry.type === "retirement-override") return `team ${teamCode(d.teamId || "FA")} | min win ${Math.round((d.minWinningPct || 0.55) * 100)}%`;
  if (entry.type === "championship") return `beat ${teamCode(d.runnerUp || "-")} | ${d.score || ""}`;
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
  const weeklyPlan = d.controlledTeam?.weeklyPlan || {};
  const expectation = d.controlledTeam?.owner?.expectation || {};
  const culture = d.controlledTeam?.cultureProfile || {};
  const box = document.getElementById("weeklyPlanSummaryText");
  if (box) {
    const lines = [];
    if (weeklyPlan.summary) lines.push(`Weekly plan: ${weeklyPlan.summary}.`);
    if (weeklyPlan.exploit) lines.push(`Exploit: ${weeklyPlan.exploit}.`);
    if (weeklyPlan.warning) lines.push(`Watch: ${weeklyPlan.warning}.`);
    if (culture.identity) lines.push(`Culture: ${culture.identity}.`);
    if (expectation.mandate) {
      lines.push(`Owner mandate: ${expectation.mandate} (${expectation.trend || "watch"}, heat ${expectation.heat ?? "-"}).`);
    }
    box.textContent = lines.join(" ") || "Weekly plan, locker-room pressure, and owner mandate updates will appear here.";
  }
  renderOverviewSpotlight();
}

function renderOverviewSpotlight() {
  const d = state.dashboard;
  if (!d) return;
  const controlledTeam = d.controlledTeam || {};
  const expectation = controlledTeam.owner?.expectation || {};
  const weeklyPlan = controlledTeam.weeklyPlan || {};
  const culture = controlledTeam.cultureProfile || {};
  const scheme = controlledTeam.schemeIdentity || {};
  const standingsRow =
    (d.latestStandings || []).find(
      (row) =>
        row.team === controlledTeam.abbrev ||
        row.team === controlledTeam.id ||
        row.teamName === controlledTeam.name
    ) || null;
  const topNeed = (d.rosterNeeds || [])
    .slice()
    .sort((a, b) => a.delta - b.delta || a.position.localeCompare(b.position))[0];
  const recordLabel = standingsRow
    ? `${standingsRow.wins}-${standingsRow.losses}${standingsRow.ties ? `-${standingsRow.ties}` : ""}`
    : "0-0";
  const teamLabel = [controlledTeam.city, controlledTeam.nickname].filter(Boolean).join(" ") || controlledTeam.name || controlledTeam.id || "-";
  const schemeLabel = [scheme.offense, scheme.defense].filter(Boolean).join(" / ") || controlledTeam.scheme || "Balanced";
  const spotlight = document.getElementById("overviewTeamSpotlight");
  if (spotlight) {
    spotlight.innerHTML = `
      <div class="overview-team-mark">
        <div class="overview-team-label">${escapeHtml(teamLabel)}</div>
        <div class="overview-team-meta">
          ${escapeHtml(controlledTeam.abbrev || controlledTeam.id || "-")} | ${escapeHtml(standingsRow?.conference || controlledTeam.conference || "-")} ${escapeHtml(standingsRow?.division || controlledTeam.division || "")} | Record ${escapeHtml(recordLabel)}
        </div>
      </div>
      <div class="overview-team-grid">
        <div class="overview-team-card">
          <strong>Competitive Window</strong>
          <div>${escapeHtml(expectation.mandate || "Build sustainably")}</div>
          <div class="small">Projected wins ${escapeHtml(expectation.projectedWins ?? "-")} | Target ${escapeHtml(expectation.targetWins ?? "-")}</div>
        </div>
        <div class="overview-team-card">
          <strong>Identity</strong>
          <div>${escapeHtml(culture.identity || "Balanced culture")}</div>
          <div class="small">${escapeHtml(schemeLabel)} | Chemistry ${escapeHtml(controlledTeam.chemistry ?? "-")}</div>
        </div>
      <div class="overview-team-card">
        <strong>Primary Need</strong>
        <div>${escapeHtml(topNeed ? `${topNeed.position} room` : "No urgent weakness")}</div>
        <div class="small">${escapeHtml(topNeed ? `${Math.abs(topNeed.delta)} players short of the target ${topNeed.target}` : "Roster shape is on target")}</div>
      </div>
        <div class="overview-team-card">
          <strong>Game Plan</strong>
          <div>${escapeHtml(weeklyPlan.focus || weeklyPlan.summary || "Balanced script")}</div>
          <div class="small">${escapeHtml(weeklyPlan.exploit || weeklyPlan.warning || "No weekly exploit flagged yet")}</div>
        </div>
      </div>
    `;
  }
  const pulse = document.getElementById("overviewPulseBar");
  if (pulse) {
    const chips = [
      expectation.trend ? `Heat ${expectation.heat ?? "-"} | ${expectation.trend}` : null,
      culture.pressure ? `Culture pressure ${culture.pressure}` : null,
      weeklyPlan.exploit ? `Exploit ${weeklyPlan.exploit}` : null,
      weeklyPlan.warning ? `Watch ${weeklyPlan.warning}` : null,
      scheme.offense ? `Offense ${scheme.offense}` : null,
      scheme.defense ? `Defense ${scheme.defense}` : null
    ].filter(Boolean);
    pulse.innerHTML = chips.length
      ? chips.map((chip) => `<span class="overview-pulse-chip">${escapeHtml(chip)}</span>`).join("")
      : `<span class="overview-pulse-chip">Refresh to load franchise signals</span>`;
  }
}

function renderPulseChips(containerId, chips, emptyText) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const filtered = (chips || []).filter(Boolean);
  el.innerHTML = filtered.length
    ? filtered.map((chip) => `<span class="control-pulse-chip">${escapeHtml(chip)}</span>`).join("")
    : `<span class="control-pulse-chip">${escapeHtml(emptyText)}</span>`;
}

function renderContractsSpotlight() {
  const spotlight = document.getElementById("contractsSpotlight");
  if (!spotlight) return;
  const teamId = state.contractTeamId || state.dashboard?.controlledTeamId || null;
  const team = teamByCode(teamId) || null;
  const selected = getSelectedContractPlayer();
  const demand = selected ? state.negotiationTargets.find((entry) => entry.id === selected.id)?.demand || null : null;
  const roster = state.contractRoster || [];
  const expiring = state.contractTools?.expiring || [];
  const cap = state.contractCap || {};
  const blockCount = roster.filter((player) => state.tradeBlockIds.includes(player.id)).length;

  spotlight.innerHTML = `
    <div class="overview-team-mark">
      <div class="overview-team-label">${escapeHtml(team?.name || teamId || "Contracts")}</div>
      <div class="overview-team-meta">
        ${escapeHtml(team?.abbrev || teamId || "-")} | ${escapeHtml(selected ? `Selected ${selected.name} (${selected.pos})` : `${roster.length} players on contract board`)}
      </div>
    </div>
    <div class="control-spotlight-grid">
      <div class="control-spotlight-card">
        <strong>Selected Player</strong>
        <div>${escapeHtml(selected ? `${selected.name} (${selected.pos})` : "No player selected")}</div>
        <div class="small">${escapeHtml(selected ? `Cap ${fmtMoney(selected.contract?.capHit || 0)} | ${selected.contract?.yearsRemaining || 0} years left` : "Pick a row to stage negotiations, trade, or restructure")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Negotiation Ask</strong>
        <div>${escapeHtml(demand ? `${demand.years}y / ${fmtMoney(demand.salary || 0)}` : "No active ask loaded")}</div>
        <div class="small">${escapeHtml(demand ? `Ask cap ${fmtMoney(demand.askCapHit || 0)}` : "Load negotiations or select a player with leverage")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Cap Posture</strong>
        <div>${escapeHtml(fmtMoney(cap.capSpace || 0))} space</div>
        <div class="small">${escapeHtml(`${expiring.length} expiring | ${blockCount} on trade block`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Risk Signal</strong>
        <div>${escapeHtml((cap.deadCapCurrentYear || 0) > (cap.capSpace || 0) ? "Dead cap pressure is elevated" : "Cap sheet is manageable")}</div>
        <div class="small">${escapeHtml(`Active cap ${fmtMoney(cap.activeCap || 0)} | Dead cap ${fmtMoney(cap.deadCapCurrentYear || 0)}`)}</div>
      </div>
    </div>
  `;

  renderPulseChips(
    "contractsPulseBar",
    [
      selected ? `Morale ${selected.morale ?? "-"}` : null,
      selected ? `Motivation ${selected.motivation ?? "-"}` : null,
      selected && state.tradeBlockIds.includes(selected.id) ? "Trade block active" : null,
      expiring.length ? `${expiring.length} expiring deals` : null,
      state.contractTools?.tagEligible?.length ? `${state.contractTools.tagEligible.length} tag candidates` : null,
      state.contractTools?.optionEligible?.length ? `${state.contractTools.optionEligible.length} option candidates` : null
    ],
    "Load a contract board to see cap and leverage signals"
  );
}

function renderSettingsSpotlight() {
  const spotlight = document.getElementById("settingsSpotlight");
  if (!spotlight) return;
  const settings = state.leagueSettings || state.dashboard?.settings || {};
  const latestSave = state.saves?.[0] || null;
  const persistence = state.persistence || {};
  const runtimeCounters = Object.keys(state.observability?.runtime?.counters || {}).length;
  const serverRequests = state.observability?.server?.requests ?? 0;

  spotlight.innerHTML = `
    <div class="overview-team-mark">
      <div class="overview-team-label">League Control Room</div>
      <div class="overview-team-meta">
        ${escapeHtml(state.dashboard ? `${state.dashboard.currentYear} | ${state.dashboard.phase}` : "Waiting on league state")} | ${escapeHtml(settings.eraProfile || "modern")} era profile
      </div>
    </div>
    <div class="control-spotlight-grid">
      <div class="control-spotlight-card">
        <strong>Saves</strong>
        <div>${escapeHtml(`${state.saves?.length || 0} slots detected`)}</div>
        <div class="small">${escapeHtml(latestSave ? `Latest ${latestSave.slot} @ ${new Date(latestSave.updatedAt).toLocaleString()}` : "No saved leagues found yet")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Commissioner Policy</strong>
        <div>${escapeHtml(settings.enableOwnerMode !== false ? "Owner mode active" : "Commissioner-only mode")}</div>
        <div class="small">${escapeHtml(`Injuries ${settings.allowInjuries !== false ? "on" : "off"} | Comp picks ${settings.enableCompPicks !== false ? "on" : "off"}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Persistence</strong>
        <div>${escapeHtml(persistence.kind || "Unknown storage")}</div>
        <div class="small">${escapeHtml(persistence.notes || "Load persistence info for adapter details")}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Runtime Health</strong>
        <div>${escapeHtml(`${serverRequests} server req | ${runtimeCounters} runtime counters`)}</div>
        <div class="small">${escapeHtml(state.observability ? "Observability loaded" : "Load metrics to inspect runtime health")}</div>
      </div>
    </div>
  `;

  renderPulseChips(
    "settingsPulseBar",
    [
      `Era ${settings.eraProfile || "modern"}`,
      `Injuries ${settings.allowInjuries !== false ? "on" : "off"}`,
      `Narratives ${settings.enableNarratives !== false ? "on" : "off"}`,
      `Owner mode ${settings.enableOwnerMode !== false ? "on" : "off"}`,
      `Chemistry ${settings.enableChemistry !== false ? "on" : "off"}`,
      `Trade aggression ${settings.cpuTradeAggression ?? 0.5}`
    ],
    "Settings will appear here after the league config loads"
  );
}

function renderOwnerSpotlight() {
  const spotlight = document.getElementById("ownerSpotlight");
  if (!spotlight) return;
  const owner = state.ownerState?.owner;
  if (!owner) {
    spotlight.innerHTML = `<div class="small">Load an owner profile to review mandate, market pressure, and budget posture.</div>`;
    return;
  }
  const culture = state.ownerState?.cultureProfile || {};
  const scheme = state.ownerState?.schemeIdentity || {};
  const weeklyPlan = state.ownerState?.weeklyPlan || {};
  const expectation = owner.expectation || {};
  const teamId = document.getElementById("ownerTeamSelect")?.value || state.dashboard?.controlledTeamId || "";
  const team = teamByCode(teamId) || null;
  spotlight.innerHTML = `
    <div class="overview-team-mark">
      <div class="overview-team-label">${escapeHtml(team?.name || teamId || "Owner")}</div>
      <div class="overview-team-meta">
        ${escapeHtml(owner.personality || "owner")} | market ${escapeHtml(owner.marketSize || "-")} | fan interest ${escapeHtml(owner.fanInterest ?? "-")}
      </div>
    </div>
    <div class="control-spotlight-grid">
      <div class="control-spotlight-card">
        <strong>Mandate</strong>
        <div>${escapeHtml(expectation.mandate || "Stabilize the club")}</div>
        <div class="small">${escapeHtml(`Target ${expectation.targetWins ?? "-"} wins | Projected ${expectation.projectedWins ?? "-"}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Economics</strong>
        <div>${escapeHtml(`${fmtMoney(owner.cash || 0)} cash | ${fmtMoney(owner.staffBudget || 0)} staff budget`)}</div>
        <div class="small">${escapeHtml(`Ticket ${owner.ticketPrice ?? "-"} | Revenue YTD ${fmtMoney(owner.finances?.revenueYtd || 0)}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Facilities</strong>
        <div>${escapeHtml(`Training ${owner.facilities?.training ?? "-"} | Rehab ${owner.facilities?.rehab ?? "-"} | Analytics ${owner.facilities?.analytics ?? "-"}`)}</div>
        <div class="small">${escapeHtml(`${culture.identity || "Balanced"} culture | ${scheme.offense || "-"} / ${scheme.defense || "-"}`)}</div>
      </div>
      <div class="control-spotlight-card">
        <strong>Weekly Pressure</strong>
        <div>${escapeHtml(weeklyPlan.summary || "No weekly plan summary loaded")}</div>
        <div class="small">${escapeHtml((expectation.reasons || []).join("; ") || "No pressure reasons flagged")}</div>
      </div>
    </div>
  `;
}

function renderRosterNeeds() {
  const needs = (state.dashboard?.rosterNeeds || [])
    .slice()
    .sort((a, b) => a.delta - b.delta || a.position.localeCompare(b.position))
    .map((entry) => ({
      pos: entry.position,
      target: entry.target,
      current: entry.current,
      gap: entry.delta,
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
        tm: teamCode(row.tm),
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
        tm: teamCode(row.tm),
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
      tm: teamCode(row.tm),
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
  const controlledTeamId = state.dashboard?.controlledTeamId || null;
  const controlledOnBye = controlledTeamId && (schedule.byeTeams || []).includes(controlledTeamId);
  weekText.textContent = `Week ${schedule.week} (${schedule.played ? "Played" : "Upcoming"})${controlledOnBye ? ` | ${controlledTeamId} bye week` : ""}`;
  const rows = (schedule.games || []).map((game) => ({
    away: teamCode(game.awayTeamId),
    home: teamCode(game.homeTeamId),
    score: game.played ? `${game.awayScore}-${game.homeScore}` : "-",
    winner: game.played ? (game.isTie ? "TIE" : teamCode(game.winnerId) || "") : "TBD"
  }));
  for (const teamId of schedule.byeTeams || []) {
    rows.push({
      away: teamCode(teamId),
      home: "BYE",
      score: "-",
      winner: "REST"
    });
  }
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
    away: teamCode(game.awayTeamId),
    home: teamCode(game.homeTeamId),
    score: `${game.awayScore}-${game.homeScore}`,
    winner: teamCode(game.winnerId) || "TIE"
  }));
  renderTable("weekTable", games);

  const injuries = (state.dashboard?.injuryReport || []).map((entry) => ({
    player: entry.player,
    team: teamCode(entry.teamId),
    pos: entry.pos,
    status: entry.injury?.type || "",
    weeks: entry.injury?.weeksRemaining || 0
  }));

  const suspensions = (state.dashboard?.suspensionReport || []).map((entry) => ({
    player: entry.player,
    team: teamCode(entry.teamId),
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
          <span>${escapeHtml(teamCode(game.awayTeamId))} ${escapeHtml(game.awayScore)}</span>
          <strong>@</strong>
          <span>${escapeHtml(teamCode(game.homeTeamId))} ${escapeHtml(game.homeScore)}</span>
        </button>`
    )
    .join("");
}

function setBoxScoreTab(panelId = "boxScoreStatsPanel") {
  document.querySelectorAll("[data-boxscore-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.boxscoreTab === panelId);
  });
  document.querySelectorAll("#boxScoreModal .subtab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
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
  setBoxScoreTab("boxScoreStatsPanel");
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
    const isSelected = player.id === state.selectedDesignationPlayerId;
    const actions = [
      `<button data-designation-select="${escapeHtml(player.id)}">${isSelected ? "Selected" : "Select"}</button>`,
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

function getSelectedDesignationPlayer() {
  return state.roster.find((player) => player.id === state.selectedDesignationPlayerId) || null;
}

function setSelectedDesignationPlayer(playerId) {
  state.selectedDesignationPlayerId = playerId || null;
  const player = getSelectedDesignationPlayer();
  if (!player) state.selectedDesignationPlayerId = null;
  const label = document.getElementById("designationSelectedPlayerText");
  if (label) {
    label.textContent = player ? `Selected: ${player.name} (${player.pos})` : "Selected: None";
  }
  const applyBtn = document.getElementById("applyDesignationBtn");
  if (applyBtn) applyBtn.disabled = !player;
  const clearBtn = document.getElementById("clearDesignationBtn");
  if (clearBtn) clearBtn.disabled = !player;
}

function getSelectedRetirementOverridePlayer() {
  return (state.retiredPool || []).find((player) => player.id === state.selectedRetirementOverridePlayerId) || null;
}

function setSelectedRetirementOverridePlayer(playerId) {
  state.selectedRetirementOverridePlayerId = playerId || null;
  const player = getSelectedRetirementOverridePlayer();
  if (!player) state.selectedRetirementOverridePlayerId = null;
  const label = document.getElementById("retirementOverrideSelectedPlayerText");
  if (label) {
    label.textContent = player ? `Selected: ${player.name} (${player.pos})` : "Selected: None";
  }
  const button = document.getElementById("retirementOverrideBtn");
  if (button) button.disabled = !player;
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
    renderContractsSpotlight();
    return;
  }

  const demand = state.negotiationTargets.find((entry) => entry.id === player.id)?.demand || null;

  if (tag) {
    const resultingCap = capSpace + (tag.contract?.capHit || 0) - (tag.projectedCapHit || 0);
    preview.textContent =
      `Tag Preview: ${tag.name} (${tag.pos}) ${fmtMoney(tag.contract?.capHit || 0)} -> ${fmtMoney(tag.projectedCapHit || 0)} (${fmtDeltaMoney(tag.capDelta || 0)}). Remaining cap: ${fmtMoney(resultingCap)}.`;
    renderContractsSpotlight();
    return;
  }

  if (option) {
    const resultingCap = capSpace + (option.contract?.capHit || 0) - (option.projectedCapHit || 0);
    preview.textContent =
      `Option Preview: ${option.name} (${option.pos}) ${fmtMoney(option.contract?.capHit || 0)} -> ${fmtMoney(option.projectedCapHit || 0)} (${fmtDeltaMoney(option.capDelta || 0)}). Remaining cap: ${fmtMoney(resultingCap)}.`;
    renderContractsSpotlight();
    return;
  }

  preview.textContent =
    `${player.name} | Salary ${fmtMoney(player.contract?.salary || 0)} | Cap ${fmtMoney(player.contract?.capHit || 0)} | Years ${player.contract?.yearsRemaining || 0}` +
    (demand ? ` | Ask ${demand.years}y / ${fmtMoney(demand.salary || 0)}` : "");
  renderContractsSpotlight();
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
  renderContractsSpotlight();
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

function getTradeTeamId(side) {
  const selectId = side === "A" ? "tradeTeamA" : "tradeTeamB";
  return document.getElementById(selectId)?.value || state.dashboard?.controlledTeamId || "BUF";
}

function setTradeEvalCards({ fairness = null, capDeltaA = null, capDeltaB = null } = {}) {
  document.getElementById("tradeFairnessScore").textContent = fairness == null ? "-" : `${fairness.toFixed(0)} / 100`;
  document.getElementById("tradeCapDeltaA").textContent = capDeltaA == null ? "-" : fmtDeltaMoney(capDeltaA);
  document.getElementById("tradeCapDeltaB").textContent = capDeltaB == null ? "-" : fmtDeltaMoney(capDeltaB);
}

function clearTradePackages({ keepMessage = false } = {}) {
  state.tradeAssets = createEmptyTradeAssets();
  renderTradeWorkspace();
  if (!keepMessage) {
    setTradeEvalText("Use evaluate to see cap/value impact.");
    setTradeEvalCards();
  }
}

function getTradePlayersForSide(side) {
  const { playerKey, rosterKey } = tradeAssetKeys(side);
  const roster = state[rosterKey] || [];
  const rosterById = new Map(roster.map((player) => [player.id, player]));
  return state.tradeAssets[playerKey]
    .map((id) => rosterById.get(id))
    .filter(Boolean);
}

function getTradePicksForSide(side) {
  const { pickKey, picksKey } = tradeAssetKeys(side);
  const picks = state[picksKey] || [];
  const picksById = new Map(picks.map((pick) => [pick.id, pick]));
  return state.tradeAssets[pickKey]
    .map((id) => picksById.get(id))
    .filter(Boolean);
}

function setTradePackageText(side) {
  const el = document.getElementById(side === "A" ? "tradeSelectedAText" : "tradeSelectedBText");
  if (!el) return;
  const players = getTradePlayersForSide(side).map((player) => `${player.name} (${player.pos})`);
  const picks = getTradePicksForSide(side).map((pick) => `${pick.year} R${pick.round} (${teamCode(pick.originalTeamId)})`);
  const assets = [...players, ...picks];
  el.textContent = `Team ${side} Assets: ${assets.length ? assets.join(", ") : "None"}`;
}

function toggleTradeAsset(side, type, id) {
  const { playerKey, pickKey } = tradeAssetKeys(side);
  const key = type === "pick" ? pickKey : playerKey;
  const current = state.tradeAssets[key] || [];
  state.tradeAssets[key] = current.includes(id) ? current.filter((value) => value !== id) : uniqueIds([...current, id]);
  renderTradeWorkspace();
}

function queueTradePlayer(playerId) {
  const teamId = state.contractTeamId || state.dashboard?.controlledTeamId || "BUF";
  const previousTeamA = getTradeTeamId("A");
  document.getElementById("tradeTeamA").value = teamId;
  if (previousTeamA !== teamId) {
    clearTradePackages({ keepMessage: true });
  }
  state.tradeAssets.teamAPlayerIds = uniqueIds([...state.tradeAssets.teamAPlayerIds, playerId]);
  activateTab("transactionsTab");
  const player = state.contractRoster.find((entry) => entry.id === playerId);
  renderTradeWorkspace();
  setTradeEvalText(`${player?.name || playerId} queued for Team A. Add more assets, then evaluate or execute.`);
  void loadPickAssets();
}

function renderTradeRosterTable(tableId, roster, side) {
  const selectedIds = new Set(side === "A" ? state.tradeAssets.teamAPlayerIds : state.tradeAssets.teamBPlayerIds);
  const rows = (roster || []).map((player) => ({
    id: player.id,
    player: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    capHit: fmtMoney(player.contract?.capHit || 0),
    action: ""
  }));
  renderTable(tableId, rows);
  decoratePlayerColumnFromRows(tableId, rows, { idKeys: ["id"] });
  document.getElementById(tableId)?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isSelected = selectedIds.has(row.id);
    cell.innerHTML = `<button data-trade-roster-side="${side}" data-trade-player-id="${escapeHtml(row.id)}">${isSelected ? "Remove" : "Add"}</button>`;
  });
}

function renderTradeWorkspace() {
  renderTradeRosterTable("tradeTeamARosterTable", state.tradeTeamARoster, "A");
  renderTradeRosterTable("tradeTeamBRosterTable", state.tradeTeamBRoster, "B");
  setTradePackageText("A");
  setTradePackageText("B");
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

function roundDepthShare(value) {
  return Number(Math.max(0, Math.min(1, value || 0)).toFixed(3));
}

function totalDepthShares(values = []) {
  return values.reduce((sum, value) => sum + value, 0);
}

function resolveDepthShareValues(ids, defaults, manualShares) {
  const baseShares = ids.map((_, index) => roundDepthShare(defaults[index] ?? 0.02));
  const targetTotal = Number(totalDepthShares(baseShares).toFixed(3));
  const manualIndexes = [];
  const shares = baseShares.slice();

  for (const [index, playerId] of ids.entries()) {
    const manualShare = Number(manualShares?.[playerId]);
    if (!Number.isFinite(manualShare)) continue;
    manualIndexes.push(index);
    shares[index] = roundDepthShare(manualShare);
  }

  if (!manualIndexes.length) return baseShares;

  let manualTotal = totalDepthShares(manualIndexes.map((index) => shares[index]));
  if (manualTotal > targetTotal && manualTotal > 0) {
    const scale = targetTotal / manualTotal;
    for (const index of manualIndexes) shares[index] = roundDepthShare(shares[index] * scale);
    manualTotal = totalDepthShares(manualIndexes.map((index) => shares[index]));
  }

  const autoIndexes = ids.map((_, index) => index).filter((index) => !manualIndexes.includes(index));
  const autoTarget = Math.max(0, Number((targetTotal - manualTotal).toFixed(3)));
  if (autoIndexes.length) {
    const autoBaseTotal = totalDepthShares(autoIndexes.map((index) => baseShares[index]));
    const autoFallback = autoIndexes.length ? autoTarget / autoIndexes.length : 0;
    for (const index of autoIndexes) {
      shares[index] =
        autoBaseTotal > 0
          ? roundDepthShare(baseShares[index] * (autoTarget / autoBaseTotal))
          : roundDepthShare(autoFallback);
    }
  }

  if (totalDepthShares(shares) <= 0.001) return baseShares;

  const rounded = shares.map((value) => roundDepthShare(value));
  const delta = Number((targetTotal - totalDepthShares(rounded)).toFixed(3));
  if (Math.abs(delta) >= 0.001) {
    const adjustmentIndex = [...autoIndexes, ...manualIndexes].reverse().find((index) => rounded[index] + delta >= 0);
    if (Number.isInteger(adjustmentIndex)) rounded[adjustmentIndex] = roundDepthShare(rounded[adjustmentIndex] + delta);
  }
  return rounded;
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
  const resolvedShares = resolveDepthShareValues(ids, defaults, manualShares);
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
        const effectiveShare = resolvedShares[index] ?? shareRows[index]?.snapShare ?? defaultShare;
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
    const isSelected = row.id === state.selectedRetirementOverridePlayerId;
    cell.innerHTML = row.eligible === "Yes"
      ? `<button data-retired-override-id="${escapeHtml(row.id)}">${isSelected ? "Selected" : "Select"}</button>`
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
    { area: "League Structure", rule: "32 teams, 18-week regular season calendar with 17 games and one bye per team, plus NFL playoff format and division/conference standings." },
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
    const insight = document.getElementById("scoutingInsightText");
    if (insight) insight.textContent = "Load the board to surface fit, confidence, and weekly scouting guidance.";
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
    fit: prospect.fitLabel ? `${prospect.fitLabel} (${prospect.schemeFit ?? "-"})` : prospect.schemeFit ?? "-",
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
  const insight = document.getElementById("scoutingInsightText");
  if (insight) {
    const featuredId = state.scoutingBoardDraft[0];
    const featured = (scouting.prospects || []).find((prospect) => prospect.playerId === featuredId) || scouting.prospects?.[0] || null;
    const latestReport = scouting.weeklyReports?.[0]?.evaluations?.[0] || null;
    const lines = [];
    if (featured) {
      lines.push(
        `Top board fit: ${featured.player} (${featured.pos}) is ${featured.fitLabel || "neutral"} for this scheme at ${featured.schemeFit ?? "-"} with ${featured.confidence ?? 0}% confidence.`
      );
    }
    if (latestReport) {
      lines.push(
        `Latest report: ${latestReport.player} changed by ${latestReport.delta >= 0 ? "+" : ""}${latestReport.delta || 0} OVR with ${latestReport.confidence ?? 0}% confidence.`
      );
    }
    lines.push(scouting.locked ? "Board is locked; scouting now only updates the live report." : `Board room remaining: ${Math.max(0, 20 - state.scoutingBoardDraft.length)} slots.`);
    insight.textContent = lines.join(" ");
  }
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

function setHistoryView(view) {
  state.historyView = view === "hall-of-fame" ? "hall-of-fame" : "season-awards";
  document.querySelectorAll("[data-history-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.historyView === state.historyView);
  });
  const seasonPanel = document.getElementById("historySeasonAwardsPanel");
  const hallPanel = document.getElementById("historyHallOfFamePanel");
  if (seasonPanel) seasonPanel.classList.toggle("hidden", state.historyView !== "season-awards");
  if (hallPanel) hallPanel.classList.toggle("hidden", state.historyView !== "hall-of-fame");
}

function formatAwardList(list = []) {
  return (list || []).map((entry) => `${entry.player} (${entry.team})`).join(", ");
}

function hallOfFameCareerLine(entry) {
  const stats = entry.careerStats || {};
  if (entry.pos === "QB") return `${stats.passing?.yards || 0} pass yds, ${stats.passing?.td || 0} pass TD`;
  if (entry.pos === "RB") return `${stats.rushing?.yards || 0} rush yds, ${stats.rushing?.td || 0} rush TD`;
  if (entry.pos === "WR" || entry.pos === "TE") return `${stats.receiving?.yards || 0} rec yds, ${stats.receiving?.td || 0} rec TD`;
  if (entry.pos === "K") return `${stats.kicking?.fgm || 0} FGM, ${stats.kicking?.xpm || 0} XPM`;
  if (entry.pos === "P") return `${stats.punting?.punts || 0} punts, ${stats.punting?.in20 || 0} in20`;
  return `${stats.defense?.tackles || 0} tackles, ${stats.defense?.sacks || 0} sacks, ${stats.defense?.int || 0} INT`;
}

function renderRecordsAndHistory() {
  const box = document.getElementById("recordsBox");
  const records = state.dashboard?.records;
  const awards = (state.dashboard?.awards || []).slice().reverse();
  const awardYears = awards.map((award) => String(award.year));

  if (!records) {
    box.innerHTML = "<div class='record'>No record data</div>";
  } else {
    const leaders = [
      ["Career Pass Yards", "passingYards"],
      ["Career Rush Yards", "rushingYards"],
      ["Career Rec Yards", "receivingYards"],
      ["Career Sacks", "sacks"],
      ["Career INT", "interceptions"],
      ["Career FG Made", "fieldGoalsMade"],
      ["Career AV", "approximateValue"]
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
    awards.map((award) => ({
      year: award.year,
      MVP: award.MVP?.player || "",
      OPOY: award.OPOY?.player || "",
      DPOY: award.DPOY?.player || "",
      OROY: award.OROY?.player || "",
      DROY: award.DROY?.player || "",
      ROY: award.ROY?.player || "",
      CPOY: award.CPOY?.player || "",
      mostImproved: award.MostImproved?.player || "",
      sbScore: award.SuperBowl?.finalScore || "",
      sbMVP: award.SuperBowl?.MVP?.player || ""
    }))
  );

  setSelectOptions(
    "historyAwardYearSelect",
    awardYears.map((year) => ({ value: year, label: year })),
    state.selectedAwardsYear && awardYears.includes(String(state.selectedAwardsYear))
      ? String(state.selectedAwardsYear)
      : awardYears[0] || ""
  );
  if (!state.selectedAwardsYear && awardYears[0]) state.selectedAwardsYear = Number(awardYears[0]);
  const selectedAward =
    awards.find((award) => String(award.year) === String(state.selectedAwardsYear || awardYears[0] || "")) || null;
  if (selectedAward) state.selectedAwardsYear = selectedAward.year;

  renderTable(
    "awardDetailTable",
    selectedAward
      ? [{
          year: selectedAward.year,
          MVP: selectedAward.MVP?.player || "",
          OPOY: selectedAward.OPOY?.player || "",
          DPOY: selectedAward.DPOY?.player || "",
          OROY: selectedAward.OROY?.player || "",
          DROY: selectedAward.DROY?.player || "",
          ROY: selectedAward.ROY?.player || "",
          CPOY: selectedAward.CPOY?.player || "",
          mostImproved: selectedAward.MostImproved?.player || "",
          superBowl: `${selectedAward.SuperBowl?.championTeamId || "-"} def. ${selectedAward.SuperBowl?.runnerUpTeamId || "-"} ${selectedAward.SuperBowl?.finalScore || ""}`,
          superBowlMVP: selectedAward.SuperBowl?.MVP?.player || "",
          pivotalMoment: selectedAward.SuperBowl?.pivotalMoment || ""
        }]
      : []
  );

  renderTable("allPro1Table", (selectedAward?.AllPro1 || []).map((entry) => ({ team: "All-Pro 1", pos: entry.pos, player: entry.player, tm: entry.team, av: entry.av })));
  renderTable("allPro2Table", (selectedAward?.AllPro2 || []).map((entry) => ({ team: "All-Pro 2", pos: entry.pos, player: entry.player, tm: entry.team, av: entry.av })));
  renderTable("allPro3Table", (selectedAward?.AllPro3 || []).map((entry) => ({ team: "All-Pro 3", pos: entry.pos, player: entry.player, tm: entry.team, av: entry.av })));
  renderTable("proBowlTable", (selectedAward?.ProBowl || []).map((entry) => ({ pos: entry.pos, player: entry.player, tm: entry.team, av: entry.av })));

  renderTable(
    "championsTable",
    (state.dashboard?.champions || []).slice().reverse().map((champion) => ({
      year: champion.year,
      champion: champion.championTeamId,
      runnerUp: champion.runnerUpTeamId,
      score: champion.score
    }))
  );

  renderTable(
    "hallOfFameTable",
    (state.dashboard?.hallOfFame || []).map((entry) => ({
      player: entry.player,
      pos: entry.pos,
      retired: entry.retiredYear,
      no: entry.jerseyNumber ?? "-",
      careerAV: entry.careerAv || 0,
      careerStats: hallOfFameCareerLine(entry),
      superBowls: entry.championships || 0,
      teams: (entry.teams || []).join(", "),
      MVP: entry.awardCounts?.MVP || 0,
      OPOY: entry.awardCounts?.OPOY || 0,
      DPOY: entry.awardCounts?.DPOY || 0,
      allPro1: entry.awardCounts?.AllPro1 || 0,
      allPro2: entry.awardCounts?.AllPro2 || 0,
      proBowl: entry.awardCounts?.ProBowl || 0,
      rookieAwards: (entry.awardCounts?.OROY || 0) + (entry.awardCounts?.DROY || 0) + (entry.awardCounts?.ROY || 0),
      comeback: entry.awardCounts?.CPOY || 0,
      improved: entry.awardCounts?.MostImproved || 0,
      retiredNos: (entry.retiredNumbers || []).map((row) => `${row.teamId} #${row.number}`).join(", ")
    }))
  );

  setHistoryView(state.historyView);
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
    byes: week.byeTeams?.length || 0,
    completed: week.games?.filter((game) => game.played).length || 0,
    points: week.games?.reduce((sum, game) => sum + (game.homeScore || 0) + (game.awayScore || 0), 0) || 0
  }));
  renderTable("calendarWeeksTable", weekRows);

  const selectedWeek = Number(state.calendarWeek || calendar.currentWeek || 1);
  const selected = (calendar.weeks || []).find((week) => week.week === selectedWeek) || calendar.weeks?.[0];
  if (selected) state.calendarWeek = selected.week;
  const gameRows = (selected?.games || []).map((game) => ({
    away: teamCode(game.awayTeamId),
    home: teamCode(game.homeTeamId),
    score: game.played ? `${game.awayScore}-${game.homeScore}` : "-",
    winner: game.played ? (game.isTie ? "TIE" : teamCode(game.winnerId) || "") : "TBD"
  }));
  for (const teamId of selected?.byeTeams || []) {
    gameRows.push({
      away: teamCode(teamId),
      home: "BYE",
      score: "-",
      winner: "REST"
    });
  }
  renderTable("calendarGamesTable", gameRows);

  const toBracketRows = (conf, bracket) =>
    ["wildcard", "divisional", "conference"].flatMap((round) =>
      (bracket?.[round] || []).map((game) => ({
        conf,
        round,
        away: teamCode(game.awayTeamId),
        home: teamCode(game.homeTeamId),
        score: `${game.awayScore}-${game.homeScore}`,
        winner: teamCode(game.winnerId)
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
            away: teamCode(sb.awayTeamId),
            home: teamCode(sb.homeTeamId),
            score: `${sb.awayScore}-${sb.homeScore}`,
            winner: teamCode(sb.championTeamId || sb.winnerId)
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
    team: entry.teamId
      ? teamCode(entry.teamId)
      : `${teamCode(entry.teamA || "")}${entry.teamB ? `/${teamCode(entry.teamB)}` : ""}`,
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
  const rows = [
    ...(state.tradeTeamAPicks || []).map((pick) => ({ ...pick, packageSide: "A" })),
    ...(state.tradeTeamBPicks || []).map((pick) => ({ ...pick, packageSide: "B" }))
  ].map((pick) => ({
    side: `Team ${pick.packageSide}`,
    id: pick.id,
    yr: pick.year,
    rnd: pick.round,
    orig: teamCode(pick.originalTeamId),
    owner: teamCode(pick.ownerTeamId),
    value: pick.value,
    action: ""
  }));
  renderTable("pickAssetsTable", rows);
  document.getElementById("pickAssetsTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isSelected =
      row.side === "Team A"
        ? state.tradeAssets.teamAPickIds.includes(row.id)
        : state.tradeAssets.teamBPickIds.includes(row.id);
    cell.innerHTML = `<button data-trade-pick-side="${row.side === "Team A" ? "A" : "B"}" data-trade-pick-id="${escapeHtml(row.id)}">${isSelected ? "Remove" : "Add"}</button>`;
  });
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
      team: analytics.teamId ? teamCode(analytics.teamId) : "ALL",
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
  const culture = s.cultureProfile || {};
  const scheme = s.schemeIdentity || {};
  const weeklyPlan = s.weeklyPlan || {};
  const rows = Object.entries(s.staff).map(([role, staff]) => ({
    role,
    name: staff.name,
    playcalling: staff.playcalling,
    development: staff.development,
    discipline: staff.discipline,
    years: staff.yearsRemaining,
    specialty: staff.specialty?.area || "",
    scheme: role === "headCoach" ? `${scheme.offense || "-"} / ${scheme.defense || "-"}` : "",
    culture: role === "headCoach" ? culture.identity || "-" : "",
    weeklyFocus: role === "headCoach" ? weeklyPlan.summary || "-" : ""
  }));
  renderTable("staffTable", rows);
}

function renderOwner() {
  const owner = state.ownerState?.owner;
  if (!owner) {
    renderTable("ownerTable", []);
    renderOwnerSpotlight();
    return;
  }
  const culture = state.ownerState?.cultureProfile || {};
  const scheme = state.ownerState?.schemeIdentity || {};
  const weeklyPlan = state.ownerState?.weeklyPlan || {};
  const expectation = owner.expectation || {};
  renderTable("ownerTable", [
    {
      market: owner.marketSize,
      fanInterest: owner.fanInterest,
      ticketPrice: owner.ticketPrice,
      staffBudget: fmtMoney(owner.staffBudget),
      cash: fmtMoney(owner.cash),
      personality: owner.personality || "-",
      patience: owner.patience ?? "-",
      hotSeat: owner.hotSeat ? "Yes" : "No",
      revenueYtd: fmtMoney(owner.finances?.revenueYtd || 0),
      expensesYtd: fmtMoney(owner.finances?.expensesYtd || 0),
      training: owner.facilities?.training,
      rehab: owner.facilities?.rehab,
      analytics: owner.facilities?.analytics,
      championships: owner.priorities?.championships ?? "-",
      profit: owner.priorities?.profit ?? "-",
      loyalty: owner.priorities?.loyalty ?? "-",
      culture: culture.identity || "-",
      pressure: culture.pressure ?? "-",
      scheme: `${scheme.offense || "-"} / ${scheme.defense || "-"}`,
      mandate: expectation.mandate || "-",
      targetWins: expectation.targetWins ?? "-",
      projectedWins: expectation.projectedWins ?? "-",
      heat: expectation.heat ?? "-",
      trend: expectation.trend || "-",
      reasons: (expectation.reasons || []).join("; ") || "-",
      weeklyPlan: weeklyPlan.summary || "-",
      exploit: weeklyPlan.exploit || "-",
      warning: weeklyPlan.warning || "-"
    }
  ]);
  renderOwnerSpotlight();
}

function renderObservability() {
  const obs = state.observability;
  if (!obs) {
    renderTable("observabilityTable", []);
    renderSettingsSpotlight();
    return;
  }
  const rows = [
    { metric: "serverRequests", value: obs.server?.requests ?? 0 },
    { metric: "apiRequests", value: obs.server?.apiRequests ?? 0 },
    { metric: "uptimeSeconds", value: obs.server?.uptimeSeconds ?? 0 },
    { metric: "runtimeCounters", value: Object.keys(obs.runtime?.counters || {}).length }
  ];
  renderTable("observabilityTable", rows);
  renderSettingsSpotlight();
}

function renderPersistence() {
  const p = state.persistence;
  if (!p) {
    renderTable("persistenceTable", []);
    renderSettingsSpotlight();
    return;
  }
  renderTable("persistenceTable", [
    {
      kind: p.kind,
      available: p.available,
      notes: p.notes
    }
  ]);
  renderSettingsSpotlight();
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
  const rows = (state.comparePlayers || []).map((player) => ({
    id: player.id,
    name: player.name,
    tm: teamCode(player.teamId),
    pos: player.position,
    ovr: player.overall,
    fit: player.schemeFit ?? "-",
    age: player.age,
    dev: player.developmentTrait
  }));
  renderTable("comparePlayersTable", rows);
  decoratePlayerColumnFromRows("comparePlayersTable", rows, { nameKey: "name", idKeys: ["id"] });
  const label = document.getElementById("compareSelectedPlayersText");
  if (label) {
    const names = (state.comparePlayers || []).map((player) => player.name);
    label.textContent = `Selected: ${state.comparePlayerIds.length} / 8${names.length ? ` (${names.join(", ")})` : ""}`;
  }
}

function renderCompareSearchResults() {
  const rows = (state.compareSearchResults || []).map((player) => ({
    id: player.id,
    player: player.name,
    tm: teamCode(player.teamId),
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    status: player.status,
    action: ""
  }));
  renderTable("comparePlayerSearchTable", rows);
  decoratePlayerColumnFromRows("comparePlayerSearchTable", rows, { idKeys: ["id"] });
  document.getElementById("comparePlayerSearchTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isSelected = state.comparePlayerIds.includes(row.id);
    cell.innerHTML = `<button data-compare-player-toggle="${escapeHtml(row.id)}">${isSelected ? "Remove" : "Add"}</button>`;
  });
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
  renderSettingsSpotlight();
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
      `${teamCode(player.teamId)} | #${player.jerseyNumber ?? "--"} | OVR ${player.overall} | Age ${player.age} | ${formatHeight(player.heightInches)} ${player.weightLbs || "-"} lbs | Dev ${player.developmentTrait} | Injury ${player.injury?.type || "Healthy"}`;
  document.getElementById("playerProfileSummary").innerHTML = renderPlayerProfileHero(profile);

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
    renderStatsBenchmarkHint();
    return;
  }

  if (scope === "career") {
    category.disabled = false;
    position.disabled = false;
    year.disabled = true;
    if (seasonType) seasonType.disabled = false;
    renderStatsBenchmarkHint();
    return;
  }

  category.disabled = false;
  position.disabled = false;
  year.disabled = false;
  if (seasonType) seasonType.disabled = false;
  renderStatsBenchmarkHint();
}

function renderStatsBenchmarkHint() {
  const box = document.getElementById("statsBenchmarkText");
  if (!box) return;
  const scope = document.getElementById("scopeFilter")?.value || "season";
  const category = scope === "team" ? "team" : document.getElementById("categoryFilter")?.value || "passing";
  const position = document.getElementById("positionFilter")?.value || "";
  const seasonType = document.getElementById("statsSeasonTypeFilter")?.value || "regular";
  const hints = STATS_BENCHMARK_HINTS[category] || {};
  const base = hints[position] || hints.default || "Benchmarks are unavailable for this view.";
  const qualifiers = [];
  if (scope === "career") qualifiers.push("Career tables aggregate seasons, so use the baseline as a role anchor, not a direct total target.");
  if (scope === "season" && seasonType !== "regular") qualifiers.push("Displayed benchmark is still based on regular-season starter samples.");
  if (scope === "season" && !position && ["receiving", "rushing", "defense"].includes(category)) {
    qualifiers.push("Choose a position filter for the cleanest NFL-average comparison.");
  }
  box.textContent = [base, ...qualifiers].join(" ");
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
      presentActionError(error);
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
  const teamA = getTradeTeamId("A").toUpperCase();
  const teamB = getTradeTeamId("B").toUpperCase();
  const [teamARoster, teamBRoster, teamAPicks, teamBPicks] = await Promise.all([
    api(`/api/roster?team=${encodeURIComponent(teamA)}`),
    api(`/api/roster?team=${encodeURIComponent(teamB)}`),
    api(`/api/picks?team=${encodeURIComponent(teamA)}`),
    api(`/api/picks?team=${encodeURIComponent(teamB)}`)
  ]);
  state.tradeTeamARoster = teamARoster.roster || [];
  state.tradeTeamBRoster = teamBRoster.roster || [];
  state.tradeTeamAPicks = teamAPicks.picks || [];
  state.tradeTeamBPicks = teamBPicks.picks || [];
  const teamARosterIds = new Set(state.tradeTeamARoster.map((player) => player.id));
  const teamBRosterIds = new Set(state.tradeTeamBRoster.map((player) => player.id));
  const teamAPickIds = new Set(state.tradeTeamAPicks.map((pick) => pick.id));
  const teamBPickIds = new Set(state.tradeTeamBPicks.map((pick) => pick.id));
  state.tradeAssets.teamAPlayerIds = state.tradeAssets.teamAPlayerIds.filter((id) => teamARosterIds.has(id));
  state.tradeAssets.teamBPlayerIds = state.tradeAssets.teamBPlayerIds.filter((id) => teamBRosterIds.has(id));
  state.tradeAssets.teamAPickIds = state.tradeAssets.teamAPickIds.filter((id) => teamAPickIds.has(id));
  state.tradeAssets.teamBPickIds = state.tradeAssets.teamBPickIds.filter((id) => teamBPickIds.has(id));
  renderTradeWorkspace();
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
  const ids = state.comparePlayerIds.slice(0, 8);
  if (!ids.length) {
    state.comparePlayers = [];
    renderComparePlayers();
    return;
  }
  const payload = await api(`/api/compare/players?ids=${encodeURIComponent(ids.join(","))}`);
  state.comparePlayers = payload.players || [];
  renderComparePlayers();
}

async function searchComparePlayers() {
  const query = document.getElementById("comparePlayerSearchInput").value.trim();
  if (!query) {
    state.compareSearchResults = [];
    renderCompareSearchResults();
    return;
  }
  const payload = await api(`/api/players/search?q=${encodeURIComponent(query)}&limit=12&includeRetired=1`);
  state.compareSearchResults = payload.players || [];
  renderCompareSearchResults();
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
  setSelectedDesignationPlayer(state.selectedDesignationPlayerId);
  renderRoster();
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
  setSelectedRetirementOverridePlayer(state.selectedRetirementOverridePlayerId);
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
  renderSettingsSpotlight();
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
  state.teamHistory = payload.history || null;
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
  renderTable(
    "retiredNumbersTable",
    (payload.history?.retiredNumbers || []).map((entry) => ({
      no: entry.number,
      player: entry.player,
      pos: entry.pos,
      retired: entry.retiredYear,
      careerAV: entry.careerAv || 0,
      superBowls: entry.championships || 0,
      awards: Object.entries(entry.awards || {}).map(([key, value]) => `${key}:${value}`).join(", ")
    }))
  );
}

async function loadPlayerTimeline() {
  const playerId = state.selectedHistoryPlayerId;
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

function setSelectedHistoryPlayer(player = null) {
  state.selectedHistoryPlayerId = player?.id || null;
  const label = document.getElementById("playerTimelineSelectedPlayerText");
  if (label) {
    label.textContent = player ? `Selected: ${player.name} (${player.pos})` : "Selected: None";
  }
  const button = document.getElementById("loadPlayerTimelineBtn");
  if (button) button.disabled = !player;
  const retireButton = document.getElementById("retireSelectedJerseyBtn");
  if (retireButton) retireButton.disabled = !player;
}

async function retireSelectedJersey() {
  const teamId = document.getElementById("teamHistorySelect").value || state.dashboard?.controlledTeamId;
  if (!teamId || !state.selectedHistoryPlayerId) return;
  await api("/api/history/retire-jersey", {
    method: "POST",
    body: {
      teamId,
      playerId: state.selectedHistoryPlayerId
    }
  });
  await Promise.all([loadState(), loadTeamHistory()]);
}

function renderPlayerTimelineSearchResults() {
  const rows = (state.historyPlayerSearchResults || []).map((player) => ({
    id: player.id,
    player: player.name,
    tm: teamCode(player.teamId),
    pos: player.pos,
    age: player.age,
    ovr: player.overall,
    status: player.status,
    action: ""
  }));
  renderTable("playerTimelineSearchTable", rows);
  decoratePlayerColumnFromRows("playerTimelineSearchTable", rows, { idKeys: ["id"] });
  document.getElementById("playerTimelineSearchTable")?.querySelectorAll("tr").forEach((tr, index) => {
    if (index === 0) return;
    const row = rows[index - 1];
    const cell = tr.lastElementChild;
    if (!cell || !row) return;
    const isSelected = row.id === state.selectedHistoryPlayerId;
    cell.innerHTML = `<button data-history-player-select="${escapeHtml(row.id)}">${isSelected ? "Selected" : "Select"}</button>`;
  });
}

async function searchHistoryPlayers() {
  const query = document.getElementById("playerTimelineSearchInput").value.trim();
  if (!query) {
    state.historyPlayerSearchResults = [];
    renderPlayerTimelineSearchResults();
    setSelectedHistoryPlayer(null);
    return;
  }
  const payload = await api(`/api/players/search?q=${encodeURIComponent(query)}&limit=12&includeRetired=1`);
  state.historyPlayerSearchResults = payload.players || [];
  const nextSelection = state.historyPlayerSearchResults.find((player) => player.id === state.selectedHistoryPlayerId) || null;
  setSelectedHistoryPlayer(nextSelection);
  renderPlayerTimelineSearchResults();
}

function syncBootFilters() {
  document.getElementById("analyticsYearFilter").value = String(state.dashboard?.currentYear || new Date().getFullYear());
}

async function loadCoreDashboard() {
  await loadState();
  updateStatsControls();
  syncBootFilters();
  renderCommandPalette();
  renderRulesTab();
  renderAnalyticsChart();
  renderRealismVerification();
}

async function loadSecondaryPanels({ background = false } = {}) {
  const loaders = [
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
  ];

  if (!background) {
    await Promise.all(loaders);
    return [];
  }

  const results = await Promise.allSettled(loaders);
  const failures = results
    .map((result, index) => (result.status === "rejected" ? result.reason?.message || `Loader ${index + 1} failed.` : null))
    .filter(Boolean);
  if (failures.length) {
    console.error("Background panel hydration failed:", failures.join(" | "));
  }
  return failures;
}

async function refreshEverything() {
  await loadCoreDashboard();
  await loadSecondaryPanels();
}

function queueStartupHydration() {
  void loadSecondaryPanels({ background: true });
}

async function runAction(fn, statusText = "Working...") {
  try {
    setStatus(statusText);
    await fn();
    setStatus("Ready");
    showToast("Done");
  } catch (error) {
    presentActionError(error);
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
      presentActionError(error);
      setSimControl({ active: false, pauseRequested: false, mode: null });
    })
  );

  document.getElementById("advanceSeasonBtn").addEventListener("click", () =>
    advanceSeasonSequential().catch((error) => {
      presentActionError(error);
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
    const selectButton = event.target.closest("button[data-designation-select]");
    if (selectButton) {
      setSelectedDesignationPlayer(selectButton.dataset.designationSelect || "");
      renderRoster();
      return;
    }
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
    setSelectedRetirementOverridePlayer(button.dataset.retiredOverrideId || "");
    renderRetiredPool();
  });

  document.getElementById("retirementOverrideBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedRetirementOverridePlayer();
      if (!player) throw new Error("Select a retired player first.");
      const teamId = (document.getElementById("retirementOverrideTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/retirement/override", {
        method: "POST",
        body: {
          playerId: player.id,
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
      const player = getSelectedDesignationPlayer();
      if (!player) throw new Error("Select a roster player first.");
      const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/roster/designation", {
        method: "POST",
        body: {
          teamId,
          playerId: player.id,
          designation: document.getElementById("designationType").value,
          active: true
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Applying designation...")
  );

  document.getElementById("clearDesignationBtn").addEventListener("click", () =>
    runAction(async () => {
      const player = getSelectedDesignationPlayer();
      if (!player) throw new Error("Select a roster player first.");
      const teamId = (document.getElementById("rosterTeamSelect").value || state.dashboard?.controlledTeamId || "BUF").toUpperCase();
      await api("/api/roster/designation", {
        method: "POST",
        body: {
          teamId,
          playerId: player.id,
          designation: document.getElementById("designationType").value,
          active: false
        }
      });
      await Promise.all([loadState(), loadRoster(), loadTransactionLog()]);
    }, "Clearing designation...")
  );

  const buildTradePayload = () => ({
    teamA: getTradeTeamId("A").toUpperCase(),
    teamB: getTradeTeamId("B").toUpperCase(),
    teamAPlayerIds: [...state.tradeAssets.teamAPlayerIds],
    teamBPlayerIds: [...state.tradeAssets.teamBPlayerIds],
    teamAPickIds: [...state.tradeAssets.teamAPickIds],
    teamBPickIds: [...state.tradeAssets.teamBPickIds]
  });

  document.getElementById("tradeBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = buildTradePayload();
      if (payload.teamA === payload.teamB) throw new Error("Select two different teams.");
      const result = await api("/api/trade", { method: "POST", body: payload });
      const a = result.valuation?.[payload.teamA] || {};
      const b = result.valuation?.[payload.teamB] || {};
      const fairness = Math.max(0, 100 - Math.abs((a.delta || 0) - (b.delta || 0)) * 4);
      setTradeEvalText(`Trade accepted. ${payload.teamA} value swing ${a.delta || 0}, ${payload.teamB} value swing ${b.delta || 0}`);
      setTradeEvalCards({ fairness, capDeltaA: a.capDelta || 0, capDeltaB: b.capDelta || 0 });
      clearTradePackages({ keepMessage: true });
      await Promise.all([loadState(), loadRoster(), loadContractsTeam(), loadFreeAgency(), loadDepthChart(), loadTransactionLog(), loadPickAssets()]);
    }, "Executing trade...")
  );

  document.getElementById("clearTradePackageBtn").addEventListener("click", () => {
    clearTradePackages();
  });

  ["tradeTeamA", "tradeTeamB"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () =>
      runAction(async () => {
        if (id === "tradeTeamA") {
          state.tradeAssets.teamAPlayerIds = [];
          state.tradeAssets.teamAPickIds = [];
        } else {
          state.tradeAssets.teamBPlayerIds = [];
          state.tradeAssets.teamBPickIds = [];
        }
        setTradeEvalText("Use evaluate to see cap/value impact.");
        setTradeEvalCards();
        await loadPickAssets();
      }, "Loading trade assets...")
    );
  });

  document.getElementById("evaluateTradeBtn").addEventListener("click", () =>
    runAction(async () => {
      const payload = buildTradePayload();
      if (payload.teamA === payload.teamB) throw new Error("Select two different teams.");
      const result = await api("/api/trade/evaluate", { method: "POST", body: payload });
      const a = result.valuation?.[payload.teamA] || {};
      const b = result.valuation?.[payload.teamB] || {};
      const fairness = Math.max(0, 100 - Math.abs((a.delta || 0) - (b.delta || 0)) * 4);
      setTradeEvalText(
        `${payload.teamA}: in ${a.incomingValue ?? 0} / out ${a.outgoingValue ?? 0} | ${payload.teamB}: in ${b.incomingValue ?? 0} / out ${b.outgoingValue ?? 0}`
      );
      setTradeEvalCards({ fairness, capDeltaA: a.capDelta || 0, capDeltaB: b.capDelta || 0 });
    }, "Evaluating trade...")
  );

  document.getElementById("tradeTeamARosterTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-trade-player-id]");
    if (!button) return;
    toggleTradeAsset("A", "player", button.dataset.tradePlayerId || "");
  });

  document.getElementById("tradeTeamBRosterTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-trade-player-id]");
    if (!button) return;
    toggleTradeAsset("B", "player", button.dataset.tradePlayerId || "");
  });

  document.getElementById("pickAssetsTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-trade-pick-id]");
    if (!button) return;
    toggleTradeAsset(button.dataset.tradePickSide || "A", "pick", button.dataset.tradePickId || "");
  });

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
  document.getElementById("searchComparePlayersBtn").addEventListener("click", () =>
    runAction(searchComparePlayers, "Searching players...")
  );
  document.getElementById("comparePlayerSearchTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-compare-player-toggle]");
    if (!button) return;
    const playerId = button.dataset.comparePlayerToggle || "";
    const current = state.comparePlayerIds.includes(playerId)
      ? state.comparePlayerIds.filter((id) => id !== playerId)
      : uniqueIds([...state.comparePlayerIds, playerId]).slice(0, 8);
    state.comparePlayerIds = current;
    renderCompareSearchResults();
    void loadComparePlayers();
  });

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
  document.querySelectorAll("[data-history-view]").forEach((button) => {
    button.addEventListener("click", () => {
      setHistoryView(button.dataset.historyView || "season-awards");
    });
  });
  document.getElementById("historyAwardYearSelect").addEventListener("change", () => {
    state.selectedAwardsYear = Number(document.getElementById("historyAwardYearSelect").value || 0) || null;
    renderRecordsAndHistory();
  });
  document.getElementById("searchPlayerTimelineBtn").addEventListener("click", () =>
    runAction(searchHistoryPlayers, "Searching player history...")
  );
  document.getElementById("playerTimelineSearchTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-history-player-select]");
    if (!button) return;
    const player =
      state.historyPlayerSearchResults.find((entry) => entry.id === (button.dataset.historyPlayerSelect || "")) || null;
    setSelectedHistoryPlayer(player);
    renderPlayerTimelineSearchResults();
  });
  document.getElementById("loadTeamHistoryBtn").addEventListener("click", () => runAction(loadTeamHistory, "Loading team history..."));
  document.getElementById("retireSelectedJerseyBtn").addEventListener("click", () =>
    runAction(retireSelectedJersey, "Retiring jersey number...")
  );

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
    const boxScoreTabButton = event.target.closest("button[data-boxscore-tab]");
    if (boxScoreTabButton) {
      setBoxScoreTab(boxScoreTabButton.dataset.boxscoreTab);
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
  renderTradeWorkspace();
  renderPickAssets();
  renderCompareSearchResults();
  renderComparePlayers();
  setSelectedHistoryPlayer(null);
  renderPlayerTimelineSearchResults();
  activateTab("overviewTab");
  await loadCoreDashboard();
  setStatus("Ready");
  queueStartupHydration();
  setInterval(() => {
    loadSimJobs().catch(() => {});
  }, 8000);
}

init();










