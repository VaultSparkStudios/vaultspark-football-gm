import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSession } from "../src/runtime/bootstrap.js";
import { buildCoGmBriefingPacket } from "../public/lib/coGmBriefing.js";
import {
  ADVISOR_WEIGHTS,
  buildAdvice,
  renderAdvisorCard,
  scoreAgreement,
  updateAgreementTally
} from "../public/lib/frontOfficeAdvisor.js";

/**
 * S109 — "front-office-advisor-narrates-the-co-gm-packet". The Co-GM packet
 * carried the authority a co-GM would read and nobody read it. The advisor is
 * a deterministic voice over that packet: it ranks the calls the packet
 * exposes with a published weight table, cites every field it read, and
 * degrades when a field is absent rather than filling the gap.
 *
 * The packets here come from a real session: seed 20260306, BUF, advanced to
 * Week 10 of 2026, where the engine queues the TRADE_DEADLINE decision
 * (buy / sell / hold). Clones of that packet with one number changed are the
 * flip cases.
 */

let cachedSession = null;
function weekTenSession() {
  if (cachedSession) return cachedSession;
  const session = createSession({ seed: 20260306, startYear: 2026, controlledTeamId: "BUF" });
  while (session.phase === "regular-season" && session.currentWeek < 10) session.advanceWeek();
  cachedSession = session;
  return session;
}

