import fs from "node:fs";
import path from "node:path";

export const PUBLIC_COPYRIGHT = "© 2026 VaultSpark Studios LLC. All rights reserved.";

export function inspectPublicFooterContract(publicDir) {
  const htmlFiles = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html")).sort();
  const missing = [];
  const openSourceClaims = [];
  for (const name of htmlFiles) {
    const source = fs.readFileSync(path.join(publicDir, name), "utf8");
    if (!source.includes(PUBLIC_COPYRIGHT)) missing.push(name);
    if (/\bopen[ -]?source\b/i.test(source)) openSourceClaims.push(name);
  }
  return { htmlFiles, missing, openSourceClaims, ok: missing.length === 0 && openSourceClaims.length === 0 };
}

export function assertPublicFooterContract(publicDir) {
  const report = inspectPublicFooterContract(publicDir);
  if (!report.ok) {
    throw new Error([
      report.missing.length ? "missing proprietary copyright: " + report.missing.join(", ") : null,
      report.openSourceClaims.length ? "forbidden open-source claim: " + report.openSourceClaims.join(", ") : null
    ].filter(Boolean).join("; "));
  }
  return report;
}
