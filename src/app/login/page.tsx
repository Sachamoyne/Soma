"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { BrandLogo } from "@/components/BrandLogo";
import { Playfair_Display } from "next/font/google";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

const playfair = Playfair_Display({ subsets: ["latin"] });

/**
 * Ensures a profile exists for the user (idempotent).
 * Uses UPSERT to avoid errors if profile already exists.
 * Does NOT block authentication if profile creation fails.
 */
async function ensureProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  userEmail: string | undefined
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: userEmail || "",
          role: "user",
          plan: "free",
        },
        {
          onConflict: "id",
          ignoreDuplicates: false,
        }
      );
  } catch (error) {
    // Log but don't throw - authentication should not fail due to profile creation
    console.error("[LoginPage] Failed to ensure profile:", error);
  }
}

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // If a valid session already exists, redirect away from /login
    // to the main authenticated dashboard.
    let cancelled = false;

    async function checkSession() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!cancelled && user) {
          // After login, main entry point is the deck list
          router.replace("/decks");
          router.refresh();
        }
      } catch (error) {
        console.error("[LoginPage] Failed to check existing session", error);
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "signin") {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // Ensure profile exists (idempotent - won't fail if already exists)
        const user = signInData.user;
        if (user) {
          await ensureProfile(supabase, user.id, user.email);
        }

        router.push("/decks");
        router.refresh();
      } else {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
        });
        
        if (error) throw error;
        
        // Login immédiatement
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });
        
        if (signInError) throw signInError;
        
        const user = signInData.user;
        if (!user) throw new Error("User not found after signup");
        
        // Ensure profile exists (idempotent - won't fail if already exists)
        await ensureProfile(supabase, user.id, user.email);
        
        router.push("/decks");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || t("auth.errorOccurred"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative isolate min-h-screen overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000'><defs><linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23030812'/><stop offset='100%' stop-color='%230a1224'/></linearGradient><radialGradient id='vignette' cx='50%' cy='50%' r='70%'><stop offset='0%' stop-color='%23030812' stop-opacity='0'/><stop offset='70%' stop-color='%23030812' stop-opacity='0.35'/><stop offset='100%' stop-color='%23030812' stop-opacity='0.7'/></radialGradient><radialGradient id='somaCore' cx='48%' cy='52%' r='30%'><stop offset='0%' stop-color='%23f8fafc' stop-opacity='0.7'/><stop offset='45%' stop-color='%23c7d2fe' stop-opacity='0.5'/><stop offset='100%' stop-color='%2393c5fd' stop-opacity='0.12'/></radialGradient><radialGradient id='somaGlow' cx='48%' cy='52%' r='55%'><stop offset='0%' stop-color='%23438bff' stop-opacity='0.25'/><stop offset='70%' stop-color='%230a1224' stop-opacity='0.06'/><stop offset='100%' stop-color='%230a1224' stop-opacity='0'/></radialGradient><filter id='blurDeep' x='-80%' y='-80%' width='260%' height='260%'><feGaussianBlur stdDeviation='20'/></filter><filter id='glow' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='14' result='b'/><feMerge><feMergeNode in='b'/><feMergeNode in='SourceGraphic'/></feMerge></filter></defs><rect width='1600' height='1000' fill='url(%23bg)'/><rect width='1600' height='1000' fill='url(%23somaGlow)'/><g filter='url(%23blurDeep)' stroke='%2383b2ff' stroke-opacity='0.25' stroke-width='2.1' fill='none'><path d='M700 520 C560 420, 420 340, 240 300'/><path d='M840 520 C980 420, 1160 380, 1360 340'/><path d='M760 600 C840 720, 980 820, 1180 900'/></g><g stroke='%2393c5fd' stroke-opacity='0.45' stroke-width='2.2' fill='none'><path d='M730 520 C620 420, 520 340, 380 300'/><path d='M780 500 C720 380, 720 260, 780 160'/><path d='M830 520 C960 440, 1080 400, 1220 360'/><path d='M780 560 C860 680, 980 760, 1120 820'/></g><g fill='%23f8fafc' fill-opacity='0.6'><circle cx='760' cy='520' r='72' fill='url(%23somaCore)' filter='url(%23glow)'/><circle cx='380' cy='300' r='10'/><circle cx='780' cy='160' r='9'/><circle cx='1220' cy='360' r='10'/><circle cx='1120' cy='820' r='9'/></g><rect width='1600' height='1000' fill='url(%23vignette)'/></svg>\")",
          }}
        />
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[4px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-slate-950/50 to-slate-950/80" />

        {/* Language toggle in top right */}
        <div className="absolute top-6 right-6 z-20">
          <LanguageToggle variant="minimal" />
        </div>

        <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <BrandLogo size={48} iconSize={28} />
              <div>
                <h1 className={`${playfair.className} text-2xl font-semibold text-white`}>
                  {t("auth.signIn", { appName: APP_NAME })}
                </h1>
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
                  disabled={loading}
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
                    disabled={loading}
                    minLength={6}
                    className="h-11 border-white/15 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/40 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
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
                <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                  <p className="text-sm text-white/80">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 text-sm font-semibold bg-white text-slate-900 hover:bg-white/90"
                disabled={loading}
              >
                {loading ? t("common.loading") : mode === "signin" ? t("auth.continue") : t("auth.createAccount")}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11 font-semibold bg-white text-slate-900 border border-white/80 shadow-sm hover:bg-white/90"
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

              <div className="text-center text-xs text-white/60">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                  }}
                  className="transition hover:text-white"
                  disabled={loading}
                >
                  {mode === "signin" ? t("auth.needAccount") : t("auth.haveAccount")}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
