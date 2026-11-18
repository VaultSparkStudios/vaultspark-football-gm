import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildFeedbackDisclosureReceipt,
  buildFeedbackContextFingerprint,
  buildFeedbackIssueUrl,
  commitFeedbackNavigation,
  openFeedbackPlaceholder,
  selectPublishedPlaytestReceipt
} from "../public/lib/betaFeedback.js";

// ── Beta feedback URL builder (S14) ──────────────────────────────────────────

test("issue URL targets the public repo with the beta-feedback label", () => {
  const url = buildFeedbackIssueUrl({ year: 2031, week: 7, phase: "regular-season", tab: "overviewTab" });
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://github.com/VaultSparkStudios/vaultspark-football-gm/issues/new");
  assert.equal(parsed.searchParams.get("labels"), "beta-feedback");
});

test("game context is embedded in title and body", () => {
  const url = buildFeedbackIssueUrl({
    year: 2031, week: 7, phase: "regular-season", tab: "overviewTab", runtimeMode: "client"
  });
  const params = new URL(url).searchParams;
  assert.match(params.get("title"), /regular-season/);
  assert.match(params.get("body"), /Season: 2031 · Week 7/);
  assert.match(params.get("body"), /Runtime: client/);
});

test("local playtest receipts stay private unless explicitly supplied", () => {
  const without = new URL(buildFeedbackIssueUrl()).searchParams.get("body");
  assert.match(without, /not attached — local notes stay private/);
  assert.doesNotMatch(without, /Playtest\/Clarity/);

  const receipt = selectPublishedPlaytestReceipt({
    schemaVersion: "1.0",
    kind: "local-playtest-receipt",
    ratings: { clarity: 4, agency: 5, pace: 3, returnIntent: 4 },
    note: "  Great\nweek\u0000 — keep it going.  "
  });
  const withReceipt = new URL(buildFeedbackIssueUrl({ playtestReceipt: receipt })).searchParams.get("body");
  assert.match(withReceipt, /Playtest\/Clarity: 4\/5/);
  assert.match(withReceipt, /Playtest\/Note: Great week — keep it going\./);
  assert.match(withReceipt, /explicitly selected/);
});

test("published receipt selection rejects malformed or out-of-range local data", () => {
  assert.equal(selectPublishedPlaytestReceipt(null), null);
  assert.equal(selectPublishedPlaytestReceipt({ schemaVersion: "1.0", kind: "wrong" }), null);
  assert.equal(selectPublishedPlaytestReceipt({
    schemaVersion: "1.0",
    kind: "local-playtest-receipt",
    ratings: { clarity: 6, agency: 5, pace: 3, returnIntent: 4 }
  }), null);
});

test("launch readiness rows are embedded in the beta issue body", () => {
  const body = new URL(buildFeedbackIssueUrl({
    launchReadinessRows: [
      { area: "Runtime", status: "Ready", detail: "browser | regular-season | 0 server requests" },
      { area: "Public Domain", status: "Blocked", detail: "Cloudflare runbook pending" },
      { area: "Contact Email", status: "Unverified", detail: "Need a real received-message receipt" }
    ]
  })).searchParams.get("body");

  assert.match(body, /Readiness\/Runtime: Ready/);
  assert.match(body, /Readiness\/Public Domain: Blocked/);
  assert.match(body, /Readiness\/Contact Email: Unverified/);
  assert.doesNotMatch(body, /token|password/i);
});

test("franchise fingerprint rows are embedded without secret-like payloads", () => {
  const fingerprint = buildFeedbackContextFingerprint({
    dashboard: {
      controlledTeamId: "BUF",
      controlledTeam: { name: "Buffalo Voltage", abbrev: "BUF" },
      latestStandings: [{ team: "BUF", wins: 7, losses: 3 }],
      cap: { capSpace: -1_250_000 },
      rosterNeeds: [{ pos: "CB" }]
    },
    newsRows: [{ headline: "Starting quarterback questionable before rivalry week" }]
  });
  const body = new URL(buildFeedbackIssueUrl({ franchiseFingerprint: fingerprint })).searchParams.get("body");

  assert.match(body, /Franchise\/Team: Buffalo Voltage/);
  assert.match(body, /Franchise\/Record: 7-3/);
  assert.match(body, /Franchise\/Cap: over cap/);
  assert.match(body, /Franchise\/Top Need: CB/);
  assert.match(body, /quarterback questionable/);
  assert.doesNotMatch(body, /token|password|localStorage|snapshot|save payload/i);
});

