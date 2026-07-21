import test from "node:test";
import assert from "node:assert/strict";
import { createClientDiagnosticsLedger } from "../public/lib/clientDiagnostics.js";

test("client diagnostics coalesce, bound, and sanitize source failures", () => {
  let tick = 100;
  const ledger = createClientDiagnosticsLedger({ limit: 2, now: () => tick++ });
  ledger.record({ surface: "hydration", operation: "roster", error: "GET https://game.test/api?token=secret failed Bearer abc.def" });
  ledger.record({ surface: "hydration", operation: "roster", error: "GET https://game.test/api?token=secret failed Bearer abc.def" });
  ledger.record({ surface: "panel", operation: "news", error: "news offline" });
  ledger.record({ surface: "panel", operation: "owner", error: "owner offline" });
  const snapshot = ledger.snapshot();
  assert.equal(snapshot.unresolved, 2);
  assert.equal(snapshot.entries.some((entry) => entry.message.includes("secret")), false);
  assert.equal(snapshot.entries.some((entry) => entry.message.includes("abc.def")), false);
});

test("retryable diagnostics recover only after their retry fulfills", async () => {
  const ledger = createClientDiagnosticsLedger();
  ledger.record({ surface: "hydration", operation: "roster", error: "offline", retry: async () => "ok" });
  ledger.record({ surface: "action", operation: "trade", error: "rejected" });
  const result = await ledger.retryAll();
  assert.deepEqual(result, { attempted: 1, recovered: 1, remaining: 1 });
  assert.equal(ledger.snapshot().entries[0].operation, "trade");
  ledger.clear();
  assert.equal(ledger.snapshot().status, "healthy");
});
