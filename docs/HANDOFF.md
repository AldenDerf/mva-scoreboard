# Agent handoff — Phase 03F review

**Branch:** `docs/phase-03f-runtime-admin-review`. **Base:** `main` at `fc34e04` after `git pull --ff-only` reported already up to date. **Database:** local `mva_dev` retains the Phase 03E foundation. No SQL, Auth, role, function, or ADMIN change was made.

Read [Phase 03F approval report](PHASE_03F_APPROVAL_REPORT.md) for read-only catalog findings, proposed SQL, Auth UUID procedure, risks, tests, and approval boundary. The existing server authorization still fails closed with `ACCESS_PENDING`. No live Auth identity lookup was performed. The report proposes a runtime role and two narrow functions; none exist yet.

**Next action:** review the proposal and privately verify the owner's Supabase Auth UUID. Seek explicit, separate owner approval for finalized local runtime DDL and ADMIN bootstrap before executing either. Do not rerun migration 0001 or use the `postgres` credential at runtime. No push, merge, deployment, or production change is authorized.