test("public feedback disclosure is bounded, control-free, and receipt-visible", () => {
  const disclosure = buildFeedbackDisclosureReceipt({
    franchiseFingerprint: Array.from({ length: 11 }, (_, index) => ({
      label: `Signal ${index}\u0000`,
      value: "x".repeat(400)
    })),
    launchReadinessRows: Array.from({ length: 15 }, (_, index) => ({
      area: `Gate ${index}`,
      status: "Needs verification".repeat(5),
      detail: "source-derived detail ".repeat(30)
    }))
  });
  assert.equal(disclosure.kind, "feedback-disclosure-receipt");
  assert.equal(disclosure.fingerprintRows.length, 8);
  assert.equal(disclosure.readinessRows.length, 12);
  assert.deepEqual(disclosure.omitted, { fingerprintRows: 3, readinessRows: 3 });
  assert.equal(disclosure.fingerprintRows[0].value.length, 160);
  assert.doesNotMatch(disclosure.fingerprintRows[0].label, /\u0000/);

  const body = new URL(buildFeedbackIssueUrl({
    franchiseFingerprint: Array.from({ length: 11 }, (_, index) => ({ label: `Signal ${index}`, value: "ok" })),
    launchReadinessRows: Array.from({ length: 15 }, (_, index) => ({ area: `Gate ${index}`, status: "Hold", detail: "evidence" }))
  })).searchParams.get("body");
  assert.match(body, /Disclosure budget: 6 excess context rows were omitted/);
});

test("missing context degrades gracefully", () => {
  const url = buildFeedbackIssueUrl();
  assert.match(new URL(url).searchParams.get("body"), /Season: \? · Week \?/);
});

test("feedback placeholder opens synchronously and severs opener access", () => {
  const popup = { opener: { unsafe: true }, location: { replace() {} } };
  const calls = [];
  const result = openFeedbackPlaceholder({ open: (...args) => { calls.push(args); return popup; } });
  assert.equal(result, popup);
  assert.deepEqual(calls, [["about:blank", "_blank"]]);
  assert.equal(popup.opener, null);
});

test("feedback navigation uses the reserved popup or a reliable current-tab fallback", () => {
  let replaced = "";
  assert.equal(
    commitFeedbackNavigation({
      popup: { location: { replace: (url) => { replaced = url; } } },
      url: "https://example.test/feedback"
    }),
    "popup"
  );
  assert.equal(replaced, "https://example.test/feedback");

  let assigned = "";
  assert.equal(
    commitFeedbackNavigation({
      popup: null,
      url: "https://example.test/fallback",
      browser: { location: { assign: (url) => { assigned = url; } } }
    }),
    "current-tab"
  );
  assert.equal(assigned, "https://example.test/fallback");
});

// ── In-game feedback form: transport, wording and entry points ──────────────

const okJson = (body, status = 200) => new Response(JSON.stringify(body), { status });

function recordingFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = String(url).split("/").at(-1);
    calls.push({ path, init, body: init.body ? JSON.parse(init.body) : null });
    return routes[path](calls.at(-1));
  };
  return { calls, fetchImpl };
}

const transportOptions = (fetchImpl, extra = {}) => ({ fetchImpl, endpoint: (path) => `https://api.example.test/community/v1/${path}`, build: async () => "7becc57", ...extra });

test("sending feedback asks for a feedback-only capability with a throwaway identifier and posts only the fixed fields", async () => {
  const { sendFeedback, buildFeedbackContext } = await import("../public/lib/feedbackTransport.js");
  const { calls, fetchImpl } = recordingFetch({
    capability: () => okJson({ capability: "feedback-lease" }, 201),
    feedback: () => okJson({ ok: true }, 202)
  });
  const context = buildFeedbackContext({
    dashboard: { currentYear: 2031, currentWeek: 7, controlledTeam: { name: "Secret Franchise" }, players: [{ name: "Secret Player" }] },
    activeTab: "rosterTab", width: 390, theme: "dark"
  });
  assert.deepEqual(context, { build: null, screen: "rosterTab", season: 2031, week: 7, viewport: "phone", theme: "dark" });
  const first = await sendFeedback({ category: "bug", message: "  The roster table lost its header.  ", rating: 3, context }, transportOptions(fetchImpl));
  const second = await sendFeedback({ category: "idea", message: "Second note.", context }, transportOptions(fetchImpl));
  assert.deepEqual([first, second], [{ ok: true }, { ok: true }]);
  assert.deepEqual(calls.map((call) => call.path), ["capability", "feedback", "capability", "feedback"]);
  assert.equal(calls[0].body.purpose, "feedback");
  assert.match(calls[0].body.participantId, /^[a-zA-Z0-9_-]{16,96}$/);
  assert.equal(calls[1].body.participantId, calls[0].body.participantId);
  assert.notEqual(calls[2].body.participantId, calls[0].body.participantId, "each note gets a fresh identifier, so notes cannot be linked");
  assert.deepEqual(calls[1].body, {
    schemaVersion: "1.0",
    participantId: calls[0].body.participantId,
    capability: "feedback-lease",
    feedback: { category: "bug", message: "The roster table lost its header.", rating: 3, context: { build: "7becc57", screen: "rosterTab", season: 2031, week: 7, viewport: "phone", theme: "dark" } }
  });
  assert.doesNotMatch(JSON.stringify(calls), /Secret/);
  for (const call of calls) assert.equal(call.init.credentials, "omit");
});

