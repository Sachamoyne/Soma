"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

export default function CGUCGVPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à l'accueil
            </Link>
            <LanguageToggle variant="minimal" />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <article className="space-y-8">
          <header>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Conditions Générales d'Utilisation et de Vente
            </h1>
            <p className="text-lg text-gray-600">
              En vigueur au : 18 janvier 2026
            </p>
          </header>

          <div className="space-y-8 text-gray-700 leading-relaxed">
            {/* 1. Mentions légales */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                1. MENTIONS LÉGALES
              </h2>
              <p>
                Le service Soma est édité par l'entreprise individuelle : <strong>Baptiste DUVERNOIS</strong>
              </p>
              <div className="ml-4 space-y-2">
                <p>103 rue Ney, 69006 Lyon, France.</p>
                <p>Contact : <a href="mailto:soma.edu.app@gmail.com" className="text-blue-600 hover:underline">soma.edu.app@gmail.com</a></p>
                <p>Hébergeur : Hostinger International Ltd.</p>
              </div>
            </section>

            {/* 2. Objet du service */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                2. OBJET DU SERVICE
              </h2>
              <p>
                Soma est une application d'aide à la révision. L'application propose :
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Une <strong>Offre Gratuite</strong> (fonctionnalités limitées).</li>
                <li>Des <strong>Offres Payantes</strong> (Abonnements) donnant accès à des fonctionnalités avancées.</li>
              </ul>
              <p>
                Le détail précis des fonctionnalités par offre est disponible sur la page d'accueil de l'application.
              </p>
            </section>

            {/* 3. Prix et paiement */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                3. PRIX ET PAIEMENT
              </h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                3.1 Tarifs
              </h3>
              <p>
                Les prix sont indiqués en euros (€) toutes taxes comprises (TTC). L'Éditeur se réserve le droit de modifier ses prix à tout moment, mais le service sera facturé sur la base des tarifs en vigueur au moment de la validation de la commande.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                3.2 Modalités de paiement et Sécurité
              </h3>
              <p>
                Le paiement est exigible immédiatement à la commande.
              </p>
              <p>
                <strong>Prestataire</strong> : Les paiements sont traités par la plateforme sécurisée Stripe.
              </p>
              <p>
                <strong>Sécurité</strong> : Les transactions sont chiffrées (protocole SSL/TLS). SOMA ne stocke jamais les coordonnées bancaires complètes de l'Utilisateur. Seul un identifiant unique (token) et les 4 derniers chiffres de la carte sont conservés pour gérer l'abonnement et la facturation.
              </p>
              <p>
                <strong>Authentification forte (3D Secure)</strong> : Conformément à la réglementation européenne (DSP2), l'Utilisateur peut être redirigé vers l'application de sa banque pour valider le paiement. En cas d'échec de cette validation, la commande ne pourra pas aboutir.
              </p>
              <p>
                <strong>Incidents</strong> : L'Éditeur ne saurait être tenu responsable en cas d'usage frauduleux des moyens de paiement de l'Utilisateur par un tiers, les opérations de paiement étant gérées exclusivement par Stripe.
              </p>
            </section>

            {/* 4. Abonnement et renouvellement */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                4. ABONNEMENT ET RENOUVELLEMENT
              </h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                4.1 Durée
              </h3>
              <p>
                Les offres payantes sont souscrites sous forme d'abonnement (mensuel ou annuel selon le choix de l'Utilisateur).
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                4.2 Tacite reconduction
              </h3>
              <p>
                Sauf résiliation par l'Utilisateur, l'abonnement est reconduit tacitement et automatiquement pour une durée identique à la période initiale. Le montant sera débité automatiquement sur le moyen de paiement enregistré.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                4.3 Résiliation
              </h3>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>L'Utilisateur peut résilier son abonnement à tout moment depuis les paramètres de son compte.</li>
                <li>La résiliation prend effet à la fin de la période en cours.</li>
                <li>Tout mois (ou année) entamé est dû. Aucun remboursement au prorata n'est effectué si l'utilisateur résilie en milieu de cycle.</li>
              </ul>
            </section>

            {/* 5. Renonciation au droit de rétractation */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                5. RENONCIATION AU DROIT DE RÉTRACTATION
              </h2>
              <p>
                Conformément à l'article L.221-28 du Code de la consommation, le droit de rétractation ne peut être exercé pour les contrats de fourniture d'un contenu numérique non fourni sur un support matériel, dont l'exécution a commencé après accord préalable exprès du consommateur.
              </p>
              <p>
                En souscrivant à une offre payante SOMA, l'Utilisateur demande expressément l'accès immédiat au service avant la fin du délai de 14 jours et renonce expressément à son droit de rétractation. En conséquence, aucun remboursement ne sera accordé une fois le service activé, même si l'Utilisateur change d'avis.
              </p>
            </section>

            {/* 6. Disponibilité et responsabilité */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                6. DISPONIBILITÉ ET RESPONSABILITÉ
              </h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                6.1 Nature "MVP" (Produit Minimum Viable)
              </h3>
              <p>
                L'Utilisateur reconnaît que l'Application est une version jeune ("MVP"). Bien que fonctionnelle, elle est susceptible d'évoluer. Des interruptions temporaires pour mises à jour ou correctifs techniques peuvent survenir. L'Éditeur s'engage à faire ses meilleurs efforts pour rétablir le service rapidement.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                6.2 Limitation de responsabilité
              </h3>
              <p>
                Soma est une obligation de moyens, non de résultat. Nous fournissons les outils pour réviser, mais nous ne garantissons pas l'obtention d'un examen ou une note spécifique. La responsabilité de l'Éditeur ne saurait être engagée en cas de mauvaise utilisation du service ou de problèmes liés au réseau internet de l'Utilisateur.
              </p>
            </section>

            {/* 7. Données personnelles */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                7. DONNÉES PERSONNELLES
              </h2>
              <p>
                Les informations bancaires et personnelles sont traitées conformément au RGPD. Pour plus d'informations, consultez notre <Link href="/confidentialite" className="text-blue-600 hover:underline">Politique de Confidentialité</Link>.
              </p>
              <p>
                En cas de défaut de paiement, l'Éditeur se réserve le droit de suspendre l'accès au compte payant.
              </p>
            </section>

            {/* 8. Loi applicable */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                8. LOI APPLICABLE
              </h2>
              <p>
                Les présentes conditions sont soumises à la loi française. En cas de litige, une solution amiable sera recherchée avant tout recours judiciaire. À défaut, les tribunaux du ressort de Lyon seront compétents.
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-200">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à l'accueil
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
