/**
 * momentCard.js — Shareable moment cards (S109)
 *
 * Every producer of a "moment" worth bragging about (a trophy, a season
 * epilogue, a development report, a first-round pick) can turn that moment
 * into a deterministic, brand-consistent 1200x630 share image without any
 * server round-trip: `buildMomentCardSvg` is a pure string builder, and
 * `rasterizeMomentCard` / `shareMomentCard` do the browser-only work of
 * turning that SVG into a PNG the OS share sheet, the clipboard, or a new
 * tab can use.
 *
 * This module is a lazy island — every producer reaches it via
 * `await import("./momentCard.js")`, never a static import, so the boot
 * graph does not grow for players who never share anything.
 */

import { encodeChallengeCode } from "./challengeCodes.js";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const DARK_GROUND = "#0b0f14";
const LIGHT_INK = "#f5f7fa";
const DARK_INK = "#0b0f14";
const MUTED_INK = "#8fa0ac";
const DEFAULT_PRIMARY = "#1f6feb";
const DEFAULT_SECONDARY = "#f7c948";

// ── Pure helpers ─────────────────────────────────────────────────────────────

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeHexColor(value, fallback) {
  const str = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(str) || /^#[0-9a-fA-F]{3}$/.test(str) ? str : fallback;
}

function expandShortHex(hex) {
  if (hex.length === 4) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

// WCAG-style relative luminance — decides whether a background colour needs
// dark or light ink drawn over it.
export function relativeLuminance(hex) {
  const normalized = expandShortHex(normalizeHexColor(hex, "#000000"));
  const rgb = [1, 3, 5].map((i) => parseInt(normalized.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function inkColorFor(hex) {
  return relativeLuminance(hex) > 0.55 ? DARK_INK : LIGHT_INK;
}

function truncate(value, max) {
  const str = String(value ?? "");
  return str.length > max ? `${str.slice(0, Math.max(0, max - 1))}…` : str;
}

// ── Card builder ─────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.kind             producer identity, e.g. "achievement"
 * @param {string} opts.headline         the big line (escaped, truncated)
 * @param {string} [opts.subline]        supporting line under the headline
 * @param {{label:string,value:string|number}[]} [opts.stats] up to 3 stat tiles
 * @param {string} [opts.teamCode]       short team code, shown in the band
 * @param {string} [opts.teamName]       team display name
 * @param {string} [opts.primary]        team primary colour (hex)
 * @param {string} [opts.secondary]      team secondary colour (hex)
 * @param {string} [opts.seasonLabel]    e.g. "2031 Season"
 * @param {string} [opts.weekLabel]      e.g. "Week 7"
 * @param {string} [opts.challengeCode]  a VSFC1 challenge code, if one exists
 * @param {string} [opts.crestSvg]       an inline <svg>…</svg> string
 * @returns {string} deterministic 1200x630 SVG markup
 */
export function buildMomentCardSvg({
  kind = "moment",
  headline = "",
  subline = "",
  stats = [],
  teamCode = "",
  teamName = "",
  primary = DEFAULT_PRIMARY,
  secondary = DEFAULT_SECONDARY,
  seasonLabel = "",
  weekLabel = "",
  challengeCode = "",
  crestSvg = ""
} = {}) {
  const primaryHex = normalizeHexColor(primary, DEFAULT_PRIMARY);
  const secondaryHex = normalizeHexColor(secondary, DEFAULT_SECONDARY);
  const bandInk = inkColorFor(primaryHex);
  const boundedStats = (Array.isArray(stats) ? stats : []).slice(0, 3);

  const bandLabel = [teamCode, teamName].filter(Boolean).join(" · ") || "Franchise Architect";
  const metaLabel = [seasonLabel, weekLabel].filter(Boolean).join(" · ");

  const tileWidth = 340;
  const tileGap = 30;
  const tilesTotalWidth = boundedStats.length * tileWidth + Math.max(0, boundedStats.length - 1) * tileGap;
  const tilesStartX = (CARD_WIDTH - tilesTotalWidth) / 2;
  const tileY = 400;
  const tileHeight = 140;

  const tilesMarkup = boundedStats
    .map((stat, index) => {
      const x = tilesStartX + index * (tileWidth + tileGap);
      return `
      <g transform="translate(${x}, ${tileY})">
        <rect x="0" y="0" width="${tileWidth}" height="${tileHeight}" rx="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" />
        <text x="28" y="58" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="46" fill="${escapeXml(secondaryHex)}">${escapeXml(truncate(stat?.value, 14))}</text>
        <text x="28" y="100" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="24" fill="${MUTED_INK}">${escapeXml(truncate(stat?.label, 26))}</text>
      </g>`;
    })
    .join("");

  const crestMarkup = crestSvg
    ? `<g transform="translate(${CARD_WIDTH - 176}, 40)">${crestSvg}</g>`
    : "";

  const challengeMarkup = challengeCode
    ? `<text x="${CARD_WIDTH - 60}" y="${CARD_HEIGHT - 44}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="24" fill="${escapeXml(secondaryHex)}">${escapeXml(truncate(challengeCode, 40))}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${DARK_GROUND}" />
  <rect x="0" y="0" width="${CARD_WIDTH}" height="118" fill="${escapeXml(primaryHex)}" />
  <text x="60" y="72" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="40" fill="${bandInk}">${escapeXml(truncate(bandLabel, 42))}</text>
  ${metaLabel ? `<text x="60" y="102" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="22" fill="${bandInk}" opacity="0.85">${escapeXml(truncate(metaLabel, 60))}</text>` : ""}
  ${crestMarkup}
  <text x="60" y="230" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="64" fill="${LIGHT_INK}">${escapeXml(truncate(headline, 34))}</text>
  ${subline ? `<text x="60" y="280" font-family="Arial, Helvetica, sans-serif" font-weight="500" font-size="30" fill="${MUTED_INK}">${escapeXml(truncate(subline, 60))}</text>` : ""}
  ${tilesMarkup}
  <line x1="60" y1="${CARD_HEIGHT - 78}" x2="${CARD_WIDTH - 60}" y2="${CARD_HEIGHT - 78}" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" />
  <text x="60" y="${CARD_HEIGHT - 44}" font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="24" fill="${MUTED_INK}">Franchise Architect: Football · playfranchisearchitect.com</text>
  ${challengeMarkup}
</svg>`;
}

// ── Rasterization (browser only) ────────────────────────────────────────────

/**
 * @param {string} svg
 * @returns {Promise<Blob>} a PNG blob rendered from the SVG at its declared size
 */
export function rasterizeMomentCard(svg, { width = CARD_WIDTH, height = CARD_HEIGHT } = {}) {
  return new Promise((resolve, reject) => {
    let url = null;
    try {
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("2D canvas context unavailable");
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((pngBlob) => {
            if (url) URL.revokeObjectURL(url);
            if (pngBlob) resolve(pngBlob);
            else reject(new Error("Canvas toBlob returned null"));
          }, "image/png");
        } catch (err) {
          if (url) URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        if (url) URL.revokeObjectURL(url);
        reject(new Error("Moment card SVG failed to rasterize"));
      };
      img.src = url;
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      reject(err);
    }
  });
}

// ── Sharing ──────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.svg
 * @param {string} [opts.filename]
 * @param {string} [opts.title]
 * @param {string} [opts.text]
 * @returns {Promise<"share"|"clipboard"|"tab"|"cancelled">} which path was used
 */
export async function shareMomentCard({ svg, filename = "franchise-architect-moment.png", title = "", text = "" } = {}) {
  const blob = await rasterizeMomentCard(svg);

  if (typeof navigator !== "undefined" && navigator.share && typeof File === "function") {
    try {
      const file = new File([blob], filename, { type: "image/png" });
      const canShareFiles = typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({ files: [file], title, text });
        return "share";
      }
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      // Fall through to the clipboard/tab paths below.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.write && typeof ClipboardItem === "function") {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      return "clipboard";
    } catch {
      // Fall through to the new-tab path below.
    }
  }

  const url = URL.createObjectURL(blob);
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
  return "tab";
}

// ── Challenge code derivation ────────────────────────────────────────────────

/**
 * Reuses the exact derivation `copyChallengeCode` (app.js, the Speedrun
 * Challenge panel) uses: this browser's active speedrun league seed plus its
 * best logged run, encoded via `encodeChallengeCode`. Returns "" — never
 * throws — when no active league seed exists, so producers can omit the
 * field cleanly rather than build a card around a missing code.
 * @param {object} state the shared app state (./appState.js)
 * @returns {string}
 */
export function deriveActiveChallengeCode(state) {
  const meta = state?.speedrunLeagueMeta;
  if (!meta || meta.seed == null) return "";
  const leaderboard = Array.isArray(state.speedrunLeaderboard) ? state.speedrunLeaderboard : [];
  const bestRun = leaderboard
    .filter((entry) => entry?.playerName && Number(entry.seasons) > 0)
    .sort((a, b) => a.seasons - b.seasons)[0] || null;
  const code = encodeChallengeCode({
    seed: meta.seed,
    startYear: meta.startYear,
    teamId: state.speedrunChallenge?.teamId || meta.controlledTeamId,
    rivalSeasons: bestRun?.seasons ?? null,
    rivalName: bestRun?.playerName ?? null
  });
  return code || "";
}

// ── Mount ────────────────────────────────────────────────────────────────────





/**
 * Appends a "Share this moment" button to `container`. `buildOptions` may be
 * a plain options object, a zero-arg function returning one, or a zero-arg
 * function returning a Promise of one. Idempotent: calling this again on a
 * container that already has the control is a no-op.
 * @param {Element} container
 * @param {object|Function} buildOptions
 * @returns {Element|null} the mounted wrapper, or null if not mounted
 */
export function mountShareControl(container, buildOptions) {
  if (!container || container.querySelector("[data-moment-share-btn]")) return null;

  const wrap = document.createElement("div");
  wrap.className = "moment-card-share";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "moment-card-share-btn";
  button.dataset.momentShareBtn = "";
  button.setAttribute("aria-label", "Share this moment");
  button.textContent = "Share this moment";

  const status = document.createElement("span");
  status.className = "moment-card-share-status";
  status.setAttribute("aria-live", "polite");

  wrap.appendChild(button);
  wrap.appendChild(status);
  container.appendChild(wrap);

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Preparing…";
    try {
      const resolved = typeof buildOptions === "function" ? buildOptions() : buildOptions;
      const opts = resolved && typeof resolved.then === "function" ? await resolved : resolved;
      if (!opts) throw new Error("No moment card data available");

      let crestSvg = opts.crestSvg;
      if (crestSvg === undefined) {
        // The crest module is optional. Its absence
        // (module 404, or a load error) must never block sharing.
        try {
          const crestModule = await import("./teamCrest.js");
          if (typeof crestModule.buildTeamCrestSvg === "function") {
            crestSvg = crestModule.buildTeamCrestSvg({
              teamId: opts.teamId || opts.teamCode,
              code: opts.teamCode,
              city: opts.teamCity || opts.teamName,
              name: opts.teamName,
              primary: opts.primary,
              secondary: opts.secondary,
              size: 96
            });
          }
        } catch {
          crestSvg = "";
        }
      }

      const svg = buildMomentCardSvg({ ...opts, crestSvg: crestSvg || "" });
      const via = await shareMomentCard({
        svg,
        filename: `franchise-architect-${opts.kind || "moment"}.png`,
        title: "Franchise Architect: Football",
        text: opts.headline || ""
      });
      status.textContent =
        via === "share" ? "Shared." :
        via === "clipboard" ? "Copied image to clipboard." :
        via === "cancelled" ? "Share cancelled." :
        "Opened the image in a new tab.";
    } catch {
      status.textContent = "Could not share this moment.";
    } finally {
      button.disabled = false;
    }
  });

  return wrap;
}

