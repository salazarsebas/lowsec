"use client";
import { useState } from "react";
import { LineChart } from "./LineChart";

export function Simulate() {
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [weeks, setWeeks] = useState<number | null>(null);
  async function go(weeks: number) {
    setBusy(true);
    setWeeks(weeks);
    const x = await fetch("/api/sim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ weeks, seed: 42 }) }).then((x) => x.json());
    setR(x);
    setBusy(false);
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
  return (
    <div className="panel">
      <h3>Fast-forward <span className="muted small">deterministic headless sim (same rules as the contract) — 1 week = 168 game hours, ~120 players, seed 42. Day 1 is the launch wave (shown, excluded from the stats; chart clipped at 20%).</span></h3>
      <div className="row-btns">
        {[1, 4].map((w) => (
          <button key={w} className={weeks === w ? "primary" : ""} disabled={busy} onClick={() => go(w)}>{busy && weeks === w ? "simulating…" : `Simulate ${w} week${w > 1 ? "s" : ""}`}</button>
        ))}
      </div>
      {r && (() => {
        const c = r.council.daily, b = r.baseline.daily;
        const ci = c.slice(1).map((d: any) => d.inflationBps / 100), bi = b.slice(1).map((d: any) => d.inflationBps / 100), oi = r.original.daily.slice(1).map((d: any) => d.inflationBps / 100);
        const mae = (a: number[]) => mean(a.map((v) => Math.abs(v - 1)));
        return (
          <>
            <div className="charts2"><div><h4>Daily gold inflation (green band = 0–1% target)</h4><LineChart band={[0, 1]} clip={[-3, 20]} yFmt={(v) => `${v.toFixed(0)}%`} series={[
              { name: "with Council", color: "#3ee6ff", values: c.map((d: any) => d.inflationBps / 100) },
              { name: "no Council", color: "#ff5c7a", values: b.map((d: any) => d.inflationBps / 100), dashed: true },
            ]} />
            </div><div><h4>Council faucet multiplier</h4><LineChart height={180} yFmt={(v) => `${v.toFixed(0)}%`} series={[{ name: "faucet multiplier %", color: "#f5a524", values: c.map((d: any) => d.faucetBps / 100) }]} /></div></div>
            <table className="ledger">
              <thead><tr><th></th><th>with Council</th><th>no Council</th><th className="muted">v0.1 rules (no Council, no docking fee)</th></tr></thead>
              <tbody>
                <tr><td>mean daily inflation (day 2+)</td><td>{mean(ci).toFixed(2)}%</td><td>{mean(bi).toFixed(2)}%</td><td className="muted">{mean(oi).toFixed(2)}%</td></tr>
                <tr><td>mean |error| vs 1% target</td><td>{mae(ci).toFixed(2)} pp</td><td>{mae(bi).toFixed(2)} pp</td><td className="muted">{mae(oi).toFixed(2)} pp</td></tr>
                <tr><td>worst day</td><td>{Math.max(...ci).toFixed(2)}%</td><td>{Math.max(...bi).toFixed(2)}%</td><td className="muted">{Math.max(...oi).toFixed(2)}%</td></tr>
                <tr><td>final gold supply</td><td>{r.council.final.supply.toLocaleString()}</td><td>{r.baseline.final.supply.toLocaleString()}</td><td className="muted">{r.original.final.supply.toLocaleString()}</td></tr>
                <tr><td>final Gini</td><td>{r.council.final.gini.toFixed(3)}</td><td>{r.baseline.final.gini.toFixed(3)}</td><td className="muted">{r.original.final.gini.toFixed(3)}</td></tr>
                <tr><td>cargo burned</td><td>{c.reduce((a: number, d: any) => a + d.cargoBurned, 0)}</td><td>{b.reduce((a: number, d: any) => a + d.cargoBurned, 0)}</td><td className="muted">{r.original.daily.reduce((a: number, d: any) => a + d.cargoBurned, 0)}</td></tr>
              </tbody>
            </table>
            <code className="rule">{r.rule}</code>
            <ul className="events">{r.council.events.filter((e: any) => e.type === "council").slice(-5).map((e: any, i: number) => <li key={i}>{e.text}</li>)}</ul>
          </>
        );
      })()}
    </div>
  );
}
