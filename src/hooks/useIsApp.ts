"use client";

import { useSearchParams } from "next/navigation";

/**
 * Returns true when the app is running inside a mobile WebView.
 * Detection: the URL contains the query parameter `app=1`.
 */
export function useIsApp(): boolean {
  const searchParams = useSearchParams();
  return searchParams.get("app") === "1";
}
