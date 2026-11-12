/** Economy health metrics (EVE "Monthly Economic Report" style). */
export function gini(values: number[]): number {
  const v = values.filter((x) => x >= 0).sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return 0;
  const sum = v.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * v[i];
  return (2 * cum) / (n * sum) - (n + 1) / n;
}

export type Faucet = "npc_buy_orders" | "new_player_grant";
export type Sink = "npc_sell_orders" | "tolls" | "raid_fees";

export interface PeriodMetrics {
  period: number;
  ticks: number;
  players: number;
  supplyStart: number;
  supplyEnd: number;
  minted: Record<Faucet, number>;
  burned: Record<Sink, number>;
  inflationBps: number; // total gold supply growth
  /** growth of gold per player (what a newcomer feels as price inflation). The Council targets THIS. */
  perCapitaInflationBps: number;
  playersStart: number;
  sinkFaucetRatio: number;
  gini: number;
  faucetBps: number;
  hauls: number;
  lowsecHauls: number;
  ambushes: number;
  raids: number;
  cargoBurnedUnits: number;
  cargoBurnedGoldValue: number;
  priceIndex: number; // avg ask/base across towns & goods, 1.0 = target
}

export function emptyPeriod(period: number, supplyStart: number, players: number, faucetBps: number): PeriodMetrics {
  return {
    period,
    ticks: 0,
    players,
    supplyStart,
    supplyEnd: supplyStart,
    minted: { npc_buy_orders: 0, new_player_grant: 0 },
    burned: { npc_sell_orders: 0, tolls: 0, raid_fees: 0 },
    inflationBps: 0,
    perCapitaInflationBps: 0,
    playersStart: players,
    sinkFaucetRatio: 0,
    gini: 0,
    faucetBps,
    hauls: 0,
    lowsecHauls: 0,
    ambushes: 0,
    raids: 0,
    cargoBurnedUnits: 0,
    cargoBurnedGoldValue: 0,
    priceIndex: 1,
  };
}

export const sumRec = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
