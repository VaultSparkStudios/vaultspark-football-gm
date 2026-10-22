import test from "node:test";
import assert from "node:assert/strict";
import { generatePlayerMeasurements, resolvePlayerMeasurements, estimatePlayerSkeleton } from "../src/domain/playerMeasurements.js";
import { playerAppearance, playerFrame } from "../src/domain/playerIdentity.js";
import { buildPlayerPhysiqueSvg } from "../public/lib/playerPortrait.js";
import { createSyntheticPlayer } from "../src/domain/playerFactory.js";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { revisePlayerPotential } from "../src/domain/livingPotential.js";
import { buildOffseasonDevelopmentReport } from "../src/engine/offseasonDevelopmentReport.js";
import { RNG } from "../src/utils/rng.js";
import { normalizePfrPlayers } from "../src/data/pfrAdapter.js";
import { expandSnapshotMeasurementProvenance } from "../src/runtime/measurementProvenanceSnapshot.js";

test("canonical measurements preserve imported precision and provenance, and leave missing values unknown", () => {
  const player = { id: "imported", heightInches: 77.625, weightLbs: 311, armLengthInches: 32.125,
    measurementProvenance: { armLengthInches: { kind: "measured", event: "combine", year: 2026 } },
    measurements: { armLengthInches: 34, wingspanInches: 81.875, provenance: { wingspanInches: { kind: "measured", event: "pro-day" } } } };
  const record = resolvePlayerMeasurements(player);
  assert.equal(record.values.heightInches, 77.625);
  assert.equal(record.values.armLengthInches, 32.125, "top-level imported measurement takes precedence");
  assert.equal(record.provenance.armLengthInches.event, "combine");
  assert.equal(record.values.wingspanInches, 81.875);
  assert.equal(record.provenance.wingspanInches.event, "pro-day");
  assert.equal(record.values.handSizeInches, null);
  assert.equal(record.provenance.handSizeInches.kind, "unknown");
  const frame = playerFrame(player);
  assert.equal(frame.heightInches, player.heightInches);
  assert.equal(frame.armLengthInches, player.armLengthInches);
  assert.equal(frame.wingspanInches, record.values.wingspanInches);
  assert.deepEqual(resolvePlayerMeasurements({ heightInches: "", weightLbs: NaN }).values,
    { heightInches: null, weightLbs: null, armLengthInches: null, wingspanInches: null, handSizeInches: null, handLengthInches: null,
      hipJointSpanInches: null, footLengthInches: null, footWidthInches: null });
});

test("the import adapter carries actual dimensions into the canonical record instead of losing them", () => {
  const [player, unknown] = normalizePfrPlayers([
    { name: "Imported <Player>", position: "OL", height: "6-5.625", weight_lbs: 311, arm_length_inches: 32.125, wingspan_inches: 81.875,
      measurementProvenance: { armLengthInches: { kind: "measured", event: "combine", year: 2026 } } },
    { name: "Unknown measurements", position: "WR" }
  ], new RNG(527), 2026);
  const record = resolvePlayerMeasurements(player);
  assert.equal(record.values.heightInches, 77.625);
  assert.equal(record.values.weightLbs, 311);
  assert.equal(record.values.armLengthInches, 32.125);
  assert.equal(record.provenance.armLengthInches.event, "combine");
  assert.equal(record.values.wingspanInches, 81.875);
  assert.equal(resolvePlayerMeasurements(unknown).values.heightInches, null);
  assert.equal(player.profile.identity, undefined, "no imported race or birthplace is invented");
});

test("fictional skeletal estimates are correlated, deterministic and preserve legacy provenance", () => {
  for (let i = 0; i < 500; i++) {
    const player = { id: `skeleton-${i}`, heightInches: 68 + i % 14, profile: { source: "generated-roster", faceSeed: `face-${i}` } };
    const skeleton = estimatePlayerSkeleton(player);
    const measured = generatePlayerMeasurements(player);
    assert.ok(Math.abs(skeleton.shoulderSpanInches + measured.armLengthInches * 2 - measured.wingspanInches) <= .125);
    assert.deepEqual(generatePlayerMeasurements(JSON.parse(JSON.stringify(player))), measured);
    assert.equal(resolvePlayerMeasurements(player).provenance.heightInches.kind, "fictional-generated");
  }
  const rng = new RNG(818);
  const player = createSyntheticPlayer({ teamId: "BUF", position: "WR", year: 2026, rng });
  const seed = rng.seed;
  const record = resolvePlayerMeasurements(player);
  assert.equal(record.provenance.armLengthInches.kind, "fictional-estimate");
  assert.ok(Math.abs(playerFrame(player).shoulderSpanInches + player.measurements.armLengthInches * 2 - player.measurements.wingspanInches) <= .125);
  playerFrame(player);
  generatePlayerMeasurements(player);
  assert.equal(rng.seed, seed);
});

