import test from "node:test";
import assert from "node:assert/strict";
import { buildPlayerProfileNarrative } from "../public/lib/playerProfileNarrative.js";

const positions = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"];

for (const [index, position] of positions.entries()) {
  test(`player dossier is deterministic and personalized for ${position}`, () => {
    const profile = {
      player: {
        id: `P-${position}`,
        name: `Test ${position}`,
        position,
        age: 22 + index,
        experience: index,
        overall: 72 + index,
        potential: 88,
        developmentTrait: index % 2 ? "Star" : "Steady",
        injury: null,
        ratings: {
          awareness: 74 + index,
          speed: 80 - index,
          strength: 70 + index
        }
      },
      career: {
        passing: { yds: 4200, td: 28, rate: 96.2, gs: 18 },
        rushing: { yds: 1300, td: 12, ypa: 4.8, gs: 18 },
        receiving: { rec: 100, yds: 1400, td: 10, gs: 18 },
        blocking: { gs: 18, passBlkSn: 900, pressuresAllowed: 22 },
        defense: { tkl: 140, sacks: 8, int: 3, gs: 18 },
        kicking: { fgm: 64, fga: 72, lng: 57, gs: 18 },
        punting: { punts: 90, ypp: 46.2, in20: 44, gs: 18 }
      },
      timeline: [{ year: 2026, champion: index === 0 }],
      awardsHistory: index === 0 ? [{ year: 2026, award: "MVP" }] : []
    };
    const first = buildPlayerProfileNarrative(profile);
    const second = buildPlayerProfileNarrative(profile);
    assert.deepEqual(first, second);
    assert.match(first.bio, new RegExp(position === "QB" ? "field general" : first.archetype, "i"));
    assert.match(first.bio, /OVR/);
    assert.match(first.bio, /POT/);
    assert.ok(first.facts.length >= 5);
    assert.ok(first.achievements.length >= 1);
    assert.ok(first.signature.length >= 3);
    assert.ok(first.milestones.length >= 1);
    assert.ok(first.milestones.every((milestone) => milestone.progress >= 0 && milestone.progress <= 100));
  });
}
