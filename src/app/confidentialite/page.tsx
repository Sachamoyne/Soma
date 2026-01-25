"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

export default function ConfidentialitePage() {
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
              Politique de Confidentialité
            </h1>
            <p className="text-lg text-gray-600">
              Dernière mise à jour : 18 janvier 2026
            </p>
          </header>

          <div className="space-y-8 text-gray-700 leading-relaxed">
            {/* Introduction */}
            <section className="space-y-4">
              <p>
                La présente Politique de Confidentialité a pour objectif d'informer les utilisateurs de l'application SOMA (ci-après "l'Application") des moyens mis en œuvre pour collecter, consulter, traiter et conserver les données personnelles des utilisateurs.
              </p>
              <p>
                L'Éditeur, Baptiste DUVERNOIS, attache une grande importance au respect de la vie privée des utilisateurs et à la confidentialité de leurs données personnelles, conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.
              </p>
            </section>

            {/* 1. Le responsable de traitement */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                1. LE RESPONSABLE DE TRAITEMENT
              </h2>
              <p>Les données sont collectées par :</p>
              <div className="ml-4 space-y-2">
                <p><strong>Baptiste DUVERNOIS</strong> (Entrepreneur Individuel)</p>
                <p>Siège social : 103 rue Ney, 69006 Lyon, France.</p>
                <p>Email de contact DPO (Délégué à la Protection des Données) : <a href="mailto:soma.edu.app@gmail.com" className="text-blue-600 hover:underline">soma.edu.app@gmail.com</a></p>
              </div>
            </section>

            {/* 2. Quelles données collectons-nous ? */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                2. QUELLES DONNÉES COLLECTONS-NOUS ?
              </h2>
              <p>Nous ne collectons que les données strictement nécessaires au bon fonctionnement du service.</p>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                2.1. Les données que vous nous transmettez directement
              </h3>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Données d'identification</strong> : Adresse email, mot de passe (crypté).</li>
                <li><strong>Données de facturation</strong> (si offre payante) : Nom, Prénom, Adresse postale (nécessaires pour l'édition des factures légales).</li>
                <li><strong>Données d'apprentissage</strong> : Les "Decks" (paquets de cartes), les questions, les réponses et les statistiques de progression que vous créez ou générez dans l'Application.</li>
                <li><strong>Données de contact</strong> : Le contenu des emails que vous nous envoyez lors d'une demande de support.</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">
                2.2. Les données collectées automatiquement
              </h3>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Données techniques</strong> : Adresse IP, type de navigateur, langue, version de l'application.</li>
                <li><strong>Données d'activité</strong> : Logs de connexion, rapports d'erreur (crash reports) pour la maintenance.</li>
                <li><strong>Données de paiement</strong> : SOMA ne stocke jamais vos coordonnées bancaires complètes. Celles-ci sont traitées exclusivement par notre prestataire de paiement sécurisé (Stripe), qui nous renvoie uniquement un "token" de validation et les 4 derniers chiffres de la carte pour votre suivi.</li>
                <li><strong>Données relatives à la transaction et à la fraude</strong> : Lors du paiement, notre prestataire Stripe collecte des données techniques (adresse IP, informations sur l'appareil et le navigateur) via des cookies et technologies similaires pour opérer son système de détection de fraude ("Stripe Radar") et sécuriser la transaction.</li>
              </ul>
            </section>

            {/* 3. Pourquoi traitons-nous vos données ? */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                3. POURQUOI TRAITONS-NOUS VOS DONNÉES ? (Finalités)
              </h2>
              <p>Nous utilisons vos données pour les raisons suivantes :</p>
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse border border-gray-300 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Finalité</th>
                      <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Base Légale (RGPD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 px-4 py-2">Gestion du compte et accès au service</td>
                      <td className="border border-gray-300 px-4 py-2">Exécution du contrat (CGU)</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2">Gestion des paiements et facturation</td>
                      <td className="border border-gray-300 px-4 py-2">Obligation légale (Comptabilité)</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-4 py-2">Support client et assistance technique</td>
                      <td className="border border-gray-300 px-4 py-2">Exécution du contrat</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2">Envoi d'informations sur le service (mises à jour)</td>
                      <td className="border border-gray-300 px-4 py-2">Intérêt légitime</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-4 py-2">Analyses statistiques (Amélioration du service)</td>
                      <td className="border border-gray-300 px-4 py-2">Consentement (Cookies) ou Intérêt légitime (Anonymisé)</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2">Sécurité et prévention de la fraude</td>
                      <td className="border border-gray-300 px-4 py-2">Intérêt légitime</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4. Qui a accès à vos données ? */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                4. QUI A ACCÈS À VOS DONNÉES ? (Sous-traitants)
              </h2>
              <p>
                Vos données sont strictement confidentielles. Elles ne sont vendues à aucun tiers.
              </p>
              <p>
                Elles sont partagées uniquement avec nos prestataires techniques (sous-traitants) pour opérer le service :
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Hébergement & Backend</strong> : Hostinger (Europe) et Supabase.</li>
                <li>
                  <strong>Gestion des paiements</strong> : Stripe Inc. (États-Unis/Europe). Stripe agit en tant que sous-traitant pour le traitement du paiement, mais également en tant que responsable de traitement indépendant pour ses obligations légales (lutte contre le blanchiment, détection de la fraude).
                  <ul className="list-disc list-inside space-y-1 ml-6 mt-2">
                    <li><strong>Données transmises</strong> : Nom, Email, Adresse IP, Informations de carte bancaire (traitées directement par Stripe via un champ sécurisé, SOMA n'y a jamais accès).</li>
                    <li><strong>Garanties</strong> : Les transferts de données vers les États-Unis sont encadrés par le "Data Privacy Framework" auquel Stripe a adhéré.</li>
                  </ul>
                </li>
                <li><strong>Emailing transactionnel</strong> : Google / Gmail (USA).</li>
                <li><strong>Analyses</strong> : Google Analytics (USA) - Uniquement si vous avez accepté les cookies.</li>
              </ul>
              <p className="mt-4 italic text-gray-600">
                Note : Certains de ces prestataires (Google, Stripe) peuvent transférer des données hors de l'Union Européenne (notamment aux USA). Ces transferts sont encadrés par des Clauses Contractuelles Types (CCT) ou le Data Privacy Framework, garantissant un niveau de protection adéquat.
              </p>
            </section>

            {/* 5. Durée de conservation */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                5. DURÉE DE CONSERVATION
              </h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Compte actif</strong> : Vos données sont conservées tant que vous utilisez le service.</li>
                <li><strong>Inactivité</strong> : Si votre compte reste inactif pendant une durée de 3 ans, vos données personnelles seront supprimées.</li>
                <li><strong>Données de facturation</strong> : Conformément à la loi française (Code de Commerce), les factures et données de transaction sont conservées pendant 10 ans (en archivage sécurisé).</li>
                <li><strong>Cookies</strong> : La durée de vie des cookies est de 13 mois maximum.</li>
              </ul>
            </section>

            {/* 6. Sécurité des données */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                6. SÉCURITÉ DES DONNÉES
              </h2>
              <p>Nous mettons en œuvre toutes les mesures techniques pour protéger vos données :</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Utilisation du protocole HTTPS/TLS pour chiffrer les transferts.</li>
                <li>Les mots de passe sont hachés (cryptés de manière irréversible) avant stockage.</li>
                <li>L'accès à la base de données est restreint aux seules personnes habilitées (équipe technique).</li>
              </ul>
            </section>

            {/* 7. Vos droits */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                7. VOS DROITS
              </h2>
              <p>Conformément au RGPD, vous disposez des droits suivants :</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Droit d'accès et de rectification</strong> : Voir ou modifier vos infos.</li>
                <li><strong>Droit à l'effacement</strong> : Demander la suppression de votre compte.</li>
                <li><strong>Droit à la portabilité</strong> : Récupérer vos données (format JSON/CSV).</li>
                <li><strong>Droit d'opposition</strong> : Refuser certains traitements (ex: newsletter).</li>
              </ul>
              <p className="mt-4">
                Pour exercer ces droits, contactez-nous simplement à : <a href="mailto:soma.edu.app@gmail.com" className="text-blue-600 hover:underline">soma.edu.app@gmail.com</a>.
              </p>
              <p>
                Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL.
              </p>
            </section>

            {/* 8. Cookies et traceurs */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                8. COOKIES ET TRACEURS
              </h2>
              <p>Lors de votre navigation, des cookies peuvent être déposés sur votre terminal.</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Cookies techniques (Essentiels)</strong> : Nécessaires au fonctionnement (connexion, panier). Ils ne requièrent pas de consentement.</li>
                <li><strong>Cookies de mesure d'audience (Google Analytics)</strong> : Servent à analyser le trafic. Vous pouvez les accepter ou les refuser via le bandeau de cookies affiché lors de votre première visite.</li>
              </ul>
            </section>

            {/* 9. Modification de la politique */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">
                9. MODIFICATION DE LA POLITIQUE
              </h2>
              <p>
                Nous nous réservons le droit de modifier cette politique à tout moment, notamment pour nous conformer aux évolutions légales. Les utilisateurs seront informés par email des changements majeurs.
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
