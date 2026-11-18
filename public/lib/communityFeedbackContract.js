/**
 * Shared shape for the two things a player can send besides game stats:
 * a feedback note they wrote and chose to send, and (only with Community Stats
 * sharing on) short error reports. The browser builds payloads with these
 * functions and the service re-applies the same functions on arrival, so a
 * field that is not listed here cannot be stored.
 */

export const FEEDBACK_CATEGORIES = Object.freeze(["bug", "idea", "confusing", "praise"]);
export const FEEDBACK_MESSAGE_LIMIT = 2000;
export const FEEDBACK_VIEWPORTS = Object.freeze(["phone", "tablet", "desktop"]);
export const DIAGNOSTIC_BATCH_LIMIT = 10;
export const DIAGNOSTIC_MESSAGE_LIMIT = 300;
export const DIAGNOSTIC_FRAME_LIMIT = 8;
const RUNTIME_ERROR_NAMES = new Set(["TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError"]);

const FRAME_PATTERN = /^\/[A-Za-z0-9._/-]{1,160}\.js:\d{1,7}(?::\d{1,7})?$/;

function label(value, maxLength) {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, maxLength);
  return normalized || null;
}

function wholeNumber(value, min, max) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const whole = Math.round(parsed);
  return whole < min || whole > max ? null : whole;
}

/** The fixed context that travels with a feedback note. Unknown keys are dropped. */
export function normalizeFeedbackContext(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const context = {};
  const build = label(source.build, 64);
  const screen = label(source.screen, 48);
  const season = wholeNumber(source.season, 0, 9999);
  const week = wholeNumber(source.week, 0, 60);
  const viewport = FEEDBACK_VIEWPORTS.includes(source.viewport) ? source.viewport : null;
  const theme = label(source.theme, 24);
  if (build) context.build = build;
  if (screen) context.screen = screen;
  if (season != null) context.season = season;
  if (week != null) context.week = week;
  if (viewport) context.viewport = viewport;
  if (theme) context.theme = theme;
  return context;
}

export function cleanFeedbackMessage(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, FEEDBACK_MESSAGE_LIMIT);
}

/** Returns the storable feedback note, or null when it is not a valid one. */
export function normalizeFeedback(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (!FEEDBACK_CATEGORIES.includes(input.category)) return null;
  const message = cleanFeedbackMessage(input.message);
  if (!message) return null;
  return {
    category: input.category,
    message,
    rating: wholeNumber(input.rating, 1, 5),
    context: normalizeFeedbackContext(input.context)
  };
}

/**
 * Reduce an error stack to "/script-path.js:line:column" entries for scripts
 * served from `origin`. Function names, query strings, fragments, other
 * origins (extensions, injected scripts) and non-script paths are discarded.
 */
export function scrubStack(stack, origin) {
  const frames = [];
  if (!origin) return frames;
  for (const line of String(stack || "").split("\n")) {
    const match = /(https?:\/\/[^\s()]+?):(\d+)(?::(\d+))?\)?\s*$/.exec(line);
    if (!match) continue;
    let url;
    try { url = new URL(match[1]); } catch { continue; }
    if (url.origin !== origin) continue;
    const frame = `${url.pathname}:${match[2]}${match[3] ? `:${match[3]}` : ""}`;
    if (FRAME_PATTERN.test(frame)) frames.push(frame);
    if (frames.length >= DIAGNOSTIC_FRAME_LIMIT) break;
  }
  return frames;
}

/**
 * Error text can quote whatever the failing code was holding, and a single
 * quoted word can be a name used as a key. Web addresses, email addresses and
 * all quoted text are replaced before the message is shortened.
 */
export function scrubDiagnosticMessage(value) {
  return String(value ?? "")
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`)]+/gi, "[address]")
    .replace(/[^\s"'`<>()]+@[^\s"'`<>()]+\.[a-z]{2,}/gi, "[email]")
    .replace(/(["'`])((?:(?!\1)[^\n]){0,400})\1/g, (quoted, mark) => `${mark}[text]${mark}`)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, DIAGNOSTIC_MESSAGE_LIMIT);
}

/** Returns the storable error report, or null when it is not a valid one. */
export function normalizeDiagnosticReport(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const name = String(input.name ?? "").replace(/[^A-Za-z0-9_$.]/g, "").slice(0, 64);
  if (!name) return null;
  const stack = (Array.isArray(input.stack) ? input.stack : [])
    .filter((frame) => typeof frame === "string" && FRAME_PATTERN.test(frame))
    .slice(0, DIAGNOSTIC_FRAME_LIMIT);
  // Only the runtime's own error types keep their text. A message the game
  // wrote itself can name a player or a team, and names are never shared.
  const report = { name, message: RUNTIME_ERROR_NAMES.has(name) ? scrubDiagnosticMessage(input.message) : "", stack };
  const screen = label(input.screen, 48);
  const build = label(input.build, 64);
  if (screen) report.screen = screen;
  if (build) report.build = build;
  return report;
}

/** Browser side: turn a thrown value into a report using only this site's own script paths. */
export function buildDiagnosticReport(error, { origin, screen = null, build = null } = {}) {
  return normalizeDiagnosticReport({
    name: error?.name || "Error",
    message: error?.message ?? error,
    stack: scrubStack(error?.stack, origin),
    screen,
    build
  });
}

/** What one report is counted as: the error name plus where it was thrown. */
export function diagnosticSignatureSource(report) {
  // A report with no stack and no text (a failed background task) is told apart by its screen.
  return `${report.name}\n${report.stack[0] || report.message || report.screen || ""}`;
}
