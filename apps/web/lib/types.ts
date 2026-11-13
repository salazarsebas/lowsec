export interface Haul { id: number; from: number; to: number; route: number; good: number; qty: number; depart_tick: number; arrive_tick: number }
export interface Player { town: number; haul: Haul | null; joined_tick: number; hauls: number; ambushed: number; raids_won: number }
export interface Raid { raider: string; lane: number; stake: string | number; expires_tick: number }
export interface Town { town: string; stock: number[]; ask: number[]; bid: number[] }
export interface Economy {
  tick: number; epoch: number; gold_supply: number; item_supply: number[]; players: number; faucet_bps: number; council: string; council_rule: string;
  rule_next_faucet_bps: number | null; towns: Town[]; raids: Raid[]; total: Record<string, number>; current_epoch: Record<string, number>; epoch_supply_start: number; decisions: number;
}
export interface Decision {
  agent: string; name: string; ts: number; kind: string; summary: string; reasoning: string; model: string; mode: "tee" | "mock"; signatureKind: string; verified: boolean;
  attestationHash: string; completionId: string; decisionId: number | null; decisionTx: string; actionTx: string; error?: string;
}
export interface Move { ts: number; text: string; txHash: string; ok: boolean }
/** decisions = AI strategy reviews (anchored on-chain); moves = rule-based actions that follow the strategy */
export interface Npc { id: string; name: string; kind?: "trader" | "guild"; style: string; player: Player | null; balances: Record<string, number>; decisions: Decision[]; moves?: Move[] }
export const NPC_COLORS = ["#f5a524", "#c06cff", "#4cd98a", "#ff6b8b", "#e8e2c8"];
export interface FeedItem { ts: number; actor: string; type: string; text: string; txHash?: string; ok?: boolean }
export interface Params { travel_ticks: number[]; toll_gold: number[]; cargo_cap: number; tick_seconds: number; epoch_ticks: number; ambush_base_bps: number; ambush_per_raid_bps: number; ambush_max_bps: number; ambush_loss_bps: number; raider_loot_bps: number; raid_min_stake: number; raid_fee_bps: number; raid_ttl_ticks: number; npc_spread_bps: number; faucet_bps: number; [k: string]: any }
export interface State {
  economy: Economy; params: Params; me: { account: string; player: Player | null; balances: Record<string, number> } | null; npcs: Npc[]; feed: FeedItem[];
  ai: { mode: "tee" | "mock"; model: string; health?: { lastOk: boolean | null; lastError?: string; calls: number; verified: number; fallbacks: number } }; genesisMs: number; contract: string; explorer: string; serverTime: number;
}
export const TOWNS = ["mina", "forja", "puerto"];
export const TOWN_LABEL: Record<string, string> = { mina: "Mina", forja: "Forja", puerto: "Puerto" };
export const GOODS = ["ore", "parts", "fuel"];
export const GOOD_ICON: Record<string, string> = { ore: "⛏", parts: "⚙", fuel: "🛢", gold: "◎" };
export const LANES = ["mina-forja", "forja-puerto", "mina-puerto"];
export function laneOf(a: number, b: number) {
  const k = [TOWNS[a], TOWNS[b]].sort().join("-");
  return ({ "forja-mina": 0, "forja-puerto": 1, "mina-puerto": 2 } as Record<string, number>)[k] ?? -1;
}
export const ambushPct = (p: Params, raids: number) => Math.min(p.ambush_base_bps + p.ambush_per_raid_bps * raids, p.ambush_max_bps) / 100;
