/**
 * Lowsec economy parameters — the ONE file that defines the rules.
 * All money is integer "gold" (on-chain: NEP-245 token id "gold", 0 decimals).
 * All ratios are basis points (bps, 10_000 = 100%) so the Rust contract can
 * mirror the math exactly with integers.
 *
 * Loop (designed first, as the official games prompt asks):
 *  - 30 s : buy cargo in a town, pick a lane (Safe or Lowsec), go.
 *  - 5 min: arrive (or get ambushed), sell, re-route; maybe stake a raid on a Lowsec lane.
 *  - session: read the Economic Report, bet on the next scarcity, watch the Council.
 */

export const TOWNS = ["mina", "forja", "puerto"] as const;
export type Town = (typeof TOWNS)[number];
export const TOWN_LABEL: Record<Town, string> = { mina: "Mina", forja: "Forja", puerto: "Puerto" };

export const GOODS = ["ore", "parts", "fuel"] as const;
export type Good = (typeof GOODS)[number];

/** Each town produces one good (cheap there) and consumes the other two (expensive there). */
export const HOME_GOOD: Record<Town, Good> = { mina: "ore", forja: "parts", puerto: "fuel" };

export type Route = "safe" | "lowsec";

export interface Params {
  /** Base price (gold/unit) of each good when stock == target. */
  basePrice: Record<Good, number>;
  /** Stock level at which price == basePrice. price = base * target / stock (clamped). */
  targetStock: number;
  /** Price clamp, bps of base. */
  minPriceBps: number;
  maxPriceBps: number;
  /** NPC buy orders pay this share of the town's ask price (bid/ask spread). */
  npcSpreadBps: number;
  /** Council-controlled multiplier on EVERY faucet (NPC buy orders + starter grant). */
  faucetBps: number;
  /**
   * Town production/consumption: every tick each stock moves reversionBps of the way
   * toward its goal (home good: homeGoalBps of target => cheap; others: awayGoalBps => expensive).
   * delta = (goal - stock) * reversionBps / 10000, at least 1 unit toward the goal.
   */
  homeGoalBps: number;
  awayGoalBps: number;
  reversionBps: number;
  maxStockFactor: number; // stock cap = targetStock * factor

  /** Lanes: every pair of towns has a Safe lane and a Lowsec lane. */
  travelTicks: Record<Route, number>;
  tollGold: Record<Route, number>; // burned (sink)
  cargoCap: number; // max units per haul
  /** Sim-only: chance per idle tick that a trader with no profitable trade relocates empty (pays safe toll). */
  relocateBps: number;

  /** Ambush on Lowsec: base chance + per active raid stake on that lane (bps). */
  ambushBaseBps: number;
  ambushPerRaidBps: number;
  ambushMaxBps: number;
  /** On ambush: share of cargo lost; of the cargo, the raider loots lootBps; the rest of the loss is BURNED. */
  ambushLossBps: number;
  raiderLootBps: number;

  /** Raid staking. */
  raidMinStake: number;
  raidFeeBps: number; // burned when the raid is posted (sink)
  raidTtlTicks: number; // stake returned (minus fee) if no convoy is hit

  /** Progressive sink: docking fee on every arrival = dockFeeBps of the pilot's gold ABOVE dockFeeExempt (burned). */
  dockFeeBps: number;
  dockFeeExempt: number;

  /** Starter grant for a new player (faucet, scaled by faucetBps). */
  newPlayerGrant: number;

  /** AI Economic Council. */
  epochTicks: number;
  councilTargetInflationBps: number; // per epoch gold-supply growth target
  councilGain: number; // bps of adjustment per bps of error
  councilMaxStepBps: number; // ±10% per epoch, ALSO enforced on-chain
  councilMinFaucetBps: number;
  councilMaxFaucetBps: number;
  /** The Council reacts to mean supply growth over the last N closed epochs (1 = last epoch only). */
  councilWindowEpochs: number;
  /** Below this many registered players the signal is noise (one sale swings it): the Council HOLDS. */
  councilMinPlayers: number;
  /** If false, the starter grant is NOT scaled by the Council (protects newcomers / Gini). */
  councilScalesGrant: boolean;

