"use client";

import { useEffect } from "react";
import { getCookieConsent } from "@/lib/cookie-consent";

const GA4_ID = "G-T93D9CKZZT";

/**
 * Composant pour charger Google Analytics 4 de manière conforme au RGPD
 * Le script n'est chargé que si l'utilisateur a donné son consentement
 */
export function GoogleAnalyticsScript() {
  useEffect(() => {
    // Initialiser dataLayer et gtag immédiatement (comme recommandé par Google)
    // Cela permet de capturer les événements même avant le chargement du script
    window.dataLayer = window.dataLayer || [];
    
    function gtag(...args: any[]) {
      window.dataLayer!.push(args);
    }
    (window as any).gtag = gtag;
    gtag("js", new Date());

    // Fonction pour charger le script Google Analytics
    const loadGoogleAnalytics = () => {
      // Vérifier si le script est déjà chargé
      const existingScript = document.querySelector(
        `script[src*="gtag/js?id=${GA4_ID}"]`
      );
      if (existingScript) {
        // Le script est déjà chargé, réactiver l'envoi de données
        gtag("config", GA4_ID, {
          send_page_view: true,
        });
        return;
      }

      // Charger le script gtag.js
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
      const firstScript = document.getElementsByTagName("script")[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        document.head.appendChild(script);
      }

      // Configurer GA4 avec l'envoi de page views activé
      gtag("config", GA4_ID, {
        send_page_view: true,
      });
    };

    // Vérifier le consentement initial
    const consent = getCookieConsent();
    
    if (consent === "accepted") {
      // Si le consentement est déjà donné, charger immédiatement
      loadGoogleAnalytics();
    }
    // Si consent === null ou "rejected", ne rien faire (respect du RGPD)
  }, []);

  // Écouter les changements de consentement
  useEffect(() => {
    const handleConsentChange = () => {
      const consent = getCookieConsent();
      if (consent === "accepted") {
        // Charger Google Analytics quand l'utilisateur accepte
        const existingScript = document.querySelector(
          `script[src*="gtag/js?id=${GA4_ID}"]`
        );
        
        if (!existingScript) {
          // Charger le script si ce n'est pas déjà fait
          const script = document.createElement("script");
          script.async = true;
          script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
          const firstScript = document.getElementsByTagName("script")[0];
          if (firstScript && firstScript.parentNode) {
            firstScript.parentNode.insertBefore(script, firstScript);
          } else {
            document.head.appendChild(script);
          }
        }

        // Configurer GA4 avec l'envoi activé
        if ((window as any).gtag) {
          (window as any).gtag("config", GA4_ID, {
            send_page_view: true,
          });
        }
      } else if (consent === "rejected") {
        // Si l'utilisateur refuse, désactiver l'envoi de données
        if ((window as any).gtag) {
          (window as any).gtag("config", GA4_ID, {
            send_page_view: false,
          });
        }
      }
    };

    window.addEventListener("cookieConsentChanged", handleConsentChange);
    window.addEventListener("storage", (e) => {
      if (e.key === "cookie-consent") {
        handleConsentChange();
      }
    });

    return () => {
      window.removeEventListener("cookieConsentChanged", handleConsentChange);
    };
  }, []);

  return null;
}
