"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Settings, List } from "lucide-react";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/brand";
import { useSidebar } from "@/contexts/SidebarContext";
import { useTranslation } from "@/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

export function AppSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { isOpen } = useSidebar();

  const navItems = [
    // Main entry: deck list
    { href: "/decks", label: t("nav.decks"), icon: BookOpen },
    { href: "/browse", label: t("nav.browse"), icon: List },
    // Statistics view (formerly dashboard)
    { href: "/statistics", label: t("nav.statistics"), icon: LayoutDashboard },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-white/10 bg-slate-950/70 backdrop-blur-md transition-all duration-300 ease-in-out shrink-0",
        isOpen
          ? "w-64 relative"
          : "w-0 overflow-hidden"
      )}
    >
      {/* Header */}
      <div className="flex h-20 items-center justify-center border-b border-white/10 px-8 overflow-hidden">
        <h1 className="text-lg font-semibold tracking-wide whitespace-nowrap text-white/90">
          {APP_NAME}
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 p-6 overflow-hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-2xl px-4 py-3 text-xs font-medium tracking-[0.08em] transition-all",
                isActive
                  ? "bg-white/10 text-white before:absolute before:left-0 before:top-2.5 before:h-5 before:w-0.5 before:rounded-full before:bg-white/70"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 stroke-[1.5]",
                  isActive ? "text-white" : "text-white/60"
                )}
              />
              <span className="whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Language toggle at bottom */}
      <div className="p-4 border-t border-white/10">
        <LanguageToggle />
      </div>
    </div>
  );
}