  ticksPerWeek: number;
}

export const DEFAULT_PARAMS: Params = {
  basePrice: { ore: 10, parts: 20, fuel: 14 },
  targetStock: 400,
  minPriceBps: 2_500,
  maxPriceBps: 40_000,
  npcSpreadBps: 9_000,
  faucetBps: 10_000,
  homeGoalBps: 20_000,
  awayGoalBps: 5_000,
  reversionBps: 600,
  maxStockFactor: 4,

  travelTicks: { safe: 3, lowsec: 1 },
  tollGold: { safe: 12, lowsec: 3 },
  cargoCap: 25,
  relocateBps: 300,

  ambushBaseBps: 800,
  ambushPerRaidBps: 1_200,
  ambushMaxBps: 6_000,
  ambushLossBps: 5_000,
  raiderLootBps: 2_000,

  raidMinStake: 100,
  raidFeeBps: 1_000,
  raidTtlTicks: 24,

  dockFeeBps: 500,
  dockFeeExempt: 400,

  newPlayerGrant: 500,

  epochTicks: 24,
  councilTargetInflationBps: 100, // 1% / day
  councilGain: 2,
  councilMaxStepBps: 1_000,
  councilMinFaucetBps: 7_000,
  councilMaxFaucetBps: 11_000,
  councilWindowEpochs: 3,
  councilMinPlayers: 5,
  councilScalesGrant: false,

  ticksPerWeek: 168,
};

/** Player population for the headless simulation. */
export interface Population {
  initialPlayers: number;
  /** launch wave: surgePerDay new players/day for the first surgeDays days, then newPlayersPerDay. */
  surgeDays: number;
  surgePerDay: number;
  newPlayersPerDay: number;
  /** share of new scripted players by behaviour (bps): safe traders, risky traders, raiders. */
  mixBps: { safe: number; risky: number; raider: number };
  aiHaulers: number;
  /** How often agents get a turn (in ticks). The live server's NPCs act every few ticks, humans even less. */
  aiActEveryTicks: number;
  humanActEveryTicks: number;
  /** Market-maker NPCs ("the Guild"): trade like haulers but hold a treasury, see marketMakerGold. */
  marketMakers: number;
  marketMakerGold: number;
}

export const DEFAULT_POPULATION: Population = {
  initialPlayers: 40,
  surgeDays: 10,
  surgePerDay: 6,
  newPlayersPerDay: 1,
  mixBps: { safe: 5_500, risky: 3_000, raider: 1_500 },
  // v0.3: 4 NPC traders + 1 market maker (the Guild). The live server runs the same cast.
  aiHaulers: 4,
  aiActEveryTicks: 3, // live NPCs take a turn about every 30 s (= 3 ticks)
  humanActEveryTicks: 1,
  marketMakers: 1,
  marketMakerGold: 30_000, // the Guild's float: genesis supply, exempt from the docking fee, safe lanes only
};

/** v0.2 cast (what was live before v0.3): 2 NPC traders acting every tick, no Guild. */
export const V02_NPCS: Partial<Population> = { aiHaulers: 2, aiActEveryTicks: 1, marketMakers: 0, marketMakerGold: 0 };

/**
 * "Live" scenario: what a judge sees on the hosted testnet demo — a handful of humans who act now and
 * then (every ~6 ticks), no launch wave, plus the NPC cast. Merged over DEFAULT_POPULATION.
 */
export const LIVE_POPULATION: Partial<Population> = { initialPlayers: 3, surgeDays: 0, surgePerDay: 0, newPlayersPerDay: 0.3, humanActEveryTicks: 6 };