function realPacket({ withDecision = true } = {}) {
  const session = weekTenSession();
  const dashboard = session.getDashboardState();
  return buildCoGmBriefingPacket({
    dashboard,
    newsRows: dashboard.newsLog || [],
    pendingDecision: withDecision ? dashboard.gmDecisionQueue?.[0] || null : null
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolvePath(root, path) {
  return path.split(".").reduce((cursor, segment) => (cursor && typeof cursor === "object" ? cursor[segment] : undefined), root);
}

function receipt({ status = "committed", choiceId = null, tacticId = "balanced" } = {}) {
  const command = realPacket().currentCommand;
  return {
    schemaVersion: "1.0",
    kind: status === "committed" ? "weekly-plan-commit-receipt" : "weekly-plan-preview",
    status,
    phase: "regular-season",
    onBye: false,
    compositionOrder: ["gm-decision", "tactic"],
    plan: { gmDecision: choiceId ? { decisionId: command.decisionId, choiceId, occurrenceKey: command.occurrenceKey } : null, tacticId, explicitNoPlan: false },
    observed: { gmDecisionApplied: Boolean(choiceId) && status === "committed" },
    review: null
  };
}

test("the real week-10 packet puts the trade-deadline decision on the desk", () => {
  const packet = realPacket();
  assert.equal(packet.currentCommand.action, "choose-gm-decision");
  assert.equal(packet.currentCommand.title, "TRADE_DEADLINE");
  assert.deepEqual(packet.currentCommand.choices.map((choice) => choice.id), ["buy", "sell", "hold"]);
  assert.equal(typeof packet.pressure.capSpace, "number");
});

test("same packet, same advice, byte for byte, and the module owns no RNG", async () => {
  const packet = realPacket();
  const a = buildAdvice(packet);
  const b = buildAdvice(clone(packet));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  // The advice is built from a JSON packet, never from the session, so it
  // cannot reach the league rng; the source carries no random draw either.
  const source = await readFile(new URL("../public/lib/frontOfficeAdvisor.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random|rng|Date\.now|new Date/);
  assert.match(source, /^import \{ describeWeeklyPlanReceipt \} from "\.\/weeklyPlanComposer\.js";$/m, "the only import is the pure receipt describer");
  assert.equal((source.match(/^import /gm) || []).length, 1);
});

test("every cite resolves to a defined value in the packet it was built from", () => {
  const packet = realPacket();
  const advice = buildAdvice(packet);
  assert.ok(advice.cites.length >= 8, `expected a well-read packet, got ${advice.cites.length} cites`);
  for (const path of advice.cites) {
    const value = resolvePath(packet, path);
    assert.notEqual(value, undefined, `cite ${path} resolves to undefined`);
    assert.notEqual(value, null, `cite ${path} resolves to null`);
  }
  assert.ok(advice.cites.includes("pressure.capSpace"));
  assert.ok(advice.cites.includes("currentCommand.choices"));
});

test("every reason embeds a number drawn from the packet", () => {
  const advice = buildAdvice(realPacket());
  assert.ok(advice.reasons.length >= 1 && advice.reasons.length <= 3);
  for (const reason of advice.reasons) assert.match(reason, /\d/, `reason carries no number: ${reason}`);
  assert.ok(advice.reasons.some((reason) => /Cap room is \$[\d.]+[MK]/.test(reason)), advice.reasons.join(" | "));
  assert.ok(advice.call.body.split(/\s+/).length <= 60, "body stays under 60 words");
});

test("the packet's weeks-to-deadline and owner heat are read as numbers, not invented", () => {
  const packet = realPacket();
  const advice = buildAdvice(packet);
  const detailWeek = Number(/end of Week (\d+)/.exec(packet.currentCommand.detail)[1]);
  const weeksLeft = detailWeek - packet.authority.week;
  assert.ok(advice.reasons.some((reason) => reason.includes(`${weeksLeft} week`) && reason.includes(`Week ${detailWeek}`)), advice.reasons.join(" | "));
  assert.ok(advice.reasons.some((reason) => reason.includes(`Owner heat is ${packet.pressure.ownerHeat}`)), advice.reasons.join(" | "));
});

test("cap room from rich to negative flips the deadline call from buy to sell", () => {
  const rich = clone(realPacket());
  rich.pressure.capSpace = ADVISOR_WEIGHTS.thresholds.capRichOver + 10_000_000;
  const richAdvice = buildAdvice(rich);
  assert.equal(richAdvice.call.kind, "gm-decision");
  assert.equal(richAdvice.call.choiceId, "buy", JSON.stringify(richAdvice.ranking));
  assert.equal(richAdvice.call.id, "gm-decision:buy");

  const broke = clone(rich);
  broke.pressure.capSpace = -2_500_000;
  const brokeAdvice = buildAdvice(broke);
  assert.equal(brokeAdvice.call.kind, "gm-decision");
  assert.equal(brokeAdvice.call.choiceId, "sell");
  assert.match(brokeAdvice.reasons[0], /-\$2\.5M/);
  assert.equal(brokeAdvice.confidence, "lean");
});

test("without a decision on the desk, negative cap outranks the roster need it would otherwise recommend", () => {
  const quiet = clone(realPacket({ withDecision: false }));
  assert.notEqual(quiet.currentCommand.action, "choose-gm-decision");
  quiet.pressure.capSpace = 40_000_000;
  quiet.pressure.controlledTeamInjuries = 0;
  const flush = buildAdvice(quiet);
  assert.notEqual(flush.call.kind, "cap-pressure");
  assert.ok(["roster-need", "deadline-window", "advance-week", "owner-mandate"].includes(flush.call.kind), flush.call.kind);

  const over = clone(quiet);
  over.pressure.capSpace = -6_000_000;
  const overAdvice = buildAdvice(over);
  assert.equal(overAdvice.call.kind, "cap-pressure");
  assert.match(overAdvice.call.body, /-\$6\.0M/);
  assert.equal(overAdvice.ranking[0].id, "cap-pressure");
  assert.ok(overAdvice.ranking.every((row, index) => index === 0 || row.score <= overAdvice.ranking[index - 1].score), "ranking is sorted by score");
});

test("owner heat crossing the hot line adds the owner call and hardens the aggressive read", () => {
  const packet = clone(realPacket({ withDecision: false }));
  packet.pressure.ownerHeat = ADVISOR_WEIGHTS.thresholds.ownerWarmAt - 5;
  const calm = buildAdvice(packet);
  assert.ok(!calm.ranking.some((row) => row.kind === "owner-mandate"));
  packet.pressure.ownerHeat = ADVISOR_WEIGHTS.thresholds.ownerHotAt + 15;
  packet.pressure.ownerTrend = "falling";
  const hot = buildAdvice(packet);
  assert.ok(hot.ranking.some((row) => row.kind === "owner-mandate"));
  assert.ok(hot.reasons.some((reason) => reason.includes(`Owner heat is ${ADVISOR_WEIGHTS.thresholds.ownerHotAt + 15}, trend falling`)));
});

test("a bare packet degrades to fewer reasons and never throws", () => {
  for (const packet of [undefined, null, {}, { authority: {} }, { pressure: { capSpace: "not a number" } }, { currentCommand: { action: "choose-gm-decision", choices: "nope" } }]) {
    const advice = buildAdvice(packet);
    assert.equal(advice.call.kind, "advance-week", JSON.stringify(packet));
    assert.deepEqual(advice.reasons, []);
    assert.equal(advice.confidence, "firm", "only one candidate: nothing to be unsure between");
    assert.deepEqual(advice.cites.filter((path) => path.startsWith("pressure.capSpace")), packet?.pressure?.capSpace !== undefined ? ["pressure.capSpace"] : []);
    assert.equal(typeof renderAdvisorCard(advice), "string");
  }
  const partial = clone(realPacket());
  delete partial.pressure.ownerHeat;
  delete partial.pressure.controlledTeamInjuries;
  const full = buildAdvice(realPacket());
  const degraded = buildAdvice(partial);
  assert.ok(degraded.reasons.length < full.reasons.length || !degraded.reasons.some((reason) => /Owner heat/.test(reason)));
  assert.ok(!degraded.cites.includes("pressure.ownerHeat"));
  assert.ok(!degraded.reasons.some((reason) => /Owner heat/.test(reason)), "no owner line without an owner number");
});

test("scoreAgreement: gm-decision matches on the committed choice id, deferral never agrees", () => {
  const advice = buildAdvice(realPacket());
  assert.equal(advice.call.kind, "gm-decision");
  const advised = advice.call.choiceId;
  const other = ["buy", "sell", "hold"].find((id) => id !== advised);
  assert.equal(scoreAgreement(advice, receipt({ choiceId: advised })).agreed, true);
  assert.equal(scoreAgreement(advice, receipt({ choiceId: other })).agreed, false);
  assert.equal(scoreAgreement(advice, receipt({ status: "deferred", choiceId: advised })).agreed, null);
  assert.equal(scoreAgreement(advice, null).basis, "no-receipt");

  const desk = buildAdvice({ pressure: { capSpace: -1_000_000 } });
  assert.equal(desk.call.kind, "cap-pressure");
  assert.equal(scoreAgreement(desk, receipt({ status: "ready" })).basis, "not-committed");
  assert.equal(scoreAgreement(desk, receipt({ status: "committed" })).agreed, null);
  assert.equal(scoreAgreement(desk, receipt({ status: "deferred" })).agreed, null);

  let tally = updateAgreementTally(null, scoreAgreement(advice, receipt({ choiceId: advised })));
  tally = updateAgreementTally(tally, scoreAgreement(advice, receipt({ choiceId: other })));
  tally = updateAgreementTally(tally, scoreAgreement(advice, receipt({ status: "deferred" })));
  assert.deepEqual({ weeks: tally.weeks, agreed: tally.agreed, against: tally.against, deferred: tally.deferred }, { weeks: 3, agreed: 1, against: 1, deferred: 1 });
});

test("the counterfactual reports both branches and describes what the player actually committed", () => {
  const packet = realPacket();
  const lastWeekAdvice = buildAdvice(packet);
  const advised = lastWeekAdvice.call.choiceId;
  const other = ["buy", "sell", "hold"].find((id) => id !== advised);

  const agreed = buildAdvice(packet, { lastWeekAdvice, lastWeekReceipt: receipt({ choiceId: advised, tacticId: "air-raid" }) });
  assert.equal(agreed.counterfactual.agreed, true);
  assert.equal(agreed.counterfactual.saidLastWeek, lastWeekAdvice.call.title);
  assert.match(agreed.counterfactual.playerDid, /Weekly plan committed: GM choice · tactic air-raid/);
  assert.match(agreed.counterfactual.note, /no bonus either way/);

  const against = buildAdvice(packet, { lastWeekAdvice, lastWeekReceipt: receipt({ choiceId: other }) });
  assert.equal(against.counterfactual.agreed, false);
  assert.match(against.counterfactual.note, /Went against the room/);

  assert.equal(buildAdvice(packet).counterfactual, undefined, "no counterfactual without last week's pair");
  assert.equal(JSON.stringify(buildAdvice(packet)), JSON.stringify(lastWeekAdvice), "the counterfactual does not perturb the call");
});

test("renderAdvisorCard escapes a hostile team name and carries the contract classes and data attributes", async () => {
  const packet = clone(realPacket());
  packet.authority.teamName = "<script>alert('x')</script> Stallions";
  packet.currentCommand.choices[0].label = "Buy <b>now</b>";
  const advice = buildAdvice(packet, { lastWeekAdvice: buildAdvice(packet), lastWeekReceipt: receipt({ choiceId: "hold" }) });
  const html = renderAdvisorCard(advice);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; Stallions"));
  assert.ok(!/<b>now<\/b>/.test(html));
  for (const cls of ["advisor-card", "advisor-call", "advisor-reasons", "advisor-risk", "advisor-counterfactual"]) {
    assert.ok(html.includes(`class="${cls}"`), `missing ${cls}`);
  }
  assert.ok(html.includes(`data-call-id="${advice.call.id}"`));
  assert.ok(html.includes(`data-confidence="${advice.confidence}"`));
  assert.ok(html.includes('data-agreed="false"'));

  const compact = renderAdvisorCard(advice, { compact: true });
  assert.ok(compact.includes('data-compact="true"'));
  assert.ok(!compact.includes("advisor-counterfactual"), "compact drops the counterfactual");
  assert.equal((compact.match(/<li>/g) || []).length, 1, "compact keeps one reason");

  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.advisor-card\{[^}]*display:grid/);
});

test("ADVISOR_WEIGHTS is the whole table and is frozen", () => {
  assert.ok(Object.isFrozen(ADVISOR_WEIGHTS));
  assert.ok(Object.isFrozen(ADVISOR_WEIGHTS.candidate));
  assert.deepEqual(Object.keys(ADVISOR_WEIGHTS.candidate).sort(), ["advance-week", "cap-pressure", "deadline-window", "draft-clock", "gm-decision", "injury-depth", "owner-mandate", "roster-need"]);
});
