# MVA Live Scoreboard implementation plan

**Current phase:** 01C architecture decisions (documentation only). **Product status:** In Development. See [architecture review](ARCHITECTURE.md#phase-01c--mvp-architecture-decision) for the recommended MVP design and its approval gates; no features or migrations exist yet.

## Sequence and gates

Do not start schema or Auth work until the MVA identity boundary and scoreboard project isolation are reviewed. Do not start MVA integration until its actual schema, eligibility policy, and restricted read contract are confirmed. Do not ship score mutations before atomicity, idempotency, correction semantics, and authorization are tested. Do not call the overlay broadcast-ready before real OBS testing.

| Phase | Objective and deliverables | Dependencies and blockers | Acceptance criteria | Testing expectations | Status |
| --- | --- | --- | --- | --- | --- |
| **01A — Documentation and architecture** | Replace starter README; roadmap, handoff, architecture and guideline review. | Repository and installed stack inspection. | Docs distinguish proposals from implementation, identify decisions, and provide next action. | Lint, TypeScript, build, diff check; record environmental failures. | **Completed** (build limited by network). |
| **01B — Architecture verification** | Verified MVA source contracts and documented Auth, schema, integration, scoring, and OBS proposals. | Read-only MVA source access. | Verified facts distinguished from proposed contracts. | Source review and lint/type/build; build limitation recorded. | **Completed** (documentation). |
| **01C — Architecture decisions** | Compare Auth isolation options; recommend MVP boundary; lock design defaults; nonproduction migration, rollback, and security plan. | 01B findings; deployed project and owner approval remain release gates. | Defaults and unresolved external approvals explicit; no application change. | Docs review, lint/type/build/diff checks; font-network failure recorded. | **Completed** (documentation). |
| **01D — Database/Auth foundation** | Implement approved nonproduction schema, roles, session handling, and environment example. | 01C gates, nonproduction target, migration ownership, rollback approval. | No public signup; unauthorized writes denied; secrets server-only; rollback rehearsed. | Migration/restore, Auth, RLS, role/assignment, lint/type/build. | Not Started |
| **01E — Application shell and admin UI** | Accessible sign-in and admin navigation, shared primitives and screen states. | 01D identity and UI guidelines. | Responsive mobile/desktop shell with loading, empty, and error states; no dead controls. | Keyboard, focus, contrast, 360–1920 px browser review; lint/type/build. | Not Started |
| **02 — MVA integration** | Secure read-only catalog for tournaments, divisions, eligible teams and official logos; dependent selection UI. | Verified MVA schema/API, eligibility policy, credentials and logo allowlist; 01B–01C. | Only eligible teams selectable, no unrelated MVA data in responses, missing logos handled. | Contract and authorization tests, changed upstream selection, invalid logos, empty states. | Not Started |
| **03 — Match management** | Create matches, configure best-of rules, assign scorekeepers, manage upcoming/live/completed lifecycle. | 01B, 02, approved rule defaults and admin policy. | Distinct eligible teams; immutable setup snapshot; authorized lifecycle actions audited and confirmed when high impact. | Server validation and role tests, lifecycle transitions, phone/desktop UI. | Not Started |
| **04 — Scoring engine** | Domain rules, atomic score actions, append-only undo/corrections, set/serve/completion tracking, concurrency and idempotency. | 03, approved action semantics and transactional design. | No duplicate points; stale revisions conflict; win-by-two and deciding set correct; finalized matches locked. | Increment/decrement/undo, transitions, duplicate/concurrent requests, authorization and refresh tests. | Not Started |
| **05 — OBS integration** | Transparent read-only overlay, Realtime notices, authoritative resync, connection/staleness states. | 04, approved public read and Realtime model. | Public safe URL, no edits, fresh state after reconnect; long names and missing logos fit 1920×1080 and 1280×720. | Browser/mobile checks, network interruption, and actual OBS transparency/resize/refresh/live updates. | Not Started |
| **06 — Production readiness** | Security and accessibility review, automated regression coverage, deployment and release checklist. | Phases 01–05, preview environment and production approvals. | Reviewed secrets, rate limits, backups, observability, migration rollback, and release owner sign-off. | Full automated suite, mobile/desktop usability, OBS Browser Source, preview smoke tests. | Not Started |

## Immediate architectural blockers

- MVA source uses Supabase SSR plus separate active ADMIN grants; deployed Auth issuer, domain/session behavior, and shared-schema approval remain unconfirmed.
- MVA schema and `VERIFIED` filtering are verified in source. Proposed scheduling statuses and a restricted catalog endpoint need MVA owner approval and implementation.
- Nonproduction migration target, owner, backup/retention period, and production rollout approval remain outstanding.
- Proposed best-of-three and operational scoring defaults need MVA association approval; official FIVB rules are identified separately in the architecture review.

**Next bounded task:** Phase 01D preflight: verify the deployed Auth issuer and owner-approved shared-schema boundary, choose a disposable nonproduction Supabase target, and prepare concrete reviewed migrations and rollback instructions before executing them.
