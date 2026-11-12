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
  const burned = t.burned_npc_sell_orders + t.burned_tolls + t.burned_raid_fees;
  const ep = r.epochs as any[];
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
          <div className="kpi"><span>Gini (gold)</span><b>{r.gini.toFixed(3)}</b><small className="muted">{r.giniPlayers} accounts</small></div>
          <div className="kpi"><span>Players</span><b>{e.players}</b></div>
        </div>
        <div className="cols">
          <table className="ledger">
            <thead><tr><th>Faucets</th><th></th></tr></thead>
            <tbody>
              <tr><td>Town buy orders (you sell cargo)</td><td className="green">+{t.minted_npc_buy_orders}</td></tr>
              <tr><td>Starter grants</td><td className="green">+{t.minted_starter_grants}</td></tr>
            </tbody>
          </table>
          <table className="ledger">
            <thead><tr><th>Sinks</th><th></th></tr></thead>
            <tbody>
              <tr><td>Town sell orders (you buy cargo)</td><td className="red">−{t.burned_npc_sell_orders}</td></tr>
              <tr><td>Lane tolls</td><td className="red">−{t.burned_tolls}</td></tr>
              <tr><td>Raid fees</td><td className="red">−{t.burned_raid_fees}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <h3>Inflation per epoch vs target <span className="muted small">(1 epoch = 4 min live · with only a handful of testnet players one sale swings it hard; Fast-forward shows the 120-player economy)</span></h3>
        <LineChart band={[0, 1]} yFmt={(v) => `${v.toFixed(1)}%`} series={[
          { name: "inflation %", color: "#ff5c7a", values: ep.map((x) => x.inflation_bps / 100) },
          { name: "faucet % / 100", color: "#3ee6ff", values: ep.map((x) => x.faucet_bps / 10000), dashed: true },
        ]} />
      </div>
      <div className="panel">
        <h3>AI Economic Council</h3>
        <code className="rule">{r.councilRule}</code>
        <p className="muted small">The number comes from the public rule (the contract computes it too: <code>rule_next_faucet_bps</code>) and the contract rejects any change above ±10% per epoch. The model only writes the explanation.</p>
        {r.council.length === 0 && <p className="muted">Waiting for the next epoch to close…</p>}
        {r.council.slice(0, 6).map((c: any) => (
          <div key={c.ts} className="council-entry">
            <div><b>Epoch {c.epoch}</b> · inflation {(c.inflationBps / 100).toFixed(2)}% · faucets {c.prevFaucetBps / 100}% → <b>{c.nextFaucetBps / 100}%</b> <AttestationBadge d={c} /></div>
            <div className="tt-reason">“{c.explanation}”</div>
            {c.tx && <a className="small" href={`${r.explorer}/txns/${c.tx}`} target="_blank" rel="noreferrer">council_update tx ↗</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
