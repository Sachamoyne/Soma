"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getEmailRedirectTo } from "@/lib/auth-callback";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function CheckEmailClient() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const email = searchParams.get("email") ?? "";

  const handleResend = async () => {
    if (!email) {
      setError(t("auth.missingEmailForResend"));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
        },
      });

      if (resendError) {
        throw resendError;
      }

      setSuccess(t("auth.verificationEmailResent"));
    } catch {
      setError(t("auth.verificationEmailResendError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="absolute right-6 z-20 flex items-center gap-3"
        style={{ top: "max(1.5rem, calc(env(safe-area-inset-top) + 0.5rem))" }}
      >
        <LanguageToggle variant="minimal" />
        <ThemeToggle variant="minimal" />
      </div>

      <div className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <BrandLogo size={48} iconSize={28} />
            <h1 className="text-2xl font-medium text-foreground font-serif">
              {t("auth.checkYourEmailTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("auth.checkYourEmailDescription")}
            </p>
            {email && <p className="text-xs text-muted-foreground">{email}</p>}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <div className="space-y-3">
            <Button onClick={handleResend} disabled={loading} className="h-11 w-full">
              {loading ? t("common.loading") : t("auth.resendVerificationEmail")}
            </Button>

            <Button asChild variant="outline" className="h-11 w-full">
              <Link href="/login">{t("auth.backToLogin")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
