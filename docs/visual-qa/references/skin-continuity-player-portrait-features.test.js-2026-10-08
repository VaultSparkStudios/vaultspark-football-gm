import test from "node:test";
import assert from "node:assert/strict";
import { playerAppearance, playerFrame, HAIRSTYLES } from "../src/domain/playerIdentity.js";
import { ensurePlayerVisualIdentity, setPlayerGrooming } from "../src/domain/playerVisualIdentity.js";
import { createSyntheticPlayer } from "../src/domain/playerFactory.js";
import { RNG } from "../src/utils/rng.js";
import { createSession, createSessionFromSnapshot } from "../src/runtime/bootstrap.js";
import { buildPlayerPortraitSvg, buildPlayerPhysiqueSvg, appearanceSkinColor } from "../public/lib/playerPortrait.js";
import { HAIR_STYLE_RULES } from "../public/lib/portraitAppearanceContract.js";
import { PORTRAIT_FEATURE_CASES } from "./fixtures/portrait-feature-cases.js";

function fixture() {
  const player = ensurePlayerVisualIdentity({ id: "control-face", name: "Control Athlete", age: 24,
    heightInches: 74, weightLbs: 220, ratings: { strength: 80 }, profile: { faceSeed: "control-face" } }, { newPlayer: true });
  const appearance = { ...playerAppearance(player), hairstyle: "shaved", facialHair: "clean", eyeColor: "#587496", complexion: .4 };
  return { ...player, appearance, visualFrame: playerFrame(player) };
}

test("v3 generates every independent facial control, while missing/stored v2 recipes retain the old decoder", () => {
  const rows = Array.from({ length: 1500 }, (_, i) => {
    const player = ensurePlayerVisualIdentity({ id: `features-${i}` }, { newPlayer: true });
    return playerAppearance(player);
  });
  assert.equal(new Set(rows.map(row => row.hairstyle)).size, HAIRSTYLES.length);
  assert.ok(rows.every(row => HAIR_STYLE_RULES[row.hairstyle].textures.includes(row.hairTexture)));
  for (const [key, low, high] of PORTRAIT_FEATURE_CASES) {
    assert.ok(rows.every(row => row[key] >= low && row[key] <= high), key);
    assert.ok(rows.some(row => row[key] < low + (high - low) * .1) && rows.some(row => row[key] > high - (high - low) * .1), `${key} lacks variation`);
  }
  const legacy = { id: "legacy-appearance", profile: { faceSeed: "legacy-appearance" } };
  const before = playerAppearance(legacy);
  assert.equal(before.version, "portrait-identity-v2");
  assert.equal(before.eyeAperture, undefined);
  ensurePlayerVisualIdentity(legacy);
  assert.deepEqual(playerAppearance(legacy), before);
  const rng = new RNG(52), player = createSyntheticPlayer({ teamId: "BUF", position: "QB", year: 2026, rng });
  const seed = rng.seed, original = structuredClone(player.ratings);
  assert.equal(player.profile.appearanceRecipe.version, "portrait-identity-v3");
  assert.equal(playerAppearance(player).version, "portrait-identity-v3");
  for (let i = 0; i < 20; i++) playerAppearance(player);
  assert.equal(rng.seed, seed);
  assert.deepEqual(player.ratings, original);
});

