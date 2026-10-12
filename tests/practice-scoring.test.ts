import assert from "node:assert/strict";
import test from "node:test";
import { applyPracticeAction, createPracticeMatch, setWinner, type PracticeMatch, type Side } from "../lib/scoring/practice.ts";

function award(state: PracticeMatch, side: Side, id = crypto.randomUUID()) {
  const result = applyPracticeAction(state, { id, expectedRevision: state.revision, type: "AWARD", team: side });
  assert.equal(result.ok, true);
  return result.state;
}
function confirm(state: PracticeMatch) {
  const result = applyPracticeAction(state, { id: crypto.randomUUID(), expectedRevision: state.revision, type: "CONFIRM_SET" });
  assert.equal(result.ok, true);
  return result.state;
}
function points(state: PracticeMatch, a: number, b: number) {
  for (let i = 0; i < a; i++) state = award(state, "A");
  for (let i = 0; i < b; i++) state = award(state, "B");
  return state;
}

test("validates practice setup", () => {
  assert.throws(() => createPracticeMatch("A", "a", 3, "A"));
  assert.throws(() => createPracticeMatch("", "B", 3, "A"));
  assert.equal(createPracticeMatch(" A ", "B", 5, "B").serving, "B");
});

test("rally scoring updates serve; duplicate and stale commands cannot double-score", () => {
  const initial = createPracticeMatch("A", "B", 3, "A");
  const command = { id: "tap-1", expectedRevision: 0, type: "AWARD" as const, team: "B" as const };
  const first = applyPracticeAction(initial, command);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.state.sets[0].teamB, 1);
  assert.equal(first.state.serving, "B");
  const replay = applyPracticeAction(first.state, command);
  assert.equal(replay.ok && replay.replayed, true);
  assert.equal(replay.state.revision, 1);
  assert.equal(applyPracticeAction(first.state, { ...command, team: "A" }).ok, false);
  assert.deepEqual(applyPracticeAction(first.state, { ...command, id: "tap-2" }), { ok: false, reason: "CONFLICT", state: first.state });
});

test("deuce requires two-point lead and locks scoring until set confirmation", () => {
  let state = points(createPracticeMatch("A", "B", 3, "A"), 24, 24);
  assert.equal(setWinner(state.sets[0], 3), null);
  state = award(state, "A");
  assert.equal(setWinner(state.sets[0], 3), null);
  state = award(state, "B");
  state = award(state, "A");
  state = award(state, "A");
  assert.equal(setWinner(state.sets[0], 3), "A");
  assert.equal(applyPracticeAction(state, { id: "extra", expectedRevision: state.revision, type: "AWARD", team: "A" }).ok, false);
  state = confirm(state);
  assert.equal(state.sets[0].winner, "A");
  assert.equal(state.sets[1].startingServe, "B");
});

