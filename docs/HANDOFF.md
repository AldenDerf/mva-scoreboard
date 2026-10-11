# Agent handoff — Phase 03B: Development Migration & Role Authorization Preflight

**Branch:** `feat/phase-03b-migration-auth-preflight`. **Base HEAD:** `fc17f162d79f19232a7c488cc9199ae50c06c8d8` (Phase 03A commit). **Latest HEAD:** run `git rev-parse HEAD` for the current commit. **Database/Auth status:** zero migrations applied; no database changes; no Auth user/configuration changes made. Preflight completed; stopped at approval boundary pending explicit owner authorization.

## Implemented and Verified in Phase 03B

- **Target database verification:** Connected to local PostgreSQL 18.0.3 on IPv6 loopback `[::1]:5432`, database `mva_dev`. Verified system identifier `7629597861964584196` matches documented preflight. Confirmed local development target (not production).
- **MVA schema baseline:** Verified all MVA public tables are present (`leagues`, `league_categories`, `registrations`, `teams`, `admin_access`, etc.). Confirmed `scoreboard` schema and capability roles do not exist.
- **Read-only post-checker baseline:** Executed `db/verification/0001_mva_dev_post_read_only.sql`. Target identity, MVA inventory, and zero-policy baseline passed. All scoreboard checks failed as expected for an unmigrated target. Recorded MVA definition fingerprint: SHA `c16708e4bf35a86e66c098a810108d0c` across 289 catalog entries.
- **Migration candidate integrity:** Recalculated SHA-256 for `db/migrations/0001_scoreboard_foundation.mva_dev.review.sql`. Checksum is byte-identical:
  `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`.
- **Backup directory preparation:**
  - Path: `C:\mva-db-backups\`
  - NTFS permissions hardened: inheritance disabled, restricted exclusively to `BUILTIN\Administrators` and `NT AUTHORITY\SYSTEM` (FullControl); broad `Users` and `Authenticated Users` access removed.
  - Available storage: 86.4 GB free space on drive C:.
  - Approved retention: 7 days after successful migration, provided recovery remains verified.
- **Restricted runtime authorization strategy designed:**
  - Plan integration between `lib/auth/authorization.ts` and `scoreboard.role_grants`.
  - Non-superuser runtime database role (`scoreboard_runtime`) will inherit `scoreboard_server` capability with `NOBYPASSRLS`.
  - Role check executed via a `SECURITY DEFINER` function `scoreboard.get_active_user_role(p_user_id uuid)` granted to `scoreboard_server`.
  - Preserves fail-closed behavior if user lacks active grant (`revoked_at IS NULL`).
  - No initial admin identity hardcoded; initial admin bootstrap will be executed via a one-time parameterized transaction with owner approval.
- **Stop condition enforced:** No migration executed. Work halted at approval boundary.

## Validation results

- `pnpm lint`: Passed (0 errors, 0 warnings).
- `pnpm exec tsc --noEmit`: Passed (0 errors).
- `pnpm test`: Passed (12/12 tests passing).
- `pnpm build`: Passed (Next.js 16 Turbopack production build succeeded).
- `git diff --check`: Passed (no whitespace errors).

## Exact migration execution steps for owner review

When the owner explicitly authorizes Phase 03C execution:

1. **Create protected backup:**
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h ::1 -p 5432 -U postgres -d mva_dev -Fc -f "C:\mva-db-backups\mva_dev_pre_migration_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"
   ```
2. **Verify backup archive:**
   ```powershell
   $latest = Get-ChildItem "C:\mva-db-backups\*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   Get-FileHash $latest.FullName -Algorithm SHA256
   & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --list $latest.FullName | Select-Object -First 10
   ```
3. **Verify migration checksum:**
   Verify SHA-256 of `db/migrations/0001_scoreboard_foundation.mva_dev.review.sql` equals `508b1cb926500936c7c7aa84dc1a802bb11ad4b3c2b52045133294a50438f2b0`.
4. **Apply migration in single transaction:**
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h ::1 -p 5432 -U postgres -d mva_dev -v ON_ERROR_STOP=1 -f "db/migrations/0001_scoreboard_foundation.mva_dev.review.sql"
   ```
5. **Run read-only post-checker:**
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h ::1 -p 5432 -U postgres -d mva_dev -f "db/verification/0001_mva_dev_post_read_only.sql"
   ```
   Require all 14 checks to report `passed = t` and `all_checks_pass = t`, and fingerprint SHA to equal `c16708e4bf35a86e66c098a810108d0c`.
6. **Provision runtime role and initial admin:**
   Create non-superuser login role `scoreboard_runtime`, grant `scoreboard_server`, and insert the owner-approved Supabase Auth UUID into `scoreboard.role_grants`.
