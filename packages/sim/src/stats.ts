/** Honest comparison metrics for Council vs no-Council runs (used by the CLI, the sweep, tests and the web Fast-forward).
 *  Day 1 is the launch spike before the Council's first epoch closes: shown on charts, excluded here. */
import type { PeriodMetrics } from "./metrics";

export interface ControlStats {
  /** mean daily gold-supply inflation, % */
  mean: number;
  /** |mean − target|, percentage points (lower is better) */
  meanOff: number;
  /** mean |daily inflation − target|, pp (lower is better) */
  mae: number;
  /** worst epoch: max |daily inflation − target|, pp (lower is better) */
  worst: number;
  /** share of epochs inside the 0–1% target band (higher is better) */
  inBand: number;
  /** final Gini of pilot gold (lower is better) */
  gini: number;
}

export function controlStats(daily: Pick<PeriodMetrics, "inflationBps">[], finalGini: number, targetBps = 100, band: [number, number] = [0, 100]): ControlStats {
  const d = daily.slice(1).map((m) => m.inflationBps);
  const n = Math.max(1, d.length);
  const mean = d.reduce((a, b) => a + b, 0) / n;
  return {
    mean: mean / 100,
    meanOff: Math.abs(mean - targetBps) / 100,
    mae: d.reduce((a, b) => a + Math.abs(b - targetBps), 0) / n / 100,
    worst: Math.max(0, ...d.map((x) => Math.abs(x - targetBps))) / 100,
    inBand: d.filter((x) => x >= band[0] && x <= band[1]).length / n,
    gini: finalGini,
  };
}

/** Direction of every metric, so UIs colour better/worse correctly instead of fixed green/red. */
export const STAT_BETTER: Record<keyof ControlStats, "lower" | "higher" | null> = { mean: null, meanOff: "lower", mae: "lower", worst: "lower", inBand: "higher", gini: "lower" };
