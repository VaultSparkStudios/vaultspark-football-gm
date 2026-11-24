import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createCommunityStatsHandler, createMemoryRateLimiter } from "../src/community/server.js";
import { createTurnstileHumanCheck, TURNSTILE_SITEVERIFY_URL } from "../src/community/humanCheck.js";
import { aggregateCommunitySnapshot } from "../src/community/aggregateCommunitySnapshot.js";
import { buildEdgeHeaders, HUMAN_CHECK_ORIGIN } from "../scripts/lib/edge-security-policy.mjs";
import { humanCheckFrom } from "../public/lib/humanCheck.js";
import { sendFeedback } from "../public/lib/feedbackTransport.js";
import { firstStepsMarkup } from "../public/community-stats.js";

const ALLOWED_ORIGIN = "https://playfranchisearchitect.com";
const SITE_KEY = "0x4AAAAAAAtestSiteKey";
const quietLogger = { error() {} };
const quietStore = (extra = {}) => ({ health: async () => ({ ok: true }), snapshot: async () => aggregateCommunitySnapshot([]), cache: null, ...extra });

async function withServer(store, run, options = {}) {
  const server = http.createServer(createCommunityStatsHandler({ store, origins: new Set([ALLOWED_ORIGIN]), ...options }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); await once(server, "close"); }
}

const jsonPost = (url, payload, headers = {}) => fetch(url, {
  method: "POST",
  headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json", ...headers },
  body: JSON.stringify(payload)
});

// A stand-in for Siteverify, injected into the check itself. No global is replaced.
function siteverifyStub(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const result = typeof answer === "function" ? await answer(init) : answer;
    return { json: async () => result };
  };
  return { calls, fetchImpl };
}

test("with no secret and no site key the human check is off and capability issuance is unchanged", async () => {
  assert.equal(createTurnstileHumanCheck({ secret: "", siteKey: "", logger: quietLogger }), null);
  await withServer(quietStore(), async (origin) => {
    const response = await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId: "browser_identifier_plain" });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(typeof body.capability, "string");
    assert.equal("humanCheck" in body, false);
  }, { humanCheck: null });
});

test("half a configuration stays off and says so, instead of locking every browser out", () => {
  const messages = [];
  const logger = { error: (message) => messages.push(message) };
  assert.equal(createTurnstileHumanCheck({ secret: "only-a-secret", siteKey: "", logger }), null);
  assert.equal(createTurnstileHumanCheck({ secret: "", siteKey: SITE_KEY, logger }), null);
  assert.equal(messages.length, 2);
  assert.ok(messages.every((message) => !message.includes("only-a-secret")), "the secret is never logged");
});

test("with the check on, a capability is issued only for a token Siteverify accepts", async () => {
  const stub = siteverifyStub({ success: true, action: "capability", "error-codes": [] });
  const humanCheck = createTurnstileHumanCheck({ secret: "server-secret", siteKey: SITE_KEY, fetchImpl: stub.fetchImpl, logger: quietLogger });
  await withServer(quietStore(), async (origin) => {
    const response = await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId: "browser_identifier_human", humanCheckToken: "solved-token" });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(typeof body.capability, "string");
  }, { humanCheck });
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].url, TURNSTILE_SITEVERIFY_URL);
  assert.deepEqual(stub.calls[0].body, { secret: "server-secret", response: "solved-token" }, "no visitor address is sent to Siteverify");
});

test("with the check on, a request without a token is refused and told which widget to solve, without calling Siteverify", async () => {
  const stub = siteverifyStub({ success: true });
  const humanCheck = createTurnstileHumanCheck({ secret: "server-secret", siteKey: SITE_KEY, fetchImpl: stub.fetchImpl, logger: quietLogger });
  await withServer(quietStore(), async (origin) => {
    for (const extra of [{}, { humanCheckToken: "" }, { humanCheckToken: 7 }, { humanCheckToken: "x".repeat(2049) }]) {
      const response = await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId: "browser_identifier_notoken", ...extra });
      const body = await response.json();
      assert.equal(response.status, 403);
      assert.equal("capability" in body, false);
      assert.deepEqual(body.humanCheck, { provider: "turnstile", siteKey: SITE_KEY, action: "capability" });
      assert.ok(!JSON.stringify(body).includes("server-secret"));
    }
    const feedback = await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId: "one_off_request_notoken", purpose: "feedback" });
    assert.equal(feedback.status, 403, "feedback capabilities are checked too");
  }, { humanCheck });
  assert.equal(stub.calls.length, 0);
});

