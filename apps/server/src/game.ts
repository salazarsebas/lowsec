/** Chain <-> sim glue: the server re-uses the exact same pricing rules as the contract (packages/sim). */
import { DEFAULT_PARAMS, GOODS, TOWNS, askPrice, bidPrice, buyCost, sellPayout, ambushChanceBps, type Params, type Good, type Town, type Route } from "@lowsec/sim";

export interface ChainParams {
  base_price: number[]; target_stock: number; min_price_bps: number; max_price_bps: number; npc_spread_bps: number; faucet_bps: number;
  home_goal_bps: number; away_goal_bps: number; reversion_bps: number; max_stock_factor: number; travel_ticks: number[]; toll_gold: number[];
  cargo_cap: number; ambush_base_bps: number; ambush_per_raid_bps: number; ambush_max_bps: number; ambush_loss_bps: number; raider_loot_bps: number;
  raid_min_stake: number; raid_fee_bps: number; raid_ttl_ticks: number; new_player_grant: number; epoch_ticks: number;
  council_target_inflation_bps: number; council_gain: number; council_max_step_bps: number; council_min_faucet_bps: number; council_max_faucet_bps: number; tick_seconds: number;
  dock_fee_bps: number; dock_fee_exempt: number; council_window_epochs: number; council_min_players: number; council_scales_grant: boolean;
}
export interface Haul { id: number; from: number; to: number; route: number; good: number; qty: number; depart_tick: number; arrive_tick: number }
export interface Player { town: number; haul: Haul | null; joined_tick: number; hauls: number; ambushed: number; raids_won: number }
export interface Raid { raider: string; lane: number; stake: string | number; expires_tick: number }
export interface Economy {
  tick: number; epoch: number; gold_supply: string | number; item_supply: (string | number)[]; players: number; faucet_bps: number; council: string; council_rule: string;
  rule_next_faucet_bps: number | null; council_signal: CouncilSignal | null; towns: { town: string; stock: number[]; ask: number[]; bid: number[] }[]; raids: Raid[];
  total: Record<string, number>; current_epoch: Record<string, number>; epoch_supply_start: string | number; decisions: number;
}

export interface CouncilSignal {
  from_record: number; to_record: number; epochs_covered: number; supply_start: string | number; supply_end: string | number;
  signal_bps: number; target_bps: number; players: number; hold: string | null; faucet_bps: number; next_faucet_bps: number;
}

export function toSimParams(c: ChainParams): Params {
  return {
    ...DEFAULT_PARAMS,
    basePrice: { ore: c.base_price[0], parts: c.base_price[1], fuel: c.base_price[2] },
    targetStock: c.target_stock, minPriceBps: c.min_price_bps, maxPriceBps: c.max_price_bps, npcSpreadBps: c.npc_spread_bps, faucetBps: c.faucet_bps,
    homeGoalBps: c.home_goal_bps, awayGoalBps: c.away_goal_bps, reversionBps: c.reversion_bps, maxStockFactor: c.max_stock_factor,
    travelTicks: { safe: c.travel_ticks[0], lowsec: c.travel_ticks[1] }, tollGold: { safe: c.toll_gold[0], lowsec: c.toll_gold[1] }, cargoCap: c.cargo_cap,
    ambushBaseBps: c.ambush_base_bps, ambushPerRaidBps: c.ambush_per_raid_bps, ambushMaxBps: c.ambush_max_bps, ambushLossBps: c.ambush_loss_bps, raiderLootBps: c.raider_loot_bps,
    raidMinStake: c.raid_min_stake, raidFeeBps: c.raid_fee_bps, raidTtlTicks: c.raid_ttl_ticks, newPlayerGrant: c.new_player_grant, epochTicks: c.epoch_ticks,
    councilTargetInflationBps: c.council_target_inflation_bps, councilGain: c.council_gain, councilMaxStepBps: c.council_max_step_bps,
    councilMinFaucetBps: c.council_min_faucet_bps, councilMaxFaucetBps: c.council_max_faucet_bps,
    dockFeeBps: c.dock_fee_bps ?? 0, dockFeeExempt: c.dock_fee_exempt ?? 0, councilWindowEpochs: c.council_window_epochs ?? 1,
    councilMinPlayers: c.council_min_players ?? 0, councilScalesGrant: c.council_scales_grant ?? true,
  };
}

export const LANES = ["mina-forja", "forja-puerto", "mina-puerto"] as const;
export function laneOf(a: number, b: number): number {
  const k = [TOWNS[a], TOWNS[b]].sort().join("-");
  return { "forja-mina": 0, "forja-puerto": 1, "mina-puerto": 2 }[k] ?? -1;
}

export interface TradeOption {
  kind: "haul";
  good: Good;
  qty: number;
  from: Town;
  to: Town;
  route: Route;
  cost: number;
  expectedRevenue: number;
  ambushChancePct: number;
  expectedProfit: number;
  profitPerTick: number;
}

/** Enumerate haul options from `town` for a budget, priced with the on-chain stocks and rules. */
export function tradeOptions(p: Params, eco: Economy, townIdx: number, gold: number, riskWeight = 1, inTransit: (to: number, good: number) => number = () => 0): TradeOption[] {
  const out: TradeOption[] = [];
  const budget = Math.floor(gold * 0.8);
  GOODS.forEach((g, gi) => {
    const s = eco.towns[townIdx].stock[gi];
    let qty = Math.min(p.cargoCap, Math.floor(budget / Math.max(askPrice(p, g, s), 1)), Math.max(s - 1, 0));
    while (qty > 0 && buyCost(p, g, s, qty) > budget) qty--;
    if (qty <= 0) return;
    const cost = buyCost(p, g, s, qty);
    TOWNS.forEach((to, ti) => {
      if (ti === townIdx) return;
      // cargo already en route there (public haul log) will hit the same buy orders first: price it in
      const rev = sellPayout(p, g, eco.towns[ti].stock[gi] + inTransit(ti, gi), qty, eco.faucet_bps);
      for (const route of ["safe", "lowsec"] as Route[]) {
        const lane = laneOf(townIdx, ti);
        const raids = eco.raids.filter((r) => r.lane === lane).length;
        const ch = ambushChanceBps(p, route, raids);
        const ev = rev * (1 - (ch / 10_000) * (p.ambushLossBps / 10_000) * riskWeight) - cost - p.tollGold[route];
        out.push({ kind: "haul", good: g, qty, from: TOWNS[townIdx], to, route, cost, expectedRevenue: rev, ambushChancePct: ch / 100, expectedProfit: Math.round(ev), profitPerTick: Math.round(ev / p.travelTicks[route]) });
      }
    });
  });
  return out.sort((a, b) => b.profitPerTick - a.profitPerTick);
}

export { askPrice, bidPrice, GOODS, TOWNS };