test("undo appends correction, restores points and serve, and cannot cross confirmed set", () => {
  let state = award(createPracticeMatch("A", "B", 3, "A"), "B");
  state = award(state, "A");
  const result = applyPracticeAction(state, { id: "undo-1", expectedRevision: state.revision, type: "UNDO" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  state = result.state;
  assert.equal(state.sets[0].teamA, 0);
  assert.equal(state.sets[0].teamB, 1);
  assert.equal(state.serving, "B");
  assert.equal(state.events.at(-1)?.type, "UNDO");
  state = points(state, 25, 0);
  state = confirm(state);
  assert.equal(applyPracticeAction(state, { id: "undo-old", expectedRevision: state.revision, type: "UNDO" }).ok, false);
});

test("undo can reopen a pending set before confirmation", () => {
  let state = points(createPracticeMatch("A", "B", 3, "A"), 25, 0);
  assert.equal(setWinner(state.sets[0], 3), "A");
  const result = applyPracticeAction(state, { id: "undo-pending", expectedRevision: state.revision, type: "UNDO" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  state = result.state;
  assert.equal(state.sets[0].teamA, 24);
  assert.equal(setWinner(state.sets[0], 3), null);
  assert.equal(applyPracticeAction(state, { id: "premature", expectedRevision: state.revision, type: "CONFIRM_SET" }).ok, false);
});

test("best of three completes on second confirmed set; completed match rejects actions", () => {
  let state = points(createPracticeMatch("A", "B", 3, "A"), 25, 0);
  state = confirm(state);
  state = points(state, 25, 0);
  state = confirm(state);
  assert.equal(state.status, "COMPLETED");
  assert.equal(state.sets.length, 2);
  assert.deepEqual(applyPracticeAction(state, { id: "late", expectedRevision: state.revision, type: "AWARD", team: "B" }), { ok: false, reason: "LOCKED", state });
});

test("best of five deciding set targets 15 and still wins by two", () => {
  let state = createPracticeMatch("A", "B", 5, "A");
  for (const side of ["A", "B", "A", "B"] as Side[]) {
    state = points(state, side === "A" ? 25 : 0, side === "B" ? 25 : 0);
    state = confirm(state);
  }
  assert.equal(state.sets.at(-1)?.number, 5);
  state = points(state, 14, 14);
  assert.equal(setWinner(state.sets[4], 5), null);
  state = award(state, "B");
  assert.equal(setWinner(state.sets[4], 5), null);
  state = award(state, "B");
  assert.equal(setWinner(state.sets[4], 5), "B");
  state = confirm(state);
  assert.equal(state.status, "COMPLETED");
});

test("best of three deciding set targets 15", () => {
  let state = points(createPracticeMatch("A", "B", 3, "A"), 25, 0);
  state = confirm(state);
  state = points(state, 0, 25);
  state = confirm(state);
  state = points(state, 14, 0);
  assert.equal(setWinner(state.sets[2], 3), null);
  state = award(state, "A");
  assert.equal(setWinner(state.sets[2], 3), "A");
  state = confirm(state);
  assert.equal(state.status, "COMPLETED");
});

function correct(state: PracticeMatch, command: Omit<Extract<Parameters<typeof applyPracticeAction>[1], { type: "CORRECT_POINTS" }>, "id" | "expectedRevision">) {
  const result = applyPracticeAction(state, { ...command, id: crypto.randomUUID(), expectedRevision: state.revision });
  assert.equal(result.ok, true);
  return result.state;
}

test("subtract is team specific, never negative, and leaves serve explicit", () => {
  let state = award(createPracticeMatch("A", "B", 3, "A"), "B");
  state = award(state, "A");
  const result = applyPracticeAction(state, { id: "sub", expectedRevision: state.revision, type: "SUBTRACT", team: "B" });
  assert.equal(result.ok, true);
  state = result.state;
  assert.equal(state.sets[0].teamB, 0);
  assert.equal(state.sets[0].teamA, 1);
  assert.equal(state.serving, "A");
  assert.equal(applyPracticeAction(state, { id: "sub2", expectedRevision: state.revision, type: "SUBTRACT", team: "B" }).ok, false);
  assert.equal(state.events.at(-1)?.type, "SUBTRACT");
});

test("direct point edit validates values, stores before/after and keeps confirmation pending", () => {
  let state = createPracticeMatch("A", "B", 3, "A");
  for (const bad of [-1, NaN, Infinity, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(applyPracticeAction(state, { id: crypto.randomUUID(), expectedRevision: state.revision, type: "CORRECT_POINTS", teamA: bad, teamB: 0 }).ok, false);
  }
  state = correct(state, { type: "CORRECT_POINTS", teamA: 18, teamB: 16 });
  state = correct(state, { type: "CORRECT_POINTS", teamA: 25, teamB: 23 });
  assert.equal(setWinner(state.sets[0], 3), "A");
  assert.equal(state.sets[0].winner, null);
  assert.equal(state.events.at(-1)?.type, "CORRECT_POINTS");
  const correction = state.events.at(-1);
  if (correction?.type === "CORRECT_POINTS") {
    assert.equal(correction.before.teamA, 18);
    assert.equal(correction.after.teamA, 25);
    assert.equal(correction.setNumber, 1);
    assert.equal(correction.description, "Correct current points");
    assert.ok(!Number.isNaN(Date.parse(correction.timestamp)));
  }
  assert.equal(applyPracticeAction(state, { id: "tap", expectedRevision: state.revision, type: "AWARD", team: "A" }).ok, false);
  state = confirm(state);
  assert.equal(state.sets[0].winner, "A");
});

test("invalid final score cannot be confirmed or written into history", () => {
  let state = correct(createPracticeMatch("A", "B", 3, "A"), { type: "CORRECT_POINTS", teamA: 26, teamB: 0 });
  assert.equal(setWinner(state.sets[0], 3), "A");
  assert.equal(applyPracticeAction(state, { id: "invalid-final", expectedRevision: state.revision, type: "CONFIRM_SET" }).ok, false);
  state = correct(state, { type: "CORRECT_POINTS", teamA: 26, teamB: 24 });
  assert.equal(applyPracticeAction(state, { id: "valid-final", expectedRevision: state.revision, type: "CONFIRM_SET" }).ok, true);
});

test("historical result correction derives wins and rejects impossible later history", () => {
  let state = createPracticeMatch("A", "B", 3, "A");
  state = confirm(correct(state, { type: "CORRECT_POINTS", teamA: 25, teamB: 0 }));
  state = confirm(correct(state, { type: "CORRECT_POINTS", teamA: 0, teamB: 25 }));
  const result = applyPracticeAction(state, { id: "history", expectedRevision: state.revision, type: "CORRECT_SET", setNumber: 1, teamA: 0, teamB: 25 });
  assert.equal(result.ok, false);
  const valid = applyPracticeAction(state, { id: "history2", expectedRevision: state.revision, type: "CORRECT_SET", setNumber: 1, teamA: 27, teamB: 25 });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.state.sets.map((set) => set.winner), ["A", "B", null]);
  assert.equal(applyPracticeAction(state, { id: "bad-set", expectedRevision: state.revision, type: "CORRECT_SET", setNumber: 1, teamA: 24, teamB: 23 }).ok, false);
});

test("current set correction reopens only immediately previous set with empty current set", () => {
  let state = createPracticeMatch("A", "B", 5, "A");
  assert.equal(applyPracticeAction(state, { id: "skip", expectedRevision: state.revision, type: "CORRECT_CURRENT_SET", setNumber: 3 }).ok, false);
  state = confirm(correct(state, { type: "CORRECT_POINTS", teamA: 25, teamB: 0 }));
  const invalid = applyPracticeAction(state, { id: "skip2", expectedRevision: state.revision, type: "CORRECT_CURRENT_SET", setNumber: 3 });
  assert.equal(invalid.ok, false);
  const reopened = applyPracticeAction(state, { id: "reopen", expectedRevision: state.revision, type: "CORRECT_CURRENT_SET", setNumber: 1 });
  assert.equal(reopened.ok, true);
  assert.equal(reopened.state.sets.length, 1);
  assert.equal(reopened.state.sets[0].winner, null);
  assert.equal(setWinner(reopened.state.sets[0], 5), "A");
  state = award(state, "B");
  assert.equal(applyPracticeAction(state, { id: "late-reopen", expectedRevision: state.revision, type: "CORRECT_CURRENT_SET", setNumber: 1 }).ok, false);
});

test("serving correction and completed match restrictions", () => {
  let state = createPracticeMatch("A", "B", 3, "A");
  const result = applyPracticeAction(state, { id: "serve", expectedRevision: state.revision, type: "CORRECT_SERVE", serving: "B" });
  assert.equal(result.ok, true);
  state = result.state;
  assert.equal(state.serving, "B");
  state = confirm(correct(state, { type: "CORRECT_POINTS", teamA: 25, teamB: 0 }));
  state = confirm(correct(state, { type: "CORRECT_POINTS", teamA: 25, teamB: 0 }));
  assert.equal(applyPracticeAction(state, { id: "locked", expectedRevision: state.revision, type: "SUBTRACT", team: "A" }).ok, false);
  assert.equal(applyPracticeAction(state, { id: "winner-flip", expectedRevision: state.revision, type: "CORRECT_SET", setNumber: 2, teamA: 0, teamB: 25 }).ok, false);
  const fresh = createPracticeMatch("A", "B", 3, "B");
  assert.equal(fresh.events.length, 0);
  assert.equal(fresh.sets[0].teamA, 0);
});

test("reason-free corrections preserve idempotency and structured event details", () => {
  const initial = createPracticeMatch("A", "B", 3, "A");
  const command = { id: "points-1", expectedRevision: 0, type: "CORRECT_POINTS" as const, teamA: 18, teamB: 16 };
  const first = applyPracticeAction(initial, command);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const replay = applyPracticeAction(first.state, command);
  assert.equal(replay.ok && replay.replayed, true);
  assert.equal(replay.state.events.length, 1);
  assert.equal(applyPracticeAction(first.state, { ...command, teamA: 19 }).ok, false);
  assert.equal(applyPracticeAction(first.state, { ...command, id: "stale" }).ok, false);
  const event = first.state.events[0];
  assert.equal(event.type, "CORRECT_POINTS");
  if (event.type !== "CORRECT_POINTS") return;
  assert.equal(event.before.teamA, 0);
  assert.equal(event.after.teamA, 18);
  assert.equal(event.setNumber, 1);
  assert.ok(!Number.isNaN(Date.parse(event.timestamp)));
});

test("same-winner set correction is accepted without changing derived wins", () => {
  let state = createPracticeMatch("A", "B", 3, "A");
  state = confirm(correct(state, { type: "CORRECT_POINTS", teamA: 25, teamB: 20 }));
  const result = applyPracticeAction(state, { id: "set-1", expectedRevision: state.revision, type: "CORRECT_SET", setNumber: 1, teamA: 25, teamB: 22 });
  assert.equal(result.ok, true);
  assert.equal(result.state.sets[0].winner, "A");
  assert.equal(result.state.sets[0].teamB, 22);
  assert.equal(result.state.sets[1].teamA, 0);
});
