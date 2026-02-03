"use client";

import { useRouter } from "next/navigation";
import { useIsApp } from "@/hooks/useIsApp";
import { appHref } from "@/lib/appHref";

/**
 * Drop-in replacement for useRouter() that automatically preserves
 * `?app=1` on push, replace, and prefetch when in app mode.
 */
export function useAppRouter() {
  const router = useRouter();
  const isApp = useIsApp();

  return {
    push(href: string, options?: Parameters<typeof router.push>[1]) {
      router.push(appHref(href, isApp), options);
    },
    replace(href: string, options?: Parameters<typeof router.replace>[1]) {
      router.replace(appHref(href, isApp), options);
    },
    prefetch(href: string, options?: Parameters<typeof router.prefetch>[1]) {
      router.prefetch(appHref(href, isApp), options);
    },
    back() {
      router.back();
    },
    forward() {
      router.forward();
    },
    refresh() {
      router.refresh();
    },
  };
}
