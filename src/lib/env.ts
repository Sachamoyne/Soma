/**
 * Shared environment helpers for Next.js client/server code.
 * This module only exposes public values and never reads secret keys.
 */

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, "");
}

/**
 * Resolve the canonical site URL used for auth callbacks.
 * Priority:
 * 1) NEXT_PUBLIC_SITE_URL
 * 2) VERCEL_URL
 * 3) window.location.origin (client runtime fallback)
 * 4) localhost
 */
export function getSiteUrl(): string {
  const explicitSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicitSiteUrl) {
    return normalizeUrl(explicitSiteUrl);
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return normalizeUrl(vercelUrl);
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeUrl(window.location.origin);
  }

  return "http://localhost:3000";
}

export function getBackendUrl(): string {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_BACKEND_URL is not defined");
  }
  return normalizeUrl(url);
}

export function getSupabasePublicUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not defined");
  }
  return normalizeUrl(url);
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined");
  }
  return key;
}
