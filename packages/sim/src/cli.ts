#!/usr/bin/env tsx
/** `pnpm sim --weeks 4 [--seed 42] [--no-baseline] [--json out.json] [--daily]` */
import { writeFileSync } from "node:fs";
import { runSim, type SimResult } from "./sim.js";
import { COUNCIL_RULE } from "./council.js";
import type { PeriodMetrics } from "./metrics.js";

const args = process.argv.slice(2);
const arg = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const has = (k: string) => args.includes(`--${k}`);
const weeks = Number(arg("weeks", "4"));
const seed = Number(arg("seed", "42"));

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const n = (x: number) => x.toLocaleString("en-US");

function table(title: string, rows: PeriodMetrics[], label: string) {
  console.log(`\n${title}`);
  const head = [label, "players", "gold supply", "minted", "burned", "net", "inflation", "sink/faucet", "gini", "faucets", "hauls", "lowsec", "ambush", "cargo burned", "price idx"];
  const data = rows.map((m) => {
    const minted = m.minted.npc_buy_orders + m.minted.new_player_grant;
    const burned = m.burned.npc_sell_orders + m.burned.tolls + m.burned.raid_fees + m.burned.dock_fees;
    return [String(m.period + 1), String(m.players), n(m.supplyEnd), n(minted), n(burned), n(minted - burned), pct(m.inflationBps), m.sinkFaucetRatio.toFixed(3), m.gini.toFixed(3), pct(m.faucetBps), String(m.hauls), String(m.lowsecHauls), String(m.ambushes), String(m.cargoBurnedUnits), m.priceIndex.toFixed(2)];
  });
  const w = head.map((h, i) => Math.max(h.length, ...data.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => c.padStart(w[i])).join("  ");
  console.log(line(head));
  console.log(w.map((x) => "-".repeat(x)).join("  "));
  data.forEach((r) => console.log(line(r)));
}

function stats(r: SimResult) {
  // day 1 is the launch spike before the Council's first epoch closes; it is shown in the table but excluded here
  const d = r.daily.slice(1).map((m) => m.inflationBps);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const last7 = d.slice(-7);
  const mean7 = last7.reduce((a, b) => a + b, 0) / last7.length;
  const target = 100;
  const mae = d.reduce((a, b) => a + Math.abs(b - target), 0) / d.length;
  return { mean, mean7, mae };
}

const withCouncil = runSim({ weeks, seed, council: true });
const baseline = has("no-baseline") ? null : runSim({ weeks, seed, council: false });
// v0.1 rules: no Council AND no progressive docking fee (the "do nothing" economy)
const original = has("no-baseline") ? null : runSim({ weeks, seed, council: false, params: { dockFeeBps: 0 } });

console.log(`LOWSEC economy simulation — ${weeks} week(s), seed ${seed}, 1 tick = 1 game hour, epoch = 1 day`);
console.log(`Council rule: ${COUNCIL_RULE}`);
table("WITH AI COUNCIL (weekly)", withCouncil.weekly, "week");
if (has("daily")) table("WITH AI COUNCIL (daily)", withCouncil.daily, "day");
if (baseline) table("BASELINE — NO COUNCIL (weekly)", baseline.weekly, "week");

const s1 = stats(withCouncil);
console.log(`\nDaily gold-supply inflation from day 2 on (target ${pct(100)}/day):`);
console.log(`  council : mean ${pct(s1.mean)}  last-7-days ${pct(s1.mean7)}  mean |error| ${pct(s1.mae)}  final supply ${n(withCouncil.final.supply)}`);
if (baseline) {
  const s0 = stats(baseline);
  console.log(`  baseline: mean ${pct(s0.mean)}  last-7-days ${pct(s0.mean7)}  mean |error| ${pct(s0.mae)}  final supply ${n(baseline.final.supply)}`);
  const red = 1 - s1.mae / s0.mae;
  const peak = (x: SimResult) => Math.max(...x.daily.slice(1).map((m) => m.inflationBps));
  console.log(`  peak day: council ${pct(peak(withCouncil))} vs baseline ${pct(peak(baseline))}; final Gini council ${withCouncil.final.gini.toFixed(3)} vs baseline ${baseline.final.gini.toFixed(3)}`);
  console.log(`  => the Council cuts the inflation error by ${(red * 100).toFixed(1)}% vs no Council with the same sinks (final faucet multiplier ${pct(withCouncil.final.faucetBps)})`);
  if (original) {
    const s2 = stats(original);
    console.log(`  v0.1 rules (no Council, no docking fee): mean |error| ${pct(s2.mae)}  peak ${pct(peak(original))}  Gini ${original.final.gini.toFixed(3)}  final supply ${n(original.final.supply)}`);
    console.log(`  => Council + docking fee vs v0.1 rules: error ${((s1.mae / s2.mae - 1) * 100).toFixed(1)}%, Gini ${withCouncil.final.gini.toFixed(3)} vs ${original.final.gini.toFixed(3)}`);
  }
}
const out = arg("json");
if (out) {
  writeFileSync(out, JSON.stringify({ withCouncil, baseline }, null, 2));
  console.log(`\nwrote ${out}`);
}
