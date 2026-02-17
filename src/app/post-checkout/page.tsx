"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PostCheckoutPage() {
  const router = useRouter();
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  useEffect(() => {
    const isSuccess =
      new URLSearchParams(window.location.search).get("checkout") === "success";

    setCheckoutSuccess(isSuccess);

    const timer = window.setTimeout(() => {
      router.replace(isSuccess ? "/login?checkout=success" : "/login");
    }, 1500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-xl">
        <h1 className="text-2xl font-semibold text-white">Finalisation de votre abonnement</h1>
        <p className="mt-3 text-sm text-white/70">
          Nous finalisons votre acces. Redirection vers la connexion...
        </p>
        <p className="mt-6 text-xs text-white/50">
          Si la redirection ne se lance pas, cliquez sur{" "}
          <Link
            href={checkoutSuccess ? "/login?checkout=success" : "/login"}
            className="underline hover:text-white"
          >
            Continuer
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
