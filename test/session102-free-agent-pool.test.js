import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { GameSession } from "../src/runtime/GameSession.js";
import { advanceContractYear } from "../src/domain/contracts.js";
import { applyAgingProgressionAndRetirements } from "../src/engine/offseasonSimulator.js";
import { FREE_AGENCY_RULES } from "../src/config.js";
import { RNG } from "../src/utils/rng.js";

// ── S102 · the free-agent pool has an exit ────────────────────────────────────
//
// Intake ran every offseason and the only way out was a retirement roll that is
// ~0.03% for an unsigned 24-year-old, so the pool only ever grew: measured 0 at
// season 0 to 311 by simulated season 10 on seed 2026, mean age 28.9, mean
// overall 66.4. That is an accumulator, not a market — and it is the same
// unbounded population `progressionParity` was forced to fence out of its gated
// statistics in S91, because a pool whose size is a free parameter can cancel
// any amount of rostered inflation in a blended mean.

const WINDOW = FREE_AGENCY_RULES.maxConsecutiveUnsignedOffseasons;

function youngUnsignedPlayer(session) {
  // A player young and good enough that the retirement roll will essentially
  // never fire — so if he leaves, it is the exit rule that removed him.
  const player = session.league.players.find(
    (candidate) =>
      candidate.status === "active" &&
      candidate.age <= 24 &&
      candidate.position !== "K" &&
      candidate.position !== "P" &&
      (candidate.overall || 0) >= 72
  );
  assert.ok(player, "seed must contain a young, non-specialist active player");
  player.teamId = "FA";
  player.unsignedOffseasons = 0;
  return player;
}

function ageOnce(session, year) {
  applyAgingProgressionAndRetirements(session.league, year, new RNG(4242 + year), {
    winningRetention: false
  });
}

