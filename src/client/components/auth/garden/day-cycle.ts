/** Approximate clear-sky solar geometry, based on NOAA's fractional-year equations.
 * https://www.gml.noaa.gov/grad/solcalc/solareqns.PDF
 * Baku is the garden's fixed location; no geolocation or weather service is used.
 */
export const GARDEN_LOCATION = {
  latitude: 40.4093,
  longitude: 49.8671,
  utcOffsetMinutes: 240,
  timeZone: "Asia/Baku",
};
export const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function smoothRange(min: number, max: number, value: number): number {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}
export type DayPeriod =
  "night" | "blue-hour" | "dawn" | "morning" | "day" | "golden-hour" | "dusk";
export interface Daylight {
  timestamp: number;
  minute: number;
  elevation: number;
  azimuth: number;
  sunDirection: [number, number, number];
  daylight: number;
  night: number;
  warmth: number;
  lanterns: number;
  period: DayPeriod;
  sunrise: number;
  sunset: number;
  solarNoon: number;
}
export function gardenDayStart(timestamp: number): number {
  const offset = GARDEN_LOCATION.utcOffsetMinutes * 60_000;
  return Math.floor((timestamp + offset) / DAY_MS) * DAY_MS - offset;
}
function solarTerms(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
  const dayIndex = Math.floor((timestamp - Date.UTC(year, 0, 1)) / DAY_MS);
  const hour =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const gamma = ((2 * Math.PI) / daysInYear) * (dayIndex + (hour - 12) / 24);
  const equation =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  return { hour, equation, declination };
}
export function solarDay(timestamp: number): Daylight {
  const { hour, equation, declination } = solarTerms(timestamp);
  const lat = GARDEN_LOCATION.latitude * RAD;
  const solarMinutes =
    (((hour * 60 + equation + 4 * GARDEN_LOCATION.longitude) % 1440) + 1440) %
    1440;
  const hourAngle = (solarMinutes / 4 - 180) * RAD;
  const sinElevation =
    Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElevation))) / RAD;
  const azimuth =
    (Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(lat) -
        Math.tan(declination) * Math.cos(lat),
    ) /
      RAD +
      180) %
    360;
  // Today's event labels stay fixed while the preview moves through that date.
  const events = solarTerms(gardenDayStart(timestamp) + 12 * 3_600_000);
  const cosH =
    Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(events.declination)) -
    Math.tan(lat) * Math.tan(events.declination);
  const sunriseAngle = Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD;
  const solarNoon =
    720 -
    4 * GARDEN_LOCATION.longitude -
    events.equation +
    GARDEN_LOCATION.utcOffsetMinutes;
  const morning = solarMinutes < 720;
  const period: DayPeriod =
    elevation < -12
      ? "night"
      : elevation < -6
        ? "blue-hour"
        : elevation < 0
          ? morning
            ? "dawn"
            : "dusk"
          : elevation < 12
            ? "golden-hour"
            : elevation < 30 && morning
              ? "morning"
              : "day";
  return {
    timestamp,
    minute: (timestamp - gardenDayStart(timestamp)) / 60_000,
    elevation,
    azimuth,
    // World axes: east +X, up +Y, north -Z.
    sunDirection: [
      Math.sin(azimuth * RAD) * Math.cos(elevation * RAD),
      sinElevation,
      -Math.cos(azimuth * RAD) * Math.cos(elevation * RAD),
    ],
    daylight: smoothRange(-8, 10, elevation),
    night: 1 - smoothRange(-15, -3, elevation),
    warmth: smoothRange(-9, 0, elevation) * (1 - smoothRange(4, 22, elevation)),
    lanterns: 1 - smoothRange(-5, 5, elevation),
    period,
    sunrise: solarNoon - sunriseAngle * 4,
    sunset: solarNoon + sunriseAngle * 4,
    solarNoon,
  };
}
export function timeLabel(minute: number): string {
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}
export const periodLabels: Record<DayPeriod, [string, string]> = {
  night: ["Night", "Gecə"],
  "blue-hour": ["Blue hour", "Mavi saat"],
  dawn: ["Dawn", "Sübh"],
  morning: ["Morning", "Səhər"],
  day: ["Daylight", "Gündüz"],
  "golden-hour": ["Golden hour", "Qızılı saat"],
  dusk: ["Dusk", "Alatoran"],
};
function mix(a: string, b: string, t: number): string {
  const aa = Number.parseInt(a.slice(1), 16),
    bb = Number.parseInt(b.slice(1), 16);
  return `#${[16, 8, 0]
    .map((shift) =>
      Math.round(((aa >> shift) & 255) * (1 - t) + ((bb >> shift) & 255) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
export function dayPalette(day: Daylight): Record<string, string | number> {
  const dark = 1 - smoothRange(-10, 0, day.elevation);
  const paper = mix(
    mix("#eeeae0", "#ecd2bb", day.warmth * 0.45),
    "#111e2c",
    dark,
  );
  const luminance = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return [16, 8, 0]
      .map((shift) => {
        const s = ((n >> shift) & 255) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const lightSurface = luminance(paper) > 0.179;
  const readable = (dayColor: string, nightColor: string) => {
    const preferred = lightSurface ? dayColor : nightColor;
    const a = luminance(paper),
      b = luminance(preferred);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5
      ? preferred
      : lightSurface
        ? "#000000"
        : "#ffffff";
  };
  return {
    "--garden-paper": paper,
    "--garden-ink": readable("#313d37", "#eee9de"),
    "--garden-muted": readable("#656b61", "#b4c0c7"),
    "--garden-rule": mix("#c8c8bb", "#425565", dark),
    "--garden-clay": readable("#994e36", "#e9b78c"),
    "--garden-field": lightSurface ? "#f5f2ea" : "#1b2b3b",
    "--garden-button": lightSurface ? "#994e36" : "#c4956d",
    "--garden-button-ink": lightSurface ? "#fff7e9" : "#142332",
    "--garden-sky-top": mix("#dce8e9", "#081424", dark),
    "--garden-sky-horizon": mix(
      mix("#ede9df", "#e9b58f", day.warmth),
      "#29344b",
      dark,
    ),
    "--garden-night": day.night,
    "--garden-fallback-brightness": 1 - dark * 0.45,
    "--garden-fallback-saturation": 1 - dark * 0.22,
  };
}
