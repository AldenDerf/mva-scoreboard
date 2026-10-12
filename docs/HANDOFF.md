# Agent handoff — Phase 03G runtime security review

**Branch:** `docs/phase-03g-runtime-security-review`. **Base:** updated `main` at `6b08aea`; fetch and fast-forward reported already up to date. **Database:** only read-only catalog queries on local `mva_dev`; no role, ACL, function, grant, Auth, or application change.

Read [Phase 03G security review](PHASE_03G_SECURITY_REVIEW.md) for the permission matrix, function-owner decision, Auth and application plan, test cases, risks, and exact approval boundary. Proposed, non-executed SQL is under `db/proposals/03g/`. Phase 03F's postgres-owned lookup is superseded. The application remains fail closed at `ACCESS_PENDING`.

**Next action:** independently review proposed SQL, verify the owner UUID privately through Supabase Auth, rehearse on a disposable cluster under separate authorization, and obtain explicit owner approval before any local runtime or ADMIN database operation. Do not rerun the foundation migration. No push, merge, deployment, or production operation is authorized.

**Changed files:** `docs/PLAN.md`, `docs/HANDOFF.md`, `docs/PHASE_03F_APPROVAL_REPORT.md`, `docs/PHASE_03G_SECURITY_REVIEW.md`, three SQL proposals under `db/proposals/03g/`, and two read-only scripts under `db/verification/`.

**Checks:** read-only catalog and bootstrap-verification scripts passed; `pnpm lint` passed; `pnpm exec tsc --noEmit` passed on sequential rerun; `pnpm test` passed 12/12 outside the sandbox; `pnpm build` passed outside the sandbox; `git diff --check` passed. Initial sandbox test/build attempts failed with Windows `spawn EPERM`; an overlapping initial TypeScript check saw transient missing `.next/types` while build regenerated them. Proposed SQL was not executed or independently syntax-tested by PostgreSQL. Browser, OBS, and live Supabase Auth were not tested.
