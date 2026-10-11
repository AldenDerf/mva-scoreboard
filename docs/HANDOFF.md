# Agent handoff — Phase 01C architecture decisions

**Current phase:** 01C documentation complete; implementation has not started. **Branch:** `docs/phase-01a-architecture`. **Base HEAD for this task:** `cc9da89b37f176f358692276baf7e896aea1cc97`. **Latest commit:** the Phase 01C documentation commit containing this handoff; use `git log -1 --oneline` for its exact SHA.

## Completed work

- Compared shared and separate Supabase Auth/project architectures. Recommended a shared Auth project with an isolated scoreboard schema, subject to MVA owner, access, and nonproduction review gates.
- Defined scoreboard-specific grant administration, assigned-match permissions, `VERIFIED` team and league-status eligibility, historical match snapshots, scoring workflow, and completed-match reopening.
- Added a nonproduction schema sequence, rollback plan, security checks, required MVA catalog API changes (documentation only), and a reproducible font-build strategy to [ARCHITECTURE.md](ARCHITECTURE.md).
- Updated [PLAN.md](PLAN.md) to separate completed architecture work from future database/Auth and UI implementation.

**Files modified in this task:** `docs/ARCHITECTURE.md`, `docs/PLAN.md`, `docs/HANDOFF.md`. The local MVA repository was read-only; no application code, database objects, or migration files were changed.

**Validation:** `pnpm lint`, `pnpm exec tsc --noEmit`, and `git diff --check` passed. `pnpm build` failed again while the unchanged starter layout fetched Geist and Geist Mono from `fonts.googleapis.com`; network availability remains the build gate. No Auth, database, browser, OBS, or Facebook Live integration was tested.

## Decisions and gates

Phase 01C design defaults are in [ARCHITECTURE.md](ARCHITECTURE.md#phase-01c--mvp-architecture-decision) and supersede the earlier Phase 01B options. They are not evidence of owner approval or deployed behavior. Before implementation, confirm the deployed MVA Supabase issuer and cookie behavior, approve shared schema/migration ownership, approve the restricted MVA catalog API and league-status filter, obtain MVA approval for best-of-three and operational scoring policy, and select a disposable nonproduction target. Determine retention, backups, and production release owner.

The app remains the Next.js starter. MVA does not yet expose the proposed integration endpoint. No scoreboard Auth, schema, scoring, or overlay exists. The Google Fonts download failure still prevents a successful build in this host unless network access is restored or a separately reviewed local-font code change is made.

## Exact next task

Begin Phase 01D preflight: verify the deployed Auth project and MVA owner approvals, identify the nonproduction Supabase target, then prepare concrete schema/RLS migrations and rollback instructions for review. Do not touch production or execute a migration until the target and impact are explicit.

## Codex / Antigravity continuation rules

1. Inspect `git status` and recent commits before editing; read `AGENTS.md`, `docs/UI_UX_GUIDELINES.md`, `docs/PLAN.md`, and this handoff.
2. Preserve uncommitted work and never edit the same working tree concurrently. Use a focused branch or a clean committed tree when switching agents.
3. Keep small Conventional Commits and update this handoff after substantial work with branch, HEAD, changed files, validation, blockers, and next action.
4. Do not merge, push, deploy, or modify production resources without explicit direction.
