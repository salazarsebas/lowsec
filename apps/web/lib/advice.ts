/** Onboarding advice computed from LIVE contract state only (prices, raids). Nothing is rolled or faked. */
import type { State } from "./types";
import { GOODS, LANES, TOWNS, ambushPct } from "./types";

export interface Trade { from: number; to: number; good: string; gi: number; qty: number; perUnit: number; profit: number }

/** Best buy-here/sell-there run by live ask/bid, for a full affordable hold, after the Lowsec toll (before ambush risk). */
export function bestTrade(s: State, from: number | null = null): Trade | null {
  const gold = s.me?.balances.gold ?? 500;
  const cap = s.params.cargo_cap;
  const toll = s.params.toll_gold[1] ?? 0;
  let best: Trade | null = null;
  for (const f of from === null ? [0, 1, 2] : [from])
    for (let gi = 0; gi < GOODS.length; gi++)
      for (const t of [0, 1, 2]) {
        if (t === f) continue;
        const ask = s.economy.towns[f]?.ask[gi] ?? 0, bid = s.economy.towns[t]?.bid[gi] ?? 0;
        if (!ask) continue;
        const qty = Math.max(0, Math.min(cap, Math.floor(gold / ask)));
        const perUnit = bid - ask;
        const profit = qty * perUnit - toll;
        if (!best || profit > best.profit) best = { from: f, to: t, good: GOODS[gi], gi, qty, perUnit, profit };
      }
  return best;
}

/** The Lowsec lane with the most raiders camped right now (highest real ambush chance), or null if none. */
export function hotLane(s: State): { lane: number; name: string; a: number; b: number; raiders: number; risk: number } | null {
  const counts = LANES.map((_, i) => s.economy.raids.filter((r) => r.lane === i).length);
  const max = Math.max(...counts);
  if (max <= 0) return null;
  const lane = counts.indexOf(max);
  const [a, b] = LANES[lane].split("-").map((t) => TOWNS.indexOf(t));
  return { lane, name: LANES[lane], a, b, raiders: max, risk: ambushPct(s.params, max) };
}
