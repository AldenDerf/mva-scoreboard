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
