"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function NativeCallbackBridge() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDescription, setErrorDescription] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCode(params.get("code"));
    setError(params.get("error"));
    setErrorDescription(params.get("error_description"));
    setReady(true);
  }, []);

  const deepLink = code
    ? `soma://auth/callback?code=${encodeURIComponent(code)}`
    : null;

  useEffect(() => {
    if (!deepLink) return;
    window.location.href = deepLink;
    setAttempted(true);
  }, [deepLink]);

  if (!ready) {
    return null;
  }

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
