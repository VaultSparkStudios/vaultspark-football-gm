import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCoGmBriefingPacket, CO_GM_BRIEFING_SCHEMA_VERSION } from "../public/lib/coGmBriefing.js";

const schema = JSON.parse(readFileSync(new URL("../public/schemas/co-gm-briefing-1.0.schema.json", import.meta.url), "utf8"));
const agents = JSON.parse(readFileSync(new URL("../public/agents.json", import.meta.url), "utf8"));

// A small checker for the subset of JSON Schema the published file uses. It
// throws on a keyword it does not know, so the schema cannot grow a rule that
// this test silently ignores.
const KNOWN = new Set(["$schema", "$id", "title", "description", "type", "additionalProperties", "required", "properties", "items", "maxItems", "const"]);
const typeOf = (value) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

function violations(node, value, at = "$") {
  for (const keyword of Object.keys(node)) assert.ok(KNOWN.has(keyword), `unknown schema keyword ${keyword} at ${at}`);
  const found = [];
  if ("const" in node && value !== node.const) found.push(`${at}: expected ${JSON.stringify(node.const)}`);
  if (node.type) {
    const allowed = [].concat(node.type);
    if (!allowed.includes(typeOf(value))) return [...found, `${at}: ${typeOf(value)} is not ${allowed.join("|")}`];
  }
  if (typeOf(value) === "object" && node.properties) {
    for (const key of node.required || []) if (!(key in value)) found.push(`${at}.${key}: missing`);
    for (const [key, entry] of Object.entries(value)) {
      if (node.properties[key]) found.push(...violations(node.properties[key], entry, `${at}.${key}`));
      else if (node.additionalProperties === false) found.push(`${at}.${key}: not in the schema`);
    }
  }
  if (typeOf(value) === "array") {
    if (node.maxItems !== undefined && value.length > node.maxItems) found.push(`${at}: more than ${node.maxItems} items`);
    if (node.items) value.forEach((entry, index) => found.push(...violations(node.items, entry, `${at}[${index}]`)));
  }
  return found;
}

function fullDashboard() {
  return {
    controlledTeamId: "BUF",
    controlledTeam: { id: "BUF", name: "Buffalo", record: "7-2", owner: { expectation: { mandate: "Win the division", trend: "rising", heat: 22 } } },
    currentYear: 2028, currentWeek: 9, phase: "regular-season",
    cap: { capSpace: 12_000_000 },
    rosterNeeds: [{ pos: "WR" }, { pos: "OT" }, { pos: "CB" }, { pos: "S" }, { pos: "RB" }],
    injuryReport: [{ teamId: "BUF", name: "A. Player" }],
    architectThesis: { focusPathId: "identity", revision: 2, pendingAdaptation: { mode: "pivot", label: "Pivot to youth", sourceEntryId: "receipt-1" } },
    architectLedger: Array.from({ length: 5 }, (_, index) => ({
      id: `receipt-${index}`, teamId: "BUF", year: 2028, week: index + 1,
      intent: { tactic: { label: `Plan ${index}` } }, outcome: { observed: `Result ${index}`, aligned: index % 2 === 0 }
    }))
  };
}

test("every briefing the game can build matches the published schema", () => {
  const decision = { id: "d1", occurrenceKey: "2028-9-d1", year: 2028, week: 9, label: "Trade deadline", prompt: "Buy or sell?", type: "deadline",
    options: [{ id: "buy", label: "Buy", effect: "Adds a starter" }, { id: "sell", label: "Sell", effect: "Adds picks" }] };
  const cases = {
    full: buildCoGmBriefingPacket({ dashboard: fullDashboard(), newsRows: [{ headline: "Division race tightens" }] }),
    "with a pending decision": buildCoGmBriefingPacket({ dashboard: fullDashboard(), pendingDecision: decision, pendingChoice: { decisionId: "d1", choiceId: "buy" } }),
    empty: buildCoGmBriefingPacket(),
    "damaged decision": buildCoGmBriefingPacket({ dashboard: fullDashboard(), pendingDecision: { label: "no id" } })
  };
  for (const [name, packet] of Object.entries(cases)) {
    assert.deepEqual(violations(schema, JSON.parse(JSON.stringify(packet))), [], `${name} briefing`);
  }
});

test("the schema refuses a briefing that carries more than the game exports", () => {
  const packet = JSON.parse(JSON.stringify(buildCoGmBriefingPacket({ dashboard: fullDashboard() })));
  assert.match(violations(schema, { ...packet, save: {} }).join("\n"), /\$\.save: not in the schema/);
  assert.match(violations(schema, { ...packet, authority: { ...packet.authority, year: "2028" } }).join("\n"), /authority\.year: string is not number\|null/);
  const { disclosure, ...withoutDisclosure } = packet;
  assert.match(violations(schema, withoutDisclosure).join("\n"), /\$\.disclosure: missing/);
});

test("the schema, the module and the agent manifest name the same version", () => {
  assert.equal(schema.properties.schemaVersion.const, CO_GM_BRIEFING_SCHEMA_VERSION);
  assert.equal(agents.liveStateContract.schemaVersion, CO_GM_BRIEFING_SCHEMA_VERSION);
  assert.equal(agents.liveStateContract.schema, schema.$id);
  assert.match(schema.$id, new RegExp(`co-gm-briefing-${CO_GM_BRIEFING_SCHEMA_VERSION.replace(".", "\\.")}\\.schema\\.json$`));
});
