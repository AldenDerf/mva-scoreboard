/**
 * Safe redirect helpers to prevent open redirect vulnerabilities.
 */

/**
 * Validates and sanitizes a redirect target URL.
 * Only relative paths starting with a single '/' are permitted.
 * Double slashes, backslashes, protocol schemes, control characters, and external domains are rejected.
 */
export function getSafeRedirectUrl(
  target: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!target || typeof target !== "string") {
    return fallback;
  }

  const trimmed = target.trim();

  // Must begin with a single slash
  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  // Reject protocol-relative URLs (//example.com) and backslashes (/\ or \/)
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\") || trimmed.includes("\\")) {
    return fallback;
  }

  // Reject URLs containing control characters or newlines
  if (/[\r\n\t]/.test(trimmed)) {
    return fallback;
  }

  // Reject URLs containing scheme indicators before query string
  const pathPart = trimmed.split("?")[0];
  if (pathPart.includes(":")) {
    return fallback;
  }

  return trimmed;
}
