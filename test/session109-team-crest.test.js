import test from "node:test";
import assert from "node:assert/strict";

import { buildTeamCrestSvg, teamCrestDataUri } from "../public/lib/teamCrest.js";

/**
 * S109 — procedural team crest generator. Pure SVG string builder used to
 * give every franchise a distinct, deterministic mark without hand-drawn
 * assets. Determinism and motif spread are pinned against a 32-team fixture
 * so a future change can't silently collapse everyone onto one shield.
 */

const TEAMS = [
  { teamId: 1, code: "NYJ", city: "New York", name: "Jets", primary: "#0c371f", secondary: "#ffffff" },
  { teamId: 2, code: "MIA", city: "Miami", name: "Dolphins", primary: "#008e97", secondary: "#f58220" },
  { teamId: 3, code: "NE", city: "New England", name: "Patriots", primary: "#002244", secondary: "#c60c30" },
  { teamId: 4, code: "BUF", city: "Buffalo", name: "Bills", primary: "#00338d", secondary: "#c60c30" },
  { teamId: 5, code: "BAL", city: "Baltimore", name: "Ravens", primary: "#241773", secondary: "#9e7c0c" },
  { teamId: 6, code: "CIN", city: "Cincinnati", name: "Bengals", primary: "#fb4f14", secondary: "#000000" },
  { teamId: 7, code: "CLE", city: "Cleveland", name: "Browns", primary: "#311d00", secondary: "#ff3c00" },
  { teamId: 8, code: "PIT", city: "Pittsburgh", name: "Steelers", primary: "#101820", secondary: "#ffb612" },
  { teamId: 9, code: "HOU", city: "Houston", name: "Texans", primary: "#03202f", secondary: "#a71930" },
  { teamId: 10, code: "IND", city: "Indianapolis", name: "Colts", primary: "#002c5f", secondary: "#a2aaad" },
  { teamId: 11, code: "JAX", city: "Jacksonville", name: "Jaguars", primary: "#101820", secondary: "#d7a22a" },
  { teamId: 12, code: "TEN", city: "Tennessee", name: "Titans", primary: "#0c2340", secondary: "#4b92db" },
  { teamId: 13, code: "DEN", city: "Denver", name: "Broncos", primary: "#fb4f14", secondary: "#002244" },
  { teamId: 14, code: "KC", city: "Kansas City", name: "Chiefs", primary: "#e31837", secondary: "#ffb81c" },
  { teamId: 15, code: "LV", city: "Las Vegas", name: "Raiders", primary: "#000000", secondary: "#a5acaf" },
  { teamId: 16, code: "LAC", city: "Los Angeles", name: "Chargers", primary: "#0080c6", secondary: "#ffc20e" },
  { teamId: 17, code: "DAL", city: "Dallas", name: "Cowboys", primary: "#041e42", secondary: "#869397" },
  { teamId: 18, code: "NYG", city: "New York", name: "Giants", primary: "#0b2265", secondary: "#a71930" },
  { teamId: 19, code: "PHI", city: "Philadelphia", name: "Eagles", primary: "#004c54", secondary: "#a5acaf" },
  { teamId: 20, code: "WAS", city: "Washington", name: "Commanders", primary: "#5a1414", secondary: "#ffb612" },
  { teamId: 21, code: "CHI", city: "Chicago", name: "Bears", primary: "#0b162a", secondary: "#c83803" },
  { teamId: 22, code: "DET", city: "Detroit", name: "Lions", primary: "#0076b6", secondary: "#b0b7bc" },
  { teamId: 23, code: "GB", city: "Green Bay", name: "Packers", primary: "#203731", secondary: "#ffb612" },
  { teamId: 24, code: "MIN", city: "Minnesota", name: "Vikings", primary: "#4f2683", secondary: "#ffc62f" },
  { teamId: 25, code: "ATL", city: "Atlanta", name: "Falcons", primary: "#a71930", secondary: "#000000" },
  { teamId: 26, code: "CAR", city: "Carolina", name: "Panthers", primary: "#0085ca", secondary: "#101820" },
  { teamId: 27, code: "NO", city: "New Orleans", name: "Saints", primary: "#101820", secondary: "#d3bc8d" },
  { teamId: 28, code: "TB", city: "Tampa Bay", name: "Buccaneers", primary: "#d50a0a", secondary: "#34302b" },
  { teamId: 29, code: "ARI", city: "Arizona", name: "Cardinals", primary: "#97233f", secondary: "#000000" },
  { teamId: 30, code: "LAR", city: "Los Angeles", name: "Rams", primary: "#003594", secondary: "#ffa300" },
  { teamId: 31, code: "SF", city: "San Francisco", name: "49ers", primary: "#aa0000", secondary: "#b3995d" },
  { teamId: 32, code: "SEA", city: "Seattle", name: "Seahawks", primary: "#002244", secondary: "#69be28" }
];

