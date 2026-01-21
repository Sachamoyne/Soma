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
 * Single entry point: /signup?plan=free|starter|pro
 *
 * FREE:
 * - onboarding_status = active
 * - email confirmation REQUIRED
 * - no Stripe
 *
 * PAID (starter / pro):
 * - onboarding_status = pending_payment
 * - immediate Stripe checkout
 * - email confirmation NON-blocking
 */
export default function SignupClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const planParam = searchParams.get("plan");
  const plan =
    planParam === "free" || planParam === "starter" || planParam === "pro"
      ? planParam
      : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Guard: signup must always have a valid plan
  useEffect(() => {
    if (!plan) {
      router.replace("/pricing");
      router.refresh();
    }
  }, [plan, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!acceptedTerms) {
        setError("Vous devez accepter la politique de confidentialité et les CGU/CGV.");
        return;
      }

      // --------------------
      // FREE PLAN
      // --------------------
      if (plan === "free") {
        const { data, error: signUpError } = await supabase.auth.signUp({
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
          throw signUpError;
        }

        const user = data.user;
        if (!user) {
          throw new Error("User not created");
        }

        setSuccess("Compte créé. Vérifiez votre email puis connectez-vous.");
        router.replace("/login");
        router.refresh();
        return;
      }

      // --------------------
      // PAID PLANS (starter / pro)
      // --------------------
      const { data, error: signUpError } = await supabase.auth.signUp({
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

      if (signUpError) {
        throw signUpError;
      }

      const user = data.user;
      if (!user) {
        throw new Error("User not created");
      }

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("NEXT_PUBLIC_BACKEND_URL not configured");
      }

      const res = await fetch(`${backendUrl}/stripe/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, userId: user.id }),
      });

      const payload = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !payload.url) {
        throw new Error(payload.error || "Stripe checkout failed");
      }

      window.location.href = payload.url;
    } catch (err: any) {
      const mapped = mapAuthError(err, "signup");
      setError(mapped.message || "Erreur lors de la création du compte.");
    } finally {
      setLoading(false);
    }
  };

  if (!plan) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative isolate min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[4px]" />

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
              <div>
                <label className="text-xs uppercase tracking-[0.25em] text-white/60">
                  {t("auth.email")}
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-[0.25em] text-white/60">
                  {t("auth.password")}
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200">
                  {success}
                </div>
              )}

              <div className="flex items-start gap-3 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  required
                />
                <span>
                  J'accepte la{" "}
                  <Link href="/confidentialite" className="underline">
                    Politique de Confidentialité
                  </Link>{" "}
                  et les{" "}
                  <Link href="/cgu-cgv" className="underline">
                    CGU/CGV
                  </Link>{" "}
                  de {APP_NAME}.
                </span>
              </div>

              <Button type="submit" disabled={loading || !acceptedTerms} className="w-full">
                {loading ? t("common.loading") : t("auth.createAccount")}
              </Button>

              <div className="text-center text-xs text-white/60">
                <Link href="/pricing">Retour aux plans</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
