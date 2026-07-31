import test from "node:test";
import assert from "node:assert/strict";
import { handleArchitectThesisRequest } from "../src/runtime/handlers/architectThesisHandler.js";

function fixture({ mutation = { ok: true, thesis: { revision: 2 } } } = {}) {
  const dashboard = { architectThesis: { revision: 1, review: { status: "no-new-receipt" } } };
  const session = {
    getDashboardState: () => dashboard,
    setArchitectThesis: () => mutation
  };
  return { dashboard, session };
}

test("Architect handler owns GET semantics including review fields", () => {
  const { dashboard, session } = fixture();
  const response = handleArchitectThesisRequest({ method: "GET", session });
  assert.deepEqual(response, {
    status: 200,
    body: { ok: true, thesis: dashboard.architectThesis }
  });
});

test("Architect handler projects one POST success shape through adapter capability", () => {
  const { session } = fixture();
  const response = handleArchitectThesisRequest({
    method: "POST",
    session,
    input: { focusPathId: "identity", expectedRevision: 1 },
    projectState: () => ({ projection: "adapter-owned" })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    ok: true,
    thesis: { revision: 2 },
    state: { projection: "adapter-owned" }
  });
});

test("Architect handler preserves validation and stale-revision refusal semantics", () => {
  for (const mutation of [
    { ok: false, status: 400, reasonCode: "ARCHITECT_THESIS_UNKNOWN_FOCUS", error: "invalid" },
    { ok: false, status: 409, reasonCode: "ARCHITECT_THESIS_REVISION_CONFLICT", error: "stale" }
  ]) {
    const { session } = fixture({ mutation });
    const response = handleArchitectThesisRequest({ method: "POST", session, input: {} });
    assert.equal(response.status, mutation.status);
    assert.deepEqual(response.body, mutation);
  }
});
