import test from "node:test";
import assert from "node:assert/strict";
import {
  contractStorageKey, dismissContract, finalizeFirstSeasonContract, markObjective,
  readContractState, renderContractCloseout, renderFirstSeasonContract, writeContractState
} from "../public/lib/firstSeasonContract.js";

function storage() {
  const values = new Map();
  return { values, denyRead: false, denyWrite: false,
    getItem(key) { if (this.denyRead) throw Error("Denied"); return values.get(key) ?? null; },
    setItem(key, value) { if (this.denyWrite) throw Error("Quota"); values.set(key, value); } };
}

function dashboard(franchiseId = "s127-contract") {
  return { franchiseId, controlledTeamId: "BUF", currentYear: 2026, startYear: 2026,
    currentWeek: 2, seasonsSimulated: 0, phase: "regular-season",
    controlledTeam: { id: "BUF", owner: { expectation: { targetWins: 9 } } },
    latestStandings: [{ teamId: "BUF", wins: 2, losses: 0 }], cap: { capSpace: 1_000_000 } };
}

function documentFixture() {
  const nodes = { firstSeasonContract: { dataset: {}, hidden: false },
    firstSeasonContractList: { innerHTML: "" }, firstSeasonContractProgress: { textContent: "" } };
  return { nodes, getElementById: (id) => nodes[id] };
}

function seed(store, d, value) { store.values.set(contractStorageKey(d), JSON.stringify(value)); }
const actionMarks = { "sign-starter": true, "depth-chart": true, "answer-the-phone": true };

function closedContract() {
  const store = storage(), d = { ...dashboard(), phase: "season-awards", currentWeek: 18,
    latestStandings: [{ teamId: "BUF", wins: 9, losses: 8 }] };
  for (const id of Object.keys(actionMarks)) markObjective(d, id, store);
  return { store, d, closeout: finalizeFirstSeasonContract(d, store) };
}

for (const payload of [null, [], "corrupt", true, 7,
  { finalized: { year: 2026, done: 0, total: 5 } },
  { marks: "done", dismissed: "false", completedAt: {}, startYear: [] },
  { finalized: { rows: [null] } }]) {
  test(`damaged optional contract renders without completion: ${JSON.stringify(payload)}`, () => {
    const store = storage(), d = dashboard(), documentRef = documentFixture();
    seed(store, d, payload);
    const result = renderFirstSeasonContract({ dashboard: d, storage: store, documentRef });
    assert.equal(result.completedNow, false);
    assert.equal(result.visibility, "open");
    assert.equal(result.summary.done, 0);
    assert.match(documentRef.nodes.firstSeasonContractProgress.textContent, /0 of 5/);
    assert.equal(readContractState(d, store).finalized, null);
  });
}

test("only known boolean action marks and strict dismissal survive hydration", () => {
  const store = storage(), d = dashboard();
  seed(store, d, { marks: { "sign-starter": "true", "depth-chart": true,
    "answer-the-phone": 1, "owner-floor": true, invented: true },
    dismissed: "true", completedAt: "2026-10-29T01:00:00.000Z", startYear: "2026" });
  assert.deepEqual(readContractState(d, store), { marks: { "depth-chart": true },
    dismissed: false, completedAt: null, startYear: null, finalized: null });
  dismissContract(d, store);
  assert.equal(readContractState(d, store).dismissed, true);
});

test("unparseable storage retains already observed tab evidence without breaking rendering", () => {
  const store = storage(), d = dashboard(), documentRef = documentFixture();
  markObjective(d, "depth-chart", store);
  store.values.set(contractStorageKey(d), "{not-json");
  assert.deepEqual(readContractState(d, store).marks, { "depth-chart": true });
  const result = renderFirstSeasonContract({ dashboard: d, storage: store, documentRef });
  assert.equal(result.summary.done, 1);
  assert.equal(result.completedNow, false);
});

test("a timestamp alone and malformed dates cannot hide uncompleted objectives", () => {
  for (const completedAt of [true, {}, 2026, "done", "2026-02-30", "2026-10-29T01:00:00.000Z"]) {
    const store = storage(), d = dashboard(), documentRef = documentFixture();
    seed(store, d, { marks: {}, completedAt });
    assert.equal(readContractState(d, store).completedAt, null);
    assert.equal(renderFirstSeasonContract({ dashboard: d, storage: store, documentRef }).visibility, "open");
  }
  for (const completedAt of ["2026-02-30", "not-a-date", true]) {
    const store = storage(), d = dashboard();
    seed(store, d, { marks: actionMarks, completedAt });
    assert.equal(readContractState(d, store).completedAt, null);
  }
});

