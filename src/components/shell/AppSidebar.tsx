"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Settings, List, CreditCard } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSidebar } from "@/contexts/SidebarContext";
import { useTranslation } from "@/i18n";
import { useIsApp } from "@/hooks/useIsApp";
import { appHref } from "@/lib/appHref";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandLogo } from "@/components/BrandLogo";

export function AppSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { isOpen } = useSidebar();
  const isApp = useIsApp();

  const navItems = [
    // Main entry: deck list
    { href: "/decks", label: t("nav.decks"), icon: BookOpen },
    { href: "/browse", label: t("nav.browse"), icon: List },
    // Statistics view (formerly dashboard)
    { href: "/statistics", label: t("nav.statistics"), icon: LayoutDashboard },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
    ...(!isApp ? [{ href: "/billing", label: t("nav.billing"), icon: CreditCard }] : []),
  ];

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-border bg-background transition-all duration-300 ease-in-out shrink-0",
        isOpen
          ? "w-64 max-w-full fixed inset-y-0 left-0 z-40 md:static md:w-64"
          : "w-0 overflow-hidden md:w-0 md:static md:-translate-x-full md:hidden",
      )}
    >
      {/* Header */}
      <div className="flex h-20 items-center justify-center border-b border-border px-6 overflow-hidden">
        <div className="flex items-center">
          <BrandLogo size={104} />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 p-6 overflow-hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={appHref(item.href, isApp)}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium tracking-wide transition-all",
                isActive
                  ? "bg-foreground/[0.04] text-foreground before:absolute before:left-0 before:top-2.5 before:h-5 before:w-0.5 before:rounded-full before:bg-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 stroke-[1.5]",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              />
              <span className="whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Language and theme toggle at bottom */}
      <div className="p-4 border-t border-border flex items-center justify-between">
        <LanguageToggle />
        <ThemeToggle variant="minimal" />
      </div>
    </div>
  );
}
