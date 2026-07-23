/**
 * Domain Services — GameSession Decomposition
 *
 * These services are bound to GameSession at runtime as an incremental extraction target. GameSession remains the source of truth until each domain delegates here and passes parity tests.
 *
 *   Phase 1 (complete):  Service bundle is constructed on GameSession
 *   Phase 2 (active):    Migrate one domain at a time; GameSession delegates
 *   Phase 3 (target):    GameSession is a thin coordinator; all logic in services
 *
 * Usage in GameSession: bind createServices(this), then delegate through
 *   services.contracts.releasePlayer(id) or services.scouting.getWeeklyPoints(teamId).
 */

import { ContractService } from "./ContractService.js";
import { ScoutingService } from "./ScoutingService.js";
import { OwnerService }    from "./OwnerService.js";
import { DraftService }    from "./DraftService.js";
import { StatsService }    from "./StatsService.js";

export { ContractService, ScoutingService, OwnerService, DraftService, StatsService };

/**
 * Factory: create all services bound to the same live session/league object.
 */
export function createServices(sessionOrLeague) {
  const league = sessionOrLeague?.league || sessionOrLeague;
  return {
    contracts: new ContractService(sessionOrLeague),
    scouting:  new ScoutingService(league),
    owner:     new OwnerService(league),
    draft:     new DraftService(league),
    stats:     new StatsService(league)
  };
}
