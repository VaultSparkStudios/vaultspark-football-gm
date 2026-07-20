# Release rollback

Franchise Architect: Football deploys a static GitHub Pages artifact from `main`. A rollback must restore a previously verified artifact without rewriting history.

1. Identify the last green `pages.yml` run whose `_health` receipt, `deploy-manifest.json`, and hashed stylesheet agree.
2. Revert the faulty commit on `main` with a normal `git revert`; never reset or force-push.
3. Push the revert and let the Pages workflow build a new artifact from that explicit rollback commit.
4. Verify `/_health`, `/deploy-manifest.json`, the hashed stylesheet, all universal public routes, and the launch-evidence report against `https://playfranchisearchitect.com`.
5. Keep lifecycle state at FORGE unless the email receipt, edge headers, current-origin fingerprint, and founder approval are all independently green.

If the source artifact is correct but the canonical origin is stale, do not revert working source. Preserve the green artifact, record the mismatch, and correct the Cloudflare/GitHub origin or cache binding through the authorized control plane.
