"use client";

import { Button } from "@/components/ui/button";
import { Plus, Upload, Menu } from "lucide-react";
import { useSidebar } from "@/contexts/SidebarContext";
import { useTranslation } from "@/i18n";
import { useIsNative } from "@/hooks/useIsNative";

interface TopbarProps {
  title: string;
  showNewDeck?: boolean;
  onNewDeck?: () => void;
  showImport?: boolean;
  onImport?: () => void;
  actions?: React.ReactNode;
}

export function Topbar({
  title,
  showNewDeck,
  onNewDeck,
  showImport,
  onImport,
  actions,
}: TopbarProps) {
  const { t } = useTranslation();
  const { toggle } = useSidebar();
  const isNative = useIsNative();

  return (
    <div
      className="flex flex-col gap-3 border-b border-border bg-background px-4 pb-3 pt-[calc(var(--sat)+0.75rem)] min-h-[calc(var(--sat)+3.5rem)] md:min-h-0 md:h-20 md:flex-row md:items-center md:justify-between md:px-10 md:py-0"
      style={{ "--sat": isNative ? "0px" : "env(safe-area-inset-top, 0px)" } as React.CSSProperties}
    >
      <div className="flex items-center gap-4">
        {!isNative && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="shrink-0 text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      </div>

      {/* Actions - mobile layout */}
      <div className="flex w-full gap-2 md:hidden">
        {showNewDeck && onNewDeck && (
          <Button onClick={onNewDeck} className="flex-1">
            <Plus className="h-4 w-4" />
            {t("decks.newDeck")}
          </Button>
        )}
        {showImport && onImport && (
          <Button
            variant="outline"
            size="icon"
            onClick={onImport}
            aria-label={t("decks.import")}
            className="shrink-0"
          >
            <Upload className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Actions - desktop layout (unchanged visually) */}
      <div className="hidden gap-2 md:flex">
        {actions}
        {showImport && onImport && (
          <Button variant="outline" onClick={onImport}>
            <Upload className="h-4 w-4" />
            {t("decks.import")}
          </Button>
        )}
        {showNewDeck && onNewDeck && (
          <Button onClick={onNewDeck}>
            <Plus className="h-4 w-4" />
            {t("decks.newDeck")}
          </Button>
        )}
      </div>
    </div>
  );
}
