/**
 * Pricing + risk rules. Integer math only, mirrored 1:1 in contracts/lowsec/src/rules.rs
 * (parity is checked by test vectors: packages/sim/test/vectors.json <-> cargo test).
 */
import type { Params, Good, Route } from "./params.js";

/** Town ask price (gold/unit) for a good at a given stock: base * target / stock, clamped. */
export function askPrice(p: Params, good: Good, stock: number): number {
  const base = p.basePrice[good];
  const s = Math.max(Math.floor(stock), 1);
  const raw = Math.floor((base * p.targetStock) / s);
  const lo = Math.max(Math.floor((base * p.minPriceBps) / 10_000), 1);
  const hi = Math.floor((base * p.maxPriceBps) / 10_000);
  return Math.min(Math.max(raw, lo), hi);
}

/** NPC buy-order price (what a town pays you per unit). This is the main FAUCET. */
export function bidPrice(p: Params, good: Good, stock: number, faucetBps = p.faucetBps): number {
  return Math.floor((askPrice(p, good, stock) * p.npcSpreadBps * faucetBps) / 100_000_000);
}

/** Cost to buy q units (burned = SINK). Price is taken at the stock after half the order (simple slippage). */
export function buyCost(p: Params, good: Good, stock: number, q: number): number {
  return q * askPrice(p, good, stock - Math.floor(q / 2));
}

/** Gold minted when selling q units to the town (FAUCET). */
export function sellPayout(p: Params, good: Good, stock: number, q: number, faucetBps = p.faucetBps): number {
  return q * bidPrice(p, good, stock + Math.floor(q / 2), faucetBps);
}

export function ambushChanceBps(p: Params, route: Route, activeRaids: number): number {
  if (route === "safe") return 0;
  return Math.min(p.ambushBaseBps + p.ambushPerRaidBps * activeRaids, p.ambushMaxBps);
}

/** Split of a cargo of q units on ambush: [burned, looted, kept]. Without a raider, loot is burned too. */
export function ambushSplit(p: Params, q: number, hasRaider: boolean): { burned: number; looted: number; kept: number } {
  const lost = Math.floor((q * p.ambushLossBps) / 10_000);
  const looted = hasRaider ? Math.min(Math.floor((q * p.raiderLootBps) / 10_000), lost) : 0;
  return { burned: lost - looted, looted, kept: q - lost };
}

export function raidFee(p: Params, stake: number): number {
  return Math.floor((stake * p.raidFeeBps) / 10_000);
}

/** Goal stock of a good in a town. */
export function goalStock(p: Params, isHome: boolean): number {
  return Math.floor((p.targetStock * (isHome ? p.homeGoalBps : p.awayGoalBps)) / 10_000);
}

/** One tick of town production/consumption (mean reversion toward the goal). */
export function revertStock(p: Params, stock: number, goal: number): number {
  if (stock === goal) return stock;
  let d = Math.trunc(((goal - stock) * p.reversionBps) / 10_000);
  if (d === 0) d = goal > stock ? 1 : -1;
  return Math.min(Math.max(stock + d, 1), p.targetStock * p.maxStockFactor);
}
