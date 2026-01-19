"use client";

import { AppSidebar } from "@/components/shell/AppSidebar";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";
import { usePathname } from "next/navigation";

export default function AppShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isStudyPage = pathname?.startsWith("/study");

  if (isStudyPage) {
    return (
      <div className="app-shell flex h-screen w-screen overflow-hidden bg-gradient-to-b from-background via-background to-muted/40 text-foreground">
        {children}
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppShellLayout>{children}</AppShellLayout>
    </SidebarProvider>
  );
}

function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { isOpen, close } = useSidebar();

  return (
    <div className="app-shell relative flex h-screen w-screen max-w-full overflow-hidden bg-gradient-to-b from-background via-background to-muted/40 text-foreground">
      <AppSidebar />
      {/* Mobile overlay to close the sidebar */}
      {isOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          aria-label="Close sidebar"
          onClick={close}
        />
      )}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {children}
      </div>
    </div>
  );
}
