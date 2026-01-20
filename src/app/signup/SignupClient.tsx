"use client";

import { useEffect, useMemo, useState } from "react";
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
import { mapAuthError } from "@/lib/auth-errors";

/**
 * Single entrypoint: /signup?plan=free|starter|pro
 * FREE: profile created client-side, email confirmation required
 * PAID: profile created by Stripe webhook (service role), immediate checkout redirect
 */
export default function SignupClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const planParam = searchParams.get("plan");
  const plan = planParam === "free" || planParam === "starter" || planParam === "pro" ? planParam : null;

  useEffect(() => {
    if (!plan) {
      router.replace("/pricing");
      router.refresh();
    }
  }, [plan, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!plan) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!acceptedTerms) {
        setError("Vous devez accepter la politique de confidentialité et les CGU/CGV pour créer un compte.");
        return;
      }

      if (plan === "free") {
        // FREE: create user + profile client-side, email confirmation required
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: {
              plan_name: "free",
              onboarding_status: "active",
            },
          },
        });

        if (signUpError) {
          const authError = mapAuthError(signUpError, "signup");
          setError(authError.message);
          return;
        }

        const user = signUpData.user;
        if (!user) {
          setError("Impossible de créer le compte. Veuillez réessayer.");
          return;
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              email: user.email || email,
              role: "user",
              plan: "free",
              plan_name: "free",
              onboarding_status: "active",
              subscription_status: "active",
            },
            { onConflict: "id", ignoreDuplicates: false }
          );

        if (profileError) {
          console.error("[signup] Failed to upsert free profile:", profileError);
          setError("Erreur lors de la création du profil. Veuillez réessayer.");
          return;
        }

        setSuccess("Compte créé. Vérifiez votre email puis connectez-vous.");
        router.replace("/login");
        router.refresh();
        return;
      }

      // PAID (starter/pro): create user, then redirect to Stripe checkout
      // Profile will be created/updated by Stripe webhook (service role) after payment
      const { data: signUpPaid, error: signUpPaidError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            plan_name: plan,
            onboarding_status: "pending_payment",
          },
        },
      });

      if (signUpPaidError) {
        const authError = mapAuthError(signUpPaidError, "signup");
        setError(authError.message);
        return;
      }

      const paidUser = signUpPaid.user;
      if (!paidUser) {
        setError("Impossible de créer le compte. Veuillez réessayer.");
        return;
      }

      // Redirect to Stripe checkout immediately (no client-side profile upsert)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        setError("Configuration backend manquante. Veuillez réessayer plus tard.");
        return;
      }

      setRedirecting(true);

      const checkoutResponse = await fetch(`${backendUrl}/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, userId: paidUser.id }),
      });

      const checkoutData = (await checkoutResponse.json()) as { url?: string; error?: string };
      if (!checkoutResponse.ok || !checkoutData.url) {
        setRedirecting(false);
        throw new Error(checkoutData.error || `Checkout failed (HTTP ${checkoutResponse.status})`);
      }

      window.location.href = checkoutData.url;
    } catch (err) {
      setRedirecting(false);
      const authError = mapAuthError(err, "signup");
      setError(authError.message || "Erreur lors de la création du compte.");
    } finally {
      setLoading(false);
    }
  };

  if (!plan) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative isolate min-h-screen overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000'><defs><linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23030812'/><stop offset='100%' stop-color='%230a1224'/></linearGradient><radialGradient id='vignette' cx='50%' cy='50%' r='70%'><stop offset='0%' stop-color='%23030812' stop-opacity='0'/><stop offset='70%' stop-color='%23030812' stop-opacity='0.35'/><stop offset='100%' stop-color='%23030812' stop-opacity='0.7'/></radialGradient></defs><rect width='1600' height='1000' fill='url(%23bg)'/><rect width='1600' height='1000' fill='url(%23vignette)'/></svg>\")",
          }}
        />
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[4px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/50 to-slate-950/80" />

        <div className="absolute top-6 right-6 z-20">
          <LanguageToggle variant="minimal" />
        </div>

        <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <BrandLogo size={48} iconSize={28} />
              <div>
                <h1 className="text-2xl font-semibold text-white font-serif">
                  Create your account
                </h1>
                <p className="mt-2 text-xs text-white/60">
                  Plan : <span className="text-white/80 font-medium">{plan}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <label htmlFor="email" className="text-xs uppercase tracking-[0.25em] text-white/60">
                  {t("auth.email")}
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading || redirecting}
                  className="h-11 border-white/15 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/40"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-xs uppercase tracking-[0.25em] text-white/60">
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
                    disabled={loading || redirecting}
                    minLength={6}
                    className="h-11 border-white/15 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/40 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                    disabled={loading || redirecting}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-3">
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}

              {success && (
                <div className="rounded-2xl border border-green-500/50 bg-green-500/10 p-3">
                  <p className="text-sm text-green-200">{success}</p>
                </div>
              )}

              {redirecting && (
                <div className="rounded-2xl border border-blue-500/50 bg-blue-500/10 p-3">
                  <p className="text-sm text-blue-200">Redirection vers le paiement...</p>
                </div>
              )}

              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                <input
                  type="checkbox"
                  id="acceptTerms"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/10 text-primary focus:ring-2 focus:ring-white/40 cursor-pointer"
                  required
                />
                <label htmlFor="acceptTerms" className="text-xs text-white/80 leading-relaxed cursor-pointer flex-1">
                  J&apos;accepte la{" "}
                  <Link
                    href="/confidentialite"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-white transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Politique de Confidentialité
                  </Link>
                  {" "}et les{" "}
                  <Link
                    href="/cgu-cgv"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-white transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    CGU/CGV
                  </Link>
                  {" "}de {APP_NAME}.
                </label>
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold bg-white text-slate-900 hover:bg-white/90"
                disabled={loading || !acceptedTerms || redirecting}
              >
                {redirecting
                  ? "Redirection..."
                  : loading
                    ? t("common.loading")
                    : t("auth.createAccount")}
              </Button>

              <div className="text-center text-xs text-white/60">
                <Link href="/pricing" className="transition hover:text-white">
                  Retour aux plans
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
