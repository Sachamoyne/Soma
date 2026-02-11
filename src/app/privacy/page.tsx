import { APP_NAME } from "@/lib/brand";
import { BackButton } from "./BackButton";

export const metadata = {
  title: `${APP_NAME} - Privacy Policy`,
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto max-w-4xl px-6 py-4">
          <BackButton />
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <article className="space-y-8">
          <header>
            <h1 className="text-3xl font-semibold sm:text-4xl">Privacy Policy</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated: February 10, 2026</p>
          </header>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">1. Data controller</h2>
            <p>
              This service is operated under the app name <strong>{APP_NAME}</strong>.
            </p>
            <p>
              Contact email for privacy requests:{" "}
              <a href="mailto:soma.edu.app@gmail.com" className="underline hover:text-foreground">
                soma.edu.app@gmail.com
              </a>
            </p>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">2. Data we collect</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Email address (account authentication).</li>
              <li>User identifier (account and service operation).</li>
              <li>Basic usage data (when analytics are enabled in the product).</li>
              <li>
                Payment data: payment processing is handled by Stripe. Full card details are not
                stored by {APP_NAME}.
              </li>
            </ul>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">3. Third-party processors</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Supabase (authentication and database).</li>
              <li>Stripe (billing and payment processing).</li>
              <li>Vercel Analytics (basic product usage analytics).</li>
              <li>Google Analytics / Google Tag Manager on web only, subject to consent.</li>
            </ul>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">4. Why we process data</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Account creation and account management.</li>
              <li>Core service operation.</li>
              <li>Billing and invoicing.</li>
              <li>Product improvement.</li>
            </ul>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">5. GDPR legal basis</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Performance of a contract.</li>
              <li>Legitimate interests.</li>
            </ul>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">6. Your rights</h2>
            <p>
              You can request access, rectification, or deletion of your personal data by contacting{" "}
              <a href="mailto:soma.edu.app@gmail.com" className="underline hover:text-foreground">
                soma.edu.app@gmail.com
              </a>
              .
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
