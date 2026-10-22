import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/runtime/bootstrap.js';
import { scoutedProspectView } from '../src/runtime/GameSession.js';
import { buildPlayerProfileNarrative } from '../public/lib/playerProfileNarrative.js';
import { playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';

test('unsigned prospect profiles preserve identity and measurements without exposing football truth or mutating the save', () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: 'BUF' });
  session.prepareDraft();
  const draft = session.league.pendingDraft;
  const prospect = draft.available[0];
  const before = JSON.stringify(session.exportState());
  const profile = session.getPlayerProfile(prospect.id);
  const expected = scoutedProspectView(prospect, draft.year);
  assert.ok(profile);
  assert.equal(profile.player.isDraftProspect, true);
  assert.equal(profile.player.overallIsEstimate, true);
  assert.equal(profile.player.overall, expected.scouting.scoutedOverall ?? null);
  assert.equal(profile.player.potential, expected.scouting.scoutedPotential);
  assert.deepEqual(profile.player.ratings, {});
  assert.equal(profile.player.developmentTrait, 'Unknown');
  assert.equal(profile.player.developmentHeadroom, null);
  assert.equal(profile.player.developmentRunwaySeasons, null);
  assert.equal(profile.player.potentialRevision, null);
  assert.equal(profile.developmentOutlook.headroom, null);
  assert.equal(profile.player.contract.salary, 0);
  assert.equal(profile.player.heightInches, prospect.heightInches);
  assert.equal(profile.player.weightLbs, prospect.weightLbs);
  assert.deepEqual(profile.player.profile.identity, prospect.profile.identity);
  assert.deepEqual(profile.player.appearance, playerAppearance(prospect));
  assert.deepEqual(profile.player.visualFrame, playerFrame({ ...prospect, ratings: { strength: 70 } }));
  assert.equal(JSON.stringify(session.exportState()), before);
  assert.equal(session.getPlayerById(prospect.id), null, 'unsigned prospects stay outside personnel lookup');
  assert.equal(session.getPlayerProfile('missing-prospect'), null);
  const narrative = buildPlayerProfileNarrative(profile);
  assert.match(narrative.bio, /Scouting estimates/);
  assert.equal(narrative.signature.length, 0);
  assert.equal(narrative.milestones.length, 0);
  assert.ok(!narrative.facts.some(fact => /growth season|Signature trait/.test(fact)));
  // Cosmetic definition plus public individuality must not reconstruct hidden
  // strength. Hold the athlete's measurements and identity fixed while truth
  // changes; the complete public frame stays identical.
  prospect.ratings.strength = 42;
  const lowStrength = session.getPlayerProfile(prospect.id).player.visualFrame;
  prospect.ratings.strength = 98;
  const highStrength = session.getPlayerProfile(prospect.id).player.visualFrame;
  assert.deepEqual(lowStrength, highStrength);
});

test('a prospect joining the controlled roster switches to the normal player disclosure', () => {
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: 'BUF' });
  session.prepareDraft();
  session.league.phase = 'offseason';
  session.prepareDraft();
  const cpu = session.runCpuDraft({ untilUserPick: true });
  assert.equal(cpu.ok, true);
  const prospect = session.league.pendingDraft.available[0];
  assert.equal(session.draftUserPick({ playerId: prospect.id }).ok, true);
  const profile = session.getPlayerProfile(prospect.id);
  assert.equal(profile.player.isDraftProspect, undefined);
  assert.equal(profile.player.overall, prospect.overall);
  assert.equal(profile.player.potential, prospect.potential);
  assert.deepEqual(profile.player.ratings, prospect.ratings);
});