test("full body has a common camera, bounded geometry, measurement-sensitive reach and no speed-as-fat assumption", () => {
  const base = { id: "body", age: 24, heightInches: 74, weightLbs: 200, ratings: { strength: 70, speed: 70 } };
  const frame = playerFrame(base);
  assert.equal(playerFrame({ ...base, ratings: { ...base.ratings, speed: 99 } }).waistRatio, frame.waistRatio);
  const wideReach = playerFrame({ ...base, wingspanInches: 88 });
  assert.ok(wideReach.armLengthInches > frame.armLengthInches);
  const render = player => buildPlayerPhysiqueSvg({ ...player, appearance: playerAppearance(player), visualFrame: playerFrame(player) });
  const short = render(base), tall = render({ ...base, heightInches: 82 });
  assert.match(short, /viewBox="0 0 320 620"/);
  assert.match(tall, /viewBox="0 0 320 620"/);
  assert.notEqual(short, tall);
  for (const [heightInches, weightLbs] of [[62, 140], [86, 400], [NaN, Infinity]]) {
    assert.doesNotMatch(render({ ...base, heightInches, weightLbs }), /NaN|Infinity|undefined/);
  }
});

test("regional visual volumes conserve the measurement budget and strength only changes definition", () => {
  const integral = (first, last, depthRatio, length) => {
    // Independently integrate elliptical cross-sections along a linear taper.
    const steps = 1000, delta = length / steps;
    let volume = 0;
    for (let i = 0; i <= steps; i++) {
      const diameter = first + (last - first) * i / steps;
      volume += Math.PI / 4 * diameter ** 2 * depthRatio * delta * (i === 0 || i === steps ? .5 : 1);
    }
    return volume;
  };
  const anatomicalIntegral = (diameter, length, kind, variation) => {
    // Independent numerical sampling of the declared rounded landmark widths.
    const sections = kind === 'arm'
      ? [[0,.88],[.16,1],[.5,.67],[.66,.77+variation*.3],[1,.4]]
      : [[0,.9],[.17,1],[.49,.61],[.66,.76+variation*.3],[1,.3]];
    let volume = 0;
    const steps=1000;
    for(let s=1;s<sections.length;s++){
      const [start,a]=sections[s-1],[end,b]=sections[s];
      for(let i=0;i<=steps;i++){
        const t=i/steps,ratio=a+(b-a)*(3*t*t-2*t*t*t);
        volume+=Math.PI/4*(diameter*ratio)**2*length*(end-start)/steps*(i===0||i===steps?.5:1);
      }
    }
    return volume;
  };
  for (let index = 0; index < 300; index++) {
    const player = { id: `budget-${index}`, heightInches: 62 + index % 25,
      weightLbs: 140 + index % 261, ratings: { strength: 40, speed: 40 } };
    const frame = playerFrame(player);
    const sum = frame.torsoVolumeInches3 + frame.legsVolumeInches3 + frame.armsVolumeInches3
      + frame.neckVolumeInches3 + frame.reservedVolumeInches3;
    assert.ok(Math.abs(sum - frame.volumeBudgetInches3) < 1e-8);
    const approx = (actual, expected) => assert.ok(Math.abs(actual / expected - 1) < 1e-6);
    approx(integral(frame.chestWidthInches, frame.chestWidthInches * frame.waistRatio,
      frame.chestDepthInches / frame.chestWidthInches, frame.torsoLengthInches), frame.torsoVolumeInches3);
    approx(2 * anatomicalIntegral(frame.upperArmWidth, frame.armSegmentLengthInches, 'arm', frame.limbShapeVariation), frame.armsVolumeInches3);
    approx(2 * anatomicalIntegral(frame.thighWidth, frame.legLengthInches, 'leg', frame.limbShapeVariation), frame.legsVolumeInches3);
    const stronger = playerFrame({ ...player, ratings: { strength: 99, speed: 40 } });
    const { muscleDefinition, ...shape } = frame;
    const { muscleDefinition: strongerDefinition, ...strongerShape } = stronger;
    assert.deepEqual(strongerShape, shape);
    assert.ok(strongerDefinition > muscleDefinition);
    assert.deepEqual(playerFrame({ ...player, ratings: { strength: 40, speed: 99 } }), frame);
    assert.ok(Object.values(frame).every(Number.isFinite));
  }
  const base = { id: "ordering", heightInches: 74, weightLbs: 190 };
  const light = playerFrame(base), heavy = playerFrame({ ...base, weightLbs: 330 });
  const tall = playerFrame({ ...base, heightInches: 82 });
  assert.ok(heavy.volumeBudgetInches3 > light.volumeBudgetInches3);
  assert.ok(heavy.thighWidth > light.thighWidth);
  assert.equal(tall.volumeBudgetInches3, light.volumeBudgetInches3);
  assert.ok(tall.thighWidth < light.thighWidth);
});

