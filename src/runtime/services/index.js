/**
 * Domain Services — GameSession Decomposition
 *
 * These services extract distinct domains from GameSession.js (2,800 lines)
 * into focused, testable units. Migration is incremental:
 *
 *   Phase 1 (complete):  Service scaffolds created with clean interfaces
 *   Phase 2 (next):      Migrate one domain at a time; GameSession delegates
 *   Phase 3 (target):    GameSession is a thin coordinator; all logic in services
 *
 * Usage in GameSession:
 *   import { createServices } from "./services/index.js";
 *   const services = createServices(league);
 *   services.contracts.releasePlayer(id);
 *   services.scouting.getWeeklyPoints(teamId);
 */

import { ContractService } from "./ContractService.js";
import { ScoutingService } from "./ScoutingService.js";
import { OwnerService }    from "./OwnerService.js";
import { DraftService }    from "./DraftService.js";
import { StatsService }    from "./StatsService.js";

export { ContractService, ScoutingService, OwnerService, DraftService, StatsService };

/**
 * Factory: create all services bound to the same league object.
 */
export function createServices(league) {
  return {
    contracts: new ContractService(league),
    scouting:  new ScoutingService(league),
    owner:     new OwnerService(league),
    draft:     new DraftService(league),
    stats:     new StatsService(league)
  };
}
