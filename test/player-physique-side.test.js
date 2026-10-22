import test from 'node:test';
import assert from 'node:assert/strict';
import { playerAppearance, playerFrame } from '../src/domain/playerIdentity.js';
import { buildPlayerPhysiqueSvg } from '../public/lib/playerPortrait.js';

const make = (weightLbs = 190) => {
  const player = { id: 'side-control', name: 'Side control', heightInches: 74, weightLbs,
    ratings: { strength: 70, speed: 80 } };
  return { ...player, appearance: playerAppearance(player), visualFrame: playerFrame(player) };
};
const paths = svg => [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(match => match[1]);

test('side silhouette exposes solved torso depth at the same height scale', () => {
  const light = make(), heavy = make(330);
  const render = p => buildPlayerPhysiqueSvg(p, { view: 'side' });
  assert.ok(heavy.visualFrame.chestDepthInches > light.visualFrame.chestDepthInches);
  assert.notEqual(render(light), render(heavy));
  const depthOnly = { ...light, visualFrame: { ...light.visualFrame, chestDepthInches: light.visualFrame.chestDepthInches + 2 } };
  assert.deepEqual(paths(buildPlayerPhysiqueSvg(light)), paths(buildPlayerPhysiqueSvg(depthOnly)), 'front must preserve width when only depth changes');
  assert.notDeepEqual(paths(render(light)), paths(render(depthOnly)), 'side must actually draw depth, beyond IDs and labels');
  for (const p of [light, heavy]) {
    assert.match(render(p), /viewBox="0 0 320 620"/);
    assert.match(render(p), /data-height="74"/);
    assert.match(render(p), /estimated depth/);
    assert.doesNotMatch(render(p), /NaN|Infinity|undefined/);
  }
});

test('side rendering preserves source identity and tolerates legacy frames without explicit depth', () => {
  const p = make(), original = structuredClone(p);
  const legacy = { ...p, visualFrame: { ...p.visualFrame } };
  delete legacy.visualFrame.chestDepthInches;
  delete legacy.visualFrame.chestWidthInches;
  assert.doesNotMatch(buildPlayerPhysiqueSvg(legacy, { view: 'side' }), /NaN|Infinity|undefined/);
  buildPlayerPhysiqueSvg(p, { view: 'side', idSuffix: '-second' });
  assert.deepEqual(p, original);
});
