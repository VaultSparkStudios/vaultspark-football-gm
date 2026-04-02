import { state, api, DISPLAY_LABELS, GUIDE_SECTIONS, STATS_BENCHMARK_HINTS, TEAM_THEME_MAP } from "./appState.js";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function fmtMoney(value) {
  if (!Number.isFinite(value)) return "$0";
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

export function hashStringLocal(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function portraitChoice(seed, items, offset = 0) {
  const index = Math.abs((seed + offset) % items.length);
  return items[index];
}

export function playerBodyTypeLabel(player) {
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

export function buildPlayerPortraitSvg(player) {
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

export function buildProfileLatestSeasonSummary(position, entry) {
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

export function renderPlayerProfileHero(profile) {
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

export function setStatus(text) {
  const el = document.getElementById("statusChip");
  if (!el) return;
  el.textContent = text;
  const tone =
    /^error/i.test(text) ? "negative"
      : /^blocked/i.test(text) ? "warning"
        : /loading|simulating|working|retiring|saving|updating|starting|searching|refreshing|advancing/i.test(text) ? "info"
          : /ready|done/i.test(text) ? "positive"
            : null;
  setElementTone(el, tone);
}

export function appendAvLast(row, av) {
  return { ...row, av: av ?? 0 };
}

export function toTitleCaseKey(key) {
  if (!key) return "";
  if (DISPLAY_LABELS[key]) return DISPLAY_LABELS[key];
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function shouldHideInternalColumn(column) {
  return column === "id" || column === "playerId";
}

export function readStatsHiddenColumns() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("vsfgm:stats-hidden-columns") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStatsHiddenColumns(columns) {
  state.statsHiddenColumns = [...columns];
  try {
    window.localStorage.setItem("vsfgm:stats-hidden-columns", JSON.stringify(state.statsHiddenColumns));
  } catch {
    // Ignore persistence failures.
  }
}

export function readTradeBlockIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("vsfgm:trade-block") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTradeBlockIds(ids) {
  state.tradeBlockIds = [...new Set(ids)];
  try {
    window.localStorage.setItem("vsfgm:trade-block", JSON.stringify(state.tradeBlockIds));
  } catch {
    // Ignore persistence failures.
  }
}

export function formatHeight(heightInches) {
  if (!Number.isFinite(heightInches)) return "-";
  const feet = Math.floor(heightInches / 12);
  const inches = heightInches % 12;
  return `${feet}'${inches}"`;
}

export function normalizeSeasonType(value, fallback = "regular") {
  if (value === "regular" || value === "playoffs" || value === "all") return value;
  return fallback;
}

export function selectedSeasonType() {
  return normalizeSeasonType(document.getElementById("statsSeasonTypeFilter")?.value, "regular");
}

export function showToast(message) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 2600);
}

export function metricNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/[^0-9.+-]/g, "");
  if (!text || text === "+" || text === "-" || text === ".") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyTone(column, value) {
  const key = String(column || "").toLowerCase();
  const text = String(value ?? "").trim();
  const lower = text.toLowerCase();
  const number = metricNumber(value);

  if (!text) return null;
  if (lower.includes("error") || lower.includes("blocked")) return "negative";
  if (lower.includes("warning") || lower.includes("watch") || lower.includes("pressure")) return "warning";
  if (lower.includes("healthy") || lower.includes("ready") || lower.includes("won") || lower.includes("surplus")) return "positive";
  if (lower.includes("locked")) return "warning";

  if (["delta", "change", "swing"].some((token) => key.includes(token)) && number != null) {
    return number > 0 ? "positive" : number < 0 ? "negative" : null;
  }
  if (["capspace", "space", "cash", "wins", "projectedwins", "confidence", "fit", "chemistry"].some((token) => key.includes(token)) && number != null) {
    return number > 0 ? "positive" : number < 0 ? "negative" : null;
  }
  if (["deadcap", "losses", "heat", "pressure", "injury", "risk"].some((token) => key.includes(token)) && number != null) {
    return number > 0 ? "warning" : null;
  }
  if (["ovr", "av", "grade", "potential"].some((token) => key === token || key.includes(token)) && number != null) {
    if (number >= 85) return "positive";
    if (number <= 65) return "warning";
    return "accent";
  }
  if (key === "status") {
    if (/(healthy|ready|active|available)/i.test(text)) return "positive";
    if (/(inj|suspended|out|inactive)/i.test(text)) return "warning";
  }
  return null;
}

export function setElementTone(elementOrId, tone) {
  const el = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
  if (!el) return;
  el.classList.remove("tone-positive", "tone-negative", "tone-warning", "tone-info", "tone-accent");
  if (tone) el.classList.add(`tone-${tone}`);
}

export function setMetricCardValue(elementId, value, tone = null) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = value;
  setElementTone(el, tone);
}

export function formatActionError(error) {
  const reasonCode = error?.reasonCode || error?.payload?.reasonCode;
  if (reasonCode === "challenge-free-agency") {
    return "Challenge mode blocks free-agent adds, waiver claims, and forced comeback signings for this franchise.";
  }
  if (reasonCode === "challenge-top10-picks") {
    return "Challenge mode blocks the controlled team from acquiring or using top-10 draft picks.";
  }
  if (reasonCode === "history-retired-number-active") {
    return "This league requires a player to be retired before a team can retire that jersey number.";
  }
  if (reasonCode === "history-retired-number-hof") {
    return "This league requires Hall of Fame induction before a jersey number can be retired.";
  }
  if (reasonCode === "history-retired-number-av") {
    return "This player does not clear the league's retired-number legacy floor.";
  }
  return error?.message || "Unexpected error.";
}

export function presentActionError(error) {
  const message = formatActionError(error);
  const reasonCode = error?.reasonCode || error?.payload?.reasonCode || "";
  const prefix = reasonCode.startsWith("challenge-") ? "Blocked" : "Error";
  setStatus(`${prefix}: ${message}`);
  showToast(`${prefix}: ${message}`);
}

export function teamName(teamId) {
  return state.dashboard?.teams?.find((team) => team.id === teamId)?.name || teamId;
}

export function teamByCode(teamId) {
  return state.dashboard?.teams?.find((team) => team.id === teamId) || null;
}

export function teamCode(teamId) {
  if (!teamId || ["FA", "WAIVER", "TIE", "TBD", "ALL"].includes(teamId)) return teamId || "-";
  return teamByCode(teamId)?.abbrev || teamId;
}

export function teamDisplayFromId(teamId) {
  const team = teamByCode(teamId);
  return team ? `${team.abbrev || team.id} - ${team.name}` : teamId || "-";
}

export function teamDisplayLabel(team) {
  return `${team?.abbrev || team?.id || "-"} - ${team?.name || "-"}`;
}

export function hexToRgbTriplet(hex, fallback = "70, 182, 154") {
  const safe = String(hex || "").trim().replace("#", "");
  if (![3, 6].includes(safe.length)) return fallback;
  const normalized = safe.length === 3 ? safe.split("").map((part) => `${part}${part}`).join("") : safe;
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) return fallback;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `${r}, ${g}, ${b}`;
}

export function getActiveTeamTheme() {
  const controlledTeamId = state.dashboard?.controlledTeam?.id || state.dashboard?.controlledTeamId || "BUF";
  return TEAM_THEME_MAP[controlledTeamId] || TEAM_THEME_MAP.BUF;
}

export function applyShellTheme() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;
  const theme = getActiveTeamTheme();
  root.style.setProperty("--team-primary", theme.primary);
  root.style.setProperty("--team-secondary", theme.secondary);
  root.style.setProperty("--team-tertiary", theme.tertiary);
  root.style.setProperty("--team-primary-rgb", hexToRgbTriplet(theme.primary, "0, 51, 141"));
  root.style.setProperty("--team-secondary-rgb", hexToRgbTriplet(theme.secondary, "198, 12, 48"));
  root.style.setProperty("--team-tertiary-rgb", hexToRgbTriplet(theme.tertiary, "91, 194, 231"));
  body.dataset.activeTab = state.activeTab || "overviewTab";
}

export function setSimControl(next) {
  state.simControl = { ...state.simControl, ...next };
  const pauseBtn = document.getElementById("pauseSimBtn");
  if (pauseBtn) {
    pauseBtn.disabled = !state.simControl.active;
    pauseBtn.textContent = state.simControl.pauseRequested ? "Pausing..." : "Pause Sim";
  }
}

export function buildProfileSeasonAvMap(profile) {
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

export function passerRateFromStats(stats) {
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

export function formatAwards(awards = [], champion = false) {
  const tags = [...awards];
  if (champion) tags.unshift("SB");
  return tags.join(", ");
}

export function buildProfileSeasonRows(profile) {
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

export function buildProfileCareerRow(profile) {
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

export function buildProfileTeamSplits(profile) {
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

export function rowJoinKey(row) {
  return `${row.playerId || row.id || row.player}-${row.year || row.seasons || 0}`;
}

export function shapeStatsRowsForDisplay(rows, { scope, category }) {

export function renderGuideContent() {
  const html = GUIDE_SECTIONS.map(
    (section) => `<div class="record"><strong>${escapeHtml(section.title)}</strong><div>${escapeHtml(section.body)}</div></div>`
  ).join("");
  const rules = document.getElementById("rulesGuideContent");
  const modal = document.getElementById("guideModalContent");
  if (rules) rules.innerHTML = html;
  if (modal) modal.innerHTML = html;
}

export function setTableSkeleton(tableId, rows = 6) {
  const table = document.getElementById(tableId);
  if (!table) return;
  table.innerHTML = Array.from({ length: rows })
    .map(() => `<tr><td><div class="skeleton"></div></td></tr>`)
    .join("");
}

export function valueAsNumber(row, key) {
  const raw = row?.[key];
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createEmptyTradeAssets() {
  return {
    teamAPlayerIds: [],
    teamBPlayerIds: [],
    teamAPickIds: [],
    teamBPickIds: []
  };
}

export function tradeAssetKeys(side) {
  return side === "A"
    ? { playerKey: "teamAPlayerIds", pickKey: "teamAPickIds", rosterKey: "tradeTeamARoster", picksKey: "tradeTeamAPicks" }
    : { playerKey: "teamBPlayerIds", pickKey: "teamBPickIds", rosterKey: "tradeTeamBRoster", picksKey: "tradeTeamBPicks" };
}

export function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter(Boolean))];
}

export function fmtDeltaMoney(value) {
  if (!Number.isFinite(value)) return "$0";
  const abs = fmtMoney(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

export function formatTradeList(rows = []) {
  if (!rows.length) return "none";
  return rows.map((row) => `${row.player || row.playerId} (${fmtMoney(row.capHit || 0)})`).join(", ");
}

export function formatTransactionDetails(entry) {
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

export function setTradeEvalText(text) {
  const el = document.getElementById("tradeEvalText");
  if (el) el.textContent = text;
}

export function renderTable(
  tableId,
  rows,
  { sortable = false, onSort = null, sortKey = null, sortDir = "desc", maxRows = null, hiddenColumns = [] } = {}

export function setSelectOptions(selectId, options, preferredValue = null) {
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

export function syncTeamSelects() {
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
  applyShellTheme();
}

export function updateTopMeta() {
  const d = state.dashboard;
  if (!d) return;
  document.getElementById("topMetaText").textContent =
    `${d.currentYear} W${d.currentWeek} | ${d.phase} | Team: ${d.controlledTeam?.abbrev || d.controlledTeamId}`;
  const stageChip = document.getElementById("stageChip");
  if (stageChip) {
    const draftStage = d.draft?.completed === false ? `Draft Pick ${d.draft.currentPick}` : null;
    const offseasonStage = d.offseasonPipeline?.currentStage?.replaceAll("-", " ") || null;
    stageChip.textContent = `Stage: ${draftStage || offseasonStage || d.phase}`;
    setElementTone(
      stageChip,
      /playoff|super bowl|draft/i.test(stageChip.textContent) ? "accent" : /offseason/i.test(stageChip.textContent) ? "info" : "positive"
    );
  }
}

export function renderPulseChips(containerId, chips, emptyText) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const filtered = (chips || []).filter(Boolean);
  el.innerHTML = filtered.length
    ? filtered.map((chip) => `<span class="control-pulse-chip">${escapeHtml(chip)}</span>`).join("")
    : `<span class="control-pulse-chip">${escapeHtml(emptyText)}</span>`;
}

export function setBoxScoreTab(panelId = "boxScoreStatsPanel") {
  document.querySelectorAll("[data-boxscore-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.boxscoreTab === panelId);
  });
  document.querySelectorAll("#boxScoreModal .subtab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
}

export function decoratePlayerColumnFromRows(tableId, rows, { nameKey = "player", idKeys = ["playerId", "id"] } = {}) {

export function decoratePlayerColumnByIds(tableId, playerIds, playerColumnIndex = 1) {
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

export async function loadPlayerModal(playerId) {
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

export function closePlayerModal() {
  state.activePlayerId = null;
  document.getElementById("playerModal").classList.add("hidden");
}

export function bindMenuTabs(activateTabFn) {
  document.querySelectorAll(".menu-btn").forEach((button) => {
    button.addEventListener("click", () => activateTabFn(button.dataset.tab));
  });
}

export async function runAction(fn, statusText = "Working...") {
  try {
    setStatus(statusText);
    await fn();
    setStatus("Ready");
    showToast("Done");
  } catch (error) {
    presentActionError(error);
  }
}
