import test from "node:test";
import assert from "node:assert/strict";
import { CHALLENGE_CODE_MAX_LENGTH, encodeChallengeCode, decodeChallengeCode, fnv1a } from "../public/lib/challengeCodes.js";

// ── Shareable challenge codes (S14) ──────────────────────────────────────────

test("encode/decode round-trip preserves all fields", () => {
  const input = {
    seed: 1748966400000,
    startYear: 2026,
    teamId: "BUF",
    rivalSeasons: 7,
    rivalName: "Carter"
  };
  const code = encodeChallengeCode(input);
  assert.ok(code, "code must be produced");
  assert.match(code, /^VSFC1\.[A-Za-z0-9_-]+\.[a-z0-9]{4}$/);
  const decoded = decodeChallengeCode(code);
  assert.deepEqual(decoded, {
    seed: input.seed,
    startYear: input.startYear,
    teamId: "BUF",
    rivalSeasons: 7,
    rivalName: "Carter"
  });
});

test("round-trip without rival result yields null rival fields", () => {
  const code = encodeChallengeCode({ seed: 42, startYear: 2026, teamId: "kc" });
  const decoded = decodeChallengeCode(code);
  assert.equal(decoded.seed, 42);
  assert.equal(decoded.teamId, "KC", "teamId is normalized to uppercase");
  assert.equal(decoded.rivalSeasons, null);
  assert.equal(decoded.rivalName, null);
});

test("tampered payload is rejected by the checksum", () => {
  const code = encodeChallengeCode({ seed: 99, startYear: 2026, teamId: "DAL", rivalSeasons: 3 });
  const [prefix, body, chk] = code.split(".");
  // Flip a character in the payload body
  const tamperedBody = (body[0] === "A" ? "B" : "A") + body.slice(1);
  assert.equal(decodeChallengeCode(`${prefix}.${tamperedBody}.${chk}`), null);
});

test("garbage, wrong prefix, and empty inputs decode to null", () => {
  assert.equal(decodeChallengeCode(""), null);
  assert.equal(decodeChallengeCode(null), null);
  assert.equal(decodeChallengeCode("not-a-code"), null);
  assert.equal(decodeChallengeCode("VSFC9.abc.0000"), null);
  assert.equal(decodeChallengeCode("VSFC1.!!!.0000"), null);
});

test("invalid encode inputs return null", () => {
  assert.equal(encodeChallengeCode({}), null);
  assert.equal(encodeChallengeCode({ seed: NaN, startYear: 2026, teamId: "BUF" }), null);
  assert.equal(encodeChallengeCode({ seed: 1, startYear: 2026, teamId: "" }), null);
  assert.equal(encodeChallengeCode({ seed: -1, startYear: 2026, teamId: "BUF" }), null);
  assert.equal(encodeChallengeCode({ seed: 1.5, startYear: 2026, teamId: "BUF" }), null);
  assert.equal(encodeChallengeCode({ seed: 1, startYear: 1899, teamId: "BUF" }), null);
  assert.equal(encodeChallengeCode({ seed: 1, startYear: 2026, teamId: "TOO-LONG" }), null);
  assert.equal(encodeChallengeCode({ seed: 1, startYear: 2026, teamId: "BUF", rivalSeasons: 201 }), null);
  assert.equal(encodeChallengeCode({ seed: 1, startYear: 2026, teamId: "BUF", rivalName: "bad\u0000name" }), null);
});

test("whitespace around a pasted code is tolerated", () => {
  const code = encodeChallengeCode({ seed: 7, startYear: 2030, teamId: "PHI", rivalSeasons: 12 });
  const decoded = decodeChallengeCode(`  ${code}\n`);
  assert.equal(decoded.rivalSeasons, 12);
});

test("rival name is capped at 24 characters", () => {
  const code = encodeChallengeCode({
    seed: 1, startYear: 2026, teamId: "NE",
    rivalSeasons: 2, rivalName: "X".repeat(60)
  });
  assert.equal(decodeChallengeCode(code).rivalName.length, 24);
});

test("oversized and malformed payloads reject before decode work", () => {
  assert.equal(decodeChallengeCode(`VSFC1.${"A".repeat(CHALLENGE_CODE_MAX_LENGTH)}.0000`), null);
  assert.equal(decodeChallengeCode(`VSFC1.${"A".repeat(385)}.0000`), null);
  assert.equal(decodeChallengeCode("VSFC1.ab+c.0000"), null);
  assert.equal(decodeChallengeCode("VSFC1.abc.0!00"), null);
  assert.equal(decodeChallengeCode("VSFC1.abc.0000\u0000"), null);
});

test("fnv1a is stable for known input", () => {
  assert.equal(fnv1a("VSFC1"), fnv1a("VSFC1"));
  assert.notEqual(fnv1a("VSFC1"), fnv1a("VSFC2"));
});