test("a rejected, replayed or wrong-action token is refused", async () => {
  for (const answer of [
    { success: false, "error-codes": ["invalid-input-response"] },
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, action: "login" },
    { success: "true" }
  ]) {
    const stub = siteverifyStub(answer);
    const humanCheck = createTurnstileHumanCheck({ secret: "server-secret", siteKey: SITE_KEY, fetchImpl: stub.fetchImpl, logger: quietLogger });
    await withServer(quietStore(), async (origin) => {
      const response = await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId: "browser_identifier_reject", humanCheckToken: "some-token" });
      assert.equal(response.status, 403, JSON.stringify(answer));
      assert.equal("capability" in (await response.json()), false);
    }, { humanCheck });
  }
});

test("the check fails closed when Siteverify is unreachable, slow, or reports its own fault", async () => {
  const cases = [
    async () => { throw new Error("network down"); },
    (init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
    async () => ({ success: false, "error-codes": ["internal-error"] }),
    async () => ({ success: false, "error-codes": ["invalid-input-secret"] })
  ];
  for (const answer of cases) {
    const stub = siteverifyStub(answer);
    const humanCheck = createTurnstileHumanCheck({ secret: "server-secret", siteKey: SITE_KEY, fetchImpl: stub.fetchImpl, timeoutMs: 40, logger: quietLogger });
    await withServer(quietStore(), async (origin) => {
      const response = await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId: "browser_identifier_closed", humanCheckToken: "some-token" });
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal("capability" in body, false);
      assert.ok(!JSON.stringify(body).includes("server-secret"));
    }, { humanCheck });
  }
});

test("a failed human check spends none of the address's capability allowance", async () => {
  let accept = false;
  const stub = siteverifyStub(() => (accept ? { success: true } : { success: false, "error-codes": ["invalid-input-response"] }));
  const humanCheck = createTurnstileHumanCheck({ secret: "server-secret", siteKey: SITE_KEY, fetchImpl: stub.fetchImpl, logger: quietLogger });
  await withServer(quietStore(), async (origin) => {
    const address = { "X-Forwarded-For": "203.0.113.70" };
    for (let index = 0; index < 6; index += 1) {
      assert.equal((await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId: `rotating_browser_hc_${index}`, humanCheckToken: "bad" }, address)).status, 403);
    }
    accept = true;
    assert.equal((await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId: "rotating_browser_hc_good", humanCheckToken: "good" }, address)).status, 201);
  }, { humanCheck });
});

// ── Feedback bounds behind the hourly per-address limit ─────────────────────

const validFeedback = () => ({ category: "bug", message: "The draft board froze on pick 12.", rating: 4, context: {} });
async function sendNote(origin, id, headers) {
  const lease = await (await jsonPost(`${origin}/community/v1/capability`, { schemaVersion: "1.0", participantId: id, purpose: "feedback" }, headers)).json();
  return (await jsonPost(`${origin}/community/v1/feedback`, { schemaVersion: "1.0", participantId: id, capability: lease.capability, feedback: validFeedback() }, headers)).status;
}

test("one address may send twelve feedback notes a day even when the hourly limit has reset", async () => {
  let saves = 0;
  const store = quietStore({ saveFeedback: async () => { saves += 1; return { accepted: 1 }; } });
  const generous = () => createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 });
  await withServer(store, async (origin) => {
    const address = { "X-Forwarded-For": "203.0.113.80" };
    const statuses = [];
    for (let index = 0; index < 13; index += 1) statuses.push(await sendNote(origin, `one_off_request_daily_${index}`, address));
    assert.deepEqual(statuses, [...Array(12).fill(202), 429]);
    assert.equal(saves, 12);
    assert.equal(await sendNote(origin, "one_off_request_daily_other", { "X-Forwarded-For": "203.0.113.81" }), 202, "another address has its own day");
  }, { feedbackRateLimit: generous(), feedbackCapabilityRateLimit: generous() });
});

