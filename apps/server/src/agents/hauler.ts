/**
 * NPC traders (v0.3). Each one is a NEAR sub-account (hauler-N.<contract>, guild.<contract>) acting
 * through a function-call key (game methods only) whose meta-transactions are paid by the relayer.
 *
 * Cost-aware split:
 *  - STRATEGY (every ~4 min, i.e. once per epoch): options priced by the shared rules -> NEAR AI TEE
 *    model picks a stance -> response verified -> attestation hash anchored on-chain (record_decision).
 *  - MOVES (every turn, ~10 s): cheap rule-based execution of that stance — sell, pick the best trade the
 *    stance allows, buy, depart — in ONE contract call (`turn`), one gasless meta-tx. No LLM call per move.
 *  - The Guild is a rule-based market maker (NO AI): safe lanes only, restocks the scarcest town.
 */
import type { KeyPairString } from "near-api-js";
import { GUILD_ID, HAULERS, STRATEGY_EVERY_MS } from "../config.js";
import { view } from "../chain.js";
import { fcKey } from "../keys.js";
import { metaCall } from "../relayer.js";
import { push } from "../feed.js";
import { recordDelivery } from "../extras.js";
import { parseJsonReply, sha256, type InferenceProvider } from "../nearai.js";
import { sellPayout } from "@lowsec/sim";
import { LANES, TOWNS, GOODS, laneOf, toSimParams, tradeOptions, type ChainParams, type Economy, type Player, type TradeOption } from "../game.js";

export type Stance = "safe-first" | "balanced" | "lowsec-first" | "raid";

export interface Persona {
  id: string;
  role: string;
  name: string;
  style: string;
  riskWeight: number;
  raider: boolean;
  home: string;
  /** "trader" = AI strategy + rule moves; "guild" = rule-based market maker, no AI */
  kind: "trader" | "guild";
  defaultStance: Stance;
}

export const PERSONAS: Persona[] = [
  { id: HAULERS[0], role: "hauler-1", name: "Kestrel", kind: "trader", style: "cautious merchant: prefers the Safe lane unless Lowsec clearly pays more after risk; never raids", riskWeight: 1.3, raider: false, home: "mina", defaultStance: "safe-first" },
  { id: HAULERS[1], role: "hauler-2", name: "Vex", kind: "trader", style: "aggressive smuggler: runs Lowsec for speed and sometimes stakes gold to raid a Lowsec lane", riskWeight: 0.7, raider: true, home: "forja", defaultStance: "lowsec-first" },
  { id: HAULERS[2], role: "hauler-3", name: "Moss", kind: "trader", style: "steady freighter: takes whatever pays best after risk, no drama, never raids", riskWeight: 1.0, raider: false, home: "puerto", defaultStance: "balanced" },
  { id: HAULERS[3], role: "hauler-4", name: "Ryo", kind: "trader", style: "opportunist: chases the scarcest town, happy to gamble on Lowsec, raids when lanes are busy", riskWeight: 0.85, raider: true, home: "mina", defaultStance: "balanced" },
  { id: GUILD_ID, role: "guild", name: "The Guild", kind: "guild", style: "market maker (rule-based, no AI): holds a float, restocks the scarcest town over SAFE lanes, exempt from the docking fee", riskWeight: 9, raider: false, home: "forja", defaultStance: "safe-first" },
].filter((p) => !!p.id) as Persona[];

const STANCE_TEXT: Record<Stance, string> = {
  "safe-first": "SAFE-FIRST: only Safe lanes until the next strategy review",
  balanced: "BALANCED: take Lowsec only when its profit after ambush risk beats Safe",
  "lowsec-first": "LOWSEC-FIRST: favour fast Lowsec runs (accept more ambush risk)",
  raid: "RAID: stake gold on the busiest Lowsec lane, then trade BALANCED",
};

export interface AgentDecision {
  agent: string;
  name: string;
  ts: number;
  kind: string;
  summary: string;
  reasoning: string;
  model: string;
  mode: "tee" | "mock" | "rule";
  signatureKind: string;
  verified: boolean;
  attestationHash: string;
  completionId: string;
  decisionId: number | null;
  decisionTx: string;
  actionTx: string;
  error?: string;
}
export interface Move { ts: number; text: string; txHash: string; ok: boolean }

