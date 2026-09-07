import React from "react";
import { smoothRange, type Daylight } from "./day-cycle.js";

/** Entirely local sky detail; no full-screen GPU postprocessing. */
export function DaySky({ day }: { day: Daylight }) {
  return (
    <div className="garden-day-sky" aria-hidden="true">
      <svg viewBox="0 0 1400 900" preserveAspectRatio="xMidYMin slice">
        <g className="garden-sky-stars">
          {Array.from({ length: 74 }, (_, i) => (
            <circle
              key={i}
              cx={((i * 137.508) % 1360) + 20}
              cy={18 + ((i * 89.713) % 460)}
              r={i % 9 === 0 ? 1.25 : 0.65}
              opacity={0.35 + (i % 5) * 0.12}
            />
          ))}
        </g>
        <g className="garden-sky-haze">
          <path d="M-100 280 Q230 185 650 300T1500 265" />
          <path d="M-100 315 Q280 230 690 315T1500 300" />
        </g>
      </svg>
      <div className="garden-sky-moon" style={{ opacity: day.night * 0.85 }} />
      <div
        className="garden-sky-sun"
        style={{
          opacity: smoothRange(-1, 2, day.elevation) * 0.65,
          left: `${35 + day.sunDirection[0] * 24}%`,
          top: `${220 - Math.max(0, day.elevation) * 2}px`,
        }}
      />
    </div>
  );
}
