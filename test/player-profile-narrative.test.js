import test from "node:test";
import assert from "node:assert/strict";
import { buildPlayerProfileNarrative, playerAvailabilitySummary } from "../public/lib/playerProfileNarrative.js";
import { playingStyleFor } from "../src/domain/playingStyle.js";
import { createSession } from "../src/runtime/bootstrap.js";
import { positionRatingKeys } from "../src/domain/ratings.js";

test('actual dossier signature uses positional grading traits rather than unrelated high ratings',()=>{
 const session=createSession({seed:20260306,startYear:2026,controlledTeamId:'BUF'});
 for(const position of ['OL','K','DB']){
  const player=session.league.players.find(p=>p.position===position&&p.teamId==='BUF');
  const relevant=positionRatingKeys(position);
  for(const key of Object.keys(player.ratings))player.ratings[key]=relevant.includes(key)?75:99;
  const profile=session.getPlayerProfile(player.id);
  const result=buildPlayerProfileNarrative(profile);
  assert.equal(result.signature.length,3);
  assert.ok(result.signature.every(trait=>trait.value===75),`${position} excludes unrelated99 ratings`);
  assert.deepEqual(profile.player.positionRatingKeys,relevant);
 }
});

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

test("a rostered player's playing style comes from his archetype, and only earned grades are called elite or strong", () => {
  const profile = {
    player: {
      id: "style-1", name: "Test Back", position: "RB", archetype: "Power", playingStyle: playingStyleFor("RB", "Power"), age: 25, overall: 80, potential: 84,
      attributes: { topAbilities: [
        { key: "trucking", label: "Power Running", value: 93 },
        { key: "breakTackle", label: "Break Tackle", value: 84 },
        { key: "carrying", label: "Ball Security", value: 72 }
      ] }
    },
    career: {}, timeline: []
  };
  const narrative = buildPlayerProfileNarrative(profile);
  assert.equal(narrative.archetype, "power back");
  assert.match(narrative.bio, /power back/);
  assert.deepEqual(narrative.signature.map((trait) => trait.tier), ["Elite", "Strong", null]);
  assert.ok(narrative.facts.includes("Signature trait: Elite Power Running 93"));
  assert.ok(narrative.facts.includes("Playing style: Power Back"));
  // A prospect's archetype is never shown: his ratings are hidden.
  const prospect = buildPlayerProfileNarrative({ player: { ...profile.player, isDraftProspect: true } });
  assert.doesNotMatch(JSON.stringify(prospect), /power back/i);
});

test("every archetype the player factory can roll has a playing style, and unknown ones have none", async () => {
  const source = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/domain/playerFactory.js", import.meta.url), "utf8"));
  const table = source.match(/const POSITION_ARCHETYPES = \{([\s\S]*?)\};/)[1];
  for (const [, position, list] of table.matchAll(/(\w+): \[([^\]]*)\]/g)) {
    for (const archetype of list.match(/"([^"]+)"/g).map((entry) => entry.slice(1, -1))) {
      const style = playingStyleFor(position, archetype);
      assert.ok(style?.label && style?.craft, `${position} ${archetype} has a playing style`);
    }
  }
  assert.equal(playingStyleFor("QB", "Unknown"), null);
  assert.equal(playingStyleFor(null, null), null);
});

const availableProjection = () => ({
  id: "availability-fixture", name: "Projected Player", position: "QB", age: 25,
  overall: 75, potential: 80, teamId: "BUF", status: "active", rosterSlot: "active",
  suspensionWeeks: 0, injury: null,
  designations: { ir: false, pup: false, nfi: false, gameDayInactive: false }
});

test("availability preserves concurrent restrictions instead of declaring an uninjured player eligible", () => {
  const player = { ...availableProjection(), suspensionWeeks: 3, rosterSlot: "reserve",
    designations: { ir: true, pup: true, nfi: true, gameDayInactive: true },
    injury: { type: "Hamstring", weeksRemaining: 2 } };
  const result = buildPlayerProfileNarrative({ player });
  for (const fact of [/Suspended: 3/, /Injured reserve/, /Physically unable to perform/, /Non-football injury/,
    /Game-day inactive/, /Medical restriction: Hamstring, 2/, /activation is not confirmed/]) {
    assert.match(result.availability, fact);
    assert.match(result.bio, fact);
  }
  assert.ok(result.facts.includes(result.availability));
  assert.doesNotMatch(result.bio, /healthy and available|available for the active rotation/i);
});

