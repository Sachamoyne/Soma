"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, List, BarChart3 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useIsApp } from "@/hooks/useIsApp";
import { appHref } from "@/lib/appHref";
import { useAppRouter } from "@/hooks/useAppRouter";
import { useTranslation } from "@/i18n";

interface DeckNavProps {
  deckId: string;
}

export function DeckNav({ deckId }: DeckNavProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useAppRouter();
  const isApp = useIsApp();

  const navItems = useMemo(
    () => [
      {
        label: t("deck.tabs.overview"),
        href: `/decks/${deckId}`,
        icon: null,
        exact: true,
      },
      {
        label: t("deck.tabs.add"),
        href: `/decks/${deckId}/add`,
        icon: Plus,
      },
      {
        label: t("deck.tabs.browse"),
        href: `/decks/${deckId}/browse`,
        icon: List,
      },
      {
        label: t("deck.tabs.stats"),
        href: `/decks/${deckId}/stats`,
        icon: BarChart3,
      },
    ],
    [deckId, t]
  );

  useEffect(() => {
    navItems.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [router, navItems]);

  return (
    <nav className="border-b bg-background">
      {/* Center the tabs using flex + justify-center */}
      <div className="flex items-center justify-center gap-1">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname?.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={appHref(item.href, isApp)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
