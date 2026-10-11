# Agent handoff — Phase 03A: Supabase Authentication Foundation

**Branch:** `feat/phase-03a-supabase-auth-foundation`. **Base HEAD:** `90fb16c4d7537d06af237408078e1d58684b8148` (Phase 02B commit). **Latest HEAD:** run `git rev-parse HEAD` for the current commit. **Database/Auth status:** no database migrations applied to `mva_dev` or production; no Auth user/configuration changes made. Server-side Supabase SSR authentication connected with fail-closed authorization.

## Implemented in Phase 03A

- **Supabase SSR integration:** Installed `@supabase/ssr` (0.12.7) and `@supabase/supabase-js` (2.117.3). Added `lib/supabase/config.ts`, `lib/supabase/client.ts`, `lib/supabase/server.ts`, and `lib/supabase/proxy.ts`. Added root Next.js 16 proxy convention `proxy.ts` for automatic session token refresh.
- **Cross-app cookie isolation:** Configured `NEXT_PUBLIC_SUPABASE_COOKIE_NAME=sb-mva-scoreboard-auth-token`. Because localhost ports (`localhost:3000` for MVA vs `localhost:3001` for Scoreboard) share cookie storage, using an app-scoped cookie prevents scoreboard logins/logouts from interfering with or stomping the MVA session cookies on port 3000.
- **Server actions for Auth:** Implemented `signInAction` and `signOutAction` in `app/actions/auth.ts`.
  - Implemented server-side input validation for email and password.
  - Implemented generic authentication error handling: returns `"Invalid email or password. Please verify your credentials and try again."` to prevent user enumeration / account existence disclosure.
  - Clears sensitive password field on failure.
- **Fail-closed authorization boundary:** Added `lib/auth/authorization.ts` and `lib/auth/session.ts`.
  - Checks verified session via `supabase.auth.getUser()`.
  - Distinguishes authentication from authorization: having a valid Supabase identity conveys zero scoreboard privileges by default.
  - Does not infer privileges from email or MVA admin status.
  - Because `scoreboard.role_grants` is unmigrated in `mva_dev`, all authenticated accounts evaluate to `ACCESS_PENDING` (fails closed).
  - Added guards: `requireScoreboardAuth()`, `requireAdmin()`, `requireScorekeeper()`.
- **Open redirect protection:** Added `lib/auth/redirects.ts` with `getSafeRedirectUrl()` ensuring only sanitized local relative paths starting with `/` are accepted (rejecting `//`, `/\`, backslashes, control characters, and protocol schemes).
- **Access Pending & Unauthorized UI:**
  - Added `app/access-pending/page.tsx` for authenticated users without an active scoreboard role grant. Features a calm, branded UI matching guidelines, displays the signed-in email, explains the fail-closed access requirement, and provides a server-action Sign Out button.
  - Added `app/unauthorized/page.tsx` for role mismatches.
- **Protected routes foundation:**
  - Added `app/(protected)/layout.tsx` enforcing the 3-step check (session, identity, scoreboard role) before rendering.
  - Added `app/(protected)/dashboard/page.tsx` with role badge and Sign Out button.
  - Opted dynamic authenticated routes out of static prerendering via Next.js 16 `export const instant = false`.
- **Login UI integration:** Updated `components/login-form.tsx` to connect to `signInAction` using React 19 `useActionState`. Removed the temporary preview warning notice. Retained password visibility toggle, accessible labels, `aria-invalid`, `aria-describedby`, and loading states.
- **Automated test suite:** Added `tests/` with 12 unit tests running via Node 24 native test runner:
  - `tests/redirects.test.ts` (4 tests)
  - `tests/cookie-config.test.ts` (3 tests)
  - `tests/auth-validation.test.ts` (5 tests)
  - Added `pnpm test` script to `package.json`.

**Files changed in Phase 03A:**
- `.gitignore` (un-ignored `.env.example`)
- `.env.example` (created template without secrets)
- `package.json` & `pnpm-lock.yaml` (added `@supabase/ssr`, `@supabase/supabase-js`, `test` script)
- `tsconfig.json` (enabled `allowImportingTsExtensions`)
- `proxy.ts` (Next.js 16 proxy)
- `lib/supabase/{config,client,server,proxy}.ts`
- `lib/auth/{session,authorization,redirects}.ts`
- `app/actions/auth.ts`
- `app/page.tsx`
- `app/access-pending/page.tsx`
- `app/unauthorized/page.tsx`
- `app/(protected)/{layout,dashboard/page}.tsx`
- `components/login-form.tsx`
- `components/ui/field.tsx`
- `tests/{redirects,cookie-config,auth-validation}.test.ts`
- `docs/PLAN.md` & `docs/HANDOFF.md`

## Validation results

- `pnpm lint`: Passed (0 errors, 0 warnings).
- `pnpm exec tsc --noEmit`: Passed (0 errors).
- `pnpm test`: Passed (12 tests passed, 0 failed).
- `pnpm build`: Passed (Next.js 16 Turbopack production build succeeded, all static and dynamic routes compiled).
- `git diff --check`: Passed (no whitespace or git diff errors).
- Local HTTP route checks on port 3001:
  - `GET /` -> 200 (Login page rendered, no preview warning)
  - `GET /dashboard` -> 307 (Redirects unauthenticated user to `/`)
  - `GET /access-pending` -> 307 (Redirects unauthenticated user to `/`)
  - `GET /dev` -> 200 (Dev previews remain available in development)

## Cross-app cookie findings

- The scoreboard development server runs on `http://localhost:3001` while the main MVA application runs on `http://localhost:3000`.
- Because web browsers scope cookies by hostname (`localhost`) and ignore TCP port numbers, standard Supabase Auth cookies (`sb-<project-ref>-auth-token`) are shared across all localhost ports for the same Supabase project reference.
- Without isolation, signing in or logging out on port 3001 would overwrite or destroy the session on port 3000.
- **Resolution implemented:** In `lib/supabase/config.ts`, the cookie name is configured as `sb-mva-scoreboard-auth-token` (configurable via `NEXT_PUBLIC_SUPABASE_COOKIE_NAME`). This ensures complete cookie isolation between the two applications during local development and preview environments.

## Remaining blockers and next recommended task

- The scoreboard schema candidate (`0001_scoreboard_foundation.mva_dev.review.sql`) has not been applied to `mva_dev` or production.
- A current retained recovery point, owner approval of the shared target, and migration checksum verification remain required before applying the database migration.
- Because the schema is not yet applied, all authenticated users currently fail closed to the `/access-pending` state.
- **Next recommended task (Phase 03B):** Complete owner preflight checks, apply the reviewed scoreboard migration to `mva_dev`, provision the first active `ADMIN` role grant, and wire `lib/auth/authorization.ts` to query `scoreboard.role_grants` for runtime authorization.