test("every v3 facial control changes rendered geometry or pigmentation, with finite coherent body skin", () => {
  const player = fixture();
  for (const [key, low, high] of PORTRAIT_FEATURE_CASES) {
    const render = value => buildPlayerPortraitSvg({ ...player, appearance: { ...player.appearance, [key]: value } });
    const left = render(low), right = render(high);
    assert.notEqual(left, right, `${key} was stored but never rendered`);
    assert.doesNotMatch(left + right, /NaN|Infinity|undefined/);
  }
  for (const skinUndertone of [-1, 0, 1]) {
    const appearance = { ...player.appearance, skinUndertone };
    const color = appearanceSkinColor(appearance);
    assert.match(buildPlayerPhysiqueSvg({ ...player, appearance }), new RegExp(color));
    assert.match(buildPlayerPortraitSvg({ ...player, appearance }), new RegExp(color));
  }
  const narrow = buildPlayerPortraitSvg({ ...player, appearance: { ...player.appearance, eyeAperture: .7 } });
  assert.match(narrow, /clip-path="url\(#athlete-.*-eye-/);
});

test("hair rules cover every cut; loose textures differ, style treatment preserves natural texture and scalp dye preserves brows", () => {
  assert.deepEqual(Object.keys(HAIR_STYLE_RULES).sort(), [...HAIRSTYLES].sort());
  const player = fixture();
  const texture = kind => buildPlayerPortraitSvg({ ...player, appearance: { ...player.appearance, hairstyle: "long", hairTexture: kind } });
  const curly = texture("curly"), coily = texture("coily");
  const paths = markup => markup.match(/class="portrait-hair-texture"[\s\S]+?<\/g>/)[0].replace(/data-texture="[^"]+"/, "");
  assert.notEqual(paths(curly), paths(coily));
  assert.match(coily, /data-texture="coily"/);
  const textured = { ...player, appearance: { ...player.appearance, hairstyle: "long", hairTexture: "coily" } };
  const normalizedTexture = suffix => paths(buildPlayerPortraitSvg(textured, { idSuffix: suffix })).replace(/url\(#[^)]+\)/g, "url(RESOURCE)");
  assert.equal(normalizedTexture("-profile"), normalizedTexture("-body"), "SVG instance IDs must not reroll cosmetic geometry");
  for (const hairstyle of HAIRSTYLES) {
    const result = buildPlayerPortraitSvg({ ...player, appearance: { ...player.appearance, hairstyle } });
    assert.doesNotMatch(result, /NaN|Infinity|undefined/);
    assert.equal(result.includes('class="portrait-hair-texture"'), HAIR_STYLE_RULES[hairstyle].textureVisible);
  }
  setPlayerGrooming(player, { hairstyle: "afro", hairTexture: "straight", dyedHairColor: "#8844aa" });
  const styled = playerAppearance(player);
  assert.equal(styled.naturalHairTexture, playerAppearance({ ...player, profile: { ...player.profile, grooming: undefined } }).naturalHairTexture);
  assert.ok(HAIR_STYLE_RULES.afro.textures.includes(styled.hairTexture));
  const svg = buildPlayerPortraitSvg({ ...player, appearance: styled });
  assert.match(svg, /class="portrait-scalp-hair"[^>]*data-hair-color="#8844aa"/);
  assert.doesNotMatch(svg.match(/class="portrait-brows"[^>]+/)[0], /#8844aa/);
  assert.doesNotMatch(svg.match(/class="portrait-facial-hair"[^>]+/)[0], /#8844aa/);
});

test("actual new v3 player appearance and v2 legacy identity survive snapshot restoration unchanged", () => {
  const session = createSession({ seed: 162, startYear: 2026 });
  const player = session.league.players[0];
  const before = playerAppearance(player);
  assert.equal(before.version, "portrait-identity-v3");
  const snapshot = JSON.parse(JSON.stringify(session.toSnapshot()));
  snapshot.league.players[1].profile.appearanceRecipe.version = "portrait-identity-v2";
  const v2 = playerAppearance(snapshot.league.players[1]);
  const restored = createSessionFromSnapshot(snapshot);
  assert.deepEqual(playerAppearance(restored.league.players[0]), before);
  assert.deepEqual(playerAppearance(restored.league.players[1]), v2);
});

test('natural cropped hair has seeded strand geometry and bounded continuous controls',()=>{
  const player=fixture();
  for(const hairstyle of ['crew','short-curls','coils','afro']) {
    const appearance={...player.appearance,detailVersion:'natural-appearance-detail-v1',hairstyle,hairTexture:hairstyle==='crew'?'straight':'coily'};
    const render=patch=>buildPlayerPortraitSvg({...player,appearance:{...appearance,...patch}});
    assert.match(render({}),/data-cropped-strands="true"/);
    for(const [key,lo,hi] of [['hairCurvature',.65,1.45],['hairWaveScale',.65,1.5],['hairStrandWidth',.65,1.5]]) {
      assert.notEqual(render({[key]:lo}),render({[key]:hi}));
      assert.equal(render({[key]:-100}),render({[key]:lo}));
      assert.equal(render({[key]:100}),render({[key]:hi}));
      assert.doesNotMatch(render({[key]:NaN}),/NaN|Infinity|undefined/);
    }
    assert.equal(render({}),render({}));
    const legacy={...appearance};delete legacy.detailVersion;
    assert.doesNotMatch(buildPlayerPortraitSvg({...player,appearance:legacy}),/data-cropped-strands/);
    const other={...player,id:'different-shirt',teamId:'OTHER',overall:99,appearance,ratings:{speed:99,strength:99}};
    const expected=buildPlayerPortraitSvg({...player,appearance},{headOnly:true});
    // IDs may differ between DTOs; compare only the hair geometry itself.
    const paths=svg=>svg.match(/class="portrait-scalp-hair"[\s\S]*?<\/svg>/)?.[0].replaceAll(/portrait-[0-9a-f]+/g,'portrait-ID');
    assert.equal(paths(buildPlayerPortraitSvg(other,{headOnly:true})),paths(expected));
  }
});
