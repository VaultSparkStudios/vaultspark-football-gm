# Codex Handoff - 2026-03-13

What changed:
- Updated GitHub Actions workflow dependencies to clear the Node 20 JavaScript-action deprecation warning reported by GitHub.
- `actions/checkout` moved from `v4` to `v5` in:
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy-backend.yml`
  - `.github/workflows/deploy-pages.yml`
- `actions/setup-node` moved from `v4` to `v5` in:
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy-pages.yml`

Why:
- GitHub warned that `actions/checkout@v4` and `actions/setup-node@v4` still run on deprecated Node 20 JavaScript-action runtimes.
- This change targets the workflow-layer warning only. It does not change the repo's application/runtime Node targets.

Validation:
- No app-level local test rerun was required for this workflow-only change.
- The next push should be checked in GitHub Actions to confirm the warning disappears.

Next step:
- Push the workflow bump and inspect the next `CI` run annotations for removal of the Node 20 deprecation warning.
