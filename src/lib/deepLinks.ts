const APP_HOST = "soma-edu.com";
const CUSTOM_SCHEME = "soma:";

export const POST_LOGIN_REDIRECT_KEY = "postLoginRedirect";

/**
 * Parses supported deep links and returns an internal app pathname (+query).
 * Returns null for unsupported or invalid URLs.
 */
export function parseDeepLinkUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const query = parsed.search ?? "";
    const path = resolveDeepLinkPath(parsed);
    if (!path) return null;
    return `${path}${query}`;
  } catch {
    return null;
  }
}

/**
 * Routes that require auth and should go through /login when session is missing.
 */
export function isProtectedDeepLinkPath(path: string): boolean {
  return path === "/review" || path === "/decks" || path.startsWith("/decks/");
}

/**
 * Stores post-login redirect destination in localStorage.
 */
export function setPostLoginRedirect(path: string): void {
  if (typeof window === "undefined") return;
  if (!path.startsWith("/")) return;
  window.localStorage.setItem(POST_LOGIN_REDIRECT_KEY, path);
}

/**
 * Reads + clears the pending post-login redirect destination.
 */
export function consumePostLoginRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  if (!value) return null;
  window.localStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  return value.startsWith("/") ? value : null;
}

/**
 * Small smoke-test list usable from console/dev scripts.
 */
export const DEEP_LINK_SMOKE_TEST_URLS = [
  "soma://review",
  "soma://decks/123",
  "soma://decks/123/stats",
  "https://soma-edu.com/review",
  "https://soma-edu.com/decks/123?ref=abc",
  "https://soma-edu.com/decks/123/stats?app=1",
  "https://example.com/decks/123",
  "not-a-url",
] as const;

export function runDeepLinkSmokeTest(): Array<{ input: string; output: string | null }> {
  return DEEP_LINK_SMOKE_TEST_URLS.map((input) => ({
    input,
    output: parseDeepLinkUrl(input),
  }));
}

function resolveDeepLinkPath(parsed: URL): string | null {
  if (parsed.protocol === CUSTOM_SCHEME) {
    const customPath = resolveCustomSchemePath(parsed);
    if (customPath) return customPath;
  }

  if (parsed.protocol === "https:" && parsed.hostname === APP_HOST) {
    return resolvePathname(parsed.pathname);
  }

  return null;
}

function resolveCustomSchemePath(parsed: URL): string | null {
  // Supported forms:
  // - soma://review
  // - soma://decks/{deckId}
  // - soma://decks/{deckId}/stats
  // Also supports soma:///review as a safe fallback.
  if (parsed.hostname === "review" && (!parsed.pathname || parsed.pathname === "/")) {
    return "/review";
  }

  if (parsed.hostname === "decks") {
    return resolveDeckPathFromSegments(getPathSegments(parsed.pathname));
  }

  if (!parsed.hostname) {
    return resolvePathname(parsed.pathname);
  }

  return null;
}

function resolvePathname(pathname: string): string | null {
  const segments = getPathSegments(pathname);
  if (segments.length === 1 && segments[0] === "review") {
    return "/review";
  }
  if (segments[0] === "decks") {
    return resolveDeckPathFromSegments(segments.slice(1));
  }
  return null;
}

function resolveDeckPathFromSegments(segments: string[]): string | null {
  if (!segments[0]) return null;
  const deckId = segments[0];

  if (segments.length === 1) {
    return `/decks/${deckId}`;
  }

  if (segments.length === 2 && segments[1] === "stats") {
    return `/decks/${deckId}/stats`;
  }

  return null;
}

function getPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}
