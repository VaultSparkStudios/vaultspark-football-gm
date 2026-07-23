import fs from "node:fs";
import path from "node:path";

export const PUBLIC_COPYRIGHT = "© 2026 VaultSpark Studios LLC. All rights reserved.";
export const PUBLIC_STUDIO_ORIGIN = "https://vaultsparkstudios.com";

function footerLinkbackStatus(source) {
  const footer = source.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i)?.[0] || "";
  const hrefs = [...footer.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
  const studioLinks = hrefs.filter((href) => {
    try {
      return new URL(href).hostname.toLowerCase() === "vaultsparkstudios.com";
    } catch {
      return /vaultsparkstudios\.com/i.test(href);
    }
  });
  const valid = studioLinks.some((href) => {
    try {
      const url = new URL(href);
      return url.protocol === "https:" && url.hostname.toLowerCase() === "vaultsparkstudios.com";
    } catch {
      return false;
    }
  });
  return { valid, invalid: studioLinks.length > 0 && !valid };
}

export function inspectPublicFooterContract(publicDir) {
  const htmlFiles = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html")).sort();
  const missing = [];
  const openSourceClaims = [];
  const missingLinkbacks = [];
  const invalidLinkbacks = [];
  for (const name of htmlFiles) {
    const source = fs.readFileSync(path.join(publicDir, name), "utf8");
    if (!source.includes(PUBLIC_COPYRIGHT)) missing.push(name);
    if (/\bopen[ -]?source\b/i.test(source)) openSourceClaims.push(name);
    const linkback = footerLinkbackStatus(source);
    if (!linkback.valid) missingLinkbacks.push(name);
    if (linkback.invalid) invalidLinkbacks.push(name);
  }
  return {
    htmlFiles,
    missing,
    openSourceClaims,
    missingLinkbacks,
    invalidLinkbacks,
    ok: missing.length === 0 && openSourceClaims.length === 0 && missingLinkbacks.length === 0 && invalidLinkbacks.length === 0
  };
}

export function assertPublicFooterContract(publicDir) {
  const report = inspectPublicFooterContract(publicDir);
  if (!report.ok) {
    throw new Error([
      report.missing.length ? "missing proprietary copyright: " + report.missing.join(", ") : null,
      report.openSourceClaims.length ? "forbidden open-source claim: " + report.openSourceClaims.join(", ") : null,
      report.missingLinkbacks.length ? "missing HTTPS Studio link-back: " + report.missingLinkbacks.join(", ") : null,
      report.invalidLinkbacks.length ? "invalid Studio link-back: " + report.invalidLinkbacks.join(", ") : null
    ].filter(Boolean).join("; "));
  }
  return report;
}
