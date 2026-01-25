"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Vérifier si le consentement a déjà été donné
    const consent = getCookieConsent();
    if (consent === null) {
      setOpen(true);
    } else if (consent === "accepted") {
      // Charger GTM si le consentement a été accepté
      loadGoogleTagManager();
    }
  }, []);

  const handleAccept = () => {
    setCookieConsent("accepted");
    setOpen(false);
    // Charger GTM immédiatement après acceptation
    loadGoogleTagManager();
  };

  const handleReject = () => {
    setCookieConsent("rejected");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("cookieConsent.title")}</DialogTitle>
          <DialogDescription className="text-left">
            {t("cookieConsent.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>{t("cookieConsent.details")}</p>
          <p className="text-xs">
            {t("cookieConsent.learnMore")}{" "}
            <Link
              href="/confidentialite"
              className="underline hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              {t("footer.privacyPolicy")}
            </Link>
            .
          </p>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleReject}
            className="w-full sm:w-auto"
          >
            {t("cookieConsent.reject")}
          </Button>
          <Button
            onClick={handleAccept}
            className="w-full sm:w-auto"
          >
            {t("cookieConsent.accept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
