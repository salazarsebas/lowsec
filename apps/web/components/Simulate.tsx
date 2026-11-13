"use client";
/** Fast-forward: the deterministic headless sim (packages/sim, same rule code as the contract) runs in the
 *  browser. Honest comparison: every metric for every run, each coloured by its own direction (lower error is
 *  better, more epochs in band is better) against "no Council". Nothing is hidden or reordered by who wins. */
import { useState } from "react";
import { COUNCIL_V04, COUNCIL_RULE, STAT_BETTER, V02_NPCS, controlStats, runSim, type ControlStats, type SimResult } from "@lowsec/sim";
import { LineChart } from "./LineChart";
import { Panel, Button } from "@/ui";
import "@/styles/econ.css";

const SEEDS = [42, 1, 2, 3, 4, 5, 6, 7];
type RunKey = "v04" | "v03" | "none" | "v01";
const RUNS: { key: RunKey; label: string; sub: string; council: boolean; params: object; population: object }[] = [
  { key: "v04", label: "Council v0.4", sub: "proposed tuning · sim only", council: true, params: COUNCIL_V04, population: {} },
  { key: "v03", label: "Council v0.3", sub: "constants on testnet now", council: true, params: {}, population: {} },
  { key: "none", label: "No Council", sub: "faucet locked at 100%", council: false, params: {}, population: {} },
  { key: "v01", label: "v0.1 rules", sub: "no Council, no dock fee, 2 NPCs", council: false, params: { dockFeeBps: 0 }, population: V02_NPCS },
];
type Row = { key: keyof ControlStats; label: string; fmt: (v: number) => string; hint: string };
const ROWS: Row[] = [
  { key: "mae", label: "Mean |error| vs 1%/day target", fmt: (v) => `${v.toFixed(2)} pp`, hint: "lower is better" },
  { key: "worst", label: "Worst day |error|", fmt: (v) => `${v.toFixed(2)} pp`, hint: "lower is better" },
  { key: "inBand", label: "Days inside the 0–1% band", fmt: (v) => `${(v * 100).toFixed(0)}%`, hint: "higher is better" },
  { key: "meanOff", label: "|Mean inflation − target|", fmt: (v) => `${v.toFixed(2)} pp`, hint: "lower is better" },
  { key: "gini", label: "Final Gini (pilot gold)", fmt: (v) => v.toFixed(3), hint: "lower is better" },
  { key: "mean", label: "Mean daily inflation", fmt: (v) => `${v.toFixed(2)}%`, hint: "context (target 1%)" },
];

/** better / worse / tie vs the no-Council baseline, by the metric's own direction. */
function verdict(key: keyof ControlStats, v: number, base: number): "better" | "worse" | "tie" | "" {
  const dir = STAT_BETTER[key];
  if (!dir) return "";
  const eps = key === "inBand" ? 0.005 : key === "gini" ? 0.0005 : 0.005;
  if (Math.abs(v - base) < eps) return "tie";
  return (dir === "lower" ? v < base : v > base) ? "better" : "worse";
}

interface Out { weeks: number; runs: Record<RunKey, SimResult>; stats: Record<RunKey, ControlStats> }
const yieldUi = () => new Promise((r) => setTimeout(r, 30));

