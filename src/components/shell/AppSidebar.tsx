"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Settings, List } from "lucide-react";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/brand";
import { useSidebar } from "@/contexts/SidebarContext";

const navItems = [
  { href: "/decks", label: "Decks", icon: BookOpen },
  { href: "/browse", label: "Browse", icon: List },
  { href: "/dashboard", label: "Statistiques", icon: LayoutDashboard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { isOpen } = useSidebar();

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out shrink-0",
        // Clean layout: sidebar is either fully open (w-64) or completely hidden (w-0)
        // When closed, it's taken out of the flex flow on mobile via fixed position
        // On desktop, it stays in flow but with w-0 so no space is taken
        isOpen
          ? "w-64 relative"
          : "w-0 overflow-hidden"
      )}
    >
      {/* Header */}
      <div className="flex h-20 items-center justify-center border-b border-slate-200 px-8 overflow-hidden">
        <h1 className="text-lg font-semibold tracking-wide whitespace-nowrap text-slate-900">
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
                  ? "bg-slate-100 text-slate-900 before:absolute before:left-0 before:top-2.5 before:h-5 before:w-0.5 before:rounded-full before:bg-primary"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 stroke-[1.5]" />
              <span className="whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
