/**
 * Best-effort server-side detection for requests coming from Capacitor iOS WebView.
 */
export function isNativeIOSUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return ua.includes("capacitor") && (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios"));
}
