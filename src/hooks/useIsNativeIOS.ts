"use client";

import { useEffect, useState } from "react";
import { isNativeIOS } from "@/lib/native";

/**
 * Returns true when running inside the Capacitor iOS shell.
 * Returns false during SSR and first client render to avoid hydration mismatch.
 */
export function useIsNativeIOS(): boolean {
  const [nativeIOS, setNativeIOS] = useState(false);

  useEffect(() => {
    setNativeIOS(isNativeIOS());
  }, []);

  return nativeIOS;
}
