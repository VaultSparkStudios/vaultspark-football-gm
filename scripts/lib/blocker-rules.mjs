const CAPABILITY_PATTERNS = [
  { pattern: /github|gh\b|pages|repo secret/i, capability: "github.repo" },
  { pattern: /cloudflare|wrangler/i, capability: "cloudflare.deploy" },
  { pattern: /vercel/i, capability: "vercel.deploy" },
  { pattern: /stripe|payment|billing/i, capability: "stripe.agent-payments" },
  { pattern: /anthropic|claude/i, capability: "anthropic.api" },
  { pattern: /openai/i, capability: "openai.api" }
];

export function classifyBlocker(text = "") {
  const capabilities = CAPABILITY_PATTERNS
    .filter((entry) => entry.pattern.test(text))
    .map((entry) => entry.capability);
  const signupUiOnly = /signup|create account|billing confirmation|hardware key|yubikey|fido/i.test(text);
  const hasScriptedPath = /secret|deploy|workflow|migration|wrangler|vercel|gh |github pages|repo secret/i.test(text);
  const attemptable = hasScriptedPath || capabilities.length > 0;
  const probeCommands = [];
  if (/github|gh\b|pages|repo secret/i.test(text)) probeCommands.push("gh auth status");
  if (/vercel/i.test(text)) probeCommands.push("vercel whoami");
  if (/cloudflare|wrangler/i.test(text)) probeCommands.push("wrangler whoami");
  return {
    category: signupUiOnly ? "human-dashboard" : attemptable ? "agent-attemptable" : "unknown",
    attemptable,
    signupUiOnly,
    elevatedProbe: attemptable ? "required-before-human-label" : "not-mapped",
    probeCommands,
    capabilities: [...new Set(capabilities)]
  };
}

export function summarizeAttemptOrder(text = "") {
  const info = classifyBlocker(text);
  const steps = ["Run secrets discovery for mapped capabilities."];
  if (info.probeCommands.length) steps.push(`Run probe: ${info.probeCommands.join(" · ")}.`);
  if (info.attemptable) steps.push("If credentials/probe are ready, execute the scripted action from the agent session.");
  steps.push("Escalate to human only if the action is dashboard-only, billing-gated, hardware-gated, or explicitly destructive.");
  return steps;
}
