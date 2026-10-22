/**
 * Domain Services — GameSession Decomposition
 *
 * Only characterized, production-delegated services are bound here. A domain
 * is not advertised merely because an extraction scaffold exists.
 */
import { ContractService } from "./ContractService.js";
import { CoachingService } from "./CoachingService.js";
import { TradeService } from "./TradeService.js";

export { ContractService, CoachingService, TradeService };

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
    }),
    trades: Object.freeze({
      delegated: true,
      methods: Object.freeze({
        evaluate: Object.freeze({
          callSites: Object.freeze([
            "GameSession.evaluateTradePackage",
            "sessionModules.transactions.evaluateTrade"
          ])
        }),
        commit: Object.freeze({
          callSites: Object.freeze([
            "GameSession.tradePlayers",
            "sessionModules.transactions.trade"
          ])
        })
      })
    })
  })
});

export function createServices(sessionOrLeague, strategies = {}) {
  return {
    contracts: new ContractService(sessionOrLeague),
    coaching: new CoachingService(sessionOrLeague),
    trades: new TradeService(sessionOrLeague, strategies)
  };
}
