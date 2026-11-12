/**
 * NEP-366 relayer: players (and NPC haulers) sign DelegateActions with function-call keys;
 * this account wraps them in a transaction and pays the gas. Players never see a wallet or gas.
 */
import { Account, actions, decodeSignedDelegate, teraToGas, type KeyPairString, type SignedDelegate } from "near-api-js";
import { CONTRACT_ID, RELAYER_ID, RELAY_METHODS } from "./config.js";
import { account, parseOutcome, type TxResult } from "./chain.js";
import { fullKey } from "./keys.js";

let relayer: Account | null = null;
export function relayerAccount(): Account {
  if (!relayer) {
    const k = fullKey(RELAYER_ID, "relayer");
    if (!k) throw new Error(`no key for relayer ${RELAYER_ID}: put it in ~/.near-credentials/testnet/ or set RELAYER_PRIVATE_KEY`);
    relayer = account(RELAYER_ID, k);
  }
  return relayer;
}

/** Policy: only zero-deposit calls to the game contract, from game sub-accounts, for allowed methods. */
export function checkPolicy(sd: SignedDelegate): string | null {
  const d: any = (sd as any).delegateAction;
  if (d.receiverId !== CONTRACT_ID) return "receiver must be the game contract";
  if (!String(d.senderId).endsWith(`.${CONTRACT_ID}`)) return "only game accounts are sponsored";
  for (const a of d.actions) {
    const fc = a.functionCall;
    if (!fc) return "only function calls are sponsored";
    if (!RELAY_METHODS.has(fc.methodName)) return `method ${fc.methodName} is not sponsored`;
    if (BigInt(fc.deposit ?? 0) !== 0n) return "deposits are not sponsored";
    if (BigInt(fc.gas ?? 0) > teraToGas(100)) return "too much gas";
  }
  return null;
}

let queue: Promise<unknown> = Promise.resolve();
/** Serialise relays: one relayer key => avoid nonce races. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

export async function relaySigned(sd: SignedDelegate): Promise<TxResult> {
  const err = checkPolicy(sd);
  if (err) return { txHash: "", ok: false, value: null, logs: [], events: [], error: err };
  return serial(async () => {
    try {
      const res = await relayerAccount().relayMetaTransaction(sd);
      return parseOutcome(res);
    } catch (e: any) {
      return { txHash: "", ok: false, value: null, logs: [], events: [], error: String(e?.message ?? e).slice(0, 400) };
    }
  });
}

export function decodeB64(b64: string): SignedDelegate {
  return decodeSignedDelegate(Buffer.from(b64, "base64"));
}

/** Server-side actors (NPC haulers) sign a meta-tx with their FC key and relay it here. */
export async function metaCall(id: string, key: KeyPairString, method: string, args: Record<string, unknown>, tgas = 50): Promise<TxResult> {
  const acc = account(id, key);
  try {
    const { signedDelegate } = await acc.createSignedMetaTransaction({
      receiverId: CONTRACT_ID,
      actions: [actions.functionCall(method, args, teraToGas(tgas), 0n)],
      blockHeightTtl: 120,
    } as never);
    return relaySigned(signedDelegate);
  } catch (e: any) {
    return { txHash: "", ok: false, value: null, logs: [], events: [], error: String(e?.message ?? e).slice(0, 400) };
  }
}
