import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findAuditSidecar, renderAuditFile, renderAuditMarkdown, validateAudit } from "../scripts/render-audit-md.mjs";

function fixture(session, status = "open") {
  return {
    schemaVersion: "1.0",
    date: "2026-07-15",
    session,
    project: "fixture-football",
    displayName: "Fixture Football",
    status,
    profile: { type: "game", audience: "public-unlaunched", rubric: "product", staging: "github-pages", source: "fixture" },
    summary: { combinedPriority: 42 },
    items: [{
      rank: 1,
      tier: "FIRE",
      category: "agency",
      effortHours: 2,
      impact: 9,
      innovation: 8,
      priority: 42,
      slug: "binding-choice",
      title: "Binding choice",
      status,
      premise: "Choice only records prose.",
      ladder: { L2: { effortHours: 2, recipe: "Execute or persist a measurable obligation." } },
      verification: ["focused test"]
    }],
    preverifiedSkips: [{ candidate: "Add choices", reason: "Choices already exist; consequence authority is missing." }]
  };
}

test("audit renderer validates required item contracts", () => {
  assert.throws(() => validateAudit({ date: "2026-07-15", session: 1, project: "x", items: [{}] }), /items\[0\]\.rank/);
});

test("audit renderer selects the newest dated session and renders cache-compatible rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "fa-audit-render-"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs", "AUDIT_2026-07-15_SESSION46.json"), JSON.stringify(fixture(46)));
  writeFileSync(join(dir, "docs", "AUDIT_2026-07-15_SESSION47.json"), JSON.stringify(fixture(47, "shipped")));
  assert.match(findAuditSidecar(dir), /SESSION47\.json$/);
  const result = renderAuditFile(dir);
  assert.equal(result.changed, true);
  const markdown = readFileSync(result.output, "utf8");
  assert.match(markdown, /# Audit — Fixture Football — Session 47/);
  assert.match(markdown, /^\| 1 \| FIRE .*\*\*binding-choice\*\*/m);
  assert.match(markdown, /\| binding-choice \| shipped \| focused test \|/);
  assert.equal(renderAuditFile(dir, { check: true }).checked, true);
});

test("audit renderer is deterministic and escapes table delimiters", () => {
  const audit = fixture(47);
  audit.items[0].category = "UI | agency";
  const first = renderAuditMarkdown(audit);
  assert.equal(renderAuditMarkdown(audit), first);
  assert.match(first, /UI \\| agency/);
});
