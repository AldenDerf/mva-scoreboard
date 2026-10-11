import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCOREBOARD_COOKIE_NAME,
  getSupabaseCookieName,
} from "../lib/supabase/config.ts";

test("getSupabaseCookieName returns default scoreboard cookie name", () => {
  const originalEnv = process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME;
  delete process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME;

  assert.strictEqual(
    getSupabaseCookieName(),
    DEFAULT_SCOREBOARD_COOKIE_NAME
  );
  assert.strictEqual(
    DEFAULT_SCOREBOARD_COOKIE_NAME,
    "sb-mva-scoreboard-auth-token"
  );

  // Restore env
  if (originalEnv !== undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME = originalEnv;
  }
});

test("getSupabaseCookieName respects custom environment variable", () => {
  const originalEnv = process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME;
  process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME = "custom-mva-cookie";

  assert.strictEqual(getSupabaseCookieName(), "custom-mva-cookie");

  // Restore env
  if (originalEnv !== undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME = originalEnv;
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME;
  }
});

test("cross-app cookie isolation verification", () => {
  // MVA application default Supabase cookie format is sb-<project-ref>-auth-token
  const mvaDefaultCookie = "sb-etrajlqbuusgjblfeiib-auth-token";
  const scoreboardCookie = DEFAULT_SCOREBOARD_COOKIE_NAME;

  // Verify that scoreboard cookie is isolated and does not collide with MVA
  assert.notStrictEqual(scoreboardCookie, mvaDefaultCookie);
  assert.match(scoreboardCookie, /^sb-mva-scoreboard/);
});
