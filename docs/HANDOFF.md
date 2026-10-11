# Agent handoff — Phase 01H migration approval readiness

**Branch:** `docs/phase-01a-architecture`. **Base HEAD:** `dc3ce5d1a333987d42fe13868d3bf88626a3a1ea`. **Latest HEAD:** the local Phase 01H commit containing this file; run `git rev-parse HEAD` for its exact SHA. **Verdict:** **BLOCKED**; no scoreboard migration applied to `mva_dev` or production.

## Verified work

- Git began clean at the reported commit. The exact review candidate SHA-256 remains `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`; its bytes were not changed.
- The MVA and scoreboard local Auth URL/anon-key values still match. A fresh read-only Auth settings request returned HTTP 200 but no redirect allowlist. Dashboard ownership, production-user status, issuer used by deployed MVA, and separate-origin callbacks still require owner confirmation. No Auth settings or users changed.
- Added [`0001_mva_dev_post_read_only.sql`](../db/verification/0001_mva_dev_post_read_only.sql). It checks target identity, scoreboard objects/constraints/indexes, forced RLS and ACLs, overlay view access, and the MVA table inventory. It emits an MVA public-definition fingerprint for pre/post comparison. A read-only run on the **unmigrated** `mva_dev` parsed successfully: target and MVA inventory passed; scoreboard checks failed as expected. The post-migration positive path remains untested.
- The [runbook](DB_RUNBOOK.md) now specifies an operator-controlled, outside-Git, restricted backup immediately before a separately approved migration, archive integrity checks, UTF-8-compatible restore, custodian/location/retention approval, and no automatic deletion. No Phase 01H backup was made or retained; the Phase 01G restore rehearsal remains the only restore proof.
- The [approval report](MIGRATION_APPROVAL_REPORT.md) includes the exact owner Auth checklist and explicit BLOCKED verdict. No application runtime credential, API, migration, MVA repository file, or production object changed.

**Files changed:** `db/verification/0001_mva_dev_post_read_only.sql`, `docs/MIGRATION_APPROVAL_REPORT.md`, `docs/DB_RUNBOOK.md`, `docs/PLAN.md`, `docs/HANDOFF.md`.

**Validation:** `pnpm lint`, `pnpm exec tsc --noEmit`, and `git diff --check` passed. `pnpm build` failed because the unchanged layout could not fetch Geist and Geist Mono from Google Fonts. The new checker ran successfully as read-only SQL against unmigrated `mva_dev`; its scoreboard checks correctly returned false.

## Remaining gates and exact next task

Owner confirmation of the Auth project/issuer, production-user classification, and callback allowlist is outstanding. The owner must approve a protected recovery location, custodian, and retention date; no recovery archive currently exists. The owner must review the checker and candidate checksum and separately authorize migration execution. Before that authorized change window, capture a current MVA definition fingerprint and create/retain the new archive. Never connect the application as `postgres`; a restricted runtime identity and transaction functions are later work.

On continuation, inspect Git status/recent commits and read `AGENTS.md`, UI guidelines, plan, architecture, preflight, runbook, approval report, and this handoff. Preserve other work. Do not push, merge, deploy, or touch production/MVA resources without explicit direction.
