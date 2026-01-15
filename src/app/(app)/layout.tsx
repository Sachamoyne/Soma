import AppShellClient from "./AppShellClient";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Simple server-side auth guard for all routes under (app)
  // - If no authenticated user: redirect to /login
  // - If authenticated: render the authenticated app shell
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AppShellClient>{children}</AppShellClient>;
}
