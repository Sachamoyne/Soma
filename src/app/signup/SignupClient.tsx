"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { isNativeIOS } from "@/lib/native";
import { getEmailRedirectTo } from "@/lib/auth-callback";

/**
 * Single entry point: /signup?intent=starter|pro
 *
 * Signup always creates a FREE account.
 * Intent is only used for post-signup redirect to login.
 */
export default function SignupClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const nativeIOS = isNativeIOS();

  const intentParam = searchParams.get("intent");
  const intent =
    !nativeIOS && (intentParam === "starter" || intentParam === "pro")
      ? intentParam
      : null;
  const planParam = searchParams.get("plan");
  const displayPlan = intent ?? (planParam === "free" ? "free" : null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!acceptedTerms) {
        setError(t("auth.acceptTermsError"));
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      const user = data.user;
      if (!user) {
        throw new Error("User not created");
      }

      const loginRedirect = intent ? `/login?intent=${intent}` : "/login";
      setSuccess(t("auth.accountCreatedCheckEmail"));
      router.replace(loginRedirect);
      router.refresh();
    } catch (err) {
      setError(t("auth.accountCreationError"));
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
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center gap-4 text-center">
            <BrandLogo size={48} iconSize={28} />
            <div>
              <h1 className="text-2xl font-medium text-foreground font-serif">
                {t("auth.createYourAccount")}
              </h1>
              {!nativeIOS && displayPlan && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("auth.planLabel")} : <span className="text-foreground font-medium">{t(`pricing.${displayPlan}`)}</span>
                </p>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t("auth.email")}
              </label>
              <Input
                type="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {t("auth.password")}
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={loading}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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

            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
                className="mt-0.5"
              />
              <span>
                {t("auth.acceptTermsPrefix")}{" "}
                <Link href="/confidentialite" className="underline hover:text-foreground">
                  {t("auth.privacyPolicy")}
                </Link>{" "}
                {t("auth.andTermsConnector")}{" "}
                <Link href="/cgu-cgv" className="underline hover:text-foreground">
                  {t("auth.termsOfService")}
                </Link>{" "}
                {t("auth.ofApp", { appName: APP_NAME })}
              </span>
            </div>

            <Button type="submit" disabled={loading || !acceptedTerms} className="w-full h-11">
              {loading ? t("common.loading") : t("auth.createAccount")}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="hover:text-foreground transition-colors"
              >
                {t("auth.signIn", { appName: APP_NAME })}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
