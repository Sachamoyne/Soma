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
import { mapAuthError } from "@/lib/auth-errors";
import { consumePostLoginRedirect } from "@/lib/deepLinks";
import { isNativeApp, isNativeIOS } from "@/lib/native";

const playfair = Playfair_Display({ subsets: ["latin"] });

type ProfileSnapshot = {
  subscription_status: string | null;
};

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

  // Check for checkout=success in URL (user just paid)
  const checkoutSuccess = searchParams.get("checkout") === "success";
  const showAppleSignIn = isNativeApp();
  const nativeIOS = isNativeIOS();

  useEffect(() => {
    // If a valid session already exists, redirect away from /login
    let cancelled = false;

    async function checkSession() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        // Handle auth errors gracefully - don't show "loader failed"
        if (userError) {
          console.log("[LoginPage] No active session or auth error:", userError.message);
          // This is normal for users who aren't logged in - don't show error
          return;
        }

        if (!cancelled && user) {
          // Get profile - subscription_status is the SINGLE SOURCE OF TRUTH
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("subscription_status")
            .eq("id", user.id)
            .single();

          // Handle profile fetch errors gracefully
          if (profileError && profileError.code !== "PGRST116") {
            console.error("[LoginPage] Profile fetch error:", profileError);
          }

          // RULE: If profile not loaded yet, do NOTHING (no redirect during loading)
          if (!profile) {
            return;
          }

          const subscriptionStatus = (profile as any)?.subscription_status as string | null;
          console.log("[LOGIN/checkSession] subscription_status =", subscriptionStatus);

          // RULE 1: subscription_status === "active" → access to /decks (email check first)
          if (subscriptionStatus === "active") {
            // Paid users must also confirm their email
            if (!user.email_confirmed_at) {
              setError(t("auth.confirmEmailFirstWithSpam"));
              return;
            }
            const redirectPath = consumePostLoginRedirect() ?? "/decks";
            router.refresh();
            router.replace(redirectPath);
            return;
          }

          // RULE 2: subscription_status === "pending_payment" → /pricing (user must click to pay)
          if (subscriptionStatus === "pending_payment") {
            router.refresh();
            router.replace(nativeIOS ? "/decks" : "/pricing");
            return;
          }

          // RULE 3: Free user (subscription_status is null or "free") → email required
          if (!user.email_confirmed_at) {
            await supabase.auth.signOut();
            setError(t("auth.confirmEmailFirst"));
            return;
          }

          // Free user with confirmed email → access to /decks
          const redirectPath = consumePostLoginRedirect() ?? "/decks";
          router.refresh();
          router.replace(redirectPath);
        }
      } catch (error) {
        // Catch all errors - don't let them bubble up as "loader failed"
        console.error("[LoginPage] Failed to check existing session:", error);
        // Don't set error for session check failures - just let user try to log in
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [nativeIOS, router, supabase, t]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log("[LoginPage] Starting Google OAuth sign in...");

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (oauthError) {
        console.error("[LoginPage] Google OAuth error:", oauthError);
        const authError = mapAuthError(oauthError, "signin");
        setError(authError.message);
        setLoading(false);
        return;
      }

      console.log("[LoginPage] Google OAuth initiated successfully:", data);
    } catch (err) {
      console.error("[LoginPage] Unexpected error during Google sign in:", err);
      const authError = mapAuthError(err, "signin");
      setError(authError.message || t("auth.googleSignInError"));
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (oauthError) {
        const authError = mapAuthError(oauthError, "signin");
        setError(authError.message);
        setLoading(false);
        return;
      }
    } catch (err) {
      const authError = mapAuthError(err, "signin");
      setError(authError.message || t("auth.unexpectedError"));
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // SIGN IN only (existing accounts)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // Handle specific Supabase auth errors with clear messages
      if (signInError) {
        console.log("[LoginPage] Sign in error:", signInError.message, signInError.status);

        // Check for specific error types
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

        // Generic auth error handling
        const authError = mapAuthError(signInError, "signin");
        setError(authError.message);
        return;
      }

      const user = signInData.user;
      if (!user) {
        setError(t("auth.noAccountFound"));
        return;
      }

      // CRITICAL: Wait for session to be fully persisted in cookies
      // This prevents "loader failed" errors on first login after email confirmation
      // Retry loop to ensure session is ready
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

      // Small additional delay to ensure cookies are persisted
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get profile - subscription_status is the SINGLE SOURCE OF TRUTH
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", user.id)
        .single();

      // Handle profile fetch error gracefully
      if (profileError && profileError.code !== "PGRST116") {
        console.error("[LoginPage] Profile fetch error:", profileError);
      }

      // RULE: If profile not loaded yet, show error (don't redirect during loading)
      if (!profile) {
        setError(t("auth.profileCreating"));
        return;
      }

      const subscriptionStatus = (profile as any)?.subscription_status as string | null;
      console.log("[LOGIN/handleSubmit] subscription_status =", subscriptionStatus);

      // RULE 1: subscription_status === "active" → access to /decks (email check first)
      if (subscriptionStatus === "active") {
        // Paid users must also confirm their email
        if (!user.email_confirmed_at) {
          setError(t("auth.confirmEmailFirstWithSpam"));
          return;
        }
        const redirectPath = consumePostLoginRedirect() ?? "/decks";
        router.refresh();
        router.push(redirectPath);
        return;
      }

      // RULE 2: subscription_status === "pending_payment" → /pricing (user must click to pay)
      if (subscriptionStatus === "pending_payment") {
        router.refresh();
        router.push(nativeIOS ? "/decks" : "/pricing");
        return;
      }

      // RULE 3: Free user (subscription_status is null or "free") → email required
      if (!user.email_confirmed_at) {
        await supabase.auth.signOut();
        setError(t("auth.confirmEmailFirst"));
        return;
      }

      // Free user with confirmed email → access to /decks
      const redirectPath = consumePostLoginRedirect() ?? "/decks";
      router.refresh();
      router.push(redirectPath);
    } catch (err) {
      // Catch all unexpected errors
      console.error("[LoginPage] Unexpected error during login:", err);
      const authError = mapAuthError(err, "signin");
      setError(authError.message || t("auth.unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Language and theme toggle in top right */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
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
                placeholder="you@example.com"
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
                  placeholder="••••••••"
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

            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              className="w-full h-11"
              disabled={loading}
            >
              <svg
                className="mr-2 h-4 w-4"
                aria-hidden="true"
                focusable="false"
                data-prefix="fab"
                data-icon="google"
                role="img"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 488 512"
              >
                <path
                  fill="#4285F4"
                  d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                ></path>
              </svg>
              {t("auth.continueWithGoogle")}
            </Button>

            {showAppleSignIn && (
              <Button
                type="button"
                variant="outline"
                onClick={handleAppleSignIn}
                className="w-full h-11"
                disabled={loading}
              >
                Continue with Apple
              </Button>
            )}

            <div className="text-center text-sm text-muted-foreground">
              {t("auth.newToSoma")}{" "}
              <Link
                href={nativeIOS ? "/signup?plan=free" : "/signup"}
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
                Politique de Confidentialité
              </Link>
              {" "}et nos{" "}
              <Link
                href="/cgu-cgv"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                CGU/CGV
              </Link>
              .
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
