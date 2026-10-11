import test from "node:test";
import assert from "node:assert/strict";
import { getSafeRedirectUrl } from "../lib/auth/redirects.ts";

test("getSafeRedirectUrl - valid relative paths are preserved", () => {
  assert.strictEqual(getSafeRedirectUrl("/dashboard"), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl("/matches/new"), "/matches/new");
  assert.strictEqual(getSafeRedirectUrl("/matches?filter=live"), "/matches?filter=live");
});

test("getSafeRedirectUrl - null, undefined, or empty fallback to default", () => {
  assert.strictEqual(getSafeRedirectUrl(null), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl(undefined), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl(""), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl("   "), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl(undefined, "/custom"), "/custom");
});

test("getSafeRedirectUrl - rejects external URLs and open redirect attempts", () => {
  // Protocol-relative
  assert.strictEqual(getSafeRedirectUrl("//evil.com"), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl("//evil.com/path"), "/dashboard");

  // Backslash variations
  assert.strictEqual(getSafeRedirectUrl("/\\evil.com"), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl("\\evil.com"), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl("/path\\evil"), "/dashboard");

  // Absolute schemes
  assert.strictEqual(getSafeRedirectUrl("https://evil.com"), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl("http://evil.com"), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl("javascript:alert(1)"), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl("data:text/html,evil"), "/dashboard");

  // Embedded schemes in path
  assert.strictEqual(getSafeRedirectUrl("/http://evil.com"), "/dashboard");
});

test("getSafeRedirectUrl - rejects control characters", () => {
  assert.strictEqual(getSafeRedirectUrl("/dashboard\r\nSet-Cookie: evil"), "/dashboard");
  assert.strictEqual(getSafeRedirectUrl("/dashboard\nLocation: evil"), "/dashboard");
});
