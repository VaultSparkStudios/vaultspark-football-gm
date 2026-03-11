# Decisions

- The canonical public slug remains `vaultspark-football-gm` and is the identifier used for Pages paths, canonical URLs, and runtime origins.
- The updated Studio `AGENTS.md` is the source of truth for deployment behavior when older local docs conflict with it.
- This game deploys GitHub Pages directly from its own repo; the studio site repo remains a separate landing-page and discovery layer only.
- Frontend Pages deployment and backend/runtime deployment remain separate workflows.
- Repo memory is stored in committed files under `context/`, `handoffs/`, `logs/`, `plans/`, `prompts/`, and `specs/` so future sessions do not rely on chat transcripts.
- Existing unrelated dirty changes are preserved during standards work; only compliance-specific files are staged and committed.
