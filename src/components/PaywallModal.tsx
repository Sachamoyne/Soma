"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslation } from "@/i18n";
import { useIsApp } from "@/hooks/useIsApp";
import { appHref } from "@/lib/appHref";
import { useIsNativeIOS } from "@/hooks/useIsNativeIOS";

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: "free_plan" | "quota_exceeded";
  plan?: "starter" | "pro";
  used?: number;
  limit?: number;
  remaining?: number;
}

export function PaywallModal({
  open,
  onOpenChange,
  reason,
  plan,
  used,
  limit,
}: PaywallModalProps) {
  const { t } = useTranslation();
  const isApp = useIsApp();
  const isNativeIOS = useIsNativeIOS();

  const isFreePlan = reason === "free_plan";
  const isStarter = plan === "starter";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isNativeIOS
              ? "Subscriptions unavailable"
              : isFreePlan
              ? "AI Generation Not Available"
              : "Card Limit Reached"}
          </DialogTitle>
          <DialogDescription>
            {isNativeIOS ? (
              <div className="space-y-4">
                <p>Subscriptions are available on the web version.</p>
              </div>
            ) : isFreePlan ? (
              <div className="space-y-4">
                <p>
                  AI flashcard generation is not available on the free plan.
                </p>
                <p>
                  Upgrade to Starter (200 cards) or Pro (unlimited cards) to
                  unlock AI-powered flashcard generation.
                </p>
              </div>
            ) : isStarter ? (
              <div className="space-y-4">
                <p>
                  You&apos;ve reached the limit of {limit} cards on the Starter
                  plan ({used} cards).
                </p>
                <p>
                  Upgrade to Pro for unlimited cards and continue creating
                  flashcards.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p>
                  You&apos;ve reached your card limit ({used} / {limit} cards).
                </p>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          {isNativeIOS ? (
            <>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Subscriptions are unavailable in the iOS app.
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                Continue with Manual Creation
              </Button>
            </>
          ) : isFreePlan ? (
            <>
              <Link href={appHref("/pricing", isApp)} className="w-full">
                <Button className="w-full" onClick={() => onOpenChange(false)}>
                  View Plans
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                Continue with Manual Creation
              </Button>
            </>
          ) : isStarter ? (
            <>
              <Link
                href={appHref("/signup?plan=pro", isApp)}
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                <Button className="w-full">
                  {t("pricing.upgrade")}
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                OK
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              OK
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
