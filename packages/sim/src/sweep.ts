#!/usr/bin/env tsx
/**
 * `pnpm --filter @lowsec/sim sweep` — compares economy configs across 8 seeds against the
 * ORIGINAL baseline (no Council, no docking fee). Prints the honest win counts.
 */
import { runSim, type SimResult } from "./sim.js";
import type { Params } from "./params.js";

const SEEDS = [42, 1, 2, 3, 4, 5, 6, 7];
const WEEKS = Number(process.argv[2] ?? 4);
const stats = (r: SimResult) => {
  const d = r.daily.slice(1).map((m) => m.inflationBps);
  return { mae: d.reduce((a, b) => a + Math.abs(b - 100), 0) / d.length / 100, peak: Math.max(...d) / 100, gini: r.final.gini, mean: d.reduce((a, b) => a + b, 0) / d.length / 100 };
};
export const CONFIGS: Record<string, { council: boolean; params: Partial<Params> }> = {
  "A. Council v0.1 (scales grant, no dock fee)": { council: true, params: { councilScalesGrant: true, dockFeeBps: 0, councilWindowEpochs: 1 } },
  "B. No Council + dock fee": { council: false, params: {} },
  "C. Council v0.2 + dock fee, window 1": { council: true, params: { councilWindowEpochs: 1 } },
  "D. Council v0.2 + dock fee, window 2": { council: true, params: { councilWindowEpochs: 2 } },
  "E. Council v0.2 + dock fee, window 3 (DEFAULT)": { council: true, params: {} },
};

const only = process.argv[3];
const base = SEEDS.map((seed) => stats(runSim({ weeks: WEEKS, seed, council: false, params: { dockFeeBps: 0 } })));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`baseline (no council, no dock fee): MAE ${avg(base.map((b) => b.mae)).toFixed(2)}pp  peak ${avg(base.map((b) => b.peak)).toFixed(1)}%  Gini ${avg(base.map((b) => b.gini)).toFixed(3)}`);
console.log("config | MAE pp | error vs base | MAE wins | peak<=base | Gini | Gini<=base");
for (const [name, c] of Object.entries(CONFIGS)) {
  if (only && !name.includes(only)) continue;
  const r = SEEDS.map((seed) => stats(runSim({ weeks: WEEKS, seed, council: c.council, params: c.params })));
  const red = 1 - avg(r.map((x) => x.mae)) / avg(base.map((b) => b.mae));
  console.log([name, avg(r.map((x) => x.mae)).toFixed(2), `${(-red * 100).toFixed(1)}%`, `${r.filter((x, i) => x.mae < base[i].mae).length}/8`, `${r.filter((x, i) => x.peak <= base[i].peak).length}/8`, avg(r.map((x) => x.gini)).toFixed(3), `${r.filter((x, i) => x.gini <= base[i].gini).length}/8`].join(" | "));
}