test("determinism: identical inputs produce an identical crest", () => {
  const a = buildTeamCrestSvg(TEAMS[0]);
  const b = buildTeamCrestSvg({ ...TEAMS[0] });
  assert.equal(a, b);
});

test("32-team fixture spreads across at least 4 distinct motifs and colors differ", () => {
  const svgs = TEAMS.map((t) => buildTeamCrestSvg(t));
  const motifSignatures = new Set(
    svgs.map((svg) => {
      // The second drawn shape after the shield base carries the motif marker;
      // classify by which motif-specific element/attribute is present.
      if (svg.includes("<circle") && svg.includes('r="28')) return "roundel";
      if (svg.includes("<polygon")) return "star";
      if (svg.includes('stroke-linejoin="round"')) return "chevron";
      if (svg.includes('rx="10.24"') || svg.includes("stroke-width=\"3.2\" opacity=\"0.8\"")) return "monogram";
      if (svg.match(/<path[^>]*opacity="0.4"/)) return "wing";
      return "shield";
    })
  );
  assert.ok(motifSignatures.size >= 4, `expected >= 4 distinct motifs, saw ${motifSignatures.size}`);

  const distinctSvgs = new Set(svgs);
  assert.equal(distinctSvgs.size, svgs.length, "every team in the fixture should render a unique crest string");
});

test("escaping: a name with < does not produce raw < inside the text node", () => {
  const svg = buildTeamCrestSvg({
    teamId: 99,
    code: "<b>X",
    city: "Test<script>",
    name: "Team</script>",
    primary: "#123456",
    secondary: "#abcdef"
  });
  const textNode = svg.match(/<text[^>]*>([^<]*)<\/text>/);
  assert.ok(textNode, "expected a single well-formed <text> element");
  assert.equal(textNode[1].includes("<"), false);
  // the aria-label also escapes the raw city/name
  assert.equal(/aria-label="[^"]*<[^"]*"/.test(svg), false);
});

test("contrast rule: dark primary gets light text, light primary gets dark text", () => {
  const dark = buildTeamCrestSvg({ teamId: 1, code: "AAA", city: "A", name: "A", primary: "#0a0a0a", secondary: "#444444" });
  const light = buildTeamCrestSvg({ teamId: 2, code: "BBB", city: "B", name: "B", primary: "#f5f5f5", secondary: "#444444" });
  const darkFill = dark.match(/<text[^>]*fill="([^"]+)"/)[1];
  const lightFill = light.match(/<text[^>]*fill="([^"]+)"/)[1];
  assert.equal(darkFill, "#f5f1e7");
  assert.equal(lightFill, "#12181c");
});

test("size parameter is respected in viewBox, width, height and stays compact", () => {
  const small = buildTeamCrestSvg({ ...TEAMS[0], size: 32 });
  const large = buildTeamCrestSvg({ ...TEAMS[0], size: 128 });
  assert.match(small, /viewBox="0 0 32 32" width="32" height="32"/);
  assert.match(large, /viewBox="0 0 128 128" width="128" height="128"/);
  assert.ok(Buffer.byteLength(large, "utf8") < 1229, "crest should stay well under ~1.2KB");
});

test("teamCrestDataUri returns a decodable data URI wrapping the same SVG", () => {
  const svg = buildTeamCrestSvg(TEAMS[3]);
  const uri = teamCrestDataUri(TEAMS[3]);
  assert.ok(uri.startsWith("data:image/svg+xml;utf8,"));
  const decoded = decodeURIComponent(uri.slice("data:image/svg+xml;utf8,".length));
  assert.equal(decoded, svg);
});
