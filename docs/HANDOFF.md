# Agent handoff â€” Phase 03E: Approved Local Foundation Migration

**Branch:** `feat/phase-03e-local-foundation-migration`. **Base:** updated `main` at `d889b3d5793640c5c193d2932bdc4eaf7b2540bc`. **Database state:** foundation migration succeeded on local `mva_dev`; do not rerun it. No ADMIN grant, runtime LOGIN, Auth change, demo data, production change, or other migration was made.

The exact approved SQL SHA-256 was `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`. Final target was `mva_dev` on `::1:5432`, PostgreSQL 18.3, cluster identifier `7629597861964584196`. The retained restore-tested backup remained intact. A fresh pre-apply backup, `C:\mva-db-backups\mva_dev_pre_phase03e_20261011_221206.dump`, was created and verified (100,733 bytes; SHA-256 `7e60c8128d64aa2f27ee95b8f8b4075611198b3cd35c396f9a01639033ffeea3`). Both backups are protected outside Git and must be retained under the approved recovery policy.

Migration `psql` exit code: **0**, ending in `COMMIT`. Post-checker exit code: **0**, all 14 checks true. Seven scoreboard tables exist with forced RLS; two restricted NOLOGIN capability roles exist; no runtime LOGIN or scoreboard rows exist. MVA definition fingerprint, 13 per-table counts, 112 public constraints, and 49 public indexes match pre-apply values. See [MIGRATION_APPROVAL_REPORT.md](MIGRATION_APPROVAL_REPORT.md#phase-03e-approved-local-foundation-migration-2026-10-11) for exact evidence and limits.

**Next action:** Complete owner Auth boundary review. In a separately authorized change, design and test a non-superuser runtime path and audited initial ADMIN bootstrap. Never use the `postgres` migration credential in app runtime. Do not rerun the foundation migration.

Quality gates: lint, TypeScript, 12 tests, build, and diff check passed. Node emitted existing module-type warnings. Modified files: docs/PLAN.md, docs/HANDOFF.md, docs/MIGRATION_APPROVAL_REPORT.md. No browser, OBS, or Facebook Live test was performed.
