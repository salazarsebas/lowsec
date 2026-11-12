"use client";
import { useEffect, useState } from "react";
import { LineChart } from "./LineChart";
import { AttestationBadge } from "./Badge";

export function Report() {
  const [r, setR] = useState<any>(null);
  useEffect(() => {
    const load = () => fetch("/api/report").then((x) => x.json()).then(setR).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (!r) return <div className="panel">loading report…</div>;
  const e = r.economy;
  const t = e.total;
  const minted = t.minted_npc_buy_orders + t.minted_starter_grants;
  const burned = t.burned_npc_sell_orders + t.burned_tolls + t.burned_raid_fees + (t.burned_dock_fees ?? 0);
  const sig = e.council_signal;
  const ep = (r.epochs as any[]).filter((x) => Number(x.supply_start) > 0); // genesis epoch: growth undefined
  return (
    <div className="report">
      <div className="panel">
        <h3>Economic Report <span className="muted small">live from {r.contract} · epoch {e.epoch}</span></h3>
        <div className="kpis">
          <div className="kpi"><span>Gold supply</span><b>{Number(e.gold_supply).toLocaleString()}</b></div>
          <div className="kpi"><span>Minted (faucets)</span><b className="green">+{minted.toLocaleString()}</b></div>
          <div className="kpi"><span>Burned (sinks)</span><b className="red">−{burned.toLocaleString()}</b></div>
          <div className="kpi"><span>Sink / faucet</span><b>{minted ? (burned / minted).toFixed(2) : "–"}</b></div>
          <div className="kpi"><span>Cargo burned</span><b>{t.cargo_burned_units} units · {t.ambushes} ambushes</b></div>
          <div className="kpi"><span>Faucet multiplier</span><b>{e.faucet_bps / 100}%</b></div>
          <div className="kpi"><span>Gini (gold)</span><b>{r.gini.toFixed(3)}</b><small className="muted">{r.giniPlayers} pilots (Guild float excluded)</small></div>
          <div className="kpi"><span>Players</span><b>{e.players}</b></div>
        </div>
        <div className="cols">
          <table className="ledger">
            <thead><tr><th>Faucets</th><th></th></tr></thead>
            <tbody>
              <tr><td>Town buy orders (you sell cargo)</td><td className="green">+{t.minted_npc_buy_orders}</td></tr>
              <tr><td>Starter grants</td><td className="green">+{t.minted_starter_grants}</td></tr>
              {(t.minted_guild_float ?? 0) > 0 && <tr><td title="Minted once in the genesis epoch (seed_guild); genesis supply, never counted as inflation">The Guild's float (market maker, genesis only)</td><td className="muted">{Number(t.minted_guild_float).toLocaleString()}</td></tr>}
            </tbody>
          </table>
          <table className="ledger">
            <thead><tr><th>Sinks</th><th></th></tr></thead>
            <tbody>
              <tr><td>Town sell orders (you buy cargo)</td><td className="red">−{t.burned_npc_sell_orders}</td></tr>
              <tr><td>Lane tolls</td><td className="red">−{t.burned_tolls}</td></tr>
              <tr><td>Raid fees</td><td className="red">−{t.burned_raid_fees}</td></tr>
              <tr><td>Docking fees (5% of gold above 400 — progressive)</td><td className="red">−{t.burned_dock_fees ?? 0}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <h3>Gold growth per epoch vs 1% target <span className="muted small">(1 epoch = 4 min live; y-axis clipped at ±25%, ▲ marks the real value. 4 AI traders + the Guild keep arbitrage margins thin; the Council uses a 3-epoch mean and holds below 5 players)</span></h3>
        <LineChart band={[0, 1]} clip={[-25, 25]} yFmt={(v) => `${v.toFixed(1)}%`} series={[
          { name: "inflation %", color: "#ff5c7a", values: ep.map((x) => x.inflation_bps / 100) },
          { name: "faucet % / 100", color: "#3ee6ff", values: ep.map((x) => x.faucet_bps / 10000), dashed: true },
        ]} />
      </div>
      <div className="panel">
        <h3>AI Economic Council</h3>
        <code className="rule">{r.councilRule}</code>
        <p className="muted small">The number comes from the public rule (the contract computes it too: <code>rule_next_faucet_bps</code>) and the contract rejects any change above ±10% per epoch. The model only writes the explanation.</p>
        {sig && (
          <div className="signal">
            <div className="muted small">What the rule sees right now (contract view <code>council_signal</code>)</div>
            <div>
              Gold {Number(sig.supply_start).toLocaleString()} → {Number(sig.supply_end).toLocaleString()} over {sig.epochs_covered} epoch(s) = <b>{(sig.signal_bps / 100).toFixed(2)}%/epoch</b> vs target {(sig.target_bps / 100).toFixed(0)}% ·{" "}
              {sig.hold ? <span className="amber">HOLD — {sig.hold}</span> : <>faucets {sig.faucet_bps / 100}% → <b>{sig.next_faucet_bps / 100}%</b> ({sig.next_faucet_bps > sig.faucet_bps ? "raise: growth below target" : sig.next_faucet_bps < sig.faucet_bps ? "cut: growth above target" : "hold"})</>}
            </div>
          </div>
        )}
        {r.council.length === 0 && <p className="muted">Waiting for the next epoch to close…</p>}
        {r.council.slice(0, 6).map((c: any) => (
          <div key={c.ts} className={c.ok ? "council-entry" : "council-entry rejected"}>
            {!c.ok && <div className="red small">✗ rejected on-chain (see tx) — the contract enforces the bound, not the server</div>}
            <div><b>Epoch {c.epoch}</b> · growth {(c.inflationBps / 100).toFixed(2)}%/epoch ({c.windowEpochs}-epoch mean, {c.players} players) · {c.hold ? <span className="amber">hold at {c.prevFaucetBps / 100}%</span> : <>faucets {c.prevFaucetBps / 100}% → <b>{c.nextFaucetBps / 100}%</b></>} <AttestationBadge d={c} /></div>
            <div className="tt-reason">“{c.explanation}”</div>
            {c.tx && <a className="small" href={`${r.explorer}/txns/${c.tx}`} target="_blank" rel="noreferrer">council_update tx ↗</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
