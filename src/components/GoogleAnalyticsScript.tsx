"use client";

import { useEffect } from "react";
import { loadGoogleTagManager } from "@/lib/cookie-consent";

export function GoogleAnalyticsScript() {
  useEffect(() => {
    const handleConsentChange = () => loadGoogleTagManager();
    handleConsentChange();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "cookie-consent") handleConsentChange();
    };

    window.addEventListener("cookieConsentChanged", handleConsentChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("cookieConsentChanged", handleConsentChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}