/** strategy decisions (AI, anchored on-chain) and recent rule-based moves, per NPC */
export const lastDecisions = new Map<string, AgentDecision[]>();
export const lastMoves = new Map<string, Move[]>();
const remember = (d: AgentDecision) => lastDecisions.set(d.agent, [d, ...(lastDecisions.get(d.agent) ?? [])].slice(0, 10));
const remMove = (id: string, m: Move) => lastMoves.set(id, [m, ...(lastMoves.get(id) ?? [])].slice(0, 10));

/** Shared view of NPC cargo en route (so 5 NPCs don't all dump into the same town). */
export const fleetHauls = new Map<string, { to: number; good: number; qty: number }>();
const inTransit = (to: number, good: number) => [...fleetHauls.values()].reduce((a, h) => a + (h.to === to && h.good === good ? h.qty : 0), 0);

function mockStance(p: Persona, eco: Economy, best: { safe?: TradeOption; low?: TradeOption }, canRaid: boolean): { choice: Stance; reasoning: string } {
  if (p.raider && canRaid && eco.epoch % 2 === 0) return { choice: "raid", reasoning: "Lanes are busy and nobody is camping them. Time to put gold on a gate and let other people's cargo pay me." };
  const s = best.safe?.expectedProfit ?? 0;
  const l = best.low?.expectedProfit ?? 0;
  if (p.defaultStance === "safe-first" || (l <= s * 1.2 && p.riskWeight >= 1)) return { choice: "safe-first", reasoning: `Safe pays ~${s} a run with zero risk; Lowsec's extra ~${Math.max(0, l - s)} isn't worth the ambush odds.` };
  if (p.defaultStance === "lowsec-first") return { choice: "lowsec-first", reasoning: `Lowsec is ${best.low?.ambushChancePct ?? "?"}% risky but three times faster. Speed is money.` };
  return { choice: "balanced", reasoning: `I'll take whichever lane pays more after risk: Safe ~${s}, Lowsec ~${l} right now.` };
}

export class Hauler {
  private key: KeyPairString | null;
  private busy = false;
  private stance: Stance;
  private stanceAt = 0;
  private raidedEpoch = -1;
  constructor(public persona: Persona, private ai: InferenceProvider, private params: () => Promise<ChainParams>) {
    this.key = fcKey(persona.id, persona.role);
    this.stance = persona.defaultStance;
  }

  get ready() {
    return !!this.key;
  }

  private call(method: string, args: Record<string, unknown>) {
    return metaCall(this.persona.id, this.key!, method, args);
  }

  private move(text: string, r: { txHash: string; ok: boolean; error?: string }, type = "haul") {
    remMove(this.persona.id, { ts: Date.now(), text, txHash: r.txHash, ok: r.ok });
    push({ actor: this.persona.name, type, text: r.ok ? text : `${text} — failed: ${String(r.error).slice(0, 120)}`, txHash: r.txHash, ok: r.ok });
  }

  async step() {
    if (!this.key || this.busy) return;
    this.busy = true;
    try {
      await this.stepInner();
    } catch (e: any) {
      push({ actor: this.persona.name, type: "error", text: String(e?.message ?? e).slice(0, 200), ok: false });
    } finally {
      this.busy = false;
    }
  }

