/**
 * NPC haulers. Each one is a NEAR sub-account (hauler-N.<contract>) acting through a function-call
 * key (allowance-capped, game methods only) whose meta-transactions are paid by the relayer.
 * Every decision: options priced by the shared rules -> NEAR AI TEE model picks one -> response
 * verified -> attestation bundle hashed -> hash anchored on-chain (record_decision) -> action.
 */
import type { KeyPairString } from "near-api-js";
import { HAULERS } from "../config.js";
import { view } from "../chain.js";
import { fcKey } from "../keys.js";
import { metaCall } from "../relayer.js";
import { push } from "../feed.js";
import { parseJsonReply, sha256, type InferenceProvider } from "../nearai.js";
import { LANES, TOWNS, GOODS, toSimParams, tradeOptions, type ChainParams, type Economy, type Player, type TradeOption } from "../game.js";

export interface Persona {
  id: string;
  role: string;
  name: string;
  style: string;
  riskWeight: number;
  raider: boolean;
  home: string;
}

export const PERSONAS: Persona[] = [
  { id: HAULERS[0], role: "hauler-1", name: "Kestrel", style: "cautious merchant: prefers the Safe lane unless Lowsec clearly pays more after risk; never raids", riskWeight: 1.3, raider: false, home: "mina" },
  { id: HAULERS[1], role: "hauler-2", name: "Vex", style: "aggressive smuggler: runs Lowsec for speed and sometimes stakes gold to raid a Lowsec lane", riskWeight: 0.7, raider: true, home: "forja" },
];

type RaidOption = { kind: "raid"; lane: string; stake: number; note: string };
type WaitOption = { kind: "wait"; note: string };
type Option = TradeOption | RaidOption | WaitOption;

export interface AgentDecision {
  agent: string;
  name: string;
  ts: number;
  kind: string;
  summary: string;
  reasoning: string;
  model: string;
  mode: "tee" | "mock";
  signatureKind: string;
  verified: boolean;
  attestationHash: string;
  completionId: string;
  decisionId: number | null;
  decisionTx: string;
  actionTx: string;
  error?: string;
}

export const lastDecisions = new Map<string, AgentDecision[]>();
const remember = (d: AgentDecision) => {
  const l = lastDecisions.get(d.agent) ?? [];
  l.unshift(d);
  lastDecisions.set(d.agent, l.slice(0, 10));
};

function describe(o: Option): string {
  if (o.kind === "haul") return `haul ${o.qty} ${o.good} ${o.from}→${o.to} via ${o.route.toUpperCase()} (cost ${o.cost}, expected profit ${o.expectedProfit}, ambush risk ${o.ambushChancePct}%)`;
  if (o.kind === "raid") return `raid the ${o.lane} Lowsec lane staking ${o.stake} gold (${o.note})`;
  return `wait (${o.note})`;
}

function mockChoice(p: Persona, opts: Option[], tick: number): { choice: number; reasoning: string } {
  const raidIdx = opts.findIndex((o) => o.kind === "raid");
  if (p.raider && raidIdx >= 0 && tick % 3 === 0) return { choice: raidIdx, reasoning: `Traffic on ${(opts[raidIdx] as RaidOption).lane} is juicy. I'll camp the gate and let someone else's cargo pay me.` };
  const h = opts.findIndex((o) => o.kind === "haul");
  if (h < 0) return { choice: opts.length - 1, reasoning: "Nothing pays after tolls and risk right now. I'll sit tight." };
  const o = opts[h] as TradeOption;
  const why = o.route === "lowsec" ? `Lowsec is ${o.ambushChancePct}% risky but the faster run still nets ~${o.expectedProfit} gold.` : `Safe lane is slower but ~${o.expectedProfit} gold profit with zero ambush risk.`;
  return { choice: h, reasoning: `${o.good} is cheap in ${o.from} and scarce in ${o.to}. ${why}` };
}

export class Hauler {
  private key: KeyPairString | null;
  private busy = false;
  constructor(public persona: Persona, private ai: InferenceProvider, private params: () => Promise<ChainParams>) {
    this.key = fcKey(persona.id, persona.role);
  }

  get ready() {
    return !!this.key;
  }

