"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAppRouter } from "@/hooks/useAppRouter";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { Playfair_Display } from "next/font/google";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { isNativeIOS } from "@/lib/native";


const playfair = Playfair_Display({ subsets: ["latin"] });

const DECKS_PATH = "/decks";

export default function LoginClient() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Check for checkout=success in URL (user just paid).
  const checkoutSuccess = searchParams.get("checkout") === "success";
  const nativeIOS = isNativeIOS();

  useEffect(() => {
    // If a valid session already exists, redirect away from /login.
    // Access control is handled by (app)/layout.tsx — no need to duplicate here.
    let cancelled = false;

    async function checkSession() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          console.log("[LoginPage] No active session:", userError.message);
          return;
        }

        if (!cancelled && user) {
          router.replace(DECKS_PATH);
        }
      } catch (error) {
        console.error("[LoginPage] Failed to check existing session:", error);
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.log("[LoginPage] Sign in error:", signInError.message, signInError.status);

        if (signInError.message?.includes("Email not confirmed") ||
            signInError.message?.includes("email_not_confirmed")) {
          setError(t("auth.confirmEmailFirstWithSpam"));
          return;
        }

        if (signInError.message?.includes("Invalid login credentials") ||
            signInError.status === 400) {
          setError(t("auth.invalidCredentials"));
          return;
        }

        setError(t("auth.unexpectedError"));
        return;
      }

      const user = signInData.user;
      if (!user) {
        setError(t("auth.noAccountFound"));
        return;
      }

      // Wait for session to be fully persisted in cookies
      let sessionReady = false;
      for (let i = 0; i < 5; i++) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          sessionReady = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (!sessionReady) {
        console.warn("[LoginPage] Session not ready after retries, proceeding anyway");
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", user.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        console.error("[LoginPage] Profile fetch error:", profileError);
      }

      if (!profile) {
        setError(t("auth.profileCreating"));
        return;
      }

      const subscriptionStatus = (profile as any)?.subscription_status as string | null;
      console.log("[LOGIN/handleSubmit] subscription_status =", subscriptionStatus);

      if (!user.email_confirmed_at) {
        await supabase.auth.signOut();
        setError(t("auth.confirmEmailFirst"));
        return;
      }

      router.refresh();
      router.push(DECKS_PATH);
    } catch (err) {
      console.error("[LoginPage] Unexpected error during login:", err);
      setError(t("auth.unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Language and theme toggle in top right */}
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
            <BrandLogo size={104} />
            <div>
              <h1 className={`${playfair.className} text-2xl font-medium text-foreground`}>
                {t("auth.signIn", { appName: APP_NAME })}
              </h1>
            </div>
          </div>

          {/* Success message after Stripe checkout */}
          {checkoutSuccess && !nativeIOS && (
            <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">{t("auth.paymentConfirmed")}</p>
                  <p className="mt-1 text-xs text-green-700">
                    {t("auth.subscriptionActiveSignIn", { appName: APP_NAME })}
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                {t("auth.email")}
              </label>
              <Input
                id="email"
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
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                {t("auth.password")}
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {success && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-700">{success}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11"
              disabled={loading}
            >
              {loading ? t("common.loading") : t("auth.continue")}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              {t("auth.newToSoma")}{" "}
              <Link
                href="/signup"
                className="text-foreground underline hover:text-foreground/80 transition-colors"
              >
                {t("auth.createAccount")}
              </Link>
            </div>

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              {t("auth.byCreatingAccount")}{" "}
              <Link
                href="/confidentialite"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                {t("auth.privacyPolicy")}
              </Link>
              {" "}{t("auth.andOur")}{" "}
              <Link
                href="/cgu-cgv"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                {t("auth.termsOfService")}
              </Link>
              .
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