test('rounded regional anatomy keeps recorded reach and height endpoints, without demographic or OVR sculpting',()=>{
  const base={id:'regional-anatomy',age:24,heightInches:77.625,weightLbs:320,armLengthInches:33.125,wingspanInches:82.875,ratings:{strength:80,speed:70},overall:60};
  const f=playerFrame(base);
  const strongerOverall=playerFrame({...base,overall:99,ratings:{...base.ratings,awareness:99}});
  assert.deepEqual(strongerOverall,f);
  const identityChanged=playerFrame({...base,profile:{identity:{source:'fictional-generated',birthCountry:'Japan',raceEthnicity:'Asian'}}});
  assert.deepEqual(identityChanged,f);
  const head=9.4+(f.heightInches-74)*.035;
  assert.ok(Math.abs(head+1.5+f.torsoLengthInches+f.legLengthInches+2.5-f.heightInches)<1e-10);
  assert.ok(Math.abs(f.armSegmentLengthInches+f.heightInches*.1-f.armLengthInches)<1e-10);
  for(const view of ['front','side']){
    const svg=buildPlayerPhysiqueSvg({...base,appearance:playerAppearance(base),visualFrame:f},{view});
    assert.match(svg,/class="physique-arm"/);assert.match(svg,/class="physique-leg"/);
    assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  }
});

test("profiles retain measurements and revisions after save/load, while rival outlooks respect scouting uncertainty", () => {
  const session = createSession({ seed: 7113, startYear: 2026, controlledTeamId: "BUF" });
  const player = session.league.players.find(p => p.teamId === "BUF");
  player.potential = 94;
  player.developmentHealth = { majorInjuries: 1, missedWeeks: 8 };
  revisePlayerPotential(player, { year: 2026, performance: "poor" });
  const profile = session.getPlayerProfile(player.id);
  assert.equal(profile.player.potentialRevision.change, -4);
  assert.equal(profile.developmentOutlook.headroom, player.potential - player.overall);
  const restored = createSessionFromSnapshot(JSON.parse(JSON.stringify(session.toSnapshot())));
  const after = restored.getPlayerProfile(player.id);
  assert.deepEqual(after.player.bodyMeasurements, profile.player.bodyMeasurements);
  assert.deepEqual(after.player.potentialRevision, profile.player.potentialRevision);
  assert.deepEqual(after.player.appearance, profile.player.appearance);
  assert.deepEqual(after.player.visualFrame, profile.player.visualFrame);
  restored.controlledTeamId = "MIA";
  const rival = restored.getPlayerProfile(player.id);
  assert.equal(rival.player.potentialRevision, null);
  assert.equal(rival.player.developmentHeadroom, rival.player.potential - rival.player.overall);
  assert.equal(rival.developmentOutlook.headroom, rival.player.developmentHeadroom);
  assert.notEqual(rival.player.potential, player.potential, "this seed must exercise a scouting-error case");
  const legacy = expandSnapshotMeasurementProvenance(JSON.parse(JSON.stringify(session.toSnapshot())));
  const legacyPlayer = legacy.league.players.find(p => p.id === player.id);
  delete legacyPlayer.measurements;
  delete legacyPlayer.measurementProvenance;
  const legacyProfile = createSessionFromSnapshot(legacy).getPlayerProfile(player.id);
  assert.equal(legacyProfile.player.bodyMeasurements.values.armLengthInches, null);
  assert.equal(legacyProfile.player.bodyMeasurements.provenance.heightInches.kind, "fictional-generated");
  assert.ok(Number.isFinite(legacyProfile.player.visualFrame.armLengthInches));
  legacyPlayer.profile = { source: "pro-football-reference", pfrId: "explicit-import" };
  legacyPlayer.heightInches = 77.625;
  legacyPlayer.armLengthInches = 32.125;
  legacyPlayer.measurementProvenance = { armLengthInches: { kind: "measured", event: "combine" } };
  const importedProfile = createSessionFromSnapshot(legacy).getPlayerProfile(player.id);
  assert.equal(importedProfile.player.profile.identity, undefined);
  assert.equal(importedProfile.player.bodyMeasurements.values.heightInches, 77.625);
  assert.equal(importedProfile.player.visualFrame.armLengthInches, 32.125);
  assert.equal(importedProfile.player.bodyMeasurements.provenance.armLengthInches.event, "combine");
});

test("report retains engine-generated ceiling changes when overall held", () => {
  const player = { potential: 85, age: 24, developmentHealth: { majorInjuries: 1, missedWeeks: 8 } };
  const revision = revisePlayerPotential(player, { year: 2026 });
  const report = buildOffseasonDevelopmentReport({ year: 2026, teamId: "BUF", progressed: [
    { playerId: "held", teamId: "BUF", before: 70, after: 70, change: 0, potential: player.potential, potentialRevision: revision }
  ] });
  assert.equal(report.risers.length + report.fallers.length, 0);
  assert.equal(report.ceilingChanges.length, 1);
  assert.deepEqual(report.ceilingChanges[0].potentialRevision, revision);
});
