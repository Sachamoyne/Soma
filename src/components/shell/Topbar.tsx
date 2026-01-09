"use client";

import { Button } from "@/components/ui/button";
import { Plus, Upload, Menu } from "lucide-react";
import { useSidebar } from "@/contexts/SidebarContext";

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
  const { toggle } = useSidebar();

  return (
    <div className="flex h-20 items-center justify-between border-b bg-background px-10">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="shrink-0 hover:bg-primary/10"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      </div>
      <div className="flex gap-2">
        {actions}
        {showImport && onImport && (
          <Button variant="outline" onClick={onImport}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
        )}
        {showNewDeck && onNewDeck && (
          <Button onClick={onNewDeck}>
            <Plus className="h-4 w-4" />
            New deck
          </Button>
        )}
      </div>
    </div>
  );
}