test("roster membership and game-day participation stay distinct", () => {
  const cases = [
    [{ suspensionWeeks: 3 }, /Suspended: 3/],
    [{ rosterSlot: "practice" }, /Practice squad; game-day elevation must be confirmed separately/],
    [{ rosterSlot: "reserve" }, /Reserve placement; activation is not confirmed/],
    [{ status: "free-agent", teamId: "FA" }, /Free agent; not on an active roster/],
    [{ status: "waiver", teamId: "WAIVER" }, /On waivers; not on an active roster/],
    [{ status: "unsigned" }, /Unsigned player; not on an active roster/],
    [{ status: "retired", teamId: "RET" }, /Retired player; not on an active roster/],
    [{ isDraftProspect: true }, /Unsigned prospect; not on an active roster/],
    [{ designations: { "ps-injured": true } }, /Practice Squad\/Injured/],
    [{ designations: { exemptCommissioner: true } }, /Commissioner's exempt list/]
  ];
  for (const [fields, expected] of cases) {
    const result = buildPlayerProfileNarrative({ player: { ...availableProjection(), ...fields } });
    assert.match(result.availability, expected);
    assert.doesNotMatch(result.availability, /healthy and available|available for the active rotation/i);
  }
  assert.match(playerAvailabilitySummary(availableProjection()), /game-day selection remains separate/);
  const practiceRestricted = playerAvailabilitySummary({ ...availableProjection(), rosterSlot: "practice",
    suspensionWeeks: 2, designations: { ir: true }, injury: { type: "Knee", weeksRemaining: 1 } });
  for (const fact of [/Practice squad/, /Injured reserve/, /Suspended: 2/, /Medical restriction: Knee, 1/]) assert.match(practiceRestricted, fact);
});

test("recovered injury does not hide an independent suspension or reserve placement", () => {
  const player = { ...availableProjection(), suspensionWeeks: 1, rosterSlot: "reserve",
    designations: { ir: true }, injury: { type: "Ankle", weeksRemaining: 0 } };
  const result = playerAvailabilitySummary(player);
  assert.match(result, /Recovered Ankle; no recovery weeks remain/);
  assert.match(result, /Injured reserve/);
  assert.match(result, /Suspended: 1/);
  assert.doesNotMatch(result, /Medical restriction:|healthy and available/);
});

test("unknown context or medical duration cannot become an active-rotation promise", () => {
  for (const fields of [{}, { teamId: "BUF" }, { status: "active", injury: null },
    { status: "active", rosterSlot: "active", teamId: "BUF", injury: { type: "Knee" } },
    { ...availableProjection(), injury: { type: "Knee", weeksRemaining: null }, suspensionWeeks: null }]) {
    const result = playerAvailabilitySummary(fields);
    assert.doesNotMatch(result, /healthy and available|available for the active rotation/i);
    assert.match(result, /not established|game-day selection remains separate/);
  }
  assert.match(playerAvailabilitySummary({ ...availableProjection(), injury: { weeksRemaining: 4 } }), /Medical restriction: injury, 4/);
});

test("actual runtime profile projections carry simultaneous availability facts into the dossier", () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  const player = session.league.players.find(row => row.teamId === "BUF" && row.status === "active");
  player.suspensionWeeks = 3;
  player.injury = null;
  const uninjuredSuspended = buildPlayerProfileNarrative(session.getPlayerProfile(player.id));
  assert.match(uninjuredSuspended.bio, /Suspended: 3/);
  assert.doesNotMatch(uninjuredSuspended.bio, /healthy and available/);
  player.rosterSlot = "reserve";
  player.designations = { ir: true, pup: false, nfi: false, gameDayInactive: true };
  player.injury = { type: "Shoulder", weeksRemaining: 2 };
  const projected = session.getPlayerProfile(player.id);
  assert.equal(projected.player.suspensionWeeks, 3);
  assert.equal(projected.player.rosterSlot, "reserve");
  assert.equal(projected.player.designations.ir, true);
  const result = buildPlayerProfileNarrative(projected);
  for (const fact of [/Suspended: 3/, /Injured reserve/, /Game-day inactive/, /Medical restriction: Shoulder, 2/]) assert.match(result.bio, fact);
  player.injury.weeksRemaining = 0;
  const recovered = buildPlayerProfileNarrative(session.getPlayerProfile(player.id));
  assert.match(recovered.bio, /Recovered Shoulder/);
  assert.match(recovered.bio, /Suspended: 3/);
  assert.match(recovered.bio, /Injured reserve/);
  assert.doesNotMatch(recovered.bio, /healthy and available/);
});
