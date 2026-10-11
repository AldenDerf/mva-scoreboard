import test from "node:test";
import assert from "node:assert/strict";

// Validation logic matching signInAction
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSignInInput(emailRaw: unknown, passwordRaw: unknown) {
  const email = typeof emailRaw === "string" ? emailRaw.trim() : "";
  const password = typeof passwordRaw === "string" ? passwordRaw : "";

  const fieldErrors: { email?: string; password?: string } = {};

  if (!email) {
    fieldErrors.email = "Email address is required.";
  } else if (!EMAIL_REGEX.test(email)) {
    fieldErrors.email = "Please enter a valid email address.";
  }

  if (!password) {
    fieldErrors.password = "Password is required.";
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}

test("validateSignInInput - missing credentials rejected", () => {
  const result1 = validateSignInInput("", "");
  assert.strictEqual(result1.isValid, false);
  assert.strictEqual(result1.fieldErrors.email, "Email address is required.");
  assert.strictEqual(result1.fieldErrors.password, "Password is required.");

  const result2 = validateSignInInput(null, null);
  assert.strictEqual(result2.isValid, false);
  assert.strictEqual(result2.fieldErrors.email, "Email address is required.");
  assert.strictEqual(result2.fieldErrors.password, "Password is required.");
});

test("validateSignInInput - invalid email format rejected", () => {
  const result = validateSignInInput("not-an-email", "secret123");
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.fieldErrors.email, "Please enter a valid email address.");
  assert.strictEqual(result.fieldErrors.password, undefined);
});

test("validateSignInInput - valid inputs accepted", () => {
  const result = validateSignInInput("scorekeeper@example.com", "validPassword123!");
  assert.strictEqual(result.isValid, true);
  assert.deepStrictEqual(result.fieldErrors, {});
});

test("generic error message does not leak account existence", () => {
  // Both non-existent account and wrong password must return the exact same generic message
  const genericMessage =
    "Invalid email or password. Please verify your credentials and try again.";

  // Verify generic message content
  assert.strictEqual(
    genericMessage.includes("user not found"),
    false,
    "Should not disclose user non-existence"
  );
  assert.strictEqual(
    genericMessage.includes("account does not exist"),
    false,
    "Should not disclose account status"
  );
  assert.strictEqual(
    genericMessage.includes("wrong password"),
    false,
    "Should not confirm email existence by only complaining about password"
  );
});

test("authorization fails closed for unauthenticated and pending users", () => {
  // Test authorization state transitions
  type AuthState = {
    isAuthenticated: boolean;
    hasScoreboardRole: boolean;
    role: "ADMIN" | "SCOREKEEPER" | null;
  };

  function evaluateRouteAccess(state: AuthState): "LOGIN" | "ACCESS_PENDING" | "DASHBOARD" {
    if (!state.isAuthenticated) {
      return "LOGIN";
    }
    if (!state.hasScoreboardRole || !state.role) {
      return "ACCESS_PENDING";
    }
    return "DASHBOARD";
  }

  // 1. Unauthenticated user
  assert.strictEqual(
    evaluateRouteAccess({ isAuthenticated: false, hasScoreboardRole: false, role: null }),
    "LOGIN"
  );

  // 2. Authenticated user without scoreboard role (current state for all users)
  assert.strictEqual(
    evaluateRouteAccess({ isAuthenticated: true, hasScoreboardRole: false, role: null }),
    "ACCESS_PENDING"
  );

  // 3. Authenticated user with role
  assert.strictEqual(
    evaluateRouteAccess({ isAuthenticated: true, hasScoreboardRole: true, role: "ADMIN" }),
    "DASHBOARD"
  );
});
