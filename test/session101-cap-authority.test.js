import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/runtime/bootstrap.js";
import { getTeamPlayers } from "../src/domain/teamFactory.js";

// ── S101 · the salary cap is allowed to refuse ────────────────────────────────
//
// `negotiateAndSign` caught `resignPlayer`'s cap refusal and, as a last resort,
// wrote `player.contract` by hand — keeping the OLD capHit — and returned
// `ok: true`. A capped-out club could therefore extend every expiring player,
// indefinitely, for free, which silently no-opped the cap pressure the Command
// Center escalates as a blocking problem. The client compounded it by reporting
// "accepted the offer" for every non-countered outcome, so even the legitimate
// smaller-deal branch told the player they had got the terms they asked for.

const TEAM_ID = "BUF";

function cappedOutSession() {
  const session = createSession({ seed: 9090, startYear: 2025, mode: "drive", controlledTeamId: TEAM_ID });
  const target = session.listNegotiationTargets(TEAM_ID)[0];
  assert.ok(target, "seed must produce an expiring contract to negotiate");

  // Push the team far past the cap via an unrelated contract, so the negotiation
  // itself is the only thing under test.
  const victim = getTeamPlayers(session.league, TEAM_ID).find((player) => player.id !== target.id);
  victim.contract = { ...victim.contract, salary: 400_000_000, capHit: 400_000_000, yearsRemaining: 4 };

  assert.ok(session.getTeamCapSummary(TEAM_ID).capSpace < 0, "the team must actually be over the cap");
  return { session, target };
}

test("a capped-out club cannot sign an extension it has no room for", () => {
  const { session, target } = cappedOutSession();

  const before = JSON.stringify(session.activePlayerOnTeam(target.id, TEAM_ID).contract);
  const capBefore = session.getTeamCapSummary(TEAM_ID).capSpace;

  const result = session.negotiateAndSign({ teamId: TEAM_ID, playerId: target.id, years: 5, salary: 40_000_000 });

  assert.equal(result.ok, false, "the cap authority's refusal must survive to the caller");
  assert.equal(result.reasonCode, "cap-blocked");
  assert.match(String(result.error), /cap/i);

  assert.equal(
    JSON.stringify(session.activePlayerOnTeam(target.id, TEAM_ID).contract),
    before,
    "a refused negotiation must not rewrite the contract"
  );
  assert.equal(
    session.getTeamCapSummary(TEAM_ID).capSpace,
    capBefore,
    "a refused negotiation must not move the cap"
  );
});

test("a refused negotiation is not logged or reported as an acceptance", () => {
  const { session, target } = cappedOutSession();
  const before = (session.league.transactionLog || []).length;

  const result = session.negotiateAndSign({ teamId: TEAM_ID, playerId: target.id, years: 5, salary: 40_000_000 });
  assert.equal(result.ok, false);

  const added = (session.league.transactionLog || []).slice(before);
  const acceptances = added.filter((entry) => entry?.details?.outcome === "accepted");
  assert.deepEqual(acceptances, [], "a cap-blocked negotiation must never record an acceptance");
});

test("a signing below the offer reports the terms actually signed", () => {
  const session = createSession({ seed: 9090, startYear: 2025, mode: "drive", controlledTeamId: TEAM_ID });
  const target = session.listNegotiationTargets(TEAM_ID)[0];

  // A deliberately unaffordable ask that the cap-room fallback can still meet.
  const result = session.negotiateAndSign({ teamId: TEAM_ID, playerId: target.id, years: 5, salary: 40_000_000 });

  if (!result.ok || result.countered) return; // this seed took another branch; nothing to assert
  assert.ok(Number.isFinite(result.appliedYears), "the response must state the years signed");
  assert.ok(Number.isFinite(result.appliedSalary), "the response must state the salary signed");

  if (result.adjustedReason === "cap-room") {
    assert.ok(
      result.appliedSalary <= 40_000_000,
      "an adjusted signing must not exceed the offer it was adjusted down from"
    );
    // the whole point: the offer and the signature are different numbers, and
    // the response says so rather than reporting a flat acceptance.
    assert.notEqual(result.appliedSalary, 40_000_000);
  }

  // whatever was signed must be what the contract now holds
  const contract = session.activePlayerOnTeam(target.id, TEAM_ID).contract;
  assert.equal(contract.yearsRemaining, result.appliedYears);
});
