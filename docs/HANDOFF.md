# Agent handoff — Phase 02A UI foundation

**Branch:** `feat/phase-02a-ui-foundation`. **Base HEAD:** `f553271cdf9f120ec989619ea490c6af6ebbf9ce`. **Latest HEAD:** the Phase 02A local commit containing this file; run `git rev-parse HEAD` for its exact SHA. **Database/Auth status:** no migration, database change, Auth user/configuration change, or application login implementation.

## Implemented

- Replaced the starter page with MVA Live Scoreboard branding and a responsive login **interface preview**. Email/password inputs have labels, native required/email validation, a show/hide control, and visible preview loading/error states. Submitting a valid-looking form displays an honest unavailable message and clears the password; it sends no credentials and grants no access.
- Added small reusable button, field/select, card, badge, brand, and preview-layout components. The admin preview has desktop sidebar and mobile scrolling navigation for Dashboard, Matches, New Match, Match History, Scorekeepers, and Settings. Every destination exists and uses an honest empty state; no production statistics are invented.
- Added fictional match setup selections that reset downstream values when tournament/division changes, prevent identical teams, and show best-of-3/5 defaults in a non-saving review step. Added a transparent, read-only visual scorebug under `/dev/overlay` with placeholder team marks, long-name truncation, serving indicator, and a prominent “Preview · Not live” label.
- All `/dev` routes are guarded in `app/dev/layout.tsx` to return 404 outside development. Production server checks confirmed 404 for dashboard, setup, and overlay; root login returned 200. Development server checks confirmed 200 for root and preview routes. No protected real dashboard pages were created.
- Switched from `next/font/google` to Vercel's official `geist` package, which bundles Geist Sans/Mono locally under SIL OFL. This preserves typography and removed the build-time Google Fonts request. Next dev rewrote its generated `AGENTS.md` block; the project-specific rules were restored outside that block, and the generated feedback block was retained.

**Files changed:** `AGENTS.md`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/dev/**`, `components/**`, `lib/dev/sample-catalog.ts`, `package.json`, `pnpm-lock.yaml`, `docs/PLAN.md`, `docs/HANDOFF.md`.

**Validation:** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, and `git diff --check` passed after the font and prerender corrections. The first sandboxed build could not spawn Next.js workers (`EPERM`); the elevated local build completed. A browser surface was unavailable, so no manual viewport or keyboard walkthrough was completed. No OBS or Facebook Live test was performed.

## Remaining work and exact next task

The UI is a prototype. Do not wire the login to the MVA production Auth project, expose real admin routes, persist matches, or replace fictional catalog data until the Auth session/cookie policy, scoreboard grants, restricted runtime identity, and approved migration are in place. Have the owner finish the protected-backup and migration approval gates in the [approval report](MIGRATION_APPROVAL_REPORT.md). The next frontend milestone is a manual desktop/mobile accessibility review of these previews (360, 390, 768, 1280, 1920 px) and an actual OBS transparency/resize review; then implement server Auth and protected routes only in a separately approved phase.

On continuation, inspect Git status and instructions. Do not push, merge, deploy, or modify MVA/production resources without explicit direction.