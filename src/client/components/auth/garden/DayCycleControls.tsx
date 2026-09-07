import React, { useId, useState } from "react";
import { Clock3, Moon, Pause, Play, Sunrise, Sunset, X } from "lucide-react";
import { periodLabels, timeLabel } from "./day-cycle.js";
import type { DayCycleController } from "./useDayCycle.js";

export function DayCycleControls({
  cycle,
  language,
  reducedMotion,
}: {
  cycle: DayCycleController;
  language: "en" | "az";
  reducedMotion: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { daylight: day, mode } = cycle;
  const az = language === "az";
  const label = periodLabels[day.period][az ? 1 : 0];
  return (
    <div className="garden-day-control">
      <button
        type="button"
        className="garden-day-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {day.night > 0.5 ? <Moon size={15} /> : <Clock3 size={15} />}
        <span>
          {az ? "BAKI" : "BAKU"} {timeLabel(day.minute)}
        </span>
        <span className="garden-day-phase">{label}</span>
        <span className="garden-day-mode">
          {mode === "live" ? (az ? "CANLI" : "LIVE") : az ? "BAXIŞ" : "PREVIEW"}
        </span>
      </button>
      {open && (
        <div className="garden-day-panel" id={id}>
          <div className="garden-day-panel__top">
            <span>{az ? "BAĞIN BİR GÜNÜ" : "A DAY IN THE GARDEN"}</span>
            <button
              type="button"
              aria-label={az ? "Vaxt panelini bağla" : "Close time controls"}
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="garden-day-reading">
            <strong>{timeLabel(day.minute)}</strong>
            <span>
              {label}
              <small>
                {az ? "Günəşin hündürlüyü" : "Sun elevation"}{" "}
                {day.elevation.toFixed(1)}°
              </small>
            </span>
          </div>
          <label htmlFor={`${id}-time`}>
            {az ? "Günün vaxtını dəyiş" : "Explore the time of day"}
          </label>
          <input
            id={`${id}-time`}
            type="range"
            min="0"
            max="1439"
            step="1"
            value={Math.floor(day.minute)}
            onChange={(event) => cycle.seek(Number(event.target.value))}
            aria-valuetext={`${timeLabel(day.minute)}, ${label}`}
          />
          <div className="garden-day-scale">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
          <div className="garden-day-events">
            <span>
              <Sunrise size={15} />
              {timeLabel(day.sunrise)}
            </span>
            <span>
              <Sunset size={15} />
              {timeLabel(day.sunset)}
            </span>
          </div>
          <div className="garden-day-presets">
            {[
              [day.sunrise - 12, az ? "Sübh" : "Dawn"],
              [day.solarNoon, az ? "Günorta" : "Noon"],
              [day.sunset - 20, az ? "Qürub" : "Sunset"],
              [23 * 60, az ? "Gecə" : "Night"],
            ].map(([minute, name]) => (
              <button
                key={name}
                type="button"
                onClick={() => cycle.seek(Number(minute))}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="garden-day-actions">
            <button
              type="button"
              onClick={cycle.toggleTour}
              disabled={reducedMotion}
              aria-pressed={mode === "tour"}
            >
              {mode === "tour" ? <Pause size={13} /> : <Play size={13} />}{" "}
              {mode === "tour"
                ? az
                  ? "Dayandır"
                  : "Pause"
                : az
                  ? "Bir gün / 2 dəqiqə"
                  : "One day / 2 minutes"}
            </button>
            <button
              type="button"
              onClick={cycle.live}
              disabled={mode === "live"}
            >
              {az ? "Canlı vaxta qayıt" : "Back to live"}
            </button>
          </div>
          <p>
            {az
              ? "Bakı vaxtı və mövsümə uyğun günəş yolu. Hava proqnozu deyil."
              : "Baku time and a seasonal sun path. A clear-sky simulation."}
          </p>
        </div>
      )}
    </div>
  );
}
