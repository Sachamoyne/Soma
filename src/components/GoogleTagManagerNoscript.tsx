"use client";

import { useEffect, useState } from "react";
import { getCookieConsent } from "@/lib/cookie-consent";

export function GoogleTagManagerNoscript() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const checkConsent = () => {
      const consent = getCookieConsent();
      setShouldRender(consent === "accepted");
    };

    // Vérifier au montage
    checkConsent();

    // Écouter les changements de localStorage (pour les changements de consentement)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "cookie-consent") {
        checkConsent();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    
    // Écouter aussi les changements dans le même onglet via un custom event
    const handleConsentChange = () => {
      checkConsent();
    };
    
    window.addEventListener("cookieConsentChanged", handleConsentChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("cookieConsentChanged", handleConsentChange);
    };
  }, []);

  if (!shouldRender) return null;

  return (
    <noscript>
      <iframe
        src="https://www.googletagmanager.com/ns.html?id=GTM-PSFK9VWM"
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
