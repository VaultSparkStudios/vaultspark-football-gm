import fs from "node:fs";
import path from "node:path";

export function recordSkillCost(repoRoot, entry = {}) {
  const ledgerPath = path.join(repoRoot, ".cache", "skill-cost-ledger.ndjson");
  const payload = {
    at: new Date().toISOString(),
    skill: entry.skill || "unknown",
    sessionId: entry.sessionId || null,
    actualTokens: Number(entry.actualTokens || 0),
    durationSec: entry.durationSec ?? null,
    status: entry.status || "unknown"
  };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(payload)}\n`);
  return payload;
}
