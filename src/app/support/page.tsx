import { APP_NAME } from "@/lib/brand";
import { BackButton } from "@/app/privacy/BackButton";

export const metadata = {
  title: `${APP_NAME} - Support`,
};

export default function SupportPage() {
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
            <h1 className="text-3xl font-semibold sm:text-4xl">Support</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              If you need help with {APP_NAME}, we&rsquo;re here to assist you.
            </p>
          </header>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">Contact Us</h2>
            <p>
              For any questions regarding your account, subscriptions, or technical issues,
              please contact us at:
            </p>
            <p>
              <a
                href="mailto:soma.edu.app@gmail.com"
                className="underline hover:text-foreground"
              >
                soma.edu.app@gmail.com
              </a>
            </p>
            <p>We typically respond within 48 hours.</p>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">Common Issues</h2>
            <ul className="list-disc space-y-3 pl-5">
              <li>
                <strong className="text-foreground">Subscription issues</strong>
                <br />
                If your subscription does not appear active, try using the &ldquo;Restore
                Purchases&rdquo; button in the app settings.
              </li>
              <li>
                <strong className="text-foreground">Billing questions</strong>
                <br />
                All subscriptions are managed by Apple. You can manage or cancel your
                subscription in your Apple ID settings.
              </li>
              <li>
                <strong className="text-foreground">Account deletion</strong>
                <br />
                You can request account deletion directly from the Settings page inside
                the app.
              </li>
            </ul>
          </section>

          <section className="space-y-3 text-sm leading-6 text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">Technical Information</h2>
            <p>
              If you are reporting a technical issue, please include your device model and
              iOS version in your message.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
