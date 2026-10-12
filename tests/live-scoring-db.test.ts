import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { applyStoredAction, closeScoreboardPool, createTestMatch, getMatch, getOverlay, listMatches } from "../lib/db/scoreboard.ts";

const actor = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const enabled = Boolean(process.env.PHASE04_TEST_DATABASE_URL);

test("isolated runtime persists scores, rejects duplicates and concurrent stale actions", { skip: !enabled }, async () => {
  const pool = new Pool({ connectionString: process.env.PHASE04_TEST_DATABASE_URL });
  try {
    const id = await createTestMatch(actor, "Synthetic North", "Synthetic South", 3, "A");
    const initial = await getMatch(actor, id);
    assert.ok(initial);
    assert.equal(initial.revision, 0);
    assert.equal(initial.sets[0].teamA, 0);
    assert.equal((await listMatches(actor)).some((match) => match.id === id), true);
    assert.equal((await getOverlay(initial.publicId))?.teamA, "Synthetic North");
    const key = crypto.randomUUID();
    const action = { type: "AWARD" as const, team: "A" as const };
    const first = await applyStoredAction(actor, id, key, 0, action);
    assert.equal(first.state.sets[0].teamA, 1);
    const replay = await applyStoredAction(actor, id, key, 0, action);
    assert.equal(replay.replayed, true);
    assert.equal(replay.state.sets[0].teamA, 1);
    await assert.rejects(applyStoredAction(actor, id, key, 0, { type: "AWARD", team: "B" }));
    const concurrent = await Promise.allSettled([
      applyStoredAction(actor, id, crypto.randomUUID(), 1, action),
      applyStoredAction(actor, id, crypto.randomUUID(), 1, action),
    ]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await getMatch(actor, id))?.sets[0].teamA, 2);
    await assert.rejects(getMatch(other, id));
    await assert.rejects(pool.query("SELECT * FROM scoreboard.matches"));
    const corrected = await applyStoredAction(actor, id, crypto.randomUUID(), 2,
      { type: "CORRECT_POINTS", teamA: 25, teamB: 23 });
    assert.equal(corrected.state.sets[0].winner, null);
    assert.equal(corrected.state.sets[0].pendingFinalization, true);
    const confirmed = await applyStoredAction(actor, id, crypto.randomUUID(), 3, { type: "CONFIRM_SET" });
    assert.equal(confirmed.state.currentSet, 2);
    assert.equal((await getOverlay(initial.publicId))?.sets[0].winner, "A");
  } finally {
    await pool.end();
    await closeScoreboardPool();
  }
});
