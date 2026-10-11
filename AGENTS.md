<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MVA Live Scoreboard — Agent Instructions

This file is the shared source of truth for coding agents (Codex, Antigravity, and other AI coding tools) working in **mva-scoreboard**. Read it before planning or editing. Apply any more-specific `AGENTS.md` found in a subdirectory to files within that directory.

## 1. Product and scope

Build a standalone, **online-first** volleyball scoreboard web app for OBS Studio Browser Source overlays used during Facebook Live broadcasts by the Mahatao Volleyball Association (MVA). It must work from any computer with OBS and an internet connection, with a separate phone-friendly scorekeeper interface.

Product flow: **Sign in → Tournament → Division → Team A / Team B → Match setup → Live scoring → OBS overlay**.

- Existing MVA website/repository: `AldenDerf/mva` (reference and future read-only team-data integration).
- This repository: `mva-scoreboard` (proposed; independent deployment and persistence).
- Teams and official logos are managed by MVA; scoreboard uses eligible teams and their logos via a deliberately narrow integration. Show placeholders if logos are missing.
- MVP is **online only**. Do not implement SQLite, LAN servers, offline-first service workers, or multi-database offline sync unless explicitly requested later.
- OBS displays a **transparent, read-only** overlay. OBS operators and viewers do not need to sign in to view that overlay. Never expose score mutation controls or credentials in an overlay URL.
- Support match setup, scorekeeping, volleyball set rules, correction/undo, score events, access control, and resilient real-time updates.

## 2. Agent workflow and communication

1. At task start inspect relevant code, Git status, package scripts, and existing docs. Do not assume a previous agent's changes are complete.
2. For nontrivial work, state a brief plan, scope, risks, and files likely to change. Follow the existing architecture before introducing a new abstraction.
3. Work in small, reviewable phases; finish one bounded task at a time. Do not silently expand scope.
4. Preserve working changes you did not create. Never reset, stash, overwrite, or delete another agent's work without explicit permission.
5. If the working tree is dirty, identify the modified files and avoid conflicting edits; ask for direction if conflicts cannot be safely resolved.
6. Keep `docs/PLAN.md` (if present) and `docs/HANDOFF.md` current when architecture, phase state, or notable decisions change.
7. At handoff, report branch, HEAD commit, modified files, tests run/results, known gaps, and the exact next recommended action. Do not claim to have tested OBS/Facebook Live unless actually done.
8. Do not invent environment variables, database columns, API contracts, or deployment states. Verify them in the code or docs.

### Switching between Codex and Antigravity

