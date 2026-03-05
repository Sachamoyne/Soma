"use client";

import { SomaDemo } from "./SomaDemo";

/**
 * Static iPhone mockup used only on the landing hero.
 * Visual-only component with no app/backend coupling.
 */
export function HeroPhoneMockup() {
  return (
    <div className="w-[78vw] max-w-[320px] min-w-[240px] px-1 sm:w-[70vw]">
      <div
        className="relative aspect-[390/844] rotate-[2deg] lg:rotate-[6deg]"
        style={{
          filter:
            "drop-shadow(0 28px 38px rgba(0,0,0,0.16)) drop-shadow(0 8px 14px rgba(0,0,0,0.10))",
        }}
      >
        {/* Left side buttons */}
        <div
          className="absolute left-[-5px] top-[22%] h-[6%] w-[4px] rounded-l-full bg-foreground/14"
          aria-hidden="true"
        />
        <div
          className="absolute left-[-5px] top-[30%] h-[7%] w-[4px] rounded-l-full bg-foreground/14"
          aria-hidden="true"
        />

        {/* Right side button */}
        <div
          className="absolute right-[-5px] top-[26%] h-[8.5%] w-[4px] rounded-r-full bg-foreground/14"
          aria-hidden="true"
        />

        <div className="absolute inset-0 overflow-hidden rounded-[42px] border-[6px] border-foreground/15 bg-background">
          {/* Dynamic island */}
          <div className="absolute left-1/2 top-3 z-20 h-[28px] w-[92px] -translate-x-1/2 rounded-full bg-foreground">
            <div className="absolute left-1/2 top-1/2 h-[8px] w-[8px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/25" />
          </div>

          <div className="flex h-full flex-col px-4 pb-6 pt-14 sm:px-5">
            <SomaDemo />
          </div>

          {/* Home bar */}
          <div
            className="absolute bottom-2 left-1/2 h-[4px] w-[84px] -translate-x-1/2 rounded-full bg-foreground/20"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
