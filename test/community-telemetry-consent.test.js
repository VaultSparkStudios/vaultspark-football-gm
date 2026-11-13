import test from "node:test";
import assert from "node:assert/strict";

const CONSENT = "fa:community-participation:v1";
const PARTICIPANT = "fa:community-participant:v1";
const QUEUE = "fa:community-queue:v1";
const DELETION = "fa:community-pending-deletion:v1";
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 4; i += 1) await new Promise(setImmediate); };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const lease = (name = "fixture-lease") => json({ capability: name, expiresAt: new Date(Date.now() + 60_000).toISOString(), remainingUses: 10 }, 201);
let sequence = 0;

async function harness(run, { entries = [], storageMissing = false } = {}) {
  const keys = ["window", "document", "navigator", "CustomEvent", "fetch", "setTimeout", "clearTimeout"];
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const h = { values: new Map(entries), calls: [], events: [], timers: new Map(), listeners: new Map(), refuse: () => false };
  h.localStorage = {
    getItem(key) { if (h.refuse("get", key)) throw Error("fixture storage read refused"); return h.values.get(key) ?? null; },
    setItem(key, value) { if (h.refuse("set", key, value)) throw Error("fixture storage write refused"); h.values.set(key, String(value)); },
    removeItem(key) { if (h.refuse("remove", key)) throw Error("fixture storage removal refused"); h.values.delete(key); }
  };
  h.fetch = async (url) => String(url).endsWith("/capability") ? lease() : json({ ok: true, deleted: 1 });
  h.deadline = async () => {
    await settle();
    const timers = [...h.timers].filter(([, timer]) => timer.delay === 10_000);
    assert.ok(timers.length, "a request has a finite active deadline");
    for (const [id, timer] of timers) { h.timers.delete(id); timer.callback(); }
    await settle();
  };
  const bindings = {
    window: { localStorage: storageMissing ? null : h.localStorage, dispatchEvent: (event) => h.events.push(event), addEventListener: (type, listener) => h.listeners.set(type, listener) },
    document: { querySelector: () => null }, navigator: { onLine: true },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async (url, init = {}) => {
      const call = { path: new URL(url).pathname.split("/").at(-1), init, body: init.body ? JSON.parse(init.body) : null };
      h.calls.push(call); return h.fetch(url, init, call);
    },
    setTimeout(callback, delay) { const id = {}; h.timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => h.timers.delete(id)
  };
  try {
    for (const [key, value] of Object.entries(bindings)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    h.module = await import(`../public/lib/communityTelemetry.js?consent-test=${++sequence}`);
    await run(h);
  } finally {
    await settle();
    for (const [key, original] of originals) { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; }
  }
}

const participating = (id = "browser-old") => [[CONSENT, "participating"], [PARTICIPANT, id], [QUEUE, JSON.stringify([{ eventId: "old-event" }])]];
function newLeagueReceipt(h) {
  return h.module.observeCommunityApiReceipt({ method: "POST", path: "/api/new-league", body: { controlledTeamId: "BUF" }, response: { ok: true, state: { controlledTeamId: "BUF", settings: {} } }, runtime: "client" });
}

test("decline remains off when consent write and removal both fail", async () => {
  await harness(async (h) => {
    h.refuse = (op, key, value) => key === CONSENT && (op === "remove" || (op === "set" && value === "declined"));
    const result = await h.module.setCommunityParticipation(false);
    assert.equal(result.participating, false);
    assert.equal(h.values.get(CONSENT), "participating", "fixture preserves the stale stored value");
    assert.equal(h.module.getCommunityParticipation(), false);
    newLeagueReceipt(h);
    assert.deepEqual(await h.module.flushCommunityQueue(), { sent: 0 });
    assert.equal(h.calls.some((call) => call.path === "events"), false);
    assert.equal(h.events.find((event) => event.type === "fa:community-participation").detail.participating, false);
  }, { entries: participating() });
});

test("failed or unavailable opt-in persistence never claims participation or starts requests", async () => {
  for (const storageMissing of [false, true]) await harness(async (h) => {
    h.refuse = (op, key) => op === "set" && key === CONSENT;
    assert.equal((await h.module.setCommunityParticipation(true)).participating, false);
    assert.equal(h.module.getCommunityParticipation(), false);
    assert.equal(h.calls.length, 0);
  }, { storageMissing });
});

test("decline during capability admission refuses the old event POST but permits deletion", async () => {
  await harness(async (h) => {
    const capability = deferred();
    h.fetch = async (url) => String(url).endsWith("/capability") ? capability.promise : json({ deleted: 2 });
    const flush = h.module.flushCommunityQueue(); await settle();
    const decline = h.module.setCommunityParticipation(false);
    assert.equal(h.module.getCommunityParticipation(), false);
    capability.resolve(lease());
    assert.deepEqual(await flush, { sent: 0 });
    assert.equal((await decline).deletion.status, "success");
    assert.equal(h.calls.filter((call) => call.path === "capability").length, 1);
    assert.equal(h.calls.some((call) => call.path === "events"), false);
    assert.equal(h.calls.find((call) => call.path === "participation").init.method, "DELETE");
  }, { entries: participating() });
});

test("old capability completion cannot replace or clear cross-document renewed participation", async () => {
  await harness(async (h) => {
    const oldCapability = deferred(), newCapability = deferred();
    h.fetch = async (_url, _init, call) => call.path === "capability"
      ? (call.body.participantId === "browser-old" ? oldCapability.promise : newCapability.promise)
      : json({ deleted: 1 });
    h.module.initCommunityTelemetry();
    const oldFlush = h.module.flushCommunityQueue(); await settle();
    h.values.set(CONSENT, "declined"); h.listeners.get("storage")({ key: CONSENT });
    // Another document acknowledged its old deletion, then explicitly opted in.
    const newId = "browser-new";
    h.values.set(PARTICIPANT, newId); h.listeners.get("storage")({ key: PARTICIPANT });
    h.values.set(CONSENT, "participating"); h.listeners.get("storage")({ key: CONSENT });
    const freshEvents = newLeagueReceipt(h);
    oldCapability.resolve(lease("old-lease")); await settle();
    newCapability.resolve(lease("new-lease"));
    await oldFlush; await settle();
    await h.module.flushCommunityQueue();
    const sends = h.calls.filter((call) => call.path === "events");
    assert.equal(sends.length, 1);
    assert.equal(sends[0].body.participantId, newId);
    assert.equal(sends[0].body.capability, "new-lease");
    assert.deepEqual(sends[0].body.events, freshEvents);
    assert.equal(h.calls.filter((call) => call.path === "capability").length, 2);
    assert.equal(h.module.getCommunityParticipation(), true);
  }, { entries: participating() });
});

test("pending deletion blocks opt-in without reusing its identifier", async () => {
  await harness(async (h) => {
    h.refuse = (op, key) => op === "set" && key === PARTICIPANT;
    assert.equal((await h.module.setCommunityParticipation(true)).participating, false);
    assert.equal(h.module.getCommunityParticipation(), false);
    assert.equal(h.values.get(CONSENT), "declined");
    assert.equal(h.values.get(PARTICIPANT), "browser-old");
    assert.equal(h.module.getPendingCommunityDeletion(), "browser-old");
    assert.equal(h.calls.length, 0);
  }, { entries: [[CONSENT, "declined"], [PARTICIPANT, "browser-old"], [DELETION, "browser-old"]] });
});

test("decline aborts an admitted event request and stale acknowledgement cannot erase fresh queue", async () => {
  await harness(async (h) => {
    const eventResponse = deferred();
    h.fetch = async (_url, _init, call) => call.path === "capability" ? lease() : call.path === "events" ? eventResponse.promise : json({ deleted: 1 });
    const flush = h.module.flushCommunityQueue(); await settle();
    const sent = h.calls.find((call) => call.path === "events"); assert.ok(sent);
    await h.module.setCommunityParticipation(false);
    assert.equal(sent.init.signal.aborted, true);
    await h.module.setCommunityParticipation(true);
    const fresh = newLeagueReceipt(h); await settle();
    eventResponse.resolve(json({ accepted: 1 }));
    assert.deepEqual(await flush, { sent: 0 });
    await settle(); await h.module.flushCommunityQueue();
    assert.equal(h.calls.filter((call) => call.path === "events").at(-1).body.events[0].eventId, fresh[0].eventId);
    assert.deepEqual(JSON.parse(h.values.get(QUEUE)), []);
  }, { entries: participating() });
});

test("decline and renewed opt-in never resurrect a queue whose removal failed", async () => {
  await harness(async (h) => {
    h.refuse = (op, key) => op === "remove" && key === QUEUE;
    await h.module.setCommunityParticipation(false);
    await h.module.setCommunityParticipation(true); await settle();
    assert.equal(h.calls.some((call) => call.path === "events"), false);
    const fresh = newLeagueReceipt(h); await settle(); await h.module.flushCommunityQueue();
    const sends = h.calls.filter((call) => call.path === "events");
    assert.equal(sends.length, 1);
    assert.deepEqual(sends[0].body.events, fresh);
  }, { entries: participating() });
});

test("a hung capability request is bounded and later deletion retry can acquire a new lease", async () => {
  await harness(async (h) => {
    let hang = true;
    h.fetch = async (url) => String(url).endsWith("/capability") ? (hang ? new Promise(() => {}) : lease()) : json({ deleted: 3 });
    const stopped = h.module.setCommunityParticipation(false); await h.deadline();
    assert.equal((await stopped).deletion.status, "failed");
    assert.equal(h.module.getPendingCommunityDeletion(), "browser-old");
    hang = false;
    assert.deepEqual(await h.module.retryPendingCommunityDeletion(), { status: "success", deleted: 3 });
    assert.equal(h.module.getPendingCommunityDeletion(), "");
    assert.equal(h.calls.filter((call) => call.path === "capability").length, 2);
  }, { entries: participating() });
});

test("hung deletion headers and body release single-flight state without losing its tombstone", async () => {
  for (const hungBody of [false, true]) await harness(async (h) => {
    let hang = true;
    h.fetch = async (_url, _init, call) => {
      if (call.path === "capability") return lease();
      if (hang) return hungBody ? { ok: true, status: 200, json: () => new Promise(() => {}) } : new Promise(() => {});
      return json({ deleted: 4 });
    };
    const stopped = h.module.setCommunityParticipation(false); await h.deadline();
    assert.equal((await stopped).deletion.status, "failed");
    assert.equal(h.module.getPendingCommunityDeletion(), "browser-old");
    hang = false;
    assert.deepEqual(await h.module.retryPendingCommunityDeletion(), { status: "success", deleted: 4 });
    assert.equal(h.module.getPendingCommunityDeletion(), "");
  }, { entries: participating() });
});

test("hung event headers and body are bounded, retain the queue, and permit a fresh flush", async () => {
  for (const hungBody of [false, true]) await harness(async (h) => {
    let hang = true;
    h.fetch = async (_url, _init, call) => call.path === "capability" ? lease()
      : hang ? (hungBody ? { ok: true, status: 200, json: () => new Promise(() => {}) } : new Promise(() => {})) : json({ accepted: 1 });
    const first = h.module.flushCommunityQueue(); await h.deadline();
    assert.deepEqual(await first, { sent: 0 });
    assert.equal(JSON.parse(h.values.get(QUEUE)).length, 1);
    hang = false;
    assert.deepEqual(await h.module.flushCommunityQueue(), { sent: 1 });
    assert.deepEqual(JSON.parse(h.values.get(QUEUE)), []);
  }, { entries: participating() });
});

test("malformed capability responses cannot admit event sends and a later response recovers", async () => {
  await harness(async (h) => {
    let invalid = true;
    h.fetch = async (_url, _init, call) => call.path === "capability" ? (invalid ? json({ capability: {}, expiresAt: "invalid" }) : lease()) : json({ accepted: 1 });
    assert.deepEqual(await h.module.flushCommunityQueue(), { sent: 0 });
    assert.equal(h.calls.some((call) => call.path === "events"), false);
    invalid = false;
    assert.deepEqual(await h.module.flushCommunityQueue(), { sent: 1 });
  }, { entries: participating() });
});

test("an old deletion acknowledgement cannot erase a newer identifier tombstone", async () => {
  await harness(async (h) => {
    const oldDelete = deferred();
    h.fetch = async (_url, _init, call) => call.path === "capability" ? lease()
      : call.body.participantId === "browser-old" ? oldDelete.promise : json({ deleted: 2 });
    const first = h.module.setCommunityParticipation(false); await settle();
    h.module.initCommunityTelemetry();
    // Simulate a newer deletion obligation arriving from another document.
    const newId = "other-document-identifier";
    h.values.set(DELETION, newId); h.listeners.get("storage")({ key: DELETION });
    assert.equal(h.module.getPendingCommunityDeletion(), newId);
    oldDelete.resolve(json({ deleted: 1 })); await first;
    assert.equal(h.module.getPendingCommunityDeletion(), newId);
    assert.deepEqual(await h.module.retryPendingCommunityDeletion(), { status: "success", deleted: 2 });
    assert.equal(h.module.getPendingCommunityDeletion(), "");
    assert.deepEqual(h.calls.filter((call) => call.path === "participation").map((call) => call.body.participantId), ["browser-old", newId]);
  }, { entries: participating() });
});

test("ordinary sharing refreshes one rejected lease, acknowledges the queue and stores no capabilities", async () => {
  await harness(async (h) => {
    let eventAttempts = 0, capabilities = 0;
    h.fetch = async (_url, _init, call) => call.path === "capability" ? lease(`fixture-lease-${++capabilities}`)
      : call.path === "events" ? json({ accepted: 1 }, ++eventAttempts === 1 ? 401 : 200) : json({ deleted: 1 });
    assert.deepEqual(await h.module.flushCommunityQueue(), { sent: 1 });
    assert.equal(capabilities, 2);
    assert.equal(eventAttempts, 2);
    assert.doesNotMatch(JSON.stringify([...h.values]), /fixture-lease/);
    assert.deepEqual((await h.module.setCommunityParticipation(false)).deletion, { status: "success", deleted: 1 });
    assert.equal(h.module.getCommunityParticipation(), false);
    assert.equal(h.module.getPendingCommunityDeletion(), "");
  }, { entries: participating() });
});

test("a failed local queue acknowledgement does not create an unbounded resend loop", async () => {
  await harness(async (h) => {
    h.refuse = (op, key) => op === "set" && key === QUEUE;
    assert.deepEqual(await h.module.flushCommunityQueue(), { sent: 1 });
    assert.equal(h.calls.filter((call) => call.path === "events").length, 1);
    assert.equal(JSON.parse(h.values.get(QUEUE)).length, 1);
    h.refuse = () => false;
    assert.deepEqual(await h.module.flushCommunityQueue(), { sent: 1 });
    assert.deepEqual(JSON.parse(h.values.get(QUEUE)), []);
  }, { entries: participating() });
});

test("a confirmed deletion stays acknowledged when removing its persisted tombstone fails", async () => {
  await harness(async (h) => {
    h.refuse = (op, key) => op === "remove" && key === DELETION;
    assert.equal((await h.module.setCommunityParticipation(false)).deletion.status, "success");
    assert.equal(h.values.get(DELETION), "browser-old", "the fixture preserves stale disk state");
    assert.equal(h.module.getPendingCommunityDeletion(), "");
    assert.deepEqual(await h.module.retryPendingCommunityDeletion(), { status: "not-needed", deleted: 0 });
    assert.equal(h.calls.filter((call) => call.path === "participation").length, 1);
  }, { entries: participating() });
});

test("cross-document consent changes invalidate admission and newer tombstones remain visible", async () => {
  await harness(async (h) => {
    const capability = deferred();
    h.fetch = async () => capability.promise;
    h.module.initCommunityTelemetry(); await settle();
    const flush = h.module.flushCommunityQueue();
    h.values.set(CONSENT, "declined"); h.listeners.get("storage")({ key: CONSENT });
    h.values.set(CONSENT, "participating");
    capability.resolve(lease());
    assert.deepEqual(await flush, { sent: 0 });
    assert.equal(h.calls.some((call) => call.path === "events"), false);
    h.values.set(DELETION, "other-document-identifier");
    h.listeners.get("storage")({ key: DELETION });
    assert.equal(h.module.getPendingCommunityDeletion(), "other-document-identifier");
  }, { entries: participating() });
});

test("a fresh flush after cross-document renewal cannot send a retained pre-decline queue", async () => {
  await harness(async (h) => {
    h.module.initCommunityTelemetry();
    h.values.set(CONSENT, "participating");
    h.refuse = (op, key) => op === "remove" && key === QUEUE;
    h.values.set(CONSENT, "declined");
    assert.throws(() => h.localStorage.removeItem(QUEUE), /fixture storage removal refused/);
    h.listeners.get("storage")({ key: CONSENT });
    h.values.set(PARTICIPANT, "browser-renewed");
    h.listeners.get("storage")({ key: PARTICIPANT });
    h.values.set(CONSENT, "participating");
    h.listeners.get("storage")({ key: CONSENT });
    assert.equal(JSON.parse(h.values.get(QUEUE))[0].eventId, "old-event");
    assert.deepEqual(await h.module.flushCommunityQueue(), { sent: 0 });
    assert.equal(h.calls.some((call) => call.path === "events"), false);
    const fresh = newLeagueReceipt(h); await settle(); await h.module.flushCommunityQueue();
    const sends = h.calls.filter((call) => call.path === "events");
    assert.equal(sends.length, 1);
    assert.equal(sends[0].body.participantId, "browser-renewed");
    assert.deepEqual(sends[0].body.events, fresh);
  }, { entries: [[CONSENT, "declined"], [PARTICIPANT, "browser-old"], [QUEUE, JSON.stringify([{ eventId: "old-event" }])]] });
});

test("failed or offline deletion gates renewal until acknowledgement, preserving each subsequent obligation", async () => {
  for (const firstFailure of ["offline", "failed"]) await harness(async (h) => {
    let acknowledge = false;
    const acknowledged = [];
    h.fetch = async (_url, _init, call) => {
      if (call.path === "capability") return lease();
      assert.equal(call.path, "participation", "off/blocked consent never sends events");
      if (!acknowledge) return json({ ok: false }, 503);
      acknowledged.push(call.body.participantId);
      return json({ deleted: 1 });
    };
    navigator.onLine = firstFailure !== "offline";
    const stoppedA = await h.module.setCommunityParticipation(false);
    assert.equal(stoppedA.deletion.status, firstFailure === "offline" ? "pending" : "failed");
    assert.equal(h.module.getPendingCommunityDeletion(), "browser-old");
    const blocked = await h.module.setCommunityParticipation(true);
    assert.deepEqual(blocked, { participating: false, deletion: { status: "pending", deleted: null, reason: "deletion-pending" } });
    assert.equal(h.module.getCommunityParticipation(), false);
    assert.equal(h.values.has(PARTICIPANT), false, "renewal cannot create identifier B before A is acknowledged");
    navigator.onLine = false;
    await h.module.setCommunityParticipation(false);
    assert.equal(h.module.getPendingCommunityDeletion(), "browser-old", "a repeated decline cannot overwrite A");
    assert.equal(h.values.get(DELETION), "browser-old", "retention remains one purpose-bound identifier string");
    acknowledge = true; navigator.onLine = true;
    assert.equal((await h.module.retryPendingCommunityDeletion()).status, "success");
    assert.deepEqual(acknowledged, ["browser-old"]);
    assert.equal(h.module.getPendingCommunityDeletion(), "");
    assert.equal((await h.module.setCommunityParticipation(true)).participating, true);
    const idB = h.values.get(PARTICIPANT); assert.ok(idB); assert.notEqual(idB, "browser-old");
    await settle(); navigator.onLine = false;
    assert.equal((await h.module.setCommunityParticipation(false)).deletion.status, "pending");
    assert.equal(h.module.getPendingCommunityDeletion(), idB);
    assert.equal((await h.module.setCommunityParticipation(true)).participating, false);
    assert.equal(h.module.getPendingCommunityDeletion(), idB);
    navigator.onLine = true;
    assert.equal((await h.module.retryPendingCommunityDeletion()).status, "success");
    assert.deepEqual(acknowledged, ["browser-old", idB]);
    assert.equal(h.module.getPendingCommunityDeletion(), "");
    assert.equal(h.values.has(DELETION), false);
  }, { entries: participating() });
});