test("an older service without the feedback route, a refusal, or a network failure is reported as could-not-send", async () => {
  const { sendFeedback } = await import("../public/lib/feedbackTransport.js");
  const note = { category: "bug", message: "Could not send test." };
  const missingRoute = recordingFetch({ capability: () => okJson({ capability: "lease" }, 201), feedback: () => okJson({ ok: false, error: "Community Stats route not found." }, 404) });
  assert.deepEqual(await sendFeedback(note, transportOptions(missingRoute.fetchImpl)), { ok: false, reason: "http-404" });
  const limited = recordingFetch({ capability: () => okJson({ ok: false }, 429) });
  assert.deepEqual(await sendFeedback(note, transportOptions(limited.fetchImpl)), { ok: false, reason: "http-429" });
  assert.deepEqual(limited.calls.map((call) => call.path), ["capability"], "no note is posted without a capability");
  const badLease = recordingFetch({ capability: () => okJson({ capability: 42 }, 201) });
  assert.deepEqual(await sendFeedback(note, transportOptions(badLease.fetchImpl)), { ok: false, reason: "unavailable" });
  const down = async () => { throw new TypeError("Failed to fetch"); };
  assert.deepEqual(await sendFeedback(note, transportOptions(down)), { ok: false, reason: "unavailable" });
  assert.deepEqual(await sendFeedback(note, transportOptions(down, { build: async () => { throw new Error("no health file"); } })), { ok: false, reason: "unavailable" });
  const untouched = recordingFetch({});
  assert.deepEqual(await sendFeedback({ category: "bug", message: "   " }, transportOptions(untouched.fetchImpl)), { ok: false, reason: "invalid" });
  assert.deepEqual(await sendFeedback({ category: "other", message: "hello" }, transportOptions(untouched.fetchImpl)), { ok: false, reason: "invalid" });
  assert.equal(untouched.calls.length, 0, "an empty or unknown-category note makes no request at all");
});

