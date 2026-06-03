const SIMPLE_PATTERNS = [
  /\b(list|count|show|find|grep|validate|check|status|version)\b/i,
  /\b(is|are|does|do|can)\b.+\?$/i
];

const COMPLEX_PATTERNS = [
  /\b(audit|architect|architecture|strategy|design|synthesize|cross-repo|portfolio)\b/i,
  /\b(refactor|migration|threat model|security review|implementation plan)\b/i
];

export function classifyTurn({ prompt = "" } = {}) {
  const text = String(prompt || "").trim();
  if (!text) return { model: "sonnet", reason: "empty-prompt" };

  if (COMPLEX_PATTERNS.some((pattern) => pattern.test(text))) {
    return { model: "opus", reason: "complex-keyword" };
  }

  if (text.length < 600 && SIMPLE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { model: "haiku", reason: "short-transactional" };
  }

  return { model: "sonnet", reason: "default-moderate" };
}