  private async stepInner() {
    const P = this.persona;
    let player = await view<Player | null>("get_player", { account_id: P.id }, 0);
    if (!player) {
      if (P.kind === "guild") return; // seated by the owner (seed_guild), never self-registers
      const r = await this.call("register", { town: P.home });
      push({ actor: P.name, type: "register", text: `${P.name} joined at ${P.home}`, txHash: r.txHash, ok: r.ok });
      return;
    }
    let eco = await view<Economy>("economy", {}, 0);
    if (player.haul) {
      fleetHauls.set(P.id, { to: player.haul.to, good: player.haul.good, qty: player.haul.qty });
      if (eco.tick < player.haul.arrive_tick) return;
      const h = player.haul;
      const r = await this.call("arrive", {});
      const v: any = r.value ?? {};
      fleetHauls.delete(P.id);
      const text = v.ambushed
        ? `${P.name} was AMBUSHED on the way to ${v.town}: ${v.burned} ${GOODS[h.good]} burned, ${v.looted} looted${v.raider ? ` by ${String(v.raider).split(".")[0]}` : " by pirates"}`
        : `${P.name} arrived in ${v.town ?? TOWNS[h.to]} with ${v.delivered ?? h.qty} ${GOODS[h.good]}${Number(v.dock_fee) > 0 ? ` (docking fee ${v.dock_fee})` : ""}`;
      this.move(text, r, v.ambushed ? "ambush" : "arrive");
      if (r.ok && recordDelivery(P.id, GOODS[h.good], v.town ?? TOWNS[h.to], Number(v.delivered ?? 0))) push({ actor: P.name, type: "contract", text: `★ ${P.name} completed today's contract`, ok: true });
      if (!r.ok) return;
      // same turn: trade at the new town
      player = await view<Player | null>("get_player", { account_id: P.id }, 0);
      eco = await view<Economy>("economy", {}, 0);
      if (!player || player.haul) return;
    }
    const tokens = ["gold", ...GOODS];
    const bal = (await view<string[]>("mt_batch_balance_of", { account_id: P.id, token_ids: tokens }, 0)).map(Number);
    const cp = await this.params();
    const p = toSimParams(cp);
    // 1) sells (priced locally with the contract's own rules so the buy can go in the same call)
    let gold = bal[0];
    const sold: string[] = [];
    for (let i = 1; i < 4; i++) {
      if (bal[i] <= 0) continue;
      const pay = sellPayout(p, GOODS[i - 1], eco.towns[player.town].stock[i - 1], bal[i], eco.faucet_bps);
      gold += pay;
      sold.push(`${bal[i]} ${tokens[i]} for ~${pay}`);
    }
    // 2) strategy review (AI) about once per epoch; Guild never uses AI
    const all = tradeOptions(p, eco, player.town, gold, P.riskWeight, inTransit).filter((o) => o.expectedProfit > 0);
    if (P.kind === "trader" && Date.now() - this.stanceAt > STRATEGY_EVERY_MS) await this.review(eco, cp, gold, all, player.town);
    // 3) the move the stance allows
    if (this.stance === "raid" && P.raider && this.raidedEpoch !== eco.epoch && gold >= 2.2 * cp.raid_min_stake && !eco.raids.some((r) => r.raider === P.id)) {
      const lane = this.busiestLane(eco);
      if (sold.length) await this.call("turn", { qty: 0 });
      const r = await this.call("raid", { lane: LANES[lane], stake: String(cp.raid_min_stake) });
      if (r.ok) this.raidedEpoch = eco.epoch;
      this.move(`${P.name} ${sold.length ? `sold ${sold.join(", ")} and ` : ""}staked ${cp.raid_min_stake} gold to raid ${LANES[lane]}`, r, "raid");
      return;
    }
    const allowed = all.filter((o) => (P.kind === "guild" || this.stance === "safe-first" ? o.route === "safe" : true));
    const pick = this.stance === "lowsec-first" ? (allowed.find((o) => o.route === "lowsec" && o.expectedProfit > 0) ?? allowed[0]) : allowed[0];
    if (!pick && !sold.length) return;
    const r = await this.call("turn", pick ? { good: pick.good, qty: pick.qty, to: pick.to, route: pick.route } : { qty: 0 });
    const parts = [sold.length ? `sold ${sold.join(", ")}` : "", pick ? `hauls ${pick.qty} ${pick.good} ${pick.from}→${pick.to} via ${pick.route.toUpperCase()}` : ""].filter(Boolean);
    if (r.ok && pick) fleetHauls.set(P.id, { to: TOWNS.indexOf(pick.to), good: GOODS.indexOf(pick.good), qty: pick.qty });
    this.move(`${P.name} ${parts.join(", then ")}`, r, pick ? "haul" : "sell");
  }