// ── S109: producer hooks that used to live in static modules ─────────────────
// achievements.js and draftPickReveal.js are on the boot path; their share
// hooks moved here so the boot graph pays only for a three-line call.
export function mountTrophyCaseShareControls(el, earned, { achievements = [], tierLabels = {}, state = {}, teamThemeMap = {} } = {}) {
  const rows = el.querySelectorAll(".trophy-earned[data-trophy-id]");
  rows.forEach((row) => {
    const body = row.querySelector(".trophy-body");
    if (!body) return;
    const achievementId = row.dataset.trophyId;
    const achievement = achievements.find((a) => a.id === achievementId);
    const record = earned?.[achievementId];
    if (!achievement || !record) return;
    mountShareControl(body, () => {
      const d = state.dashboard || {};
      const theme = teamThemeMap[d.controlledTeam?.abbrev] || {};
      return {
        kind: "achievement",
        headline: achievement.name,
        subline: achievement.desc,
        stats: [
          { label: "Tier", value: tierLabels[achievement.tier] || "" },
          record.earnedAt ? { label: "Earned", value: new Date(record.earnedAt).toLocaleDateString() } : null,
          record.franchise ? { label: "Franchise", value: record.franchise } : null
        ].filter(Boolean),
        teamCode: d.controlledTeam?.abbrev || "",
        teamName: d.controlledTeam?.name || record.franchise || "Franchise Architect",
        primary: theme.primary,
        secondary: theme.secondary,
        challengeCode: deriveActiveChallengeCode(state)
      };
    });
  });
}

export function mountDraftRevealShareControl(mount, { prospect = null, teamName = "", shownOverall = null, state = {}, teamThemeMap = {} } = {}) {
  mountShareControl(mount, () => {
    const d = state.dashboard || {};
    const teamAbbrev = d.controlledTeam?.abbrev || "";
    const theme = teamThemeMap[teamAbbrev] || {};
    return {
      kind: "draft-pick",
      headline: prospect?.name || "Round 1 Pick",
      subline: `${prospect?.position || prospect?.pos || "?"} · Round 1 Pick`,
      stats: [
        { label: "Overall", value: shownOverall ?? "—" },
        prospect?.college ? { label: "College", value: prospect.college } : null
      ].filter(Boolean),
      teamCode: teamAbbrev,
      teamName: teamName || d.controlledTeam?.name || "",
      primary: theme.primary,
      secondary: theme.secondary,
      challengeCode: deriveActiveChallengeCode(state)
    };
  });
}