export function Simulate() {
  const [r, setR] = useState<Out | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [multi, setMulti] = useState<Record<RunKey, ControlStats> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go(weeks: number) {
    setBusy(`Simulating ${weeks} week${weeks === 1 ? "" : "s"}…`);
    setErr(null);
    setMulti(null);
    try {
      const runs = {} as Record<RunKey, SimResult>, stats = {} as Record<RunKey, ControlStats>;
      for (const x of RUNS) {
        await yieldUi();
        runs[x.key] = runSim({ weeks, seed: 42, council: x.council, params: x.params, population: x.population });
        stats[x.key] = controlStats(runs[x.key].daily, runs[x.key].final.gini);
      }
      setR({ weeks, runs, stats });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  /** Same comparison averaged over 8 seeds: the anti-cherry-pick check, shown even where it is less flattering. */
  async function eightSeeds() {
    if (!r) return;
    setBusy("Running 8 seeds × 4 configurations…");
    const acc = {} as Record<RunKey, ControlStats>;
    for (const x of RUNS) {
      const all: ControlStats[] = [];
      for (const seed of SEEDS) {
        await yieldUi();
        const o = runSim({ weeks: r.weeks, seed, council: x.council, params: x.params, population: x.population });
        all.push(controlStats(o.daily, o.final.gini));
      }
      acc[x.key] = Object.fromEntries(ROWS.map((row) => [row.key, all.reduce((a, s) => a + s[row.key], 0) / all.length])) as unknown as ControlStats;
    }
    setMulti(acc);
    setBusy(null);
  }

  const table = (st: Record<RunKey, ControlStats>, caption: string) => (
    <table className="ledger ui-table ff-table">
      <caption className="ui-label">{caption}</caption>
      <thead>
        <tr>
          <th>metric (day 2+)</th>
          {RUNS.map((x) => <th key={x.key} className={`n ${x.key === "none" ? "ff-base" : ""}`}>{x.label}<span className="ff-th-sub">{x.sub}</span></th>)}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <tr key={row.key}>
            <td>{row.label} <span className="muted small">· {row.hint}</span></td>
            {RUNS.map((x) => {
              const v = st[x.key][row.key];
              const vd = x.key === "none" ? "" : verdict(row.key, v, st.none[row.key]);
              return (
                <td key={x.key} className={`n ff-cell ${vd}`}>
                  {row.fmt(v)}
                  {vd && vd !== "tie" && <span className="ff-mark">{vd === "better" ? "▲ better" : "▼ worse"}</span>}
                  {vd === "tie" && <span className="ff-mark">= same</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="econ econ-sim">
      <Panel
        title="Fast-forward"
        sub="deterministic headless sim · the contract's rule code (packages/sim) · seed 42 · runs in your browser"
        right={<span className="muted small">1 day = 1 epoch · launch wave of ~100 pilots</span>}
      >
        {!r && !busy && (
          <div className="econ-ff-intro">
            <p className="econ-ff-kicker">Run 4 weeks</p>
            <h2>What happens in 4 weeks with vs without the Council?</h2>
            <p className="muted">
              Same sinks, faucets and players; only the Council changes. <b>v0.3</b> is what the testnet contract runs today (gain 2, faucet range 70–110%).{" "}
              <b>v0.4</b> is the retuned proposal (gain 3, ceiling 100%: the Council can only tighten), not deployed yet. Every metric is shown for every run and coloured against &quot;No Council&quot;.
            </p>
            <div className="row-btns">
              <Button variant="primary" size="lg" icon="launch" onClick={() => go(4)}>Simulate 4 weeks</Button>
              <Button onClick={() => go(1)}>Simulate 1 week</Button>
            </div>
          </div>
        )}
        {busy && (
          <div className="econ-ff-intro">
            <p className="econ-ff-kicker">{busy}</p>
            <p className="muted">Running the headless economy locally. This takes a few seconds.</p>
          </div>
        )}
        {err && <p className="loss">{err}</p>}
        {r && !busy && (() => {
          const v4 = r.runs.v04.daily, nb = r.runs.none.daily, v3 = r.runs.v03.daily;
          const days = v4.map((_, i) => i + 1);
          const s4 = r.stats.v04, s0 = r.stats.none;
          const hero = (k: keyof ControlStats, title: string, fmt: (v: number) => string, note: string) => {
            const vd = verdict(k, s4[k], s0[k]);
            return (
              <div className="econ-hero-card">
                <span className="ui-label">{title}</span>
                <div className="econ-hero-value ff-hero">
                  <span className={vd === "better" ? "profit" : vd === "worse" ? "loss" : ""}>{fmt(s4[k])}</span>
                  <span className="muted small"> vs </span>
                  <span className="ff-hero-base">{fmt(s0[k])}</span>
                </div>
                <p className="muted small">{note} · v0.4 Council left, no Council right · {vd === "better" ? "Council better" : vd === "worse" ? "Council worse" : "same"}</p>
              </div>
            );
          };
          return (
            <>
              <div className="row-btns econ-ff-actions">
                <Button variant={r.weeks === 4 ? "primary" : "secondary"} onClick={() => go(4)}>Simulate 4 weeks</Button>
                <Button variant={r.weeks === 1 ? "primary" : "secondary"} onClick={() => go(1)}>Simulate 1 week</Button>
                <Button variant="secondary" onClick={eightSeeds}>Check 8 seeds (no cherry-picking)</Button>
              </div>
              <div className="econ-ff-headlines">
                {hero("mae", "Error vs 1% target", (v) => `${v.toFixed(2)} pp`, "mean |daily inflation − 1%|, lower is better")}
                {hero("worst", "Worst day", (v) => `${v.toFixed(2)} pp`, "largest |error|, lower is better")}
                {hero("inBand", "Days in target band", (v) => `${(v * 100).toFixed(0)}%`, "0–1% per day, higher is better")}
              </div>
              {table(r.stats, `Seed 42 · ${r.weeks} week${r.weeks === 1 ? "" : "s"} · green = better than No Council, red = worse`)}
              {multi && table(multi, `Average of 8 seeds (${SEEDS.join(", ")}) · ${r.weeks} week${r.weeks === 1 ? "" : "s"}`)}
              <p className="muted small ff-honest">
                Trade-offs we know about: the deployed v0.3 cuts error and the worst day but spends more days outside the band and raises Gini, because its 110% ceiling pays traders extra when growth dips. Over 8 seeds v0.4 is 1 pp lower on band time than No Council; in a tiny live population (3 humans) its mean error is slightly higher. Day 1 is the launch wave before the first epoch closes (on the chart, excluded from stats).
              </p>
              <div className="charts2">
                <div>
                  <h4>Daily gold inflation (green band = 0–1% target)</h4>
                  <LineChart
                    animate
                    band={[0, 1]}
                    clip={[-3, 8]}
                    yFmt={(v) => `${v.toFixed(0)}%`}
                    series={[
                      { name: "Council v0.4", color: "var(--profit)", values: v4.map((d) => d.inflationBps / 100), xs: days, fill: true },
                      { name: "No Council", color: "var(--loss)", values: nb.map((d) => d.inflationBps / 100), xs: days, dashed: true },
                      { name: "Council v0.3 (deployed)", color: "var(--gold)", values: v3.map((d) => d.inflationBps / 100), xs: days, dashed: true },
                    ]}
                  />
                </div>
                <div>
                  <h4>Council faucet multiplier</h4>
                  <LineChart
                    animate
                    height={180}
                    yFmt={(v) => `${v.toFixed(0)}%`}
                    series={[
                      { name: "v0.4 (range 70–100%)", color: "var(--profit)", values: v4.map((d) => d.faucetBps / 100), xs: days },
                      { name: "v0.3 (range 70–110%)", color: "var(--gold)", values: v3.map((d) => d.faucetBps / 100), xs: days, dashed: true },
                    ]}
                  />
                </div>
              </div>
              <code className="rule">{COUNCIL_RULE}</code>
              <p className="muted small">v0.4 changes two constants of this rule (gain 2→3, ceiling 110%→100%). The contract enforces the deployed constants; v0.4 ships with the next contract init.</p>
              <ul className="events">{r.runs.v04.events.filter((e) => e.type === "council").slice(-5).map((e, i) => <li key={i}>{e.text}</li>)}</ul>
            </>
          );
        })()}
      </Panel>
    </div>
  );
}
