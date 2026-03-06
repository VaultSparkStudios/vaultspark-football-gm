export function createSessionModules(session) {
  return {
    roster: {
      get: (teamId) => session.getRoster(teamId),
      setDesignation: (payload) => session.setPlayerDesignation(payload),
      setPracticeSquad: (payload) => session.setPracticeSquad(payload)
    },
    transactions: {
      trade: (payload) => session.tradePlayers(payload),
      evaluateTrade: (payload) => session.evaluateTradePackage(payload),
      log: (filters) => session.getTransactionLog(filters)
    },
    offseason: {
      pipeline: () => session.getOffseasonPipeline(),
      advancePipeline: () => session.advanceOffseasonPipeline(),
      compPicks: (filters) => session.getCompensatoryPicks(filters)
    },
    owner: {
      get: (teamId) => session.getOwnerState(teamId),
      update: (payload) => session.updateOwnerState(payload)
    }
  };
}
