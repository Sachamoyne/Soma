"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function NativeCallbackBridge() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const [attempted, setAttempted] = useState(false);

  const deepLink = code
    ? `soma://auth/callback?code=${encodeURIComponent(code)}`
    : null;

  useEffect(() => {
    if (!deepLink) return;
    // Auto-redirect to the native app via custom scheme
    window.location.href = deepLink;
    setAttempted(true);
  }, [deepLink]);

  if (error) {
    return (
      <div style={{ fontFamily: "system-ui", textAlign: "center", padding: "60px 24px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Erreur de connexion</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>
          {errorDescription || error}
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "12px 32px",
            background: "#000",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 16,
          }}
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  if (!code) {
    return (
      <div style={{ fontFamily: "system-ui", textAlign: "center", padding: "60px 24px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Lien invalide</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>Aucun code d&apos;authentification trouvé.</p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "12px 32px",
            background: "#000",
            color: "#fff",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 16,
          }}
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui", textAlign: "center", padding: "60px 24px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Connexion réussie</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        {attempted
          ? "Si l\u2019app ne s\u2019est pas ouverte, appuie sur le bouton ci-dessous."
          : "Redirection vers Soma..."}
      </p>
      <a
        href={deepLink!}
        style={{
          display: "inline-block",
          padding: "14px 36px",
          background: "#000",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        Ouvrir Soma
      </a>
    </div>
  );
}
