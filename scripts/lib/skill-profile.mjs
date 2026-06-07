#!/usr/bin/env node
const skill = process.argv[2] || "unknown";

const profile = {
  skill,
  medium: "game",
  overlays: [],
  extraSignals: [
    "Game medium: prioritize retention, emotional payoff, fast playable proof, and mobile browser polish."
  ],
  successBar: [
    "Any gameplay change must be visible in the browser UI and covered by a focused test when practical.",
    "Free-tier work must remain static-host-safe or local-only."
  ],
  promptOverlay:
    "VaultSpark Football GM is a public-unlaunched browser franchise simulator. Prefer beta-readiness, zero-backend loops, and vivid General Manager decision pressure over backend-heavy features.",
  axisWeightDeltas: {
    "gamification/engagement/immersion": 2,
    "ui/ux/user-experience": 1,
    "speed/organization/efficiency": 1
  },
  preHooks: []
};

console.log(JSON.stringify(profile, null, 2));
