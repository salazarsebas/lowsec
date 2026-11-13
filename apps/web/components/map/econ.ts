/** Lane economics computed ONLY from data the client already has (State.params / economy / me).
 *  Nothing here is invented: when an input is missing the field is null and the UI omits it. */
import type { State } from "@/lib/types";
import { GOODS, TOWNS, TOWN_LABEL, laneOf, ambushPct } from "@/lib/types";

export interface LaneStat {
  lane: number; route: number; raids: number;
  riskPct: number;          // ambush probability on this route (0 on Safe)
  etaS: number | null;      // travel time in seconds
  toll: number | null;      // gold burned at departure
  speedup: number | null;   // Safe time / Lowsec time
  best: null | { from: number; to: number; good: number; qty: number; profit: number; perUnit: number };
}

export function laneStat(s: State, a: number, b: number, route: number): LaneStat {
  const p = s.params;
  const lane = laneOf(a, b);
  const raids = s.economy.raids.filter((r) => r.lane === lane).length;
  const riskPct = route === 1 ? ambushPct(p, raids) : 0;
  const etaS = p.travel_ticks?.[route] != null ? p.travel_ticks[route] * p.tick_seconds : null;
  const toll = p.toll_gold?.[route] ?? null;
  const speedup = p.travel_ticks?.[0] && p.travel_ticks?.[1] ? p.travel_ticks[0] / p.travel_ticks[1] : null;
  // Expected profit of a full hold of the best good, buying at the origin's ask and selling at
  // the destination's bid, discounted by ambush risk × share of cargo lost. Excludes the
  // wealth-based dock fee. If the player is docked at one end, only that direction counts.
  let best: LaneStat["best"] = null;
  const loss = (p.ambush_loss_bps ?? 0) / 10000;
  const cap = p.cargo_cap;
  const myTown = s.me?.player && !s.me.player.haul ? s.me.player.town : null;
  const dirs: [number, number][] = myTown === a ? [[a, b]] : myTown === b ? [[b, a]] : [[a, b], [b, a]];
  for (const [f, t] of dirs) {
    const tf = s.economy.towns[f], tt = s.economy.towns[t];
    if (!tf || !tt || !cap || toll == null) continue;
    for (let g = 0; g < GOODS.length; g++) {
      const per = tt.bid[g] * (1 - (riskPct / 100) * loss) - tf.ask[g];
      const profit = Math.round(per * cap - toll);
      if (!best || profit > best.profit) best = { from: f, to: t, good: g, qty: cap, profit, perUnit: per };
    }
  }
  return { lane, route, raids, riskPct, etaS, toll, speedup, best };
}

export const townName = (i: number) => TOWN_LABEL[TOWNS[i]] ?? TOWNS[i];
export const fmtS = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`);
