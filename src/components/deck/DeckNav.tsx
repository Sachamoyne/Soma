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
      {/* Mobile: equal-width tabs with wrapping labels. Desktop: centered auto-width tabs. */}
      <div className="mx-auto flex w-full items-stretch gap-1 px-2 md:w-auto md:justify-center md:px-0">
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
                "flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-3 text-center text-xs font-medium leading-tight border-b-2 transition-colors sm:text-sm md:flex-none md:px-6",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {Icon && <Icon className="hidden h-4 w-4 shrink-0 sm:block" />}
              <span className="min-w-0 whitespace-normal break-words md:whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
