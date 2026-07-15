import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  );
}

test("every static game button exposes a JavaScript action contract", () => {
  const html = fs.readFileSync(path.resolve("public/game.html"), "utf8");
  const jsCorpus = walk(path.resolve("public"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  const buttonTags = [...html.matchAll(/<button\b[^>]*>/gi)].map((match) => match[0]);
  const failures = [];

  for (const tag of buttonTags) {
    const id = tag.match(/\bid=["']([^"']+)/i)?.[1] || null;
    const dataContracts = [...tag.matchAll(/\b(data-[\w-]+)=["']([^"']*)/gi)]
      .map((match) => ({ attribute: match[1], value: match[2] }))
      .filter((entry) => !["data-testid"].includes(entry.attribute));
    const nativeSubmit = /\btype=["']submit["']/i.test(tag);
    const wiredById = id ? jsCorpus.includes(id) : false;
    const wiredByClass = [...(tag.match(/\bclass=["']([^"']+)/i)?.[1] || "").split(/\s+/)]
      .filter((token) => token && !token.startsWith("btn"))
      .some((token) => jsCorpus.includes(token));
    const wiredByData = dataContracts.some(
      ({ attribute, value }) => jsCorpus.includes(attribute.replace(/^data-/, "")) || (value && jsCorpus.includes(value))
    );
    if (!nativeSubmit && !wiredById && !wiredByData && !wiredByClass) failures.push(id || tag);
  }

  assert.deepEqual(failures, [], `Orphaned button contracts: ${failures.join(", ")}`);
  assert.ok(buttonTags.length >= 100, "Action inventory unexpectedly shrank");
});

test("feedback action failures are surfaced rather than swallowed", () => {
  const source = fs.readFileSync(path.resolve("public/lib/betaFeedback.js"), "utf8");
  assert.doesNotMatch(source, /openFeedback\(\)\.catch\(\(\)\s*=>\s*\{\}\)/);
  assert.match(source, /openFeedback\(\)\.catch\(reportFeedbackError\)/);
});

test("agent negotiation actions bind the IDs actually rendered by the modal", () => {
  const source = fs.readFileSync(path.resolve("public/lib/tabContracts.js"), "utf8");
  assert.match(source, /getElementById\("submitAgentOfferBtn"\)\?\.addEventListener/);
  assert.match(source, /getElementById\("signalCompetingOfferBtn"\)\?\.addEventListener/);
  assert.doesNotMatch(source, /getElementById\("agent(?:Submit|Competing)Btn"\)/);
});
