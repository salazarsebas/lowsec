"use client";
import { useState } from "react";
import { LineChart } from "./LineChart";
import { Panel, Button, CountUp } from "@/ui";
import "@/styles/econ.css";

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);

export function Simulate() {
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [weeks, setWeeks] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go(w: number) {
    setBusy(true);
    setWeeks(w);
    setErr(null);
    try {
      const x = await fetch("/api/sim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weeks: w, seed: 42 }) }).then((res) => res.json());
      if (x?.error) setErr(String(x.error));
      setR(x?.error ? null : x);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setR(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="econ econ-sim">
      <Panel
        title="Fast-forward"
        sub="deterministic headless sim · same rules as the contract · seed 42"
        right={<span className="muted small">1 week = 168 game hours · ~120 players</span>}
      >
        {!r && !busy && (
          <div className="econ-ff-intro">
            <p className="econ-ff-kicker">Run 4 weeks</p>
            <h2>What happens in 4 weeks with vs without the Council?</h2>
            <p className="muted">The simulator uses the contract&apos;s public rule, sinks and faucets. Day 1 is the launch wave (shown on the chart, excluded from the stats). Charts clip at 20% so a first-day spike does not flatten the rest.</p>
            <div className="row-btns">
              <Button variant="primary" size="lg" icon="launch" disabled={busy} onClick={() => go(4)}>
                Simulate 4 weeks
              </Button>
              <Button disabled={busy} onClick={() => go(1)}>Simulate 1 week</Button>
            </div>
          </div>
        )}
        {busy && (
          <div className="econ-ff-intro">
            <p className="econ-ff-kicker">Simulating {weeks} week{weeks === 1 ? "" : "s"}…</p>
            <p className="muted">Running the headless economy (seed 42). This can take a few seconds.</p>
          </div>
        )}
        {err && <p className="loss">{err}</p>}
        {r && (() => {
          const c = r.council.daily, b = r.baseline.daily;
          const ci = c.slice(1).map((d: any) => d.inflationBps / 100);
          const bi = b.slice(1).map((d: any) => d.inflationBps / 100);
          const oi = r.original.daily.slice(1).map((d: any) => d.inflationBps / 100);
          const mae = (a: number[]) => mean(a.map((v) => Math.abs(v - 1)));
          const days = c.map((_: unknown, i: number) => i + 1);
          return (
            <>
              <div className="row-btns econ-ff-actions">
                <Button variant={weeks === 4 ? "primary" : "secondary"} disabled={busy} onClick={() => go(4)}>
                  {busy && weeks === 4 ? "simulating…" : "Simulate 4 weeks"}
                </Button>
                <Button variant={weeks === 1 ? "primary" : "secondary"} disabled={busy} onClick={() => go(1)}>
                  {busy && weeks === 1 ? "simulating…" : "Simulate 1 week"}
                </Button>
              </div>
              <div className="econ-ff-headlines">
                <div className="econ-hero-card">
                  <span className="ui-label">With Council</span>
                  <div className="econ-hero-value profit">
                    <CountUp value={mean(ci)} format={(n) => `${n.toFixed(2)}%`} />
                  </div>
                  <p className="muted small">mean daily inflation (day 2+)</p>
                </div>
                <div className="econ-hero-card">
                  <span className="ui-label">No Council</span>
                  <div className="econ-hero-value loss">
                    <CountUp value={mean(bi)} format={(n) => `${n.toFixed(2)}%`} />
                  </div>
                  <p className="muted small">same sim, faucet locked at launch</p>
                </div>
                <div className="econ-hero-card">
                  <span className="ui-label">Error vs 1% target</span>
                  <div className="econ-hero-value">
                    <CountUp value={mae(ci)} format={(n) => `${n.toFixed(2)} pp`} />
                    <span className="muted small"> vs </span>
                    <span className="loss"><CountUp value={mae(bi)} format={(n) => `${n.toFixed(2)} pp`} /></span>
                  </div>
                  <p className="muted small">mean |error| — Council left, no Council right</p>
                </div>
              </div>
              <div className="charts2">
                <div>
                  <h4>Daily gold inflation (green band = 0–1% target)</h4>
                  <LineChart
                    animate
                    band={[0, 1]}
                    clip={[-3, 20]}
                    yFmt={(v) => `${v.toFixed(0)}%`}
                    series={[
                      { name: "with Council", color: "var(--profit)", values: c.map((d: any) => d.inflationBps / 100), xs: days, fill: true },
                      { name: "no Council", color: "var(--loss)", values: b.map((d: any) => d.inflationBps / 100), xs: days, dashed: true },
                    ]}
                  />
                </div>
                <div>
                  <h4>Council faucet multiplier</h4>
                  <LineChart
                    animate
                    height={180}
                    yFmt={(v) => `${v.toFixed(0)}%`}
                    series={[{ name: "faucet multiplier %", color: "var(--gold)", values: c.map((d: any) => d.faucetBps / 100), xs: days, fill: true }]}
                  />
                </div>
              </div>
              <table className="ledger ui-table">
                <thead>
                  <tr>
                    <th></th>
                    <th className="n">with Council</th>
                    <th className="n">no Council</th>
                    <th className="n muted">v0.1 rules (no Council, no docking fee)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>mean daily inflation (day 2+)</td>
                    <td className="n">{mean(ci).toFixed(2)}%</td>
                    <td className="n">{mean(bi).toFixed(2)}%</td>
                    <td className="n muted">{mean(oi).toFixed(2)}%</td>
                  </tr>
                  <tr>
                    <td>mean |error| vs 1% target</td>
                    <td className="n">{mae(ci).toFixed(2)} pp</td>
                    <td className="n">{mae(bi).toFixed(2)} pp</td>
                    <td className="n muted">{mae(oi).toFixed(2)} pp</td>
                  </tr>
                  <tr>
                    <td>worst day</td>
                    <td className="n">{Math.max(...ci).toFixed(2)}%</td>
                    <td className="n">{Math.max(...bi).toFixed(2)}%</td>
                    <td className="n muted">{Math.max(...oi).toFixed(2)}%</td>
                  </tr>
                  <tr>
                    <td>final gold supply</td>
                    <td className="n">{r.council.final.supply.toLocaleString()}</td>
                    <td className="n">{r.baseline.final.supply.toLocaleString()}</td>
                    <td className="n muted">{r.original.final.supply.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td>final Gini</td>
                    <td className="n">{r.council.final.gini.toFixed(3)}</td>
                    <td className="n">{r.baseline.final.gini.toFixed(3)}</td>
                    <td className="n muted">{r.original.final.gini.toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td>cargo burned</td>
                    <td className="n">{c.reduce((a: number, d: any) => a + d.cargoBurned, 0)}</td>
                    <td className="n">{b.reduce((a: number, d: any) => a + d.cargoBurned, 0)}</td>
                    <td className="n muted">{r.original.daily.reduce((a: number, d: any) => a + d.cargoBurned, 0)}</td>
                  </tr>
                </tbody>
              </table>
              <code className="rule">{r.rule}</code>
              <ul className="events">{r.council.events.filter((e: any) => e.type === "council").slice(-5).map((e: any, i: number) => <li key={i}>{e.text}</li>)}</ul>
            </>
          );
        })()}
      </Panel>
    </div>
  );
}
