"use client";

import { useAppRouter } from "@/hooks/useAppRouter";
import { ArrowLeft } from "lucide-react";

export function BackButton() {
  const router = useAppRouter();
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}
