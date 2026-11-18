// First-run flow: a new visitor picks a team (or lets the game pick), sees what
// each quick-start card sets, answers the Opening Contract on one screen, and
// can reach the command palette from the keyboard.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  RANDOM_TEAM_VALUE,
  keepTeamChoice,
  resolveTeamChoice,
  teamOptionsHtml
} from "../public/lib/setupTeamChoice.js";
import {
  DIFFICULTY_PRESETS,
  FRANCHISE_ARCHETYPES,
  SETUP_QUICK_STARTS
} from "../src/config/leagueSetup.js";
import {
  OPENING_CALLS,
  defaultOpeningSelections,
  openingContractMarkup
} from "../public/lib/tutorialCampaign.js";
import {
  START_SCENARIO_CHOICES,
  buildStartScenarioRequest,
  validateStartScenario
} from "../public/lib/startScenarioContract.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../public/index.html");
const setup = read("../public/setup.js");

const TEAMS = [
  { id: "BUF", abbrev: "BUF", name: "Buffalo" },
  { id: "KC", abbrev: "KC", name: "Kansas City" },
  { id: "SF", name: "San <Francisco>" }
];

// ── 1. Hero team choice ──────────────────────────────────────────────────────

test("team choice: Surprise me is the default and stays random; a picked club is kept", () => {
  const html = teamOptionsHtml(TEAMS, "Team: Surprise me");
  assert.ok(html.startsWith(`<option value="${RANDOM_TEAM_VALUE}">Team: Surprise me</option>`), "the random option is first");
  assert.equal((html.match(/<option /g) || []).length, TEAMS.length + 1);
  assert.match(html, /<option value="KC">KC - Kansas City<\/option>/);
  assert.match(html, /SF - San &lt;Francisco&gt;/, "club names are escaped and a missing abbreviation falls back to the id");

  assert.equal(resolveTeamChoice("KC", TEAMS, () => 0), "KC", "an explicit pick is never re-rolled");
  assert.equal(resolveTeamChoice(RANDOM_TEAM_VALUE, TEAMS, () => 0), "BUF");
  assert.equal(resolveTeamChoice(RANDOM_TEAM_VALUE, TEAMS, () => 0.5), "KC");
  assert.equal(resolveTeamChoice(RANDOM_TEAM_VALUE, TEAMS, () => 0.999999), "SF");
  assert.equal(resolveTeamChoice(undefined, TEAMS, () => 0.5), "KC", "no selection behaves like Surprise me");
  assert.equal(resolveTeamChoice("NOPE", TEAMS, () => 0), "BUF", "a club that is not in the league is never submitted");
  assert.equal(resolveTeamChoice(RANDOM_TEAM_VALUE, [], () => 0.5), "BUF", "an unloaded league keeps the old fallback");
  assert.equal(keepTeamChoice("KC", TEAMS), "KC");
  assert.equal(keepTeamChoice("NOPE", TEAMS), RANDOM_TEAM_VALUE);
});

