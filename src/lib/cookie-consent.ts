/**
 * Gestion du consentement aux cookies et chargement conditionnel de Google Tag Manager
 */

const COOKIE_CONSENT_KEY = "cookie-consent";
const GTM_ID = "GTM-PSFK9VWM";

export type CookieConsent = "accepted" | "rejected" | null;

/**
 * Récupère le consentement aux cookies depuis le localStorage
 */
export function getCookieConsent(): CookieConsent {
  if (typeof window === "undefined") return null;
  const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
  return consent === "accepted" || consent === "rejected" ? consent : null;
}

/**
 * Enregistre le consentement aux cookies
 */
export function setCookieConsent(consent: "accepted" | "rejected"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(COOKIE_CONSENT_KEY, consent);
  // Déclencher un événement personnalisé pour notifier les autres composants
  window.dispatchEvent(new Event("cookieConsentChanged"));
}

/**
 * Charge Google Tag Manager si le consentement a été donné
 */
export function loadGoogleTagManager(): void {
  if (typeof window === "undefined") return;
  
  const consent = getCookieConsent();
  if (consent !== "accepted") return;

  // Vérifier si GTM est déjà chargé
  if (window.dataLayer) return;

  // Initialiser dataLayer
  window.dataLayer = window.dataLayer || [];
  
  // Fonction GTM
  (function(w: any, d: Document, s: string, l: string, i: string) {
    w[l] = w[l] || [];
    w[l].push({
      "gtm.start": new Date().getTime(),
      event: "gtm.js",
    });
    const f = d.getElementsByTagName(s)[0];
    const j = d.createElement(s) as HTMLScriptElement;
    const dl = l != "dataLayer" ? "&l=" + l : "";
    j.async = true;
    j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
    f.parentNode?.insertBefore(j, f);
  })(window, document, "script", "dataLayer", GTM_ID);
}

/**
 * Déclare les types pour window.dataLayer
 */
declare global {
  interface Window {
    dataLayer?: any[];
  }
}
