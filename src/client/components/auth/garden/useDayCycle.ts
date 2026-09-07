import { useCallback, useEffect, useMemo, useState } from "react";
import { DAY_MS, gardenDayStart, solarDay } from "./day-cycle.js";

export function useDayCycle(reducedMotion: boolean) {
  const [timestamp, setTimestamp] = useState(Date.now);
  const [mode, setMode] = useState<"live" | "manual" | "tour">("live");
  useEffect(() => {
    if (mode === "manual") return;
    if (mode === "tour" && reducedMotion) {
      setMode("manual");
      return;
    }
    let previous = performance.now();
    const update = () => {
      const now = performance.now();
      const elapsed = now - previous;
      previous = now;
      if (document.hidden) return;
      if (mode === "live") setTimestamp(Date.now());
      else
        setTimestamp(
          (value) =>
            gardenDayStart(value) +
            ((value -
              gardenDayStart(value) +
              (Math.min(elapsed, 1000) * DAY_MS) / 120_000) %
              DAY_MS),
        );
    };
    const visibility = () => {
      previous = performance.now();
      if (!document.hidden && mode === "live") setTimestamp(Date.now());
    };
    const interval = window.setInterval(update, mode === "tour" ? 100 : 30_000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [mode, reducedMotion]);
  const seek = useCallback((minute: number) => {
    setMode("manual");
    setTimestamp(
      (value) =>
        gardenDayStart(value) + Math.max(0, Math.min(1439, minute)) * 60_000,
    );
  }, []);
  const live = useCallback(() => {
    setMode("live");
    setTimestamp(Date.now());
  }, []);
  const toggleTour = useCallback(
    () => setMode((value) => (value === "tour" ? "manual" : "tour")),
    [],
  );
  const daylight = useMemo(() => solarDay(timestamp), [timestamp]);
  return { daylight, mode, seek, live, toggleTour };
}
export type DayCycleController = ReturnType<typeof useDayCycle>;
