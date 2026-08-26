const SIL_CATEGORY_KEYS = Object.freeze({
  "Dev Health": "devHealth",
  "Creative Alignment": "creativeAlignment",
  Momentum: "momentum",
  Engagement: "engagement",
  "Process Quality": "processQuality",
  "Cross-Repo Coherence": "crossRepoCoherence",
  "Security Posture": "securityPosture",
  "Ecosystem Integration": "ecosystemIntegration",
  "Capital Efficiency": "capitalEfficiency",
  "Automation Coverage": "automationCoverage"
});

export function parseInlineSilCategories(source = "") {
  const line = String(source).match(/SIL\s+v\d+(?:\.\d+)?:[^\n]*\(([^\n)]+)\)/i)?.[1] || "";
  const categories = {};
  for (const [label, key] of Object.entries(SIL_CATEGORY_KEYS)) {
    const match = line.match(new RegExp(`${label.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&")}\\s+(\\d{1,3})(?:\\s*,|$)`, "i"));
    if (match) categories[key] = Number(match[1]);
  }
  return categories;
}

export function isIsoCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function achievedIntentStreak(entries = []) {
  let streak = 0;
  for (const entry of entries.slice(0, 10)) {
    const body = typeof entry === "string" ? entry : String(entry?.body || "");
    if (/Classification:.*Achieved|Intent outcome:.*(?:Achieved|✓)/i.test(body)) streak += 1;
    else break;
  }
  return streak;
}
