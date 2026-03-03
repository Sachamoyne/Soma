import { APP_NAME } from "@/lib/brand";
import { BackButton } from "./BackButton";

export const metadata = {
  title: `${APP_NAME} - Terms of Use`,
};

export default function TermsPage() {
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
            <h1 className="text-3xl font-semibold sm:text-4xl">Terms of Use</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated: March 3, 2026</p>
          </header>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using {APP_NAME} (the &ldquo;Service&rdquo;), you agree to be bound by
              these Terms of Use. If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">2. Description of Service</h2>
            <p>
              {APP_NAME} is a study and flashcard application that uses AI to help you learn more
              effectively. The Service includes a free tier with limited functionality and paid
              subscription plans with expanded features.
            </p>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">3. Subscriptions and Billing</h2>
            <p>
              Paid features are available through a subscription. Subscription fees are charged at
              the beginning of each billing period. All prices are inclusive of applicable taxes.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Web:</strong> payments are processed by Stripe. Card details are never
                stored by {APP_NAME}.
              </li>
              <li>
                <strong>iOS:</strong> purchases are processed by Apple via the App Store. Payment
                is charged to your Apple ID account at confirmation of purchase.
              </li>
            </ul>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">4. Automatic Renewal</h2>
            <p>
              Subscriptions automatically renew at the end of each billing period unless cancelled
              at least 24 hours before the renewal date. The renewal charge will be applied to your
              payment method on file.
            </p>
            <p>
              For iOS subscriptions, renewal can be managed in your Apple ID account settings under
              Subscriptions.
            </p>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">5. Cancellation</h2>
            <p>
              You may cancel your subscription at any time. Cancellation takes effect at the end of
              the current billing period — you retain access to paid features until then. No
              partial refunds are issued for unused time within a billing period.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>iOS:</strong> cancel via iOS Settings &rarr; Apple ID &rarr; Subscriptions.
              </li>
              <li>
                <strong>Web:</strong> cancel via the billing portal in your account settings.
              </li>
            </ul>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">6. User Responsibilities</h2>
            <p>You agree not to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Use the Service for any unlawful purpose.</li>
              <li>Attempt to reverse-engineer or extract AI model outputs for redistribution.</li>
              <li>Share your account credentials with others.</li>
              <li>Abuse or circumvent usage limits.</li>
            </ul>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">7. Intellectual Property</h2>
            <p>
              All content, design, and code in {APP_NAME} are the property of the Service operator.
              Flashcard content you create remains yours. By using the Service you grant us a
              limited license to store and process your content solely to operate the Service.
            </p>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">8. Limitation of Liability</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranties of any kind. {APP_NAME}{" "}
              does not guarantee specific study outcomes or exam results. To the fullest extent
              permitted by law, our liability for any claim arising from the use of the Service is
              limited to the amount you paid in the 12 months preceding the claim.
            </p>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">9. Contact Information</h2>
            <p>For any questions regarding these Terms of Use, please contact us:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Email:{" "}
                <a
                  href="mailto:soma.edu.app@gmail.com"
                  className="underline hover:text-foreground"
                >
                  soma.edu.app@gmail.com
                </a>
              </li>
              <li>
                Website:{" "}
                <a
                  href="https://soma-edu.com"
                  className="underline hover:text-foreground"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  soma-edu.com
                </a>
              </li>
            </ul>
          </section>
        </article>
      </main>
    </div>
  );
}
