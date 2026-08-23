// ── S94: developer diagnostics are opt-in ────────────────────────────────────
//
// Launch Readiness, System Health, the 10-20 year Realism Verification runner,
// League Progression Parity, Finite-Number Integrity and the Offseason Pipeline
// shipped to every consumer inside the Settings tab, ungated. They are for
// maintaining the simulation, not for playing it, and one of them can lock the
// tab on a thirty-season synchronous run.
//
// The reveal is deliberately a URL parameter rather than a stored preference:
// a diagnostics surface a player can switch on permanently by accident is the
// same defect one step removed. Opting in costs a query string every time.
export function isDeveloperSurfaceRequested(search = globalThis.location?.search || "") {
  try {
    return new URLSearchParams(search).get("dev") === "1";
  } catch {
    return false;
  }
}

export function applyDeveloperSurfaceVisibility(root = globalThis.document, search) {
  if (!root?.querySelectorAll) return 0;
  const requested = isDeveloperSurfaceRequested(search);
  const surfaces = root.querySelectorAll("[data-dev-surface]");
  for (const surface of surfaces) {
    surface.hidden = !requested;
    surface.setAttribute("aria-hidden", String(!requested));
  }
  return requested ? surfaces.length : 0;
}