test("many addresses together cannot push more than the service's hourly feedback bound", async () => {
  let saves = 0;
  const store = quietStore({ saveFeedback: async () => { saves += 1; return { accepted: 1 }; } });
  await withServer(store, async (origin) => {
    const statuses = [];
    for (let index = 0; index < 5; index += 1) statuses.push(await sendNote(origin, `one_off_request_flood_${index}`, { "X-Forwarded-For": `198.51.100.${index + 1}` }));
    assert.deepEqual(statuses, [202, 202, 202, 429, 429]);
    assert.equal(saves, 3);
  }, { feedbackServiceRateLimit: createMemoryRateLimiter({ limit: 3, windowMs: 60_000 }) });
});

// ── First steps ─────────────────────────────────────────────────────────────

function milestoneRows(type, browsers, dimensions = {}) {
  const now = new Date().toISOString();
  return Array.from({ length: browsers }, (unused, index) => ({ participant_hash: `browser-${index}`, type, occurred_at: now, received_at: now, dimensions, metrics: {} }));
}

test("first steps count browsers once each and hide any figure with fewer than five browsers in it", () => {
  const rows = [
    ...milestoneRows("setup_finished", 6),
    ...milestoneRows("setup_finished", 6),
    ...milestoneRows("first_advance", 5),
    ...milestoneRows("first_season_finished", 4),
    ...milestoneRows("return_visit", 5, { gap: "1-6" }),
    ...milestoneRows("return_visit", 2, { gap: "30-plus" }),
    ...milestoneRows("return_visit", 6, { gap: "not-a-gap" })
  ];
  const steps = aggregateCommunitySnapshot(rows).periods["30d"].firstSteps;
  assert.equal(steps.status, "live");
  const byId = Object.fromEntries([...steps.milestones, ...steps.returns].map((stat) => [stat.id, stat]));
  assert.equal(byId["setup-finished"].value, 6, "a repeated milestone from one browser counts once");
  assert.equal(byId["first-advance"].value, 5);
  assert.deepEqual([byId["first-season-finished"].value, byId["first-season-finished"].status], [null, "suppressed"]);
  assert.equal(byId["return-1-6"].value, 5);
  assert.deepEqual([byId["return-30-plus"].value, byId["return-30-plus"].status], [null, "suppressed"]);
  assert.deepEqual([byId["return-same-day"].value, byId["return-same-day"].status], [null, "suppressed"]);
  assert.ok(!JSON.stringify(steps).includes("browser-"), "no browser code is published");
});

test("first steps show no figure at all below the cohort threshold, and say warming when nobody shares", () => {
  const small = aggregateCommunitySnapshot(milestoneRows("setup_finished", 4)).periods["30d"].firstSteps;
  assert.equal(small.status, "suppressed");
  assert.ok([...small.milestones, ...small.returns].every((stat) => stat.value === null && stat.status === "suppressed"));
  const empty = aggregateCommunitySnapshot([]).periods["30d"].firstSteps;
  assert.equal(empty.status, "warming");
  assert.ok([...empty.milestones, ...empty.returns].every((stat) => stat.value === null && stat.status === "warming"));
});

