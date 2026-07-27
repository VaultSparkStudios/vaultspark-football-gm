function normalizedWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function innovationCandidateKey(candidate = {}) {
  const words = new Set(normalizedWords([
    candidate.title,
    candidate.action,
    candidate.evidence
  ].join(" ")));
  const launch = ["launch", "sparked", "live", "origin", "staging"].some((word) => words.has(word));
  const evidence = ["evidence", "provenance", "email", "receipt", "approval", "edge"].some((word) => words.has(word));
  if (launch && evidence) return "launch-readiness-evidence-gate";
  return normalizedWords(candidate.title).join("-") || "untitled";
}

function distinct(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function dedupeInnovationCandidates(candidates = []) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const key = innovationCandidateKey(candidate);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...candidate,
        title: key === "launch-readiness-evidence-gate" ? "launch-readiness-evidence-gate" : candidate.title,
        duplicateCount: 1
      });
      continue;
    }
    const sources = distinct([existing.source, candidate.source]);
    const actions = distinct([existing.action, candidate.action]);
    const evidenceRows = distinct([existing.evidence, candidate.evidence]);
    grouped.set(key, {
      ...existing,
      source: sources.join(" + "),
      action: actions.sort((left, right) => right.length - left.length)[0],
      evidence: evidenceRows.join("; "),
      duplicateCount: existing.duplicateCount + 1
    });
  }
  return [...grouped.values()];
}
