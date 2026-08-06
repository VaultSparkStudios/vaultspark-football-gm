const SEVERITY = Object.freeze({ "out-of-range": 3, watch: 2, incomplete: 1, "on-target": 0 });

function flagMap(receipt = {}) {
  return new Map((receipt.rooms || [])
    .filter((room) => room.status !== "on-target")
    .map((room) => [room.room, room]));
}

export function derivePositionRoomWatch(report = null) {
  if (!report?.progression) {
    return { status: "unavailable", alerts: [], summary: "Run verification to establish position-room evidence." };
  }
  const current = report.progression;
  const currentFlags = current.roomAlerts || (current.rooms || []).filter((room) => room.status !== "on-target");
  const history = report.progressionHistory || [];
  const previous = history.length > 1 ? flagMap(history.at(-2)) : new Map();
  const alerts = currentFlags.map((room) => {
    const persistent = previous.has(room.room);
    const status = room.status || "incomplete";
    const action = status === "incomplete"
      ? "Increase the room sample to at least 20 players, then rerun an independent seed."
      : persistent
        ? "Inspect this room's development and aging inputs; confirm with another seed before changing targets."
        : "Treat as a watch signal and rerun an independent seed before tuning progression."
    return {
      room: room.room,
      status,
      severity: SEVERITY[status] || 0,
      persistence: persistent ? "repeat" : "new",
      annualMeanOverallDrift: room.annualMeanOverallDrift ?? null,
      action
    };
  }).sort((left, right) => right.severity - left.severity || left.room.localeCompare(right.room));
  return {
    status: alerts.some((alert) => alert.status === "out-of-range") ? "action-required" : alerts.length ? "watch" : "clear",
    alerts,
    summary: alerts.length
      ? `${alerts.length} room${alerts.length === 1 ? "" : "s"} require evidence review; no tuning was applied automatically.`
      : "All seven position rooms are on target for this seed."
  };
}
