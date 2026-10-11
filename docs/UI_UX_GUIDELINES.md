# MVA Live Scoreboard — UI/UX Guidelines

## Design intent

Build a calm, premium and readable volleyball broadcast tool—not a cluttered gaming dashboard. Admin configuration, scorekeeping and on-air overlay are different contexts and should not share one oversized layout.

## Visual system

- **Identity:** deep navy and neutral surfaces, confident blue accents, limited warm highlight for active/live state. Use CSS design tokens instead of scattering hex codes.
- **Hierarchy:** clear screen title → section heading → field/action. Keep score numerals dominant on the overlay.
- **Typography:** use a consistent sans-serif font; align score digits with tabular numerals. Avoid decorative fonts for scores.
- **Spacing:** consistent 4/8 px rhythm; prefer fewer, well-grouped controls.
- **Contrast:** meet WCAG AA contrast for normal UI text where possible. Never communicate serving/live/errors by color alone.
- **Icons:** pair ambiguous icons with labels or accessible names. Avoid icon-only destructive controls.
- **Consistency:** use shared button, input, select, card, dialog, and toast components. Avoid one-off styling.

## Core screens

### 1. Sign in

Simple and focused: product identity, email/password or approved auth flow, visible validation and error handling. No public registration in MVP.

### 2. Admin match creation

Use a guided sequence: **Tournament → Division → Team A / Team B → Rules → Review → Create**.
- Clear each dependent selection when an upstream value changes.
- Only show teams eligible for the selected tournament/division, according to a documented status policy.
- Prevent same team playing against itself.
- Use the official team logo if present; otherwise initials or a tasteful default shield.
- Display a clear matchup preview and explicitly show best-of-3/best-of-5, set targets and deciding-set rules before creation.
- Loading, no tournaments, no divisions and no eligible teams need distinct helpful states.

### 3. Scorekeeper control panel — highest priority

- Phone-first; make points readable at arm's length.
- Large primary **+1** controls, separated physically from **−1** and reset actions. Minimum 44×44 px; prefer 56×56 px for score-changing taps.
- Use clear team names/logos and current scores at all times.
- Show set scores, current set, serve indicator and match status.
- Provide quick correction/undo with visible result confirmation and event context.
- Avoid confirmations for routine +1, but confirm resets, finalization and destructive operations.
- Disable controls while a mutation is unresolved or make idempotent repeated taps safe. Display pending/save/error states explicitly.
- Indicate connection loss or out-of-sync state prominently, without obstructing necessary recovery actions.
- On match completion, prevent accidental scoring unless authorized reopening happens.

### 4. OBS overlay — broadcast view

- Fully transparent page background (`transparent`), no app chrome or scrollbars.
- Start with a compact, professional top-left or bottom-left scorebug that does not occupy the entire frame.
- Team names, logos, scores, sets and serving status should be readable on both bright and dark footage: use an opaque/semipermeable scoreboard panel even though the surrounding canvas is transparent.
- Provide safe padding within the 1920×1080 capture frame. Avoid placing important text at the very edge.
- Never stretch logos. Preserve aspect ratio with object-fit contain and a fallback placeholder.
- Long team names: truncate or adapt gracefully; never overlap scores.
- No modal, tooltips, hidden menus or hover dependencies in the overlay.
- Be careful with live delay: browser update time and Facebook playback latency differ.
- Design for default landscape 16:9; check 1280×720 and resized browser sources.

### 5. Match management

Clear Upcoming / Live / Completed statuses, search/filter, latest updates, and the ability to reopen a specific match according to role policy. Avoid a crowded table on mobile; use stacked match cards.

## Interactions and states

- Every action needs accessible name, loading/success/error feedback and keyboard operation.
- Modal dialogs: focus trap, Escape handling (unless a critical irreversible operation is in progress), and focus return to triggering control.
- Toasts are supplemental; durable status changes must also appear in the page UI.
- Prefer skeletons for loading collections, helpful empty states, and plain-language error copy with retry.
- Respect `prefers-reduced-motion` and keep broadcast animations subtle and optional.
- Avoid fake example content in production views; seed data belongs only in explicitly labeled development environments.

## Responsive test checklist

Check approximately 360, 390, 768, 1280, and 1920 px layouts. Test keyboard navigation, touch targets, long names, missing logos, network interruption, accidental double taps, refreshed browser source, and actual OBS capture transparency.

## Definition of done for UI changes

A UI change is not finished until responsive behavior, accessible labels/focus, all relevant states, and live-readability have been checked and documented. Do not claim OBS testing unless an OBS Browser Source was actually exercised.
