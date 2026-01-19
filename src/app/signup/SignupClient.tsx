"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Alias route to satisfy onboarding flows that expect /signup.
 * Reuses the existing combined /login page (signin/signup) without changing backend logic.
 */
export default function SignupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const plan = searchParams.get("plan");
    const next = searchParams.get("next");
    const qs = new URLSearchParams();
    qs.set("mode", "signup");
    if (plan) qs.set("plan", plan);
    if (next) qs.set("next", next);
    router.replace(`/login?${qs.toString()}`);
  }, [router, searchParams]);

  return null;
}
