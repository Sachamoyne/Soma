"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SidebarContextType {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage if available, default to true (desktop) / false (mobile)
  const [isOpen, setIsOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-open");
    const hasStored = stored !== null;
    // Default closed on small screens if no stored preference
    const prefersClosedOnMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const initial = hasStored ? stored === "true" : !prefersClosedOnMobile;
    setIsOpen(initial);
    setMounted(true);
  }, []);

  // Save to localStorage when changed
  useEffect(() => {
    if (mounted) {
      localStorage.setItem("sidebar-open", String(isOpen));
    }
  }, [isOpen, mounted]);

  const toggle = () => setIsOpen((prev) => !prev);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return (
    <SidebarContext.Provider value={{ isOpen, toggle, open, close }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
