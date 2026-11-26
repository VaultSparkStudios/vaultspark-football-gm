import test from "node:test";
import assert from "node:assert/strict";
import { corpusVocabulary, cssBlocks, selectorMayMatch, subsetStylesheet } from "../scripts/lib/site-stylesheet-subset.mjs";

const vocab = corpusVocabulary([
  `<div class="site-page census-grid"><span class="census-ras-\${tier}">`,
  `el.classList.add("is-open")`
]);

test("a rule stays when any selector could match the site, in source order", () => {
  const css = `:root{--a:1}.site-page{color:red}.game-only{color:blue}.census-ras-elite,.game-only{x:1}@media (max-width:600px){.game-only{a:1}.census-grid{b:2}}@keyframes spin{to{transform:rotate(1turn)}}.site-page:not(.never-mentioned){c:3}`;
  const out = subsetStylesheet(css, vocab);
  assert.equal(out, [":root{--a:1}", ".site-page{color:red}", ".census-ras-elite,.game-only{x:1}", "@media (max-width:600px){.census-grid{b:2}}", "@keyframes spin{to{transform:rotate(1turn)}}", ".site-page:not(.never-mentioned){c:3}"].join("\n"));
});

test("negative control: a rule whose every selector names an unmentioned class is dropped", () => {
  assert.equal(selectorMayMatch(".game-only .site-page", vocab), false, "one unknown class in a compound selector rules it out");
  assert.equal(selectorMayMatch(".is-open", vocab), true, "a class added by a script is kept");
  assert.equal(selectorMayMatch(".census-ras-poor", vocab), true, "a template prefix keeps every variant");
  assert.equal(selectorMayMatch(":is(.game-only)", vocab), true, ":is/:where/:has are kept, never guessed");
  assert.equal(subsetStylesheet(".game-only{a:1}@media print{.game-only{b:2}}", vocab), "", "an emptied @media block disappears");
});

test("the block splitter ignores braces inside strings and comments", () => {
  assert.deepEqual(cssBlocks(`/* { */.a{content:"}"}.b{x:1}`), [`/* { */.a{content:"}"}`, ".b{x:1}"]);
});
