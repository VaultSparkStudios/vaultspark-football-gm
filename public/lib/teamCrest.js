// Procedural team crest generator. Pure — no DOM, no app-state imports, no
// shared RNG stream. Motif and layout are derived only from the team's own
// identity strings (city + name) via a local FNV-1a hash, so the same team
// always renders the same crest and different teams spread across motifs.

const MOTIFS = ["shield", "roundel", "chevron", "star", "wing", "monogram"];

function fnv1a(value) {
  let hash = 0x811c9dc5;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function escapeSvgText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeHex(hex, fallback) {
  const raw = String(hex || "").trim();
  const m = /^#?([0-9a-fA-F]{6})$/.exec(raw);
  return m ? `#${m[1]}` : fallback;
}

function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Picks readable text color (near-black or near-white) against a fill. */
function contrastTextColor(hex) {
  return relativeLuminance(hex) > 0.42 ? "#12181c" : "#f5f1e7";
}

function shieldPath(size) {
  const w = size, h = size;
  return `M${w * 0.5} ${h * 0.04} L${w * 0.92} ${h * 0.2} V${h * 0.52} ` +
    `C${w * 0.92} ${h * 0.78} ${w * 0.74} ${h * 0.94} ${w * 0.5} ${h * 0.98} ` +
    `C${w * 0.26} ${h * 0.94} ${w * 0.08} ${h * 0.78} ${w * 0.08} ${h * 0.52} ` +
    `V${h * 0.2} Z`;
}

function motifShapeMarkup(motif, size, secondary) {
  const cx = size / 2, cy = size / 2;
  switch (motif) {
    case "roundel":
      return `<circle cx="${cx}" cy="${cy}" r="${size * 0.44}" fill="none" stroke="${secondary}" stroke-width="${size * 0.05}" opacity="0.85" />`;
    case "chevron":
      return `<path d="M${size * 0.1} ${size * 0.62} L${cx} ${size * 0.32} L${size * 0.9} ${size * 0.62}" fill="none" stroke="${secondary}" stroke-width="${size * 0.09}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />`;
    case "star": {
      const pts = [];
      for (let i = 0; i < 10; i += 1) {
        const r = i % 2 === 0 ? size * 0.4 : size * 0.18;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${secondary}" opacity="0.5" />`;
    }
    case "wing":
      return `<path d="M${size * 0.06} ${cy} Q${cx} ${size * 0.14} ${size * 0.94} ${cy} Q${cx} ${size * 0.58} ${size * 0.06} ${cy} Z" fill="${secondary}" opacity="0.4" />`;
    case "monogram":
      return `<rect x="${size * 0.14}" y="${size * 0.14}" width="${size * 0.72}" height="${size * 0.72}" rx="${size * 0.16}" fill="none" stroke="${secondary}" stroke-width="${size * 0.05}" opacity="0.8" />`;
    case "shield":
    default:
      return `<path d="${shieldPath(size)}" fill="none" stroke="${secondary}" stroke-width="${size * 0.045}" opacity="0.75" transform="translate(0,${size * -0.02}) scale(0.86)" transform-origin="${cx} ${cy}" />`;
  }
}

/**
 * Builds an inline SVG string for a team crest.
 * @param {{teamId?: string|number, code?: string, city?: string, name?: string,
 *   primary?: string, secondary?: string, size?: number}} opts
 * @returns {string} SVG markup
 */
export function buildTeamCrestSvg(opts = {}) {
  const { teamId = "", code = "", city = "", name = "", size = 64 } = opts;
  const dim = Math.max(16, Number(size) || 64);
  const primary = normalizeHex(opts.primary, "#2f4645");
  const secondary = normalizeHex(opts.secondary, "#f4c97a");

  const seed = fnv1a(`${city}|${name}|${teamId}`);
  const motif = MOTIFS[seed % MOTIFS.length];

  const monogram = String(code || name || "?")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3) || "?";

  const textColor = contrastTextColor(primary);
  const outline = contrastTextColor(secondary) === "#12181c" ? secondary : primary;
  const label = `${city} ${name}`.trim() || monogram;
  const cx = dim / 2;
  const cy = dim / 2;
  const fontSize = dim * (monogram.length >= 3 ? 0.3 : 0.38);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" role="img" aria-label="${escapeSvgText(label)} crest">` +
    `<path d="${shieldPath(dim)}" fill="${primary}" stroke="${outline}" stroke-width="${Math.max(1, dim * 0.03)}" />` +
    motifShapeMarkup(motif, dim, secondary) +
    `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="Bahnschrift, 'Franklin Gothic Medium', sans-serif" font-weight="800" font-size="${fontSize.toFixed(1)}" fill="${textColor}">${escapeSvgText(monogram)}</text>` +
    `</svg>`
  );
}

/** Encodes a crest as a `data:image/svg+xml` URI suitable for an <img src>. */
export function teamCrestDataUri(opts = {}) {
  const svg = buildTeamCrestSvg(opts);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// S109: DOM mount used by the Desk spotlight; lives here so the static
// overview module pays only for a dynamic import.
export function mountTeamCrest(slot, team = {}, theme = {}, size = 56) {
  if (!slot) return;
  slot.innerHTML = buildTeamCrestSvg({
    teamId: team.id,
    code: team.abbrev || team.id || "",
    city: team.city || "",
    name: team.nickname || team.name || "",
    primary: theme.primary || "#1f2933",
    secondary: theme.secondary || "#d7a24a",
    size
  });
}