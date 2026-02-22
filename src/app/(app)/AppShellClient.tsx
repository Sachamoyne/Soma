"use client";

import { useEffect, useRef } from "react";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { MobileBottomNav } from "@/components/shell/MobileBottomNav";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";
import { usePathname } from "next/navigation";
import { useIsNative } from "@/hooks/useIsNative";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useRevenueCat } from "@/hooks/useRevenueCat";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { OfflineFallback } from "@/components/OfflineFallback";

export default function AppShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isNative = useIsNative();
  const { online } = useNetworkStatus();
  const wasOfflineRef = useRef(false);
  const isStudyPage = pathname?.startsWith("/study");

  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
      return;
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      window.location.reload();
    }
  }, [online]);

  if (!online) {
    return <OfflineFallback onRetry={() => window.location.reload()} />;
  }

  // Study pages: full-screen, no chrome at all
  if (isStudyPage) {
    return (
      <div className="app-shell flex h-screen w-screen overflow-hidden bg-background text-foreground">
        {children}
      </div>
    );
  }

  // Native app (Capacitor): bottom tab bar instead of sidebar
  if (isNative) {
    return (
      <SidebarProvider>
        <NativeAppLayout>{children}</NativeAppLayout>
      </SidebarProvider>
    );
  }

  // Web: sidebar (unchanged)
  return (
    <SidebarProvider>
      <AppShellLayout>{children}</AppShellLayout>
    </SidebarProvider>
  );
}

/** Native layout: no sidebar, bottom tab bar, content padded above the bar. */
function NativeAppLayout({ children }: { children: React.ReactNode }) {
  // Register for iOS push notifications (no-op if permission denied or on web)
  usePushNotifications();
  // Initialize RevenueCat and sync subscription plan (no-op on web)
  useRevenueCat();

  // Add native-ios class to body + detect iOS keyboard via visualViewport
  useEffect(() => {
    document.body.classList.add("native-ios");

    const vv = window.visualViewport;
    if (vv) {
      const handleResize = () => {
        const keyboardOpen = vv.height < window.innerHeight * 0.75;
        document.body.classList.toggle("keyboard-open", keyboardOpen);
        if (keyboardOpen) {
          document.documentElement.style.setProperty("--vvh", `${vv.height}px`);
        }
      };
      vv.addEventListener("resize", handleResize);
      return () => {
        document.body.classList.remove("native-ios", "keyboard-open");
        vv.removeEventListener("resize", handleResize);
      };
    }

    return () => {
      document.body.classList.remove("native-ios", "keyboard-open");
    };
  }, []);

  return (
    <div
      className="app-shell flex h-screen w-screen max-w-full flex-col overflow-hidden bg-background text-foreground"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div
        className="flex flex-1 flex-col overflow-hidden min-w-0"
        style={{ paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {children}
      </div>
      <MobileBottomNav />
    </div>
  );
}

/** Web layout: sidebar + overlay (unchanged). */
function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { isOpen, close } = useSidebar();

  return (
    <div className="app-shell relative flex h-screen w-screen max-w-full overflow-hidden bg-background text-foreground">
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
