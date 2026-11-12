/**
 * AI Economic Council. The decision is a PUBLIC ONE-LINE RULE applied by code;
 * the LLM (NEAR AI Cloud, TEE) only writes the human explanation.
 *
 * RULE: faucet_next = clamp(faucet * (1 - gain * (inflation - target)), ±10% per epoch, [min,max])
 * where faucet scales every gold faucet (NPC buy orders + starter grant) and inflation = daily gold-supply growth.
 *
 * The contract re-checks the ±10% bound on-chain (set_npc_buy_bps), so even a
 * compromised council key cannot crash or pump the economy in one step.
 */
import type { Params } from "./params.js";

export const COUNCIL_RULE =
  "faucet_next = clamp(faucet × (1 − gain × (inflation − target)), ±10%/epoch, [70%, 110%])";

export interface CouncilDecision {
  epoch: number;
  inflationBps: number;
  targetBps: number;
  stepBps: number;
  prevFaucetBps: number;
  nextFaucetBps: number;
}

export function inflationBps(supplyStart: number, supplyEnd: number): number {
  if (supplyStart <= 0) return 0;
  return Math.trunc(((supplyEnd - supplyStart) * 10_000) / supplyStart);
}

export function councilStep(p: Params, epoch: number, faucetBps: number, inflBps: number): CouncilDecision {
  const err = inflBps - p.councilTargetInflationBps;
  let step = -Math.trunc(err * p.councilGain);
  step = Math.max(-p.councilMaxStepBps, Math.min(p.councilMaxStepBps, step));
  let next = Math.trunc((faucetBps * (10_000 + step)) / 10_000);
  next = Math.max(p.councilMinFaucetBps, Math.min(p.councilMaxFaucetBps, next));
  return { epoch, inflationBps: inflBps, targetBps: p.councilTargetInflationBps, stepBps: step, prevFaucetBps: faucetBps, nextFaucetBps: next };
}

/** Same bound the contract enforces: |next - prev| <= prev * maxStep. */
export function withinBound(prev: number, next: number, maxStepBps: number): boolean {
  return Math.abs(next - prev) * 10_000 <= prev * maxStepBps;
}

/** Per-capita inflation in bps: growth of (supply / players). Integer math, mirrored on-chain. */
export function perCapitaInflationBps(supplyStart: number, playersStart: number, supplyEnd: number, playersEnd: number): number {
  if (supplyStart <= 0 || playersStart <= 0 || playersEnd <= 0) return 0;
  // (supplyEnd/playersEnd) / (supplyStart/playersStart) - 1
  return Math.trunc(((supplyEnd * playersStart - supplyStart * playersEnd) * 10_000) / (supplyStart * playersEnd));
}
