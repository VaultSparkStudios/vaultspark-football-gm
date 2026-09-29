# Release rollback

Franchise Architect: Football builds a static artifact from `main`, verifies the exact candidate on stable staging, and publishes to Cloudflare Pages through the manual `Deploy Pages` workflow. A rollback must restore a previously verified source and artifact without rewriting history.

1. Identify a previously green candidate SHA and its 64-character artifact digest from the stable staging authority receipt and the production release receipt. Confirm its `/_health`, `deploy-manifest.json`, and hashed stylesheet agree.
2. If the faulty source must be undone, use a normal `git revert` on `main`; never reset or force-push. Build and verify the resulting commit as a new candidate on stable staging.
3. Dispatch `.github/workflows/deploy-pages.yml` with the **exact** verified `candidate_revision` and `staging_artifact_digest`. A push to `main` builds an artifact but does not publish Cloudflare Pages.
4. If backend behavior is involved, dispatch `.github/workflows/deploy-backend.yml` at the verified source ref with `deploy_to_server=true`, after its build and test gates pass. Check the runtime source revision separately from the Pages artifact.
5. Verify `/_health`, `/deploy-manifest.json`, the hashed stylesheet, all universal public routes, and the release provenance report against `https://playfranchisearchitect.com`. Record the source SHA and digest observed live.
6. Keep lifecycle state at FORGE unless the email receipt, edge headers, current-origin fingerprint, and founder approval are all independently green.

If the source artifact is correct but the canonical origin is stale, preserve the green artifact, record the mismatch, and correct the Cloudflare origin or cache binding through the authorized control plane.
