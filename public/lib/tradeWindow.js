/**
 * tradeWindow.js — one trade-deadline authority for the player-facing surfaces.
 *
 * S101: three surfaces hand-typed three different windows (9-11, 8-10, W12) for
 * a rule the engine never enforced. Declared once in DEFAULT_LEAGUE_SETTINGS,
 * enforced once in TradeService.commit, derived once here.
 */

/** How many weeks before the deadline the "window is closing" surfaces appear. */
export const DEADLINE_STRETCH_WEEKS = 2;

/**
 * `declared` is false when the league carries no deadline rule; callers must
 * then say nothing about a window rather than inventing one.
 */
export function tradeWindow(dashboard = {}) {
  const deadlineWeek = Number(dashboard?.settings?.tradeDeadlineWeek);
  const phase = String(dashboard?.phase || "").toLowerCase();
  const week = Number(dashboard?.currentWeek);

  if (!Number.isFinite(deadlineWeek)) {
    return { declared: false, deadlineWeek: null, open: true, closing: false, weeksLeft: null };
  }

  const regularSeason = phase === "regular-season";
  const postseason = phase === "postseason";
  const knownWeek = Number.isFinite(week);

  const open = postseason ? false : !(regularSeason && knownWeek && week > deadlineWeek);
  const closing = Boolean(
    regularSeason && knownWeek && week >= deadlineWeek - DEADLINE_STRETCH_WEEKS && week <= deadlineWeek
  );
  const weeksLeft = regularSeason && knownWeek ? Math.max(0, deadlineWeek - week) : null;

  return { declared: true, deadlineWeek, open, closing, weeksLeft };
}
