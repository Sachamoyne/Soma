import { useRef, useCallback, useEffect } from "react";

/**
 * Tracks elapsed time for the current card being studied.
 * Pauses when tab is hidden or window loses focus.
 * Uses refs only — no re-renders, no setInterval.
 */
export function useCardTimer() {
  const sessionStartRef = useRef<number | null>(Date.now());
  const accumulatedRef = useRef(0);

  const pause = useCallback(() => {
    if (sessionStartRef.current !== null) {
      accumulatedRef.current += Date.now() - sessionStartRef.current;
      sessionStartRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    if (sessionStartRef.current === null) {
      sessionStartRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        pause();
      } else {
        resume();
      }
    };

    const onBlur = () => pause();
    const onFocus = () => resume();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [pause, resume]);

  const getElapsed = useCallback((): number => {
    const running =
      sessionStartRef.current !== null
        ? Date.now() - sessionStartRef.current
        : 0;
    return accumulatedRef.current + running;
  }, []);

  const reset = useCallback(() => {
    accumulatedRef.current = 0;
    sessionStartRef.current = Date.now();
  }, []);

  return { getElapsed, reset };
}