test("a player nobody signs leaves the league after the declared window", () => {
  const session = createSession({ seed: 5150, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  const player = youngUnsignedPlayer(session);
  const id = player.id;

  for (let i = 1; i < WINDOW; i += 1) {
    ageOnce(session, 2026 + i);
    const still = session.league.players.find((candidate) => candidate.id === id);
    assert.ok(still, `an unsigned player must survive offseason ${i} of ${WINDOW}`);
    assert.equal(still.unsignedOffseasons, i, "the counter must track consecutive unsigned offseasons");
  }

  ageOnce(session, 2026 + WINDOW);
  assert.equal(
    session.league.players.find((candidate) => candidate.id === id),
    undefined,
    "the window closed and the player is still in the active pool"
  );
  const gone = session.league.retiredPlayers.find((candidate) => candidate.id === id);
  assert.ok(gone, "the player must land in the retired collection, not simply vanish");
  assert.equal(gone.retirementReason, "unsigned-out-of-league", "the exit must say why it happened");
});

test("signing a free agent resets his clock", () => {
  const session = createSession({ seed: 5150, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  const player = youngUnsignedPlayer(session);
  const id = player.id;

  for (let i = 1; i < WINDOW; i += 1) ageOnce(session, 2026 + i);
  assert.equal(session.league.players.find((c) => c.id === id).unsignedOffseasons, WINDOW - 1);

  // The market picks him up.
  session.league.players.find((c) => c.id === id).teamId = session.league.teams[0].id;
  ageOnce(session, 2026 + WINDOW);

  const signed = session.league.players.find((c) => c.id === id);
  assert.ok(signed, "a signed player must not be swept out by a stale counter");
  assert.ok(!signed.unsignedOffseasons, "being rostered must clear the clock");
  assert.ok(
    !("unsignedOffseasons" in signed),
    "and must drop the field entirely, so it costs nothing in the save payload"
  );
});

// NEGATIVE CONTROL — prove the rule is what removes him. With the window pushed
// out of reach (the pre-S102 engine), the same player on the same seed survives
// every one of those offseasons.
test("negative control: with no exit rule the same player never leaves", () => {
  const original = FREE_AGENCY_RULES.maxConsecutiveUnsignedOffseasons;
  FREE_AGENCY_RULES.maxConsecutiveUnsignedOffseasons = 10_000;
  try {
    const session = createSession({ seed: 5150, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
    const player = youngUnsignedPlayer(session);
    const id = player.id;
    for (let i = 1; i <= WINDOW + 2; i += 1) ageOnce(session, 2026 + i);
    assert.ok(
      session.league.players.find((candidate) => candidate.id === id),
      "without the rule this player must still be in the pool — otherwise the test above proves nothing"
    );
  } finally {
    FREE_AGENCY_RULES.maxConsecutiveUnsignedOffseasons = original;
  }
});

test("the proration schedule survives a save and reload", () => {
  // The field is additive and self-migrating in `normalizeContract`, so it
  // deliberately carries no snapshot schema bump — but that only holds if it
  // actually round-trips, and if a save written without it still loads.
  const session = createSession({ seed: 6060, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  const before = session.league.players
    .filter((player) => player.contract && Number(player.contract.signingBonus) > 0)
    .slice(0, 25)
    .map((player) => [player.id, player.contract.prorationYears, player.contract.capHit]);
  assert.ok(before.length >= 5, "the seed must produce contracts carrying signing bonuses");

  const snapshot = JSON.parse(JSON.stringify(session.exportState()));
  const reloaded = GameSession.fromSnapshot(snapshot, (seed) => new RNG(seed));

  for (const [id, prorationYears, capHit] of before) {
    const player = reloaded.league.players.find((candidate) => candidate.id === id);
    assert.ok(player, `player ${id} did not survive the round trip`);
    assert.equal(player.contract.prorationYears, prorationYears, `proration schedule drifted for ${id}`);
    assert.equal(player.contract.capHit, capHit, `cap hit drifted for ${id}`);
  }
});

test("a save written before the field existed still loads and stops accelerating", () => {
  const session = createSession({ seed: 6060, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
  const snapshot = JSON.parse(JSON.stringify(session.exportState()));

  // Strip the field everywhere, reproducing a pre-S102 save exactly.
  let stripped = 0;
  for (const player of snapshot.league.players) {
    if (player?.contract && "prorationYears" in player.contract) {
      delete player.contract.prorationYears;
      stripped += 1;
    }
  }
  assert.ok(stripped > 100, `the fixture must actually strip the field (stripped ${stripped})`);

  const reloaded = GameSession.fromSnapshot(snapshot, (seed) => new RNG(seed));
  const sample = reloaded.league.players.find((player) => Number(player.contract?.signingBonus) > 0);
  assert.ok(sample, "a legacy save must still produce readable contracts");
  assert.ok(
    Number.isFinite(sample.contract.prorationYears) && sample.contract.prorationYears >= 1,
    "every migrated contract must carry a usable schedule"
  );

  const advanced = advanceContractYear(sample.contract);
  if (advanced.yearsRemaining > 0) {
    assert.equal(advanced.capHit, sample.contract.capHit, "a migrated deal must not climb after the load");
  }
});

test("the exit rule does not consume the RNG stream", () => {
  // A forced exit must not short-circuit the retirement roll: the whole league's
  // calibration is keyed to how many draws this loop makes. Two runs of the same
  // offseason — one where a player is swept out, one where he is not — must
  // leave the shared RNG at the same position.
  const cursorAfterOffseason = (forceSweep) => {
    const session = createSession({ seed: 5150, startYear: 2026, mode: "drive", controlledTeamId: "BUF" });
    const player = youngUnsignedPlayer(session);
    player.unsignedOffseasons = forceSweep ? WINDOW - 1 : 0;
    const rng = new RNG(31337);
    applyAgingProgressionAndRetirements(session.league, 2027, rng, { winningRetention: false });
    // Whatever the RNG hands out next is the position we care about.
    return rng.int(0, 1_000_000_000);
  };

  assert.equal(
    cursorAfterOffseason(true),
    cursorAfterOffseason(false),
    "a forced exit shifted the RNG stream, which would re-calibrate every seeded league"
  );
});
