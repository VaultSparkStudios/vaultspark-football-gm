/**
 * Football's season calendar (multi-sport Phase 1 step 4). See
 * src/sport/calendarContract.js for the shape.
 *
 * The ids are the strings already stored in saves (`session.phase`,
 * `league.offseasonPipeline.stage` and `.stages`), so they are fixed.
 *
 * Offseason order is the real league calendar (S67): bodies leave first, the
 * market opens on the class that just hit it, and only then does anyone draft.
 * Before S67 every stage except `udfa` did nothing to the roster, and `udfa`
 * ran the whole rollover in one call after the draft, so the free-agent pool
 * was empty at every stage while ~295 contracts sat pending expiry.
 */
const declare = (entry) => Object.freeze(entry);

export const FOOTBALL_CALENDAR = Object.freeze({
  phases: Object.freeze([
    declare({ id: "regular-season", handler: "advanceRegularSeasonPhase", weeksFrom: "regularSeasonWeeks" }),
    declare({ id: "postseason", handler: "advancePostseasonPhase" }),
    declare({ id: "season-awards", handler: "advanceSeasonAwardsPhase" }),
    declare({ id: "offseason", handler: "advanceOffseasonPhase" })
  ]),
  offseasonStages: Object.freeze([
    declare({ id: "retirements", handler: "runOffseasonRetirementsStage" }),
    declare({ id: "coaching-carousel", handler: "runOffseasonCoachingCarouselStage" }),
    declare({ id: "combine", handler: "runOffseasonCombineStage" }),
    declare({ id: "pro-days", handler: "runOffseasonProDaysStage" }),
    declare({ id: "free-agency", handler: "runOffseasonFreeAgencyStage" }),
    declare({ id: "draft", handler: "runOffseasonDraftStage" }),
    declare({ id: "udfa", handler: "runOffseasonUdfaStage" }),
    declare({ id: "camp-cuts", handler: "runOffseasonCampCutsStage" }),
    declare({ id: "complete", terminal: true })
  ])
});