  private busiestLane(eco: Economy): number {
    const counts = [0, 1, 2].map((l) => eco.raids.filter((r) => r.lane === l).length);
    // traffic = NPC cargo currently heading over each lane pair
    const traffic = [0, 0, 0];
    for (const h of fleetHauls.values()) for (let from = 0; from < 3; from++) if (from !== h.to) traffic[laneOf(from, h.to)] += h.qty;
    const score = [0, 1, 2].map((l) => traffic[l] - counts[l] * 50);
    return score.indexOf(Math.max(...score));
  }

  /** One AI call: pick the stance for the next few minutes. Anchored on-chain via record_decision. */
  private async review(eco: Economy, cp: ChainParams, gold: number, all: TradeOption[], town: number) {
    const P = this.persona;
    const best = { safe: all.find((o) => o.route === "safe"), low: all.find((o) => o.route === "lowsec") };
    const canRaid = P.raider && gold >= 2.2 * cp.raid_min_stake && !eco.raids.some((r) => r.raider === P.id);
    const stances: Stance[] = ["safe-first", "balanced", "lowsec-first", ...(canRaid ? (["raid"] as Stance[]) : [])];
    const messages = [
      { role: "system" as const, content: `You are ${P.name}, an NPC trader in Lowsec, a trading game with 3 towns (mina makes ore, forja makes parts, puerto makes fuel). Lowsec lanes are 3x faster but can be ambushed (destroyed cargo is burned). Personality: ${P.style}. Choose your STRATEGY for the next few minutes by index. Reply with ONLY a JSON object: {"choice": <index>, "reasoning": "<one or two short in-character sentences, max 35 words>"}` },
      {
        role: "user" as const,
        content: JSON.stringify({
          you: { gold, town: TOWNS[town] },
          best_safe_run: best.safe ? `${best.safe.qty} ${best.safe.good} → ${best.safe.to}, profit ~${best.safe.expectedProfit}` : "none",
          best_lowsec_run: best.low ? `${best.low.qty} ${best.low.good} → ${best.low.to}, profit after risk ~${best.low.expectedProfit}, ambush ${best.low.ambushChancePct}%` : "none",
          active_raids: eco.raids.map((r) => LANES[r.lane]),
          council_faucet_pct: eco.faucet_bps / 100,
          options: stances.map((s, i) => `${i}: ${STANCE_TEXT[s]}`),
        }),
      },
    ];
    const m = mockStance(P, eco, best, canRaid);
    const mock = () => JSON.stringify({ choice: stances.indexOf(m.choice), reasoning: m.reasoning });
    const res = await this.ai.complete(messages, mock);
    let parsed = parseJsonReply<{ choice: number; reasoning: string }>(res.text);
    if (!parsed || !Number.isInteger(parsed.choice) || parsed.choice < 0 || parsed.choice >= stances.length) parsed = { choice: stances.indexOf(m.choice), reasoning: `(model reply unusable, rule fallback) ${m.reasoning}` };
    const chosen = stances[parsed.choice];
    const payloadHash = sha256(JSON.stringify({ messages, reply: res.text, choice: parsed.choice, stance: chosen }));
    const rec = await this.call("record_decision", { kind: "strategy", payload_hash: payloadHash, attestation_hash: res.attestationHash, model: res.model.slice(0, 120), signature_kind: res.signatureKind });
    this.stance = chosen;
    this.stanceAt = Date.now();
    remember({
      agent: P.id, name: P.name, ts: Date.now(), kind: "strategy", summary: STANCE_TEXT[chosen], reasoning: parsed.reasoning, model: res.model, mode: res.mode, signatureKind: res.signatureKind,
      verified: res.verified, attestationHash: res.attestationHash, completionId: res.completionId, decisionId: rec.ok ? Number(rec.value) : null, decisionTx: rec.txHash, actionTx: "", error: res.error ?? (rec.ok ? undefined : rec.error),
    });
    push({ actor: P.name, type: "strategy", text: `${P.name} new strategy: ${chosen.toUpperCase()} — “${parsed.reasoning}”`, txHash: rec.txHash, ok: rec.ok });
  }
}
