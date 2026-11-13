/** EVE security ramp helpers. sec is 0.0 (nullsec, red) … 1.0 (highsec, cyan). */
export const SEC_RAMP = ["#F00000", "#D73000", "#F04800", "#F06000", "#D77700", "#EFEF00", "#8FEF2F", "#00F000", "#00EF47", "#48F0C0", "#2FEFEF"];
export function secColor(sec: number) {
  return SEC_RAMP[Math.max(0, Math.min(10, Math.round(sec * 10)))];
}
/** Map an ambush probability (0–100 %) to a security value: 0% → 1.0 highsec, ≥50% → 0.0. */
export function riskToSec(pct: number) {
  return Math.max(0, Math.min(1, 1 - pct / 50));
}
export const LANE_COLOR = { safe: "var(--sec-high)", lowsec: "var(--sec-low)", hot: "var(--sec-null)" } as const;
