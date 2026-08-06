export function resolvePublicDomainReadiness(status = {}) {
  status = status || {};
  const checkedAt = status.checkedAt ? ` Checked ${status.checkedAt}.` : "";
  if (status.ok === true || status.status === "ready") return { status: "Ready", detail: status.detail || `Public game URL is reachable.${checkedAt}`.trim() };
  if (status.status === "needs-check") return { status: "Needs check", detail: status.detail || `Run the public URL smoke after DNS or Pages changes.${checkedAt}`.trim() };
  return { status: "Blocked", detail: status.detail || "playfranchisearchitect.com needs current origin/routing evidence before launch readiness can flip green" };
}

export function resolveContactEmailReadiness(status = {}) {
  status = status || {};
  const checkedAt = status.checkedAt ? ` Checked ${status.checkedAt}.` : "";
  if (status.ok === true || status.status === "verified") return { status: "Verified", detail: status.detail || `football@playfranchisearchitect.com forwarding/copying is verified.${checkedAt}`.trim() };
  if (status.status === "needs-check") return { status: "Needs check", detail: status.detail || `Send a real message to football@playfranchisearchitect.com and confirm receipt by Studio operations.${checkedAt}`.trim() };
  return { status: "Unverified", detail: status.detail || "Need a real received-message receipt proving football@playfranchisearchitect.com forwards/copies to Studio operations" };
}

export function buildLaunchReadinessRows({ dashboard = null, saves = [], persistence = {}, observability = {}, speedrunChallenge = null, publicDomainStatus = {}, contactEmailStatus = {} } = {}) {
  const safePersistence = persistence || {};
  const safeObservability = observability || {};
  const publicDomain = resolvePublicDomainReadiness(publicDomainStatus);
  const contactEmail = resolveContactEmailReadiness(contactEmailStatus);
  return [
    { area: "Runtime", status: dashboard ? "Ready" : "Load league", detail: `${safePersistence.kind || (dashboard ? "browser/server" : "not loaded")} | ${dashboard?.phase || "no league loaded"} | ${safeObservability.server?.requests ?? 0} server requests` },
    { area: "Save Health", status: saves.length ? "Ready" : "No saves", detail: saves.length ? `${saves.length} local slots available` : "Create a save before inviting long beta runs" },
    { area: "Feedback", status: "Ready", detail: "Tell the Commissioner opens a prefilled public GitHub feedback path" },
    { area: "Challenge Codes", status: speedrunChallenge ? "Active" : "Ready", detail: "VSFC1 seeded challenge codes support zero-backend beat-my-run duels" },
    { area: "Public Domain", status: publicDomain.status, detail: publicDomain.detail },
    { area: "Contact Email", status: contactEmail.status, detail: contactEmail.detail }
  ];
}