- Both agents must obey this root file and `docs/UI_UX_GUIDELINES.md`.
- Before editing: run `git status`, inspect the last commits and `docs/HANDOFF.md` if present.
- Use separate feature branches when switching tools, or ensure all prior changes are committed and the tree is clean before continuing on the same branch.
- Never have two agents change the same working tree concurrently.
- Do not merge, push, deploy, delete branches, or alter production resources unless the user explicitly directs that operation. Committing completed and verified work locally is permitted, but report it clearly.
- Commit messages use Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`). Keep changes focused.

## 3. Technology and architecture

Preferred stack, subject to what is actually installed:
- Next.js App Router, React, TypeScript (strict), Tailwind CSS, shadcn/ui-compatible accessible primitives, pnpm.
- Supabase Auth / PostgreSQL / Realtime for online application services; Prisma where justified by the actual project setup.
- Vercel as an optional deployment target, not assumed to be configured.

Architecture rules:
- Use Server Components by default. Add Client Components only when interactivity or browser APIs require them.
- Keep scoring domain rules separate from UI and database code (`lib/scoring` or equivalent).
- Validate inputs at server boundaries; use TypeScript types but do not mistake them for runtime validation.
- Enforce authorization on the server for every mutation, never only by hiding UI buttons.
- Keep data access behind typed services. Do not expose the database service-role key to clients.
- Minimize dependencies. Before installing packages, explain why existing libraries are insufficient.
- Use environment variables for secrets; provide example variable names in `.env.example` without credentials.
- Do not rewrite the MVA repository or reuse its private backend credentials.
- Treat the integration with MVA as read-only and limited to tournaments, divisions, eligible team identities, and logo references. No player personal data, payment data, or admin audit data belongs in scoreboard API responses.
- No browser-side direct access to privileged MVA tables. Use a securely authenticated, least-privilege server-to-server API or another reviewed restricted read model.

## 4. Login, roles, and security

- `ADMIN`: create/configure matches, assign authorized scorekeepers, control matches, manage application settings.
- `SCOREKEEPER`: update only explicitly assigned matches (unless policy is changed and reviewed).
- `OVERLAY_VIEWER`: anonymous read-only match presentation via a non-editable URL; expose only broadcast-safe information.
- Reuse existing MVA Supabase Auth identities **only after confirming** the auth architecture and authorization boundary. Sharing a Supabase project does not automatically grant scoreboard privileges.
- No public self-registration in MVP.
- Ensure robust session handling, rate limits or equivalent mutation protection, and auditable administrative operations.
- Never put secrets or access tokens in query parameters, screenshots, logs, commits, or browser bundles.
- Validate logo/media URLs and avoid untrusted embeds or HTML injection.

## 5. Scoring correctness — critical

- The backend is authoritative; the overlay must never mutate match state.
- Every scoring action is attributed to an authorized user, recorded in an append-only event/audit history, and can be safely corrected via an explicit undo/correction action (not silent database editing).
- Score mutations must be atomic and resilient to rapid repeated taps, refreshes, duplicated requests, and concurrent scorekeepers. Define idempotency/concurrency semantics before implementing writes.
- Model volleyball rules explicitly (set target, win by two, deciding set, best-of-3 / best-of-5, serving indicator, match completion). Prefer configurable rules with validated defaults.
- Reject illegal transitions (for example editing a finalized match without reopening permissions), negative scores, and unintended duplicate actions.
- Mark all irreversible or high-impact actions with confirmation dialogs and safeguards (reset match, finalization, delete).
- Real-time updates must resynchronize from authoritative server state after reconnect; do not rely solely on missed realtime events.
- If live state cannot be verified, show a visible connection/staleness warning to the scorekeeper. Do not falsely suggest scores have saved.

## 6. OBS/browser-source requirements

- Provide a dedicated `/overlay/...` route with genuinely transparent background; no application header, sidebar, or scrollbars.
- Design for 1920×1080 canvas first while adapting cleanly to other capture sizes.
- Overlay URL must be safe to paste into OBS Browser Source and must not require an interactive login.
- Display only broadcast-safe information: tournament, division, team names/logos, set and point scores, serving indicator, match status.
- Long names and missing images must not break layout. Optimize image loading; use fallbacks.
- Avoid animations that obscure scoring, excessive motion, or expensive rerenders. Respect reduced-motion preferences.
- On refresh or reconnect, the overlay must fetch current scores before presenting stale data as live.
- Manual OBS verification must check transparency, resizing, URL refresh, long team names, logo fallbacks, and realtime changes.

## 7. UI/UX design rules

Read and follow **`docs/UI_UX_GUIDELINES.md`** before creating or changing screens. Key expectations:
- Modern professional sports-broadcast identity, restrained navy/blue accents, high contrast, consistent typography and spacing.
- Scorekeeper is mobile-first, with large touch targets and clear score-change feedback; avoid accidental taps.
- Make states obvious: loading, empty, error, saved, reconnecting, live, paused, completed.
- Keyboard accessibility, focus management, semantic labels, and visible focus indicators are required.
- No placeholder buttons, fake metrics, or dead-end controls in completed features.
- Layouts must handle narrow phones, tablets, and wide desktop displays without horizontal overflow.

## 8. Quality gates

For changed code, run the relevant installed commands (prefer `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, and feature-focused tests). Report any command not runnable and why.

Before declaring a scoring feature finished, cover:
- score increment/decrement, undo, set transition, win-by-two and deciding-set rules;
- duplicate/concurrent requests, authorization failures, refresh/reconnect;
- overlay read-only behavior and missing-logo states.

Manual browser testing (desktop/mobile) and OBS verification are distinct from lint/build and must not be claimed without execution.

## 9. Destructive actions and deployment

- Never modify production MVA data, RLS policies, or schema without explicit approval and a reviewed migration/rollback plan.
- Never commit `.env*`, tokens, database passwords, exported user data, or production secrets.
- Before migrations or uploads, state the target environment and expected impact.
- Don't automatically push to `main`, merge PRs, trigger deployments, or delete branches.
- Prefer tests and preview environments before production rollout.

## 10. Next.js version-specific instructions

When the installed Next.js version adds its own `AGENTS.md` block, retain that generated block. Follow the installed package's current documentation in `node_modules/next/dist/docs/` when available, rather than outdated assumptions. Resolve conflicts in favor of secure, tested project behavior and document the decision.

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Ignore routine debugging and unverified changes. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Keep a qualifying candidate through the reporting pass even if you resolve or work around it. A successful fix changes the report outcome; it does not erase the friction that qualified it.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `node node_modules/next/dist/bin/next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
