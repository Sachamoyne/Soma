"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getCookieConsent,
  setCookieConsent,
  loadGoogleTagManager,
} from "@/lib/cookie-consent";
import { useTranslation } from "@/i18n";
import Link from "next/link";

export function CookieConsent() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Vérifier si le consentement a déjà été donné
    const consent = getCookieConsent();
    if (consent === null) {
      setVisible(true);
    } else if (consent === "accepted") {
      // Charger GTM si le consentement a été accepté
      // Google Analytics est géré par GoogleAnalyticsScript dans le layout
      loadGoogleTagManager();
    }
  }, []);

  const handleAccept = () => {
    setCookieConsent("accepted");
    setVisible(false);
    // Charger GTM immédiatement après acceptation
    // Google Analytics sera chargé automatiquement via l'événement cookieConsentChanged
    loadGoogleTagManager();
  };

  const handleReject = () => {
    setCookieConsent("rejected");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg
        animate-in slide-in-from-bottom-4 fade-in duration-500
        rounded-lg border border-border bg-background p-4 shadow-lg"
    >
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t("cookieConsent.title")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("cookieConsent.description")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("cookieConsent.details")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("cookieConsent.learnMore")}{" "}
          <Link
            href="/confidentialite"
            className="underline hover:text-foreground"
          >
            {t("footer.privacyPolicy")}
          </Link>
          .
        </p>
      </div>
      <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReject}
          className="w-full sm:w-auto"
        >
          {t("cookieConsent.reject")}
        </Button>
        <Button
          size="sm"
          onClick={handleAccept}
          className="w-full sm:w-auto"
        >
          {t("cookieConsent.accept")}
        </Button>
      </div>
    </div>
  );
}
