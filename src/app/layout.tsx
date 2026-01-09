import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "@/styles/globals.css";
import { APP_NAME, APP_TAGLINE, APP_DESCRIPTION } from "@/lib/brand";

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
    <html lang="fr">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
