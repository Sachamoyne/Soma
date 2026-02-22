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
              ? isFreePlan
                ? t("paywall.modal.iosFreePlanTitle")
                : t("paywall.modal.iosQuotaTitle")
              : isFreePlan
              ? t("paywall.modal.webFreePlanTitle")
              : t("paywall.modal.webQuotaTitle")}
          </DialogTitle>
          <DialogDescription>
            {isNativeIOS ? (
              <div className="space-y-4">
                <p>
                  {isFreePlan
                    ? t("paywall.modal.iosFreePlanDesc")
                    : t("paywall.modal.iosStarterLimitDesc", { limit: limit ?? 0 })}
                </p>
              </div>
            ) : isFreePlan ? (
              <div className="space-y-4">
                <p>{t("paywall.modal.webFreePlanDesc1")}</p>
                <p>{t("paywall.modal.webFreePlanDesc2")}</p>
              </div>
            ) : isStarter ? (
              <div className="space-y-4">
                <p>{t("paywall.modal.webStarterLimitDesc1", { limit: limit ?? 0, used: used ?? 0 })}</p>
                <p>{t("paywall.modal.webStarterLimitDesc2")}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p>{t("paywall.modal.webProLimitDesc", { used: used ?? 0, limit: limit ?? 0 })}</p>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          {isNativeIOS ? (
            <>
              <Link href="/billing" className="w-full" onClick={() => onOpenChange(false)}>
                <Button className="w-full">
                  {isFreePlan ? t("paywall.modal.viewSubscriptions") : t("paywall.modal.upgradeToPro")}
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                {t("paywall.modal.continueManual")}
              </Button>
            </>
          ) : isFreePlan ? (
            <>
              <Link href={appHref("/pricing", isApp)} className="w-full">
                <Button className="w-full" onClick={() => onOpenChange(false)}>
                  {t("paywall.modal.viewPlans")}
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onOpenChange(false)}
              >
                {t("paywall.modal.continueManual")}
              </Button>
            </>
          ) : isStarter ? (
            <>
              <Link
                href={appHref("/pricing", isApp)}
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
                {t("common.close")}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              {t("common.close")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