test("the hero offers one team picker beside one primary start button", () => {
  const hero = index.slice(index.indexOf('class="setup-hero-actions"'), index.indexOf('class="hero-meta"'));
  assert.equal((hero.match(/<select /g) || []).length, 1);
  assert.match(hero, /<select id="heroTeamSelect"[^>]*data-testid="hero-team-select"[^>]*aria-label="Your team">\s*<option value="__random__">Team: Surprise me<\/option>/);
  assert.ok(hero.indexOf('id="heroTeamSelect"') < hero.indexOf('id="instantStartBtn"'), "the picker sits next to the start button");
  assert.equal((index.match(/id="heroTeamSelect"/g) || []).length, 1);
  assert.equal((hero.match(/id="instantStartBtn"/g) || []).length, 1, "still one start button for a new visitor");
  assert.equal((hero.match(/class="btn-primary btn-lg"/g) || []).length, 2, "start, plus the Continue button shown instead of it");

  assert.match(setup, /from "\.\/lib\/setupTeamChoice\.js"/);
  assert.match(setup, /hero\.innerHTML = teamOptionsHtml\(state\.teams, "Team: Surprise me"\)/, "the hero reuses the loaded club list");
  assert.match(setup, /getElementById\("heroTeamSelect"\)\?\.addEventListener\("change"/, "a hero pick sets the league's team");
  assert.match(setup, /getElementById\("teamSelect"\)\?\.addEventListener\("change", syncHeroTeam\)/, "the two pickers never disagree");
  assert.match(setup, /return resolveTeamChoice\(document\.getElementById\("teamSelect"\)\?\.value, state\.teams\)/);
  assert.match(setup, /heroTeam\.hidden = returning/, "returning players do not see a new-franchise picker");
  assert.match(setup, /#teamSelect, #heroTeamSelect,/, "the picker locks with the other start controls");
});

// ── 2. Quick-start cards state what they set ─────────────────────────────────

const MODE_WORDS = { play: /Play-by-play sim/, drive: /Drive-by-drive sim/ };
const SWITCH_WORDS = {
  enableOwnerMode: "Owner Mode off",
  enableNarratives: "Dynamic Narratives off",
  enableCompPicks: "Comp Picks off",
  enableChemistry: "Team Chemistry off"
};

for (const [id, preset] of Object.entries(SETUP_QUICK_STARTS)) {
  test(`the ${id} quick-start card states its difficulty, sim mode and what it turns off`, () => {
    const line = index.match(new RegExp(`data-preset-sets="${id}">([^<]+)<`))?.[1];
    assert.ok(line, `the ${id} card carries a settings line`);
    const sel = preset.selections;
    assert.ok(line.includes(`${DIFFICULTY_PRESETS[sel.difficultyPreset].label} difficulty`), `names ${sel.difficultyPreset} difficulty`);
    assert.match(line, MODE_WORDS[sel.mode], `names the ${sel.mode} sim mode`);
    for (const [key, words] of Object.entries(SWITCH_WORDS)) {
      assert.equal(line.includes(words), sel[key] === false, `${words} is stated exactly when the preset turns it off`);
    }
    assert.equal(/\boff\b/.test(line), Object.keys(SWITCH_WORDS).some((key) => sel[key] === false), "no card claims to turn something off that it leaves on");
    assert.equal(/roster rules/i.test(line), sel.rulesPreset !== "standard", "non-standard rules are stated");
    if (sel.franchiseArchetype !== "balanced") {
      const archetype = FRANCHISE_ARCHETYPES[sel.franchiseArchetype].label.toLowerCase();
      assert.ok(line.toLowerCase().includes(archetype), `names the ${archetype} start`);
    }
    assert.equal(sel.challengeMode, "open", "a challenge restriction would need its own words on the card");
  });
}

test("every quick-start card has a settings line and the card set matches the presets", () => {
  const ids = [...index.matchAll(/data-preset-sets="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids.sort(), Object.keys(SETUP_QUICK_STARTS).sort());
  for (const id of ids) {
    const button = `preset${id[0].toUpperCase()}${id.slice(1)}Btn`;
    const card = index.slice(index.indexOf(`id="${button}"`), index.indexOf("</button>", index.indexOf(`id="${button}"`)));
    assert.ok(card.includes(`data-preset-sets="${id}"`), `the ${id} line is inside the ${id} card`);
  }
});

// ── 4c. Opening Contract on one screen ───────────────────────────────────────

test("the Opening Contract asks the same three calls with the same choices", () => {
  assert.deepEqual(OPENING_CALLS.map((call) => call.id), ["identity", "pressure", "first-call"]);
  assert.deepEqual(OPENING_CALLS[0].choices.map((c) => c.id), [...START_SCENARIO_CHOICES.identity]);
  assert.deepEqual(OPENING_CALLS[1].choices.map((c) => c.id), [...START_SCENARIO_CHOICES.pressure]);
  assert.deepEqual(OPENING_CALLS[2].choices.map((c) => c.id), [...START_SCENARIO_CHOICES.firstCall]);
  for (const call of OPENING_CALLS) {
    assert.ok(call.choices.some((choice) => choice.id === call.fallback), `${call.id} starts on one of its own choices`);
  }
});

test("the preselected answers and any other pick produce the request the engine already accepts", () => {
  const defaults = defaultOpeningSelections();
  assert.deepEqual(defaults, { identity: "balanced", pressure: "balanced-mandate", "first-call": "trust-scout" });
  assert.deepEqual(buildStartScenarioRequest(defaults).selections, { identity: "balanced", pressure: "balanced-mandate", firstCall: "trust-scout" });
  assert.equal(validateStartScenario(buildStartScenarioRequest(defaults)).ok, true);
  for (const identity of START_SCENARIO_CHOICES.identity) for (const pressure of START_SCENARIO_CHOICES.pressure) for (const firstCall of START_SCENARIO_CHOICES.firstCall) {
    const verdict = validateStartScenario(buildStartScenarioRequest({ identity, pressure, "first-call": firstCall }));
    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.value.selections, { identity, pressure, firstCall });
  }
});

test("one screen: three groups, nine choices, one selected per group, one confirm", () => {
  const markup = openingContractMarkup();
  assert.equal((markup.match(/class="tutorial-group"/g) || []).length, 3);
  assert.deepEqual([...markup.matchAll(/data-step="([^"]+)"/g)].map((match) => match[1]), ["identity", "pressure", "first-call"]);
  assert.equal((markup.match(/class="tutorial-choice /g) || []).length, 9);
  assert.equal((markup.match(/aria-pressed="true"/g) || []).length, 3);
  assert.equal((markup.match(/id="tutNextBtn"/g) || []).length, 1);
  assert.equal((markup.match(/id="tutSkipBtn"/g) || []).length, 1);
  assert.doesNotMatch(markup, /id="tutNextBtn"[^>]*disabled/, "the confirm is ready as soon as the screen opens");
  assert.doesNotMatch(markup, /Step \d+ of|tutorial-pip|>Next</, "no step counter and no Next button");

  const picked = openingContractMarkup({ identity: "air-raid", pressure: "win-now", "first-call": "ignore" });
  for (const choice of ["air-raid", "win-now", "ignore"]) {
    assert.match(picked, new RegExp(`class="tutorial-choice selected"\\s+data-choice="${choice}" aria-pressed="true"`));
  }

  const source = read("../public/lib/tutorialCampaign.js");
  assert.doesNotMatch(source, /renderReceipt|tutorial-receipt|Enter the Franchise|currentStep/, "no second screen after the confirm");
  assert.match(source, /markTutorialSeen\(scope, storage\);[\s\S]*dismissTutorial\(\);/, "an applied contract closes the dialog");
  assert.match(source, /if \(!receipt\?\.effects\) throw new Error/, "a contract the league did not confirm is never marked done");
  for (const word of [/receipt/i, /thesis/i, /ledger/i]) {
    assert.doesNotMatch(markup, word, "player-facing copy uses football English");
  }
});

// ── 6. Command palette shortcut ──────────────────────────────────────────────

test("Ctrl+K and Cmd+K open the command palette, and the shortcuts list says so", () => {
  const app = read("../public/app.js");
  const start = app.indexOf('document.addEventListener("keydown", (event) => {\n    // No shortcut may act');
  assert.ok(start > 0, "the shared keydown handler is present");
  const handler = app.slice(start, app.indexOf('document.addEventListener("click"', start));
  const guard = handler.indexOf("if (hasOpenModal()) return;");
  const binding = handler.indexOf('if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {');
  const editable = handler.indexOf("if (editable) return;");
  assert.ok(guard > 0 && binding > guard, "the palette never opens over another modal");
  assert.ok(binding < editable, "the palette opens even while a field has focus");
  assert.match(handler.slice(binding, editable), /event\.preventDefault\(\);\s*openCommandPalette\(\);\s*return;/);
  assert.ok(app.indexOf("const openCommandPalette = () => {") < start, "the opener is defined before the handler uses it");

  const game = read("../public/game.html");
  const shortcuts = game.slice(game.indexOf('id="shortcutsModal"'), game.indexOf("</table>", game.indexOf('id="shortcutsModal"')));
  assert.match(shortcuts, /<kbd>Ctrl<\/kbd>\+<kbd>K<\/kbd> \/ <kbd>⌘<\/kbd><kbd>K<\/kbd><\/td><td>Open the command palette/);

  const settings = read("../public/lib/tabSettings.js");
  assert.match(settings, /getElementById\("closeCommandPaletteBtn"\)\?\.click\(\);\s*command\.run\(\);/, "running a command closes the palette through its one close path");
});
