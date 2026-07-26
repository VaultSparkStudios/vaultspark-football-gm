/**
 * Domain Services — GameSession Decomposition
 *
 * Only characterized, production-delegated services are bound here. A domain
 * is not advertised merely because an extraction scaffold exists.
 *
 * Usage in GameSession: bind createServices(this), then delegate through
 *   services.contracts.releasePlayer(id) or services.scouting.getWeeklyPoints(teamId).
 */

import { ContractService } from "./ContractService.js";
import { CoachingService } from "./CoachingService.js";

export { ContractService, CoachingService };

export const SERVICE_AUTHORITY_MANIFEST = Object.freeze({
  schemaVersion: "1.0",
  services: Object.freeze({
    contracts: Object.freeze({
      delegated: true,
      methods: Object.freeze({
        getCapSummary: Object.freeze({
          callSites: Object.freeze(["GameSession.getCapSummary"])
        })
      })
    }),
    coaching: Object.freeze({
      delegated: true,
      methods: Object.freeze({
        processLifecycle: Object.freeze({
          callSites: Object.freeze(["GameSession.processStaffLifecycle"])
        }),
        getTeamView: Object.freeze({
          callSites: Object.freeze(["GameSession.getDashboard"])
        })
      })
    })
  })
});

/**
 * Factory: create all services bound to the same live session/league object.
 */
export function createServices(sessionOrLeague) {
  return {
    contracts: new ContractService(sessionOrLeague),
    coaching:  new CoachingService(sessionOrLeague)
  };
}
