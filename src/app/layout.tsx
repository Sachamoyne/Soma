import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "@/styles/globals.css";
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from "@/lib/brand";
import { LanguageProvider } from "@/i18n";
import { GoogleTagManagerNoscript } from "@/components/GoogleTagManagerNoscript";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${APP_NAME} - ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Tag Manager sera chargé conditionnellement via le composant CookieConsent */}
      </head>
      <body className={geist.className}>
        <GoogleTagManagerNoscript />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
