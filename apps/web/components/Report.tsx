"use client";
import { useEffect, useState } from "react";
import { LineChart, councilMarkers, rollingMean } from "./LineChart";
import { AttestationBadge } from "./Badge";
import { Panel, Stat, CountUp, Icon } from "@/ui";
import "@/styles/econ.css";

type EpochRec = {
  epoch: number; supply_start: number | string; supply_end: number | string;
  inflation_bps: number; faucet_bps: number; span?: number;
};

function num(v: number | string | undefined) { return Number(v ?? 0); }
function pct(bps: number, digits = 1) { return `${(bps / 100).toFixed(digits)}%`; }

/** Horizontal gauge with an optional target band and a needle. Values outside [min,max] are clamped on the track. */
function BandGauge({ value, min, max, band, format, midLabel }: {
  value: number; min: number; max: number; band?: [number, number];
  format: (n: number) => string; midLabel?: string;
}) {
  const span = max - min;
  const at = (v: number) => `${((Math.min(max, Math.max(min, v)) - min) / span) * 100}%`;
  return (
    <div className="econ-gauge">
      <div className="econ-gauge-track" role="meter" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}>
        {band && <i className="econ-gauge-band" style={{ left: at(band[0]), width: `calc(${at(band[1])} - ${at(band[0])})` }} />}
        <i className="econ-gauge-needle" style={{ left: at(value) }} />
      </div>
      <div className="econ-gauge-axis">
        <span>{format(min)}</span>
        {(midLabel || band) && <span className={band ? "econ-gauge-target" : undefined}>{midLabel ?? (band ? `target ${format(band[0])}–${format(band[1])}` : "")}</span>}
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

const RECENT_EPOCHS = 60;
const CLIP = 5;

/** Loading state: skeleton cards in the final layout instead of a bare "loading…" line (the report can take a while on testnet). */
function ReportSkeleton() {
  return (
    <div className="report econ" aria-busy="true">
      <Panel title="Economic Report" sub="reading the ledger from the contract…">
        <div className="econ-hero">
          {[0, 1, 2].map((i) => <div key={i} className="econ-skel"><i className="short" /><i className="big" /><i /><i className="short" /></div>)}
        </div>
        <div className="econ-hero">
          {[0, 1, 2].map((i) => <div key={i} className="econ-skel" style={{ minHeight: 70 }}><i className="short" /><i className="big" /></div>)}
        </div>
      </Panel>
      <Panel title="Gold growth per epoch" sub="loading epoch records…"><div className="econ-skel econ-skel-chart"><i className="short" /><i /><i /><i className="short" /></div></Panel>
    </div>
  );
}

export function Report() {
  const [r, setR] = useState<any>(null);
  const [range, setRange] = useState<"recent" | "all">("recent");
  useEffect(() => {
    const load = () => fetch("/api/report").then((x) => x.json()).then(setR).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (!r) return <ReportSkeleton />;

  const e = r.economy;
  const t = e.total ?? {};
  const minted = num(t.minted_npc_buy_orders) + num(t.minted_starter_grants);
  const burned = num(t.burned_npc_sell_orders) + num(t.burned_tolls) + num(t.burned_raid_fees) + num(t.burned_dock_fees);
  const ratio = minted ? burned / minted : 0;
  const gold = num(e.gold_supply);
  const start = num(e.epoch_supply_start);
  const inflNow = start > 0 ? ((gold - start) / start) * 100 : 0;
  const target = (e.council_signal?.target_bps ?? 100) / 100;
  const sig = e.council_signal;
  const faucet = num(e.faucet_bps);
  const nextFaucet = num(e.rule_next_faucet_bps ?? sig?.next_faucet_bps ?? faucet);
  const floor = 70, ceil = 110; // council_min/max_faucet_bps: 7000 / 11000 — public rule, [70%, 110%]

  const allRecs: EpochRec[] = Array.isArray(r.epochs) ? r.epochs : [];
  // default view: the last ~60 epochs (launch spikes squash everything else); "All" shows the full window
  const lastEp = allRecs.length ? Math.max(...allRecs.map((x) => num(x.epoch))) : 0;
  const recs = range === "all" ? allRecs : allRecs.filter((x) => num(x.epoch) + Math.max(1, num(x.span ?? 1)) > lastEp - RECENT_EPOCHS);
  const closed = recs.filter((x) => num(x.supply_start) > 0);
  const inflXs = closed.map((x) => num(x.epoch));
  const inflSpans = closed.map((x) => Math.max(1, num(x.span ?? 1)));
  const inflation = closed.map((x) => x.inflation_bps / 100);
  // Gold path uses each record's start and end so the line holds flat across a
  // merged idle span instead of drawing a diagonal between distant close-points.
  const goldXs: number[] = [];
  const goldVs: number[] = [];
  for (const rec of recs) {
    if (num(rec.supply_end) <= 0 && num(rec.supply_start) <= 0) continue;
    goldXs.push(num(rec.epoch));
    goldVs.push(num(rec.supply_start) || num(rec.supply_end));
    goldXs.push(num(rec.epoch) + Math.max(1, num(rec.span ?? 1)));
    goldVs.push(num(rec.supply_end));
  }
  const hasChart = closed.length >= 1 && inflation.some((v) => Number.isFinite(v));
  const markers = councilMarkers(r.council ?? []);
  const rolling = rollingMean(inflation, 5);
  const overflow = inflation.filter((v) => Math.abs(v) > CLIP).length;

  const barMax = Math.max(minted, burned, 1);
  const cargo = num(t.cargo_burned_units);
  const ambushes = num(t.ambushes);

  return (
    <div className="report econ">
      <Panel title="Economic Report" sub={`live from ${r.contract} · epoch ${e.epoch}`} right={<span className="muted small">on-chain ledger · 1 epoch = 4 min</span>}>
        <div className="econ-hero">
          <div className="econ-hero-card">
            <span className="ui-label">Sink / faucet</span>
            <div className="econ-hero-value">
              <CountUp value={ratio} format={(n) => n.toFixed(2)} />
            </div>
            <div className="econ-flow">
              <div className="econ-flow-row">
                <span className="ui-label">Faucets</span>
                <i className="econ-flow-bar profit" style={{ width: `${(minted / barMax) * 100}%` }} />
                <b className="profit">+{minted.toLocaleString()}</b>
              </div>
              <div className="econ-flow-row">
                <span className="ui-label">Sinks</span>
                <i className="econ-flow-bar loss" style={{ width: `${(burned / barMax) * 100}%` }} />
                <b className="loss">−{burned.toLocaleString()}</b>
              </div>
            </div>
            <p className="muted small">{ratio >= 1 ? "Sinks absorb more than issuance this ledger." : `Sinks absorb ${(ratio * 100).toFixed(0)}% of issuance — the rest is net inflation.`}</p>
          </div>

          <div className="econ-hero-card">
            <span className="ui-label">Inflation this epoch</span>
            <div className={`econ-hero-value ${inflNow > target ? "loss" : inflNow < 0 ? "loss" : "profit"}`}>
              <CountUp value={inflNow} format={(n) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`} />
            </div>
            <BandGauge
              value={inflNow}
              min={-5}
              max={5}
              band={[0, target]}
              format={(n) => `${n.toFixed(0)}%`}
              midLabel={`target 0–${target.toFixed(0)}%`}
            />
            <p className="muted small">Live vs epoch open ({start.toLocaleString()} → {gold.toLocaleString()} ◎). Green band is the Council target.</p>
            {sig && <p className="econ-gap-note">Different windows: this card is the current epoch incl. new-player starter grants; the Council acts on a {sig.epochs_covered}-epoch mean without grants ({(sig.signal_bps / 100).toFixed(2)}%/epoch), so it can raise while this reads red.</p>}
          </div>

          <div className="econ-hero-card">
            <span className="ui-label">Faucet multiplier</span>
            <div className="econ-hero-value gold">
              <CountUp value={faucet / 100} format={(n) => `${n.toFixed(1)}%`} />
            </div>
            <BandGauge
              value={faucet / 100}
              min={floor}
              max={ceil}
              format={(n) => `${n.toFixed(0)}%`}
              midLabel={`floor ${floor}% – ceiling ${ceil}%`}
            />
            <p className="muted small">
              {sig?.hold
                ? `HOLD — ${sig.hold}`
                : nextFaucet === faucet
                  ? "Rule holds the multiplier this epoch."
                  : `Rule next: ${pct(nextFaucet)} (${nextFaucet > faucet ? "raise" : "cut"}, cap ±10%/epoch).`}
            </p>
          </div>
        </div>

        <div className="econ-stats">
          <Stat label="Gold supply" value={gold} tone="gold" size="lg" tick unit="◎" />
          <Stat label="Minted (faucets)" value={<CountUp value={minted} signed />} tone="profit" />
          <Stat label="Burned (sinks)" value={<CountUp value={burned} format={(n) => `−${Math.round(n).toLocaleString()}`} />} tone="loss" />
          <Stat label="Cargo burned" value={cargo} unit="units" />
          <Stat label="Gini (gold)" value={<CountUp value={Number(r.gini)} format={(n) => n.toFixed(3)} />} />
          <Stat label="Pilots" value={Number(e.players)} />
        </div>
        <p className="muted small econ-gini-note">{r.giniPlayers} pilots in the Gini (Guild float excluded) · {ambushes} ambushes destroyed {cargo} cargo units — a real sink, not a transfer.</p>
        {r.council[0] && (() => {
          const c = r.council[0];
          return (
            <div className="econ-latest">
              <div className="econ-council-head">
                <Icon name="council" size={14} />
                <b>Epoch {c.epoch}</b>
                {c.hold ? <span className="amber">hold at {c.prevFaucetBps / 100}%</span> : <span>faucets {c.prevFaucetBps / 100}% → <b>{c.nextFaucetBps / 100}%</b></span>}
                <span className="muted">growth {(c.inflationBps / 100).toFixed(2)}%/epoch ({c.windowEpochs}-epoch mean, {c.players} players)</span>
                <AttestationBadge d={c} />
              </div>
              <div className="tt-reason">“{c.explanation}”{c.explanationSource === "model" && <span className="muted small"> — written by {c.model}</span>}{c.explanationSource === "rule-fallback" && <span className="amber small"> — model reply contradicted the rule; rule text shown</span>}</div>
            </div>
          );
        })()}
      </Panel>

      <Panel
        title="Gold growth per epoch"
        sub={`${range === "all" ? "full on-chain window" : `last ${RECENT_EPOCHS} epochs`} · clamped at ±${CLIP}%${overflow ? ` (${overflow} bar${overflow > 1 ? "s" : ""} past the edge, capped in white)` : ""} · line = 5-record rolling mean`}
        right={
          <span className="econ-chart-tools">
            <button className={range === "recent" ? "sel" : ""} onClick={() => setRange("recent")}>Last {RECENT_EPOCHS}</button>
            <button className={range === "all" ? "sel" : ""} onClick={() => setRange("all")}>All</button>
          </span>
        }
      >
        {hasChart ? (
          <LineChart
            height={220}
            band={[0, target]}
            clip={[-CLIP, CLIP]}
            yFmt={(v) => `${v.toFixed(1)}%`}
            yFmtRight={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`}
            markers={markers}
            series={[
              { name: "inflation % / epoch", color: "var(--loss)", values: inflation, xs: inflXs, spans: inflSpans, kind: "bars" },
              { name: "5-record rolling mean", color: "var(--ink)", values: rolling, xs: inflXs.map((x, i) => x + inflSpans[i] / 2) },
              { name: "gold supply", color: "var(--gold)", values: goldVs, xs: goldXs, axis: "right", kind: "area", fill: true },
            ]}
          />
        ) : (
          <div className="econ-empty">
            <Icon name="gauge" size={22} />
            <p>No closed epoch records in the on-chain window yet.</p>
            <p className="muted small">The contract writes one record each time an epoch closes (idle epochs merge into a single record with span &gt; 1). This chart reads the public <code>epochs</code> view — it never invents points. It fills as epochs close.</p>
          </div>
        )}
      </Panel>

      <div className="econ-split">
        <Panel title="Ledger" sub="cumulative, from the contract">
          <div className="cols econ-ledgers">
            <table className="ledger ui-table">
              <thead><tr><th>Faucets</th><th className="n"></th></tr></thead>
              <tbody>
                <tr><td>Town buy orders (you sell cargo)</td><td className="n profit">+{num(t.minted_npc_buy_orders).toLocaleString()}</td></tr>
                <tr><td>Starter grants</td><td className="n profit">+{num(t.minted_starter_grants).toLocaleString()}</td></tr>
                {num(t.minted_guild_float) > 0 && (
                  <tr title="Minted once in the genesis epoch (seed_guild); genesis supply, never counted as inflation">
                    <td>The Guild&apos;s float (market maker, genesis only)</td>
                    <td className="n muted">{num(t.minted_guild_float).toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <table className="ledger ui-table">
              <thead><tr><th>Sinks</th><th className="n"></th></tr></thead>
              <tbody>
                <tr><td>Town sell orders (you buy cargo)</td><td className="n loss">−{num(t.burned_npc_sell_orders).toLocaleString()}</td></tr>
                <tr><td>Lane tolls</td><td className="n loss">−{num(t.burned_tolls).toLocaleString()}</td></tr>
                <tr><td>Raid fees</td><td className="n loss">−{num(t.burned_raid_fees).toLocaleString()}</td></tr>
                <tr><td>Docking fees (5% of gold above 400 — progressive)</td><td className="n loss">−{num(t.burned_dock_fees).toLocaleString()}</td></tr>
                <tr>
                  <td>Cargo burned in ambushes <span className="muted">({ambushes} hits)</span></td>
                  <td className="n loss">{cargo.toLocaleString()} units</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="AI Economic Council" icon={<Icon name="council" size={14} />}>
          <code className="rule">{r.councilRule}</code>
          <p className="muted small">The number comes from the public rule (the contract computes it too: <code>rule_next_faucet_bps</code>) and the contract rejects any change above ±10% per epoch. The model only writes the explanation.</p>
          {sig && (
            <div className="signal">
              <div className="muted small">What the rule sees right now (contract view <code>council_signal</code>)</div>
              <div>
                Gold {num(sig.supply_start).toLocaleString()} → {num(sig.supply_end).toLocaleString()} over {sig.epochs_covered} epoch(s) = <b>{(sig.signal_bps / 100).toFixed(2)}%/epoch</b> vs target {(sig.target_bps / 100).toFixed(0)}% ·{" "}
                {sig.hold ? <span className="amber">HOLD — {sig.hold}</span> : <>faucets {sig.faucet_bps / 100}% → <b>{sig.next_faucet_bps / 100}%</b> ({sig.next_faucet_bps > sig.faucet_bps ? "raise: growth below target" : sig.next_faucet_bps < sig.faucet_bps ? "cut: growth above target" : "hold"})</>}
              </div>
            </div>
          )}
          {r.council.length === 0 && <p className="muted">Waiting for the next epoch to close…</p>}
          {r.council.slice(0, 6).map((c: any) => (
            <div key={c.ts} className={c.ok ? "council-entry" : "council-entry rejected"}>
              {!c.ok && <div className="red small">✗ rejected on-chain (see tx) — the contract enforces the bound, not the server</div>}
              <div className="econ-council-head">
                <b>Epoch {c.epoch}</b>
                <span>growth {(c.inflationBps / 100).toFixed(2)}%/epoch ({c.windowEpochs}-epoch mean, {c.players} players)</span>
                {c.hold ? <span className="amber">hold at {c.prevFaucetBps / 100}%</span> : <span>faucets {c.prevFaucetBps / 100}% → <b>{c.nextFaucetBps / 100}%</b></span>}
                <AttestationBadge d={c} />
              </div>
              <div className="tt-reason">“{c.explanation}”{c.explanationSource === "model" && <span className="muted small"> — written by {c.model}</span>}{c.explanationSource === "rule-fallback" && <span className="amber small"> — model reply contradicted the rule; rule text shown</span>}</div>
              {c.tx && <a className="small" href={`${r.explorer}/txns/${c.tx}`} target="_blank" rel="noreferrer">council_update tx ↗</a>}
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
