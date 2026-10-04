/**
 * Calendar contract (multi-sport Phase 1 step 4).
 *
 * A sport pack declares its season as data: an ordered list of phases and an
 * ordered list of offseason stages, each naming the GameSession method that
 * runs it. The core never spells a phase transition itself; it asks this module
 * what comes next. The ids are the strings stored in league state and saves, so
 * they must never be renamed for an existing sport.
 *
 * @typedef {object} CalendarPhase
 * @property {string} id  the value stored in `session.phase`
 * @property {string} handler  GameSession method that advances this phase once
 * @property {string} [weeksFrom]  key of `rules.structure` holding the phase's week count;
 *   the phase ends once the week counter passes it
 *
 * @typedef {object} CalendarStage
 * @property {string} id  the value stored in `league.offseasonPipeline.stage`
 * @property {string} [handler]  GameSession method `(pipeline, next) => result`
 * @property {boolean} [terminal]  the resting stage once the pipeline is done
 *
 * @typedef {object} SportCalendar
 * @property {CalendarPhase[]} phases  in season order; the last wraps to the first
 * @property {CalendarStage[]} offseasonStages  in order; exactly one terminal stage, last
 */

export class UnknownCalendarPhaseError extends Error {
  constructor(phaseId, calendar) {
    const known = (calendar?.phases || []).map((phase) => phase.id).join(", ");
    super(`Unknown calendar phase "${phaseId}". Declared: ${known}`);
    this.name = "UnknownCalendarPhaseError";
    this.phaseId = phaseId;
  }
}

export function calendarPhase(calendar, phaseId) {
  const entry = calendar.phases.find((phase) => phase.id === phaseId);
  if (!entry) throw new UnknownCalendarPhaseError(phaseId, calendar);
  return entry;
}

/** The phase a new season opens in. */
export function seasonOpeningPhaseId(calendar) {
  return calendar.phases[0].id;
}

/** The phase that follows `phaseId`; the last phase wraps to the season opener. */
export function nextCalendarPhaseId(calendar, phaseId) {
  const index = calendar.phases.findIndex((phase) => phase.id === phaseId);
  if (index < 0) throw new UnknownCalendarPhaseError(phaseId, calendar);
  return calendar.phases[(index + 1) % calendar.phases.length].id;
}

/** The last week of a phase that declares a length, else null. */
export function calendarPhaseWeekLimit(calendar, phaseId, structure) {
  const entry = calendarPhase(calendar, phaseId);
  return entry.weeksFrom ? structure[entry.weeksFrom] : null;
}

export function offseasonStageIds(calendar) {
  return calendar.offseasonStages.map((stage) => stage.id);
}

export function firstOffseasonStageId(calendar) {
  return calendar.offseasonStages[0].id;
}

/** The resting stage once the pipeline is done (the last declared stage). */
export function terminalOffseasonStageId(calendar) {
  return calendar.offseasonStages[calendar.offseasonStages.length - 1].id;
}

/** The declared stage, or null for an id this calendar does not know (a legacy save). */
export function offseasonStage(calendar, stageId) {
  return calendar.offseasonStages.find((stage) => stage.id === stageId) || null;
}

export function nextOffseasonStageId(calendar, stageId) {
  const index = calendar.offseasonStages.findIndex((stage) => stage.id === stageId);
  if (index < 0 || index === calendar.offseasonStages.length - 1) return null;
  return calendar.offseasonStages[index + 1].id;
}

/**
 * Checks a calendar declaration, and optionally that every handler it names
 * exists on `host` (GameSession.prototype). Returns a list of problems.
 */
export function validateCalendar(calendar, host = null) {
  const problems = [];
  if (!calendar || !Array.isArray(calendar.phases) || !calendar.phases.length) return ["phases is not a non-empty array"];
  if (!Array.isArray(calendar.offseasonStages) || !calendar.offseasonStages.length) {
    return ["offseasonStages is not a non-empty array"];
  }
  const checkIds = (list, label) => {
    const seen = new Set();
    list.forEach((entry, index) => {
      if (typeof entry?.id !== "string" || !entry.id) problems.push(`${label}[${index}].id is missing`);
      else if (seen.has(entry.id)) problems.push(`${label}[${index}].id "${entry.id}" is declared twice`);
      else seen.add(entry.id);
    });
  };
  checkIds(calendar.phases, "phases");
  checkIds(calendar.offseasonStages, "offseasonStages");
  const checkHandler = (entry, label) => {
    if (typeof entry.handler !== "string" || !entry.handler) problems.push(`${label} "${entry.id}" names no handler`);
    else if (host && typeof host[entry.handler] !== "function") {
      problems.push(`${label} "${entry.id}" handler ${entry.handler} is not a method`);
    }
  };
  for (const phase of calendar.phases) checkHandler(phase, "phase");
  calendar.offseasonStages.forEach((stage, index) => {
    const last = index === calendar.offseasonStages.length - 1;
    if (stage.terminal) {
      if (!last) problems.push(`terminal stage "${stage.id}" is not last`);
      if (stage.handler) problems.push(`terminal stage "${stage.id}" must not name a handler`);
    } else {
      if (last) problems.push(`last stage "${stage.id}" is not terminal`);
      checkHandler(stage, "stage");
    }
  });
  return problems;
}