  private call(method: string, args: Record<string, unknown>) {
    return metaCall(this.persona.id, this.key!, method, args);
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
    const player = await view<Player | null>("get_player", { account_id: P.id });
    if (!player) {
      const r = await this.call("register", { town: P.home });
      push({ actor: P.name, type: "register", text: `${P.name} joined at ${P.home}`, txHash: r.txHash, ok: r.ok });
      return;
    }
    const eco = await view<Economy>("economy");
    if (player.haul) {
      if (eco.tick >= player.haul.arrive_tick) {
        const r = await this.call("arrive", {});
        const v: any = r.value ?? {};
        push({ actor: P.name, type: v.ambushed ? "ambush" : "arrive", text: v.ambushed ? `${P.name} was AMBUSHED on the way to ${v.town}: ${v.burned} burned, ${v.looted} looted` : `${P.name} arrived in ${v.town ?? TOWNS[player.haul.to]} with ${v.delivered ?? player.haul.qty} ${GOODS[player.haul.good]}`, txHash: r.txHash, ok: r.ok });
      }
      return;
    }
    const tokens = ["gold", ...GOODS];
    const bal = (await view<string[]>("mt_batch_balance_of", { account_id: P.id, token_ids: tokens })).map(Number);
    for (let i = 1; i < 4; i++) {
      if (bal[i] > 0) {
        const r = await this.call("sell", { good: tokens[i], qty: bal[i] });
        push({ actor: P.name, type: "sell", text: `${P.name} sold ${bal[i]} ${tokens[i]} in ${TOWNS[player.town]} for ${r.value ?? "?"} gold`, txHash: r.txHash, ok: r.ok });
        if (r.ok) bal[0] += Number(r.value ?? 0);
      }
    }
    const cp = await this.params();
    const p = toSimParams(cp);
    const all = tradeOptions(p, eco, player.town, bal[0], P.riskWeight).filter((o) => o.expectedProfit > 0);
    const opts: Option[] = [];
    const bestSafe = all.find((o) => o.route === "safe");
    const bestLow = all.find((o) => o.route === "lowsec");
    for (const o of [all[0], bestSafe, bestLow, all[1]]) if (o && !opts.includes(o) && opts.length < 3) opts.push(o);
    if (P.raider && bal[0] >= 2.2 * cp.raid_min_stake && !eco.raids.some((r) => r.raider === P.id)) {
      const counts = [0, 1, 2].map((l) => eco.raids.filter((r) => r.lane === l).length);
      const lane = counts.indexOf(Math.min(...counts));
      opts.push({ kind: "raid", lane: LANES[lane], stake: cp.raid_min_stake, note: `${counts[lane]} raids already there; ambush chance would rise for everyone on it` });
    }
    opts.push({ kind: "wait", note: "do nothing this turn" });

    const messages = [
      { role: "system" as const, content: `You are ${P.name}, an NPC hauler in Lowsec, a trading game with 3 towns (mina makes ore, forja makes parts, puerto makes fuel). Lowsec lanes are 3x faster but can be ambushed (destroyed cargo is burned). Personality: ${P.style}. Pick exactly ONE option by index. Reply with ONLY a JSON object: {"choice": <index>, "reasoning": "<one or two short in-character sentences, max 35 words>"}` },
      { role: "user" as const, content: JSON.stringify({ you: { town: TOWNS[player.town], gold: bal[0] }, council_faucet_pct: eco.faucet_bps / 100, options: opts.map((o, i) => `${i}: ${describe(o)}`) }) },
    ];
    const mock = () => JSON.stringify(mockChoice(P, opts, eco.tick));
    const res = await this.ai.complete(messages, mock);
    let parsed = parseJsonReply<{ choice: number; reasoning: string }>(res.text);
    if (!parsed || !Number.isInteger(parsed.choice) || parsed.choice < 0 || parsed.choice >= opts.length) parsed = { ...mockChoice(P, opts, eco.tick), reasoning: `(model reply unusable, rule fallback) ${mockChoice(P, opts, eco.tick).reasoning}` };
    const chosen = opts[parsed.choice];
    const payloadHash = sha256(JSON.stringify({ messages, reply: res.text, choice: parsed.choice, action: chosen }));
    const rec = await this.call("record_decision", { kind: chosen.kind, payload_hash: payloadHash, attestation_hash: res.attestationHash, model: res.model.slice(0, 120), signature_kind: res.signatureKind });
    let actionTx = "";
    let summary = describe(chosen);
    if (chosen.kind === "haul") {
      const b = await this.call("buy", { good: chosen.good, qty: chosen.qty });
      if (b.ok) {
        const h = await this.call("start_haul", { to: chosen.to, route: chosen.route, good: chosen.good, qty: chosen.qty });
        actionTx = h.txHash;
        push({ actor: P.name, type: "haul", text: `${P.name} hauls ${chosen.qty} ${chosen.good} ${chosen.from}→${chosen.to} via ${chosen.route.toUpperCase()}`, txHash: h.txHash, ok: h.ok });
      } else summary += ` — buy failed: ${b.error}`;
    } else if (chosen.kind === "raid") {
      const r = await this.call("raid", { lane: chosen.lane, stake: String(chosen.stake) });
      actionTx = r.txHash;
      push({ actor: P.name, type: "raid", text: `${P.name} staked ${chosen.stake} gold to raid ${chosen.lane}`, txHash: r.txHash, ok: r.ok });
    }
    remember({
      agent: P.id, name: P.name, ts: Date.now(), kind: chosen.kind, summary, reasoning: parsed.reasoning, model: res.model, mode: res.mode, signatureKind: res.signatureKind,
      verified: res.verified, attestationHash: res.attestationHash, completionId: res.completionId, decisionId: rec.ok ? Number(rec.value) : null, decisionTx: rec.txHash, actionTx, error: res.error ?? (rec.ok ? undefined : rec.error),
    });
  }
}
