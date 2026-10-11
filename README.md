# MVA Live Scoreboard

**Status: In Development — Phase 01D (foundation preparation).** The repository still contains the Next.js starter application. Review-only migration SQL and TypeScript contracts have been prepared; authentication, match management, scoring, MVA integration, and OBS overlays are not available yet.

MVA Live Scoreboard is a standalone, online-first volleyball scoring application for Mahatao Volleyball Association (MVA) broadcasts. An authorized scorekeeper will control a match from a phone-friendly interface while OBS Studio shows a transparent, public, read-only Browser Source during Facebook Live. The existing [MVA application](https://github.com/AldenDerf/mva) remains the source for tournaments, divisions, eligible teams, and official team logos; this project is intended to have separate deployment and scoreboard persistence.

## Planned product flow

Sign in → choose tournament and division → choose two eligible teams → configure a match → score live sets → display its unique OBS overlay URL.

- **Administration:** create and configure matches, assign scorekeepers, and manage lifecycle actions.
- **Scorekeeping:** best-of-3 or best-of-5 rules, serving, explicit corrections and undo, attributed event history, and authoritative real-time state.
- **Broadcast:** transparent overlay with tournament, division, team identity, set and point scores, serve, and match status; no login or editing controls for viewers.
- **Resilience:** atomic and idempotent mutations, reconnect synchronization, visible stale-state warnings, and logo fallbacks.

The MVP is online only. There is no offline mode or separate logo upload system planned.

## Technology and architecture

The installed foundation is Next.js 16.4.0 App Router, React 19.3.0, TypeScript, Tailwind CSS 4, ESLint, and pnpm 11.25.0. Proposed services are Supabase Auth, PostgreSQL, and Realtime, with Vercel as an optional independent hosting target. Supabase, database schema, and deployment configuration have **not** been added. Prisma is not currently installed and needs a concrete reason before adoption.

The intended trust boundaries are: browser UI → authenticated scoreboard server mutation → scoreboard database; MVA data → narrow authenticated server-to-server read integration → match setup; scoreboard read model → public broadcast-safe overlay. The server owns scoring rules, authorization, and persistence. Realtime is an invalidation signal; clients refetch authoritative state. See [architecture review](docs/ARCHITECTURE.md) and [implementation plan](docs/PLAN.md).

## Local development

Prerequisites: Node.js compatible with the installed Next.js version and pnpm 11.25.0 (see `packageManager` in `package.json`). No Supabase project is needed to run the current starter page. Check the [installed Next.js documentation](node_modules/next/dist/docs/index.md) when changing application code.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Current scripts are `pnpm dev`, `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build`. There are no application tests yet.

### Environment configuration

The current ignored `.env.local` has `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The database credentials currently identify a privileged local PostgreSQL role and are **not suitable for application runtime**. Read the [database runbook](docs/DB_RUNBOOK.md) before any connection or migration work. A future implementation should document approved variable names in `.env.example` without values and use a distinct least-privilege server credential. Never commit secrets or put privileged keys in browser code.

## Intended OBS workflow

An admin creates a match; OBS adds that match's public `/overlay/...` URL as a Browser Source. The overlay will render a compact scorebug against a transparent canvas and refresh from authoritative state after load or reconnection. The scorekeeper uses a separate authenticated screen. The route and workflow have not been implemented or tested in OBS yet.

## Contributing

Read [agent instructions](AGENTS.md), [UI/UX guidelines](docs/UI_UX_GUIDELINES.md), [plan](docs/PLAN.md), and [handoff](docs/HANDOFF.md). Work on a focused branch, inspect Git status and recent commits, preserve another agent's work, run relevant checks, and update the handoff after substantial work. Use Conventional Commits. Do not push, merge, or deploy without explicit direction.