test("feedback never reads or writes browser storage and never uses the Community Stats identifier", async () => {
  const source = readFileSync(new URL("../public/lib/feedbackTransport.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|COMMUNITY_PARTICIPANT_KEY|getCommunityParticipation|ensureCapability/);
});

test("the form states exactly what is sent and turns a prompt's ratings into editable text", async () => {
  const { FEEDBACK_SENT_LINE, FEEDBACK_DISCUSS_URL, describePromptNote, feedbackFailureMessage } = await import("../public/lib/feedbackModal.js");
  assert.match(FEEDBACK_SENT_LINE, /your message.*and: screen, season and week, app version, screen size and theme/);
  assert.doesNotMatch(FEEDBACK_SENT_LINE, /receipt|cohort|shard|canon/i);
  assert.match(FEEDBACK_DISCUSS_URL, /^https:\/\/github\.com\/.+\/discussions\//);
  assert.equal(
    describePromptNote({ note: "  The board made the tradeoff clear. ", ratings: { clarity: "4", agency: 5, pace: 3, returnIntent: 9 }, moment: "season-complete" }),
    "The board made the tradeoff clear.\n\nMy ratings: Clarity 4/5, Agency 5/5, Pace 3/5.\n\nAbout: season complete."
  );
  assert.equal(describePromptNote({}), "");
  assert.match(feedbackFailureMessage("http-404"), /Could not send your note\. Your text is still here\./);
  assert.match(feedbackFailureMessage("offline"), /offline.*still here/);
  assert.match(feedbackFailureMessage("http-429"), /still here/);
});

test("the Feedback button and Tell the Commissioner open the in-game form, not a GitHub page", async () => {
  const game = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");
  const widget = game.slice(game.indexOf('id="feedbackWidget"'), game.indexOf("</div>", game.indexOf('id="feedbackWidget"')));
  assert.match(widget, /<a href="\.\/contact\.html" aria-label="Send feedback">/);
  assert.doesNotMatch(widget, /github\.com/);
  const source = readFileSync(new URL("../public/lib/betaFeedback.js", import.meta.url), "utf8");
  assert.match(source, /import\("\.\/feedbackModal\.js"\)/);
  assert.match(source, /#feedbackWidget a/);
  const opener = source.slice(source.indexOf("export async function openFeedback"), source.indexOf("export function shouldLoadCommunityOffer"));
  assert.doesNotMatch(opener, /openFeedbackPlaceholder|commitFeedbackNavigation|buildFeedbackIssueUrl|window\.open/);

  const { openFeedback } = await import("../public/lib/betaFeedback.js");
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
  const opened = [];
  try {
    Object.defineProperty(globalThis, "document", { configurable: true, value: { getElementById: () => null } });
    await openFeedback({ loadModal: async () => ({ openFeedbackModal: (options) => { opened.push(options); return "dialog"; }, describePromptNote: () => "unused" }) });
  } finally {
    if (saved) Object.defineProperty(globalThis, "document", saved); else delete globalThis.document;
  }
  assert.deepEqual(opened, [{}], "without a selected playtest note the form opens empty");
});

test("the in-game Community Stats offer waits for a finished season and is made at most once", async () => {
  const { shouldLoadCommunityOffer } = await import("../public/lib/betaFeedback.js");
  const { COMMUNITY_OFFER_KEY, shouldOfferCommunityChoice, maybeOfferCommunityChoice } = await import("../public/lib/communityConsentPrompt.js");
  const { COMMUNITY_CONSENT_KEY, COMMUNITY_SHARING_SUMMARY } = await import("../public/lib/communityTelemetry.js");
  const storageWith = (entries = {}) => {
    const values = new Map(Object.entries(entries));
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), values };
  };
  const finished = { seasonsSimulated: 1 };
  for (const decide of [shouldLoadCommunityOffer, (dashboard, storage) => shouldOfferCommunityChoice({ dashboard, storage })]) {
    assert.equal(decide({ seasonsSimulated: 0 }, storageWith()), false, "never before the first finished season");
    assert.equal(decide({}, storageWith()), false);
    assert.equal(decide(finished, storageWith()), true);
    assert.equal(decide(finished, storageWith({ [COMMUNITY_OFFER_KEY]: "offered" })), false, "an earlier offer is remembered");
    assert.equal(decide(finished, storageWith({ [COMMUNITY_CONSENT_KEY]: "participating" })), false, "already sharing");
    assert.equal(decide(finished, storageWith({ [COMMUNITY_CONSENT_KEY]: "declined" })), false, "already said no on the website");
    assert.equal(decide(finished, null), false, "no storage means the answer could not be remembered, so do not ask");
    assert.equal(decide(finished, { getItem() { throw new Error("blocked"); } }), false);
  }
  assert.equal(shouldOfferCommunityChoice({ dashboard: finished, storage: storageWith(), modalOpen: true }), false, "not while the season review or any dialog is open");

  // The card is recorded as offered the moment it is shown, so it cannot come back.
  const storage = storageWith();
  const card = { attributes: {}, listeners: {}, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(type, listener) { this.listeners[type] = listener; }, remove() { this.removed = true; } };
  const prepended = [];
  const overview = { classList: { contains: (name) => name === "active" }, prepend: (node) => prepended.push(node) };
  const documentRef = { getElementById: (id) => (id === "overviewTab" ? overview : null), createElement: () => card };
  let asked = 0;
  assert.equal(maybeOfferCommunityChoice({ dashboard: finished, storage, documentRef, setParticipation: async () => { asked += 1; return { participating: true }; } }), true);
  assert.equal(storage.values.get(COMMUNITY_OFFER_KEY), "offered");
  assert.equal(prepended.length, 1);
  assert.ok(card.innerHTML.includes(COMMUNITY_SHARING_SUMMARY));
  assert.match(COMMUNITY_SHARING_SUMMARY, /error reports/);
  assert.equal(asked, 0, "showing the offer changes nothing; only pressing Share does");
  assert.equal(storage.values.has(COMMUNITY_CONSENT_KEY), false);
  assert.equal(maybeOfferCommunityChoice({ dashboard: finished, storage, documentRef }), false, "never offered twice");
  card.listeners.click({ target: { closest: () => ({ dataset: { communityOffer: "dismiss" } }) } });
  assert.equal(card.removed, true);
  assert.equal(asked, 0);
  const hidden = { ...documentRef, getElementById: (id) => (id === "overviewTab" ? { classList: { contains: () => false } } : null) };
  assert.equal(maybeOfferCommunityChoice({ dashboard: finished, storage: storageWith(), documentRef: hidden }), false, "only where the player can see it");
});
