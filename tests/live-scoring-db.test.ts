import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import {
  activeRoleForUser,
  applyStoredAction,
  closeScoreboardPool,
  createOfficialMatch,
  createTestMatch,
  getMatch,
  getOverlay,
  listMatches,
  reconcileMvaAdminRole,
} from "../lib/db/scoreboard.ts";

const actor = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const mvaAdmin = "44444444-4444-4444-8444-444444444444";
const scorekeeper = "55555555-5555-4555-8555-555555555555";
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

    // Verify MVA ADMIN inheritance, official match creation, scorekeeper access, and revocation
    const syncedRole = await reconcileMvaAdminRole(mvaAdmin, true);
    assert.equal(syncedRole, "ADMIN");
    assert.equal(await activeRoleForUser(mvaAdmin), "ADMIN");

    const officialId = await createOfficialMatch(mvaAdmin, {
      mvaTournamentId: "10000000-0000-4000-8000-000000000001",
      mvaDivisionId: "10000000-0000-4000-8000-000000000002",
      mvaTeamAId: "10000000-0000-4000-8000-000000000003",
      mvaTeamBId: "10000000-0000-4000-8000-000000000004",
      mvaRegistrationAId: "10000000-0000-4000-8000-000000000005",
      mvaRegistrationBId: "10000000-0000-4000-8000-000000000006",
      tournamentName: "MVA Provincial Cup 2026",
      divisionName: "Men's Open",
      teamAName: "Mahatao Waves",
      teamBName: "San Carlos Spikers",
      teamALogoUrl:
        "https://project-ref.supabase.co/storage/v1/object/public/logos/waves.png",
      teamBLogoUrl: null,
      bestOf: 5,
      serving: "B",
    });
    const officialMatch = await getMatch(mvaAdmin, officialId);
    assert.ok(officialMatch);
    assert.equal(officialMatch.isTest, false);
    assert.equal(officialMatch.bestOf, 5);
    assert.equal(officialMatch.serving, "B");

    const officialOverlay = await getOverlay(officialMatch.publicId);
    assert.ok(officialOverlay);
    assert.equal(officialOverlay.isTest, false);
    assert.equal(officialOverlay.tournament, "MVA Provincial Cup 2026");
    assert.equal(officialOverlay.division, "Men's Open");
    assert.equal(
      officialOverlay.teamALogoUrl,
      "https://project-ref.supabase.co/storage/v1/object/public/logos/waves.png"
    );
    assert.equal(officialOverlay.teamBLogoUrl, null);

    // Revoking MVA ADMIN removes MVA_ADMIN grant while preserving independent SCOREBOARD grants
    const afterRevoke = await reconcileMvaAdminRole(mvaAdmin, false);
    assert.equal(afterRevoke, null);
    await assert.rejects(getMatch(mvaAdmin, officialId));

    // Scorekeeper with independent SCOREKEEPER role + MVA admin inheritance keeps SCOREKEEPER after MVA revoke
    assert.equal(await reconcileMvaAdminRole(scorekeeper, true), "ADMIN");
    assert.equal(await reconcileMvaAdminRole(scorekeeper, false), "SCOREKEEPER");
    // Unassigned scorekeeper cannot access officialId, but can access assigned match id
    await assert.rejects(getMatch(scorekeeper, officialId));
    const assignedMatch = await getMatch(scorekeeper, id);
    assert.ok(assignedMatch);
    const skScored = await applyStoredAction(scorekeeper, id, crypto.randomUUID(), 4, {
      type: "AWARD",
      team: "B",
    });
    assert.equal(skScored.state.sets[1].teamB, 1);
  } finally {
    await pool.end();
    await closeScoreboardPool();
  }
});
