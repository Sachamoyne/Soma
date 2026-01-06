"use client";

import { AppSidebar } from "@/components/shell/AppSidebar";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { usePathname } from "next/navigation";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isStudyPage = pathname?.startsWith("/study");

  // Full-screen mode for study pages (no sidebar)
  if (isStudyPage) {
    return (
      <div className="flex h-screen w-screen overflow-hidden">
        {children}
      </div>
    );
  }

  // Normal layout with sidebar for other pages
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}

