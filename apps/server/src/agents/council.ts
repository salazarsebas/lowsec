/**
 * AI Economic Council. Once per on-chain epoch it applies the PUBLIC rule (computed by the contract
 * itself: view rule_next_faucet_bps), asks the TEE model only to EXPLAIN it, anchors the attestation
 * hash on-chain, and calls council_update — which the contract bounds to ±10% per epoch.
 */
import type { Account } from "near-api-js";
import { COUNCIL_ID } from "../config.js";
import { account, call, view } from "../chain.js";
import { fcKey, fullKey } from "../keys.js";
import { push } from "../feed.js";
import { parseJsonReply, sha256, type InferenceProvider } from "../nearai.js";
import type { Economy } from "../game.js";

export interface CouncilEntry {
  epoch: number;
  hold: string | null;
  windowEpochs: number;
  players: number;
  inflationBps: number;
  prevFaucetBps: number;
  nextFaucetBps: number;
  explanation: string;
  mode: "tee" | "mock";
  signatureKind: string;
  verified: boolean;
  attestationHash: string;
  model: string;
  decisionId: number | null;
  tx: string;
  ok: boolean;
  ts: number;
}

export const councilLog: CouncilEntry[] = [];

export class Council {
  private acc: Account | null = null;
  private lastEpoch = -1;
  private busy = false;
  constructor(private ai: InferenceProvider) {
    const k = fcKey(COUNCIL_ID, "council") ?? fullKey(COUNCIL_ID, "council");
    if (k) this.acc = account(COUNCIL_ID, k);
  }
  get ready() {
    return !!this.acc;
  }

  async step() {
    if (!this.acc || this.busy) return;
    this.busy = true;
    try {
      const eco = await view<Economy>("economy", {}, 0);
      if (eco.epoch === 0 || eco.rule_next_faucet_bps == null || eco.epoch === this.lastEpoch) return;
      const acted = await view<number | null>("last_council_epoch", {}, 0);
      if (acted !== null && acted >= eco.epoch) {
        this.lastEpoch = eco.epoch;
        return;
      }
      // The rule's exact inputs come from the contract itself (council_signal view), so the explanation
      // can never disagree with the number the contract computes.
      const sig = eco.council_signal;
      if (!sig) return;
      const infl = sig.signal_bps;
      const next = sig.next_faucet_bps;
      const prev = sig.faucet_bps;
      const facts = {
        rule: eco.council_rule,
        epochs_in_window: sig.epochs_covered,
        gold_supply_window_start: Number(sig.supply_start),
        gold_supply_window_end: Number(sig.supply_end),
        mean_growth_per_epoch_pct: infl / 100,
        target_pct: sig.target_bps / 100,
        players: sig.players,
        hold_reason: sig.hold,
        faucet_before_pct: prev / 100,
        faucet_after_pct: next / 100,
      };
      const messages = [
        { role: "system" as const, content: `You are the Economic Council of Lowsec, a player-driven trading game. You do NOT choose the number: a public rule does. Explain the decision to players in plain words (no jargon, max 40 words). Above target means cut rewards, below target means raise them. Reply ONLY JSON {"explanation": "..."}` },
        { role: "user" as const, content: JSON.stringify(facts) },
      ];
      const dir = next < prev ? "cut" : next > prev ? "raise" : "hold";
      const rel = infl > sig.target_bps ? "above" : infl < sig.target_bps ? "below" : "on";
      const mock = () =>
        JSON.stringify({
          explanation: sig.hold
            ? `Only ${sig.players} pilots so far: one sale would swing the numbers, so we hold rewards at ${(prev / 100).toFixed(1)}% until there's enough activity to read.`
            : `Gold supply grew ${(infl / 100).toFixed(2)}% per epoch over the last ${sig.epochs_covered} epoch(s), ${rel} the ${(sig.target_bps / 100).toFixed(0)}% target, so we ${dir} town buy orders: ${(prev / 100).toFixed(1)}% → ${(next / 100).toFixed(1)}%.`,
        });
      const res = await this.ai.complete(messages, mock);
      const explanation = parseJsonReply<{ explanation: string }>(res.text)?.explanation ?? JSON.parse(mock()).explanation;
      const payloadHash = sha256(JSON.stringify({ messages, reply: res.text, next }));
      const rec = await call(this.acc, "record_decision", { kind: "council", payload_hash: payloadHash, attestation_hash: res.attestationHash, model: res.model.slice(0, 120), signature_kind: res.signatureKind });
      const up = await call(this.acc, "council_update", { faucet_bps: next, rationale_hash: res.attestationHash, decision_id: rec.ok ? Number(rec.value) : null });
      if (up.ok || /already acted/.test(up.error ?? "")) this.lastEpoch = eco.epoch;
      councilLog.unshift({ epoch: eco.epoch, hold: sig.hold, windowEpochs: sig.epochs_covered, players: sig.players, inflationBps: infl, prevFaucetBps: prev, nextFaucetBps: next, explanation, mode: res.mode, signatureKind: res.signatureKind, verified: res.verified, attestationHash: res.attestationHash, model: res.model, decisionId: rec.ok ? Number(rec.value) : null, tx: up.txHash, ok: up.ok, ts: Date.now() });
      councilLog.splice(30);
      push({ actor: "Council", type: "council", text: up.ok ? (sig.hold ? `Council (epoch ${eco.epoch}) holds at ${(prev / 100).toFixed(1)}%: ${sig.hold}` : `Council (epoch ${eco.epoch}): growth ${(infl / 100).toFixed(2)}%/epoch vs ${(sig.target_bps / 100).toFixed(0)}% target → faucets ${(prev / 100).toFixed(1)}% → ${(next / 100).toFixed(1)}%`) : `Council update failed: ${up.error}`, txHash: up.txHash, ok: up.ok });
    } catch (e: any) {
      push({ actor: "Council", type: "error", text: String(e?.message ?? e).slice(0, 200), ok: false });
    } finally {
      this.busy = false;
    }
  }
}
