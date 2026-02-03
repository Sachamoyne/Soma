/**
 * Appends `?app=1` to an internal href when in app mode.
 * Preserves any existing query parameters and hash fragments.
 * Returns the href unchanged when isApp is false.
 */
export function appHref(href: string, isApp: boolean): string {
  if (!isApp) return href;
  const url = new URL(href, "http://n");
  url.searchParams.set("app", "1");
  return url.pathname + url.search + url.hash;
}
