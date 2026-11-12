#!/usr/bin/env tsx
/**
 * `pnpm --filter @lowsec/sim sweep [weeks]` — honest comparison across 8 seeds and TWO populations:
 *  - launch: 40 players + a 10-day wave (~100 pilots), the original stress test
 *  - live:   3 humans who act now and then, no wave — what a judge sees on the hosted demo
 * Rows: v0.1 rules, v0.2 (2 NPCs, Council + dock fee), v0.3 (4 NPC traders + the Guild) with and without Council.
 */
import { runSim, type SimResult } from "./sim.js";
import { LIVE_POPULATION, V02_NPCS, type Params, type Population } from "./params.js";

const SEEDS = [42, 1, 2, 3, 4, 5, 6, 7];
const WEEKS = Number(process.argv[2] ?? 4);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function stats(r: SimResult, p: Partial<Params> = {}) {
  // day 1 = launch spike before the Council's first epoch closes: shown in tables, excluded here
  const d = r.daily.slice(1).map((m) => m.inflationBps);
  const f = r.daily.slice(3).map((m) => m.faucetBps);
  const floor = p.councilMinFaucetBps ?? 7_000;
  return {
    mean: avg(d) / 100,
    mae: avg(d.map((x) => Math.abs(x - 100))) / 100,
    worst: Math.max(...d.map(Math.abs)) / 100,
    inBand: d.filter((x) => x >= -100 && x <= 300).length / d.length,
    gini: r.final.gini,
    faucet: r.final.faucetBps / 100,
    atFloor: f.filter((x) => x <= floor).length / Math.max(1, f.length),
  };
}

export const ROWS: { name: string; council: boolean; params: Partial<Params>; pop: Partial<Population>; liveOnly?: boolean }[] = [
  { name: "v0.1 rules (2 NPCs, no Council, no dock fee)", council: false, params: { dockFeeBps: 0 }, pop: V02_NPCS },
  { name: "v0.2 (2 NPCs, Council + dock fee)", council: true, params: {}, pop: V02_NPCS },
  // what was actually deployed: 2 NPCs taking one action per 20 s step ≈ a trade every ~4 ticks
  { name: "v0.2 as it ran live (2 NPCs acting every ~4 ticks)", council: true, params: {}, pop: { ...V02_NPCS, aiActEveryTicks: 4 }, liveOnly: true },
  { name: "v0.3 NPCs, no Council", council: false, params: {}, pop: {} },
  { name: "v0.3 NPCs + Council (DEFAULT)", council: true, params: {}, pop: {} },
];

export function sweep(popName: string, extra: Partial<Population>) {
  console.log(`\n${popName} — ${WEEKS} weeks × 8 seeds (target +1%/epoch; band = −1%..+3%)`);
  console.log("| config | mean infl./epoch | mean abs error vs 1% | worst epoch | epochs in band | Gini (pilots) | final faucet | epochs at 70% floor |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const row of ROWS) {
    if (row.liveOnly && !extra.humanActEveryTicks) continue;
    const r = SEEDS.map((seed) => stats(runSim({ weeks: WEEKS, seed, council: row.council, params: row.params, population: { ...row.pop, ...extra } }), row.params));
    const pc = (x: number) => `${x.toFixed(2)}%`;
    console.log(`| ${row.name} | ${pc(avg(r.map((x) => x.mean)))} | ${avg(r.map((x) => x.mae)).toFixed(2)} pp | ${pc(avg(r.map((x) => x.worst)))} | ${(avg(r.map((x) => x.inBand)) * 100).toFixed(0)}% | ${avg(r.map((x) => x.gini)).toFixed(3)} | ${row.council ? pc(avg(r.map((x) => x.faucet))) : "100% (fixed)"} | ${row.council ? `${(avg(r.map((x) => x.atFloor)) * 100).toFixed(0)}%` : "—"} |`);
  }
}

if (process.argv[1]?.endsWith("sweep.ts")) {
  sweep("LAUNCH (40 players + 10-day wave, ~100 pilots)", {});
  sweep("LIVE (3 humans acting now and then, no wave)", LIVE_POPULATION);
}