test("the first-steps route returns only the per-period aggregate", async () => {
  const snapshot = aggregateCommunitySnapshot([...milestoneRows("setup_finished", 7), ...milestoneRows("first_advance", 3)]);
  await withServer(quietStore({ snapshot: async () => snapshot }), async (origin) => {
    const response = await fetch(`${origin}/community/v1/first-steps`, { headers: { Origin: ALLOWED_ORIGIN } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /public/);
    assert.deepEqual(Object.keys(body).sort(), ["computedAt", "denominator", "periods", "schemaVersion", "suppressionThreshold"]);
    assert.deepEqual(Object.keys(body.periods).sort(), ["24h", "30d", "7d"]);
    const stats = body.periods["30d"].milestones;
    assert.equal(stats.find((stat) => stat.id === "setup-finished").value, 7);
    assert.equal(stats.find((stat) => stat.id === "first-advance").value, null);
    assert.ok(!JSON.stringify(body).includes("browser-"));
  });
});

test("the First steps section says plainly when figures are missing or not yet shown", () => {
  assert.match(firstStepsMarkup(null), /not available right now/);
  assert.match(firstStepsMarkup(aggregateCommunitySnapshot([]).periods["30d"]), /Not enough players are sharing yet/);
  assert.match(firstStepsMarkup(aggregateCommunitySnapshot(milestoneRows("setup_finished", 4)).periods["30d"]), /Not enough players are sharing yet/);
  const live = firstStepsMarkup(aggregateCommunitySnapshot([...milestoneRows("setup_finished", 6), ...milestoneRows("first_advance", 2)]).periods["30d"]);
  assert.match(live, /Getting started/);
  assert.match(live, /Coming back/);
  assert.match(live, /Finished setting up a franchise/);
  assert.match(live, /Private for now/, "a count under the threshold is shown as private, not as a number");
});

// ── Edge policy and the browser side ────────────────────────────────────────

test("the edge policy admits the human-check origin by default, so the server can enable the check without a site rebuild", () => {
  const cspOf = (headers) => headers.match(/Content-Security-Policy: (.*)/)[1];
  const off = cspOf(buildEdgeHeaders({ inlineScriptHashes: [], humanCheck: false }));
  assert.ok(!off.includes(HUMAN_CHECK_ORIGIN));
  assert.ok(!/frame-src/.test(off));
  const on = cspOf(buildEdgeHeaders({ inlineScriptHashes: [], humanCheck: true }));
  assert.match(on, new RegExp(`script-src [^;]*${HUMAN_CHECK_ORIGIN}`));
  assert.match(on, new RegExp(`frame-src ${HUMAN_CHECK_ORIGIN}(;|$)`));
  assert.ok(!new RegExp(`connect-src [^;]*${HUMAN_CHECK_ORIGIN}`).test(on), "only the script and the frame are admitted");
  assert.equal(cspOf(buildEdgeHeaders({ inlineScriptHashes: [] })), process.env.EDGE_HUMAN_CHECK === "off" ? off : on,
    "the default admits the widget: the switch lives on the community server, not in this build");
});

test("the browser accepts only a well-formed Turnstile challenge from a refusal", () => {
  assert.deepEqual(humanCheckFrom({ humanCheck: { provider: "turnstile", siteKey: SITE_KEY, action: "capability" } }), { siteKey: SITE_KEY, action: "capability" });
  assert.equal(humanCheckFrom({ humanCheck: { provider: "other", siteKey: SITE_KEY } }), null);
  assert.equal(humanCheckFrom({ humanCheck: { provider: "turnstile", siteKey: "\"><script>" } }), null);
  assert.equal(humanCheckFrom({}), null);
  assert.equal(humanCheckFrom(null), null);
});

test("a feedback note solves the human check once when the service asks, and sends without one otherwise", async () => {
  const run = async (challengeFirst) => {
    const posts = [];
    let solved = 0;
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body);
      posts.push({ url, body });
      if (url.endsWith("/capability")) {
        if (challengeFirst && !body.humanCheckToken) return { ok: false, status: 403, json: async () => ({ ok: false, humanCheck: { provider: "turnstile", siteKey: SITE_KEY, action: "capability" } }) };
        return { ok: true, status: 201, json: async () => ({ capability: "lease-token" }) };
      }
      return { ok: true, status: 202, json: async () => ({ ok: true }) };
    };
    const result = await sendFeedback({ category: "bug", message: "The draft board froze on pick 12." }, {
      fetchImpl, endpoint: (path) => `https://service.test/${path}`, identifier: () => "one_off_request_client", build: async () => "abc123",
      solve: async (challenge) => { solved += 1; assert.equal(challenge.siteKey, SITE_KEY); return "solved-token"; }
    });
    return { result, posts, solved };
  };
  const plain = await run(false);
  assert.deepEqual(plain.result, { ok: true });
  assert.equal(plain.solved, 0);
  assert.equal(plain.posts.length, 2);
  assert.equal("humanCheckToken" in plain.posts[0].body, false);
  const challenged = await run(true);
  assert.deepEqual(challenged.result, { ok: true });
  assert.equal(challenged.solved, 1);
  assert.deepEqual(challenged.posts.map((post) => post.url.split("/").pop()), ["capability", "capability", "feedback"]);
  assert.equal(challenged.posts[1].body.humanCheckToken, "solved-token");
  assert.equal("humanCheckToken" in challenged.posts[2].body, false, "the token is not sent with the note itself");
});
