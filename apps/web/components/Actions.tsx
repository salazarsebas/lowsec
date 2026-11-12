"use client";
import { useState } from "react";
import type { State } from "@/lib/types";
import { GOODS, GOOD_ICON, LANES, TOWNS, TOWN_LABEL, ambushPct, laneOf } from "@/lib/types";
import { act, type Session } from "@/lib/near";

export function Actions({ s, session, onResult }: { s: State; session: Session; onResult: (msg: string, ok: boolean, tx?: string) => void }) {
  const me = s.me!;
  const p = s.params;
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState(10);
  const [dest, setDest] = useState<number>((me.player?.town ?? 0) === 0 ? 1 : 0);
  const [route, setRoute] = useState<"safe" | "lowsec">("lowsec");
  const [cargo, setCargo] = useState<string>("ore");
  const [lane, setLane] = useState(0);
  const [stake, setStake] = useState(p.raid_min_stake);
  if (!me.player) return null;
  const here = me.player.town;
  const town = s.economy.towns[here];

  async function run(method: string, args: Record<string, unknown>, label: string) {
    setBusy(true);
    try {
      const r = await act(session, method, args, label);
      onResult(r.ok ? label : `${label} failed: ${r.error}`, r.ok, r.txHash);
    } catch (e: any) {
      onResult(String(e?.message ?? e), false);
    } finally {
      setBusy(false);
    }
  }

  if (me.player.haul) {
    const h = me.player.haul;
    return (
      <div className="panel">
        <h3>On the road</h3>
        <p>
          Hauling <b>{h.qty} {GOOD_ICON[GOODS[h.good]]} {GOODS[h.good]}</b> {TOWN_LABEL[TOWNS[h.from]]} → {TOWN_LABEL[TOWNS[h.to]]} via{" "}
          <b className={h.route === 1 ? "red" : "green"}>{h.route === 1 ? "LOWSEC" : "safe lane"}</b>
        </p>
        <p className="muted small">Arrival resolves on-chain when the convoy gets there{h.route === 1 ? " — Lowsec convoys can be ambushed and lose cargo (burned)" : ""}.</p>
        <button disabled={busy || s.economy.tick < h.arrive_tick} onClick={() => run("arrive", {}, "arrive")}>{s.economy.tick < h.arrive_tick ? `arriving… (tick ${s.economy.tick}/${h.arrive_tick})` : "Arrive"}</button>
      </div>
    );
  }

  const destOpts = [0, 1, 2].filter((t) => t !== here);
  const d = destOpts.includes(dest) ? dest : destOpts[0];
  const l = laneOf(here, d);
  const raidsOnLane = s.economy.raids.filter((r) => r.lane === l).length;
  const holding = me.balances[cargo] ?? 0;
  const gi = GOODS.indexOf(cargo);
  const estRevenue = Math.floor(holding * (s.economy.towns[d]?.bid[gi] ?? 0));
  const chance = route === "lowsec" ? ambushPct(p, raidsOnLane) : 0;
  const newChance = ambushPct(p, s.economy.raids.filter((r) => r.lane === lane).length + 1);

  return (
    <div className="actions">
      <div className="panel">
        <h3>Market · {TOWN_LABEL[TOWNS[here]]}</h3>
        <table className="market">
          <thead><tr><th>good</th><th>buy at</th><th>sell at</th><th>stock</th><th>you</th><th></th></tr></thead>
          <tbody>
            {GOODS.map((g, i) => (
              <tr key={g} className={i === here ? "home" : ""}>
                <td>{GOOD_ICON[g]} {g}{i === here && <span className="tag">made here</span>}</td>
                <td>{town.ask[i]}</td>
                <td>{town.bid[i]}</td>
                <td className="muted">{town.stock[i]}</td>
                <td>{me.balances[g] ?? 0}</td>
                <td className="row-btns">
                  <button disabled={busy} onClick={() => run("buy", { good: g, qty }, `bought ${qty} ${g}`)}>Buy {qty}</button>
                  <button disabled={busy || !me.balances[g]} onClick={() => run("sell", { good: g, qty: me.balances[g] }, `sold ${me.balances[g]} ${g}`)}>Sell all</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="small">Qty <input type="range" min={1} max={p.cargo_cap} value={qty} onChange={(e) => setQty(Number(e.target.value))} /> {qty}</label>
        <p className="muted small">Buying burns gold (sink). Selling is paid by town buy orders (faucet, scaled by the Council: {s.economy.faucet_bps / 100}%).</p>
      </div>
      <div className="panel">
        <h3>Haul</h3>
        <div className="form">
          <label>Cargo <select value={cargo} onChange={(e) => setCargo(e.target.value)}>{GOODS.map((g) => <option key={g} value={g}>{g} ({me.balances[g] ?? 0})</option>)}</select></label>
          <label>To <select value={d} onChange={(e) => setDest(Number(e.target.value))}>{destOpts.map((t) => <option key={t} value={t}>{TOWN_LABEL[TOWNS[t]]}</option>)}</select></label>
        </div>
        <div className="routes">
          <button className={route === "safe" ? "route sel" : "route"} onClick={() => setRoute("safe")}>
            <b className="green">Safe lane</b><span>{p.travel_ticks[0] * p.tick_seconds}s · toll {p.toll_gold[0]} · 0% risk</span>
          </button>
          <button className={route === "lowsec" ? "route sel" : "route"} onClick={() => setRoute("lowsec")}>
            <b className="red">Lowsec</b><span>{p.travel_ticks[1] * p.tick_seconds}s · toll {p.toll_gold[1]} · {ambushPct(p, raidsOnLane)}% ambush{raidsOnLane ? ` (☠×${raidsOnLane})` : ""}</span>
          </button>
        </div>
        <p className="small">Est. sale in {TOWN_LABEL[TOWNS[d]]}: <b>{estRevenue}</b> gold{route === "lowsec" && <> · if ambushed you lose {p.ambush_loss_bps / 100}% of the cargo (burned / looted)</>}</p>
        <button className="primary" disabled={busy} onClick={() => run("start_haul", { to: TOWNS[d], route, good: holding ? cargo : null, qty: holding }, holding ? `departed with ${holding} ${cargo} to ${TOWNS[d]} via ${route}` : `travelled empty to ${TOWNS[d]}`)}>
          {holding ? `Depart with ${holding} ${cargo}` : "Travel empty"} → {TOWN_LABEL[TOWNS[d]]}
        </button>
        {route === "lowsec" && <p className="muted small">Ambush chance now: {chance}%</p>}
      </div>
      <div className="panel">
        <h3>Raid a Lowsec lane</h3>
        <div className="form">
          <label>Lane <select value={lane} onChange={(e) => setLane(Number(e.target.value))}>{LANES.map((x, i) => <option key={x} value={i}>{x}</option>)}</select></label>
          <label>Stake <input type="number" min={p.raid_min_stake} value={stake} onChange={(e) => setStake(Number(e.target.value))} /></label>
        </div>
        <p className="small muted">Fee {Math.floor((stake * p.raid_fee_bps) / 10000)} gold is burned. Your stake returns when you hit a convoy (+{p.raider_loot_bps / 100}% of its cargo) or after {p.raid_ttl_ticks * p.tick_seconds}s. Ambush chance on this lane becomes {newChance}%.</p>
        <button disabled={busy || (me.balances.gold ?? 0) < stake * 1.1} onClick={() => run("raid", { lane: LANES[lane], stake: String(stake) }, `staked ${stake} to raid ${LANES[lane]}`)}>Post raid</button>
      </div>
    </div>
  );
}