test("legitimate legacy completion dates retain their strict action evidence", () => {
  for (const completedAt of ["2026-10-28", "2026-10-28T18:20:30.000Z"]) {
    const store = storage(), d = dashboard();
    seed(store, d, { marks: actionMarks, completedAt, startYear: 2026 });
    const state = readContractState(d, store);
    assert.equal(state.completedAt, completedAt);
    assert.deepEqual(state.marks, actionMarks);
  }
});

test("inconsistent finalized receipts are discarded without losing independent marks", () => {
  const { closeout } = closedContract();
  const corruptions = [
    (c) => { c.rows = undefined; }, (c) => { c.rows[0] = null; },
    (c) => { c.rows[0].done = "true"; }, (c) => { c.rows[0].status = "not-met"; },
    (c) => { c.rows[0].id = c.rows[1].id; }, (c) => { c.rows[0].id = "invented"; },
    (c) => { c.rows.pop(); }, (c) => { c.done = 0; }, (c) => { c.total = 0; },
    (c) => { c.year = "2026"; }, (c) => { c.rows[0].progress = {}; },
    (c) => { c.year = 2027; }
  ];
  for (const corrupt of corruptions) {
    const store = storage(), d = dashboard(), damaged = structuredClone(closeout);
    corrupt(damaged);
    seed(store, d, { marks: { "depth-chart": true }, startYear: 2026, finalized: damaged });
    const state = readContractState(d, store);
    assert.equal(state.finalized, null);
    assert.deepEqual(state.marks, { "depth-chart": true });
    const result = renderFirstSeasonContract({ dashboard: d, storage: store, documentRef: documentFixture() });
    assert.equal(result.completedNow, false);
    assert.equal(result.summary.done, 1);
  }
});

test("valid finalization roundtrips, is isolated by franchise and cannot be changed by later dashboards", () => {
  const { store, d, closeout } = closedContract();
  assert.equal(closeout.done, 5);
  assert.deepEqual(readContractState(d, store).finalized, closeout);
  const later = { ...d, currentYear: 2027, seasonsSimulated: 1, cap: { capSpace: -1 } };
  assert.deepEqual(finalizeFirstSeasonContract(later, store), closeout);
  assert.equal(readContractState(dashboard("another-franchise"), store).finalized, null);
  const copy = readContractState(d, store);
  copy.finalized.rows[0].done = false;
  copy.marks["depth-chart"] = false;
  assert.deepEqual(readContractState(d, store).finalized, closeout);
  assert.equal(readContractState(d, store).marks["depth-chart"], true);
});

test("legacy finalized rows retain evidence while display summaries derive from rows", () => {
  const { closeout } = closedContract();
  const legacy = structuredClone(closeout);
  legacy.rows.forEach((row) => { delete row.status; });
  legacy.rows[0].done = false;
  legacy.done = 4;
  legacy.verdict = "All five first-season objectives met.";
  const store = storage(), d = dashboard();
  seed(store, d, { startYear: 2026, finalized: legacy });
  const accepted = readContractState(d, store).finalized;
  assert.equal(accepted.done, 4);
  assert.equal(accepted.rows[0].status, "not-met");
  assert.match(accepted.verdict, /4 of 5/);
  assert.doesNotMatch(renderContractCloseout(legacy), /All five/);
});

test("direct closeout rendering refuses invalid inputs without a crash or invented result", () => {
  for (const input of [null, [], {}, { rows: null }, { rows: [null], year: 2026, total: 5, done: 5 }]) {
    assert.equal(renderContractCloseout(input), "");
  }
  assert.match(renderContractCloseout(closedContract().closeout), /All five/);
});

test("failed persistence retains real marks and finalized results only in this tab", () => {
  const store = storage(), d = { ...dashboard("tab-only"), phase: "season-awards",
    latestStandings: [{ teamId: "BUF", wins: 9, losses: 8 }] };
  store.denyWrite = true;
  for (const id of Object.keys(actionMarks)) markObjective(d, id, store);
  const documentRef = documentFixture();
  assert.equal(renderFirstSeasonContract({ dashboard: d, storage: store, documentRef }).completedNow, true);
  assert.match(documentRef.nodes.firstSeasonContractProgress.textContent, /this tab only/);
  assert.equal(renderFirstSeasonContract({ dashboard: d, storage: store, documentRef }).completedNow, false);
  const closeout = finalizeFirstSeasonContract(d, store);
  store.denyRead = true;
  assert.deepEqual(readContractState(d, store).finalized, closeout);
  assert.equal(readContractState(d, storage()).finalized, null);
  assert.deepEqual(readContractState(dashboard("other-tab-contract"), store).marks, {});
  store.denyRead = store.denyWrite = false;
  writeContractState(d, readContractState(d, store), store);
  assert.deepEqual(JSON.parse(store.values.get(contractStorageKey(d))).finalized, closeout);
});
