import test from "node:test";
import assert from "node:assert/strict";

import {
  dedupeInnovationCandidates,
  innovationCandidateKey
} from "../scripts/lib/innovation-candidates.mjs";

test("launch evidence wording variants collapse into one canonical gate", () => {
  const candidates = [
    {
      title: "sparked-flip",
      source: "TASK_BOARD open item",
      action: "Deferred until same-origin staging provenance and founder approval exist.",
      evidence: "sparked-flip"
    },
    {
      title: "launch/SPARKED email and live-origin evidence",
      source: "TASK_BOARD open item",
      action: "No real received-message receipt exists.",
      evidence: "launch/SPARKED email and live-origin evidence"
    },
    {
      title: "latest-audit-follow-through",
      source: "latest audit artifact",
      action: "Re-check live code.",
      evidence: "audit"
    }
  ];
  assert.equal(innovationCandidateKey(candidates[0]), "launch-readiness-evidence-gate");
  const deduped = dedupeInnovationCandidates(candidates);
  assert.equal(deduped.length, 2);
  const launch = deduped.find((candidate) => candidate.title === "launch-readiness-evidence-gate");
  assert.equal(launch.duplicateCount, 2);
  assert.match(launch.evidence, /sparked-flip/);
  assert.match(launch.evidence, /live-origin evidence/);
});
