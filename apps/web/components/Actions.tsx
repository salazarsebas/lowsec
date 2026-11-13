"use client";
import { useRef, useState } from "react";
import type { State } from "@/lib/types";
import { GOODS, LANES, TOWNS, TOWN_LABEL, ambushPct, laneOf } from "@/lib/types";
import { GoodIcon, Icon, Pill, Progress, SecTag, riskToSec } from "@/ui";
import type { RelayResult, Session } from "@/lib/near";
import { sfx } from "@/lib/sound";
import { bestTrade, hotLane } from "@/lib/advice";
import type { Toast } from "@/lib/useGame";

type OnResult = (msg: string, ok: boolean, tx?: string, kind?: Toast["kind"]) => void;
const fmtEta = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.ceil(sec % 60))).padStart(2, "0")}`;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Bottom dock. Docked: Market · Haul (lane risk cards) · Raid. Hauling: convoy HUD with trip progress.
 *  Recorder/e2e contract: h3 "Market · <Town>", rows <tr> with Buy/Sell all, input[type=range] (qty),
 *  .panel with h3 "Haul" holding 2 <select>s (cargo, destination), button.route Safe/Lowsec,
 *  button.primary "Depart…", .panel "Raid a Lowsec lane" with a lane <select> + "Post raid", h3 "On the road". */
export function Actions({ s, session, onResult, runTx, pending, step, now, docking, recordBuy, clearCost, unitCost }: {
  s: State; session: Session; onResult: OnResult; step: number | null; now: number; docking: boolean;
  runTx: (method: string, args: Record<string, any>, label: string, kind: Toast["kind"]) => Promise<RelayResult | null>; pending: string | null;
  recordBuy: (good: string, qty: number, gold: number) => void; clearCost: (good: string) => void; unitCost: (good: string) => number | null;
}) {
  const me = s.me!;
  const p = s.params;
  // one tx at a time across the whole dock: buttons stay disabled until the tx resolves and state is refetched
  const busy = !!pending;
  const [qty, setQty] = useState(10);
  const [dest, setDest] = useState<number | null>(null);
  const [route, setRoute] = useState<"safe" | "lowsec">("lowsec");
  const [cargoSel, setCargo] = useState<string | null>(null);
  const [lane, setLane] = useState(0);
  const [stake, setStake] = useState(p.raid_min_stake);
  const seen = useRef<Record<number, number>>({});
  if (!me.player) return null;
  const here = me.player.town;
  const town = s.economy.towns[here];

  async function run(method: string, args: Record<string, unknown>, label: string, kind: Toast["kind"], after?: () => void) {
    const r = await runTx(method, args as Record<string, any>, label, kind);
    if (r?.ok) after?.();
    sfx(r?.ok ? (kind === "haul" ? "launch" : "confirm") : "error");
  }
  void session; void onResult; // kept in the props contract for page.tsx / recorder
  const pendLabel = (m: string, idle: React.ReactNode, busyText: string) => (pending === m ? <><span className="spin" /> {busyText}</> : idle);

  // ---------- on the road: convoy HUD ----------
  if (me.player.haul) {
    const h = me.player.haul;
    const tickMs = p.tick_seconds * 1000;
    seen.current[h.id] ??= now;
    const t0 = Math.max(s.genesisMs + h.depart_tick * tickMs, Math.min(seen.current[h.id], s.genesisMs + h.arrive_tick * tickMs - 1500));
    const tA = s.genesisMs + h.arrive_tick * tickMs;
    const pct = s.genesisMs ? Math.min(1, Math.max(0.02, (now - t0) / (tA - t0))) : 0.5;
    const eta = Math.max(0, (tA - now) / 1000);
    const low = h.route === 1;
    const l = laneOf(h.from, h.to);
    const raiders = s.economy.raids.filter((r) => r.lane === l).length;
    const risk = low ? ambushPct(p, raiders) : 0;
    const good = GOODS[h.good];
    const atRisk = h.qty * (s.economy.towns[h.to]?.bid[h.good] ?? 0);
    const reached = s.economy.tick >= h.arrive_tick;
    return (
      <div className="dock-row">
        <div className={low ? "panel dock-convoy low" : "panel dock-convoy"}>
          <div className="ui-panel-header">
            <h3>On the road</h3>
            <span className="sub">{TOWN_LABEL[TOWNS[h.from]]} ▸ {TOWN_LABEL[TOWNS[h.to]]}</span>
            <span className="right">{docking || reached ? <Pill tone="signal" icon="radar">Docking</Pill> : <Pill tone={low ? "low" : "high"} icon={low ? "lowsec" : "safe"}>{low ? "Lowsec · in transit" : "Safe lane · in transit"}</Pill>}</span>
          </div>
          <div className="convoy-track">
            <span className="ct-town">{TOWN_LABEL[TOWNS[h.from]]}</span>
            <div className="ct-bar">
              <Progress value={pct} color={low ? "var(--sec-low)" : "var(--sec-high)"} />
              <span className="ct-ship" style={{ left: `${pct * 100}%` }}><Icon name="launch" size={16} /></span>
            </div>
            <span className="ct-town">{TOWN_LABEL[TOWNS[h.to]]}</span>
          </div>
          <div className="convoy-stats">
            <div><span className="ui-label">ETA</span><b className="num">{docking || reached ? "0:00" : fmtEta(eta)}</b></div>
            <div><span className="ui-label">Cargo</span><b className="num"><GoodIcon good={good} size={14} /> {h.qty} {good}</b></div>
            <div><span className="ui-label">Ambush risk</span><b className="num" style={{ color: low ? "var(--sec-low)" : "var(--sec-high)" }}>{risk}%</b></div>
            <div><span className="ui-label">Raiders on lane</span><b className="num">{low ? raiders : "—"}</b></div>
            <div><span className="ui-label">Value at risk</span><b className="num gold">{low ? atRisk : 0}<GoodIcon good="gold" size={13} /></b></div>
          </div>
          <div className="convoy-foot">
            {docking ? <span className="docking"><span className="spin" /> Docking · resolving arrival on-chain…</span>
              : reached ? <button disabled={busy} onClick={() => run("arrive", {}, "arrive", "arrive")}>Arrive</button>
              : <span className="muted small">{low ? `Lowsec: if raiders hit, you lose ${p.ambush_loss_bps / 100}% of the cargo (burned forever / looted).` : "Safe lane: no raiders, slower, bigger toll."}</span>}
          </div>
        </div>
      </div>
    );
  }

  // ---------- docked ----------
  const destOpts = [0, 1, 2].filter((t) => t !== here);
  const holdTotal = GOODS.reduce((a, g) => a + (me.balances[g] ?? 0), 0);
  // default cargo = the good you hold most of (falls back to the selection)
  const autoCargo = GOODS.reduce((a, g) => ((me.balances[g] ?? 0) > (me.balances[a] ?? 0) ? g : a), GOODS[0]);
  const cargo = cargoSel ?? autoCargo;
  const gi = GOODS.indexOf(cargo);
  const bestDest = destOpts.reduce((a, t) => ((s.economy.towns[t]?.bid[gi] ?? 0) > (s.economy.towns[a]?.bid[gi] ?? 0) ? t : a), destOpts[0]);
  const d = dest !== null && destOpts.includes(dest) ? dest : bestDest;
  const l = laneOf(here, d);
  const raidsOnLane = s.economy.raids.filter((r) => r.lane === l).length;
  const holding = me.balances[cargo] ?? 0;
  const estRevenue = Math.floor(holding * (s.economy.towns[d]?.bid[gi] ?? 0));
  const lowRisk = ambushPct(p, raidsOnLane);
  const lossFrac = p.ambush_loss_bps / 10000;
  const uc = unitCost(cargo);
  const basis = holding ? Math.round(holding * (uc ?? town.ask[gi])) : 0;
  const exp = (r: 0 | 1) => Math.round(estRevenue * (1 - (r ? lowRisk / 100 : 0) * lossFrac)) - p.toll_gold[r] - basis;
  const newChance = ambushPct(p, s.economy.raids.filter((r) => r.lane === lane).length + 1);
  const lit = (k: "market" | "haul" | "raid") => step === null || step >= 3 ? "" : (step === 1 ? k === "haul" : k === "market") ? " lit" : " dim";
  const sugg = bestTrade(s, here);
  const homeGood = sugg && sugg.profit > 0 ? sugg.good : GOODS[here];
  const hot = hotLane(s);
  const hotDest = hot && (hot.a === here || hot.b === here) ? (hot.a === here ? hot.b : hot.a) : null;

  const routeCard = (r: 0 | 1) => {
    const low = r === 1;
    const risk = low ? lowRisk : 0;
    const e = exp(r);
    return (
      <button className={`route ${low ? "lowsec" : "safe"}${route === (low ? "lowsec" : "safe") ? " sel" : ""}${step === 1 && low ? " cue" : ""}`} onClick={() => setRoute(low ? "lowsec" : "safe")} onMouseEnter={() => sfx("hover")}>
        <span className="rc-head">
          <Icon name={low ? "lowsec" : "safe"} size={15} />
          <b>{low ? "Lowsec" : "Safe"}</b>
          <SecTag sec={low ? riskToSec(risk) : 1} />
          <span className="rc-eta num">{p.travel_ticks[r] * p.tick_seconds}s</span>
        </span>
        <span className="rc-risk">
          <span className="ui-label">Ambush</span>
          <span className="rc-meter"><i style={{ width: `${Math.min(100, (risk / (p.ambush_max_bps / 100)) * 100)}%` }} /></span>
          <b className="num">{risk}%</b>
        </span>
        <span className="rc-kv">
          <span><span className="ui-label">Toll</span> <b className="num">{p.toll_gold[r]}</b></span>
          <span>{low ? (raidsOnLane ? <b className="num hot">{raidsOnLane} raider{raidsOnLane > 1 ? "s" : ""}</b> : <span className="ui-label">3× faster</span>) : <span className="ui-label">no raiders</span>}</span>
        </span>
        <span className="rc-profit">
          <span className="ui-label">Exp. profit</span>
          <b className={`num ${holding ? (e >= 0 ? "pos" : "neg") : ""}`}>{holding ? signed(e) : "—"}{holding ? <GoodIcon good="gold" size={13} /> : null}</b>
        </span>
      </button>
    );
  };

  return (
    <div className="dock-row">
      <div className={"panel dock-market" + lit("market")}>
        <div className="ui-panel-header">
          <h3>Market · {TOWN_LABEL[TOWNS[here]]}</h3>
          <span className="right"><Pill tone="neutral" icon="cargo">Hold {holdTotal}/{p.cargo_cap}</Pill></span>
        </div>
        <table className="market">
          <thead><tr><th>Good</th><th className="n">Buy</th><th className="n">Sell</th><th className="n you">You</th><th className="n">Run</th><th></th></tr></thead>
          <tbody>
            {GOODS.map((g, i) => {
              const others = [0, 1, 2].filter((t) => t !== here);
              const bt = others.reduce((a, t) => (s.economy.towns[t].bid[i] > s.economy.towns[a].bid[i] ? t : a), others[0]);
              const margin = s.economy.towns[bt].bid[i] - town.ask[i];
              const has = me.balances[g] ?? 0;
              return (
                <tr key={g} className={i === here ? "home" : ""}>
                  <td className="good"><GoodIcon good={g} size={15} /> <span>{g}</span>{i === here && <span className="tag">local</span>}</td>
                  <td className="n">{town.ask[i]}</td>
                  <td className="n">{town.bid[i]}</td>
                  <td className="n you">{has}</td>
                  <td className={`n run ${margin > 0 ? "pos" : "neg"}`} title={`Buy here at ${town.ask[i]}, sell in ${TOWN_LABEL[TOWNS[bt]]} at ${s.economy.towns[bt].bid[i]} (per unit, before toll)`}>
                    <span className="to">{TOWN_LABEL[TOWNS[bt]].slice(0, 3)}</span> {signed(margin)}
                  </td>
                  <td className="row-btns">
                    <button className={step === 0 && g === homeGood ? "buy cue" : "buy"} disabled={busy} onClick={() => run("buy", { good: g, qty }, `bought ${qty} ${g}`, "buy", () => recordBuy(g, qty, qty * town.ask[i]))}>Buy {qty}</button>
                    <button className={step === 2 && has ? "sell cue" : "sell"} disabled={busy || !me.balances[g]} onClick={() => run("sell", { good: g, qty: me.balances[g] }, `sold ${me.balances[g]} ${g}`, "sell", () => clearCost(g))}>Sell all</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="qty-row">
          <span className="ui-label">Qty</span>
          <input type="range" min={1} max={p.cargo_cap} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          <b className="num qty-val">{qty}</b>
        </div>
        <div className="dock-note">Buying burns gold (sink). Sales are paid by town buy orders (faucet × Council {s.economy.faucet_bps / 100}%).</div>
      </div>

      <div className={"panel dock-haul" + lit("haul")}>
        <div className="ui-panel-header">
          <h3>Haul</h3>
          <span className="sub">{TOWN_LABEL[TOWNS[here]]} ▸ {TOWN_LABEL[TOWNS[d]]}</span>
        </div>
        <div className="haul-selects">
          <label><span className="ui-label">Cargo</span><select value={cargo} onChange={(e) => setCargo(e.target.value)}>{GOODS.map((g) => <option key={g} value={g}>{g} ({me.balances[g] ?? 0})</option>)}</select></label>
          <label><span className="ui-label">Destination</span><select value={d} onChange={(e) => setDest(Number(e.target.value))}>{destOpts.map((t) => <option key={t} value={t}>{TOWN_LABEL[TOWNS[t]]}</option>)}</select></label>
        </div>
        {hot && (
          <div className="hot-lane">
            <Icon name="raid" size={13} /> <span className="hl-txt">Raiders on <b>{hot.name}</b> · {hot.risk}% ambush</span>
            {hotDest !== null && hotDest !== d && <button className="link" onClick={() => (setDest(hotDest), setRoute("lowsec"))}>fly it</button>}
          </div>
        )}
        <div className="routes">{routeCard(0)}{routeCard(1)}</div>
        <div className="haul-go">
          <span className="haul-est">{holding ? <>Sale in {TOWN_LABEL[TOWNS[d]]} <b className="num gold">{estRevenue}</b></> : <span className="muted">Empty hold: buy cargo first</span>}</span>
          {holding ? (
            <button className={step === 1 ? "primary depart cue" : "primary depart"} disabled={busy} onClick={() => run("start_haul", { to: TOWNS[d], route, good: cargo, qty: holding }, `departed with ${holding} ${cargo} to ${TOWNS[d]} via ${route}`, "haul")}>
              {pendLabel("start_haul", <>Depart with {holding} {cargo} → {TOWN_LABEL[TOWNS[d]]}</>, "Departing… signing on-chain")}
            </button>
          ) : (
            <button className="depart" disabled={busy} onClick={() => run("start_haul", { to: TOWNS[d], route, good: null, qty: 0 }, `travelled empty to ${TOWNS[d]}`, "haul")}>Travel empty → {TOWN_LABEL[TOWNS[d]]}</button>
          )}
        </div>
      </div>

      <div className={"panel dock-raid" + lit("raid")}>
        <div className="ui-panel-header"><h3>Raid a Lowsec lane</h3></div>
        <label><span className="ui-label">Lane</span><select value={lane} onChange={(e) => setLane(Number(e.target.value))}>{LANES.map((x, i) => <option key={x} value={i}>{x}</option>)}</select></label>
        <label><span className="ui-label">Stake</span><input type="number" min={p.raid_min_stake} value={stake} onChange={(e) => setStake(Number(e.target.value))} /></label>
        <div className="raid-kv">
          <span><span className="ui-label">Fee burned</span> <b className="num">{Math.floor((stake * p.raid_fee_bps) / 10000)}</b></span>
          <span><span className="ui-label">Lane risk</span> <b className="num hot">{newChance}%</b></span>
        </div>
        <button className="ui-btn danger raid-btn" disabled={busy || (me.balances.gold ?? 0) < stake * 1.1} onClick={() => run("raid", { lane: LANES[lane], stake: String(stake) }, `staked ${stake} to raid ${LANES[lane]}`, "raid")}>
          <Icon name="raid" size={14} /> Post raid
        </button>
        <div className="dock-note">Hit a convoy: stake back + {p.raider_loot_bps / 100}% of its cargo. Expires in {p.raid_ttl_ticks * p.tick_seconds}s.</div>
      </div>
    </div>
  );
}
