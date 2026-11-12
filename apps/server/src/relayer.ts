/**
 * NEP-366 relayer: players (and NPC haulers) sign DelegateActions with function-call keys;
 * this account wraps them in a transaction and pays the gas. Players never see a wallet or gas.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Account, actions, decodeSignedDelegate, teraToGas, type KeyPairString, type SignedDelegate } from "near-api-js";
import { CONTRACT_ID, FC_DIR, RELAYER_ID, RELAY_METHODS } from "./config.js";
import { account, parseOutcome, type TxResult } from "./chain.js";
import { fullKey } from "./keys.js";

/**
 * Relayer key pool: each access key has its own nonce, so N keys = N meta-txs in flight.
 * Key 0 = the relayer's main key; extra keys come from RELAYER_POOL_PRIVATE_KEYS (comma-separated)
 * or ~/.near-credentials/<net>/lowsec-fc/relayer-pool.<relayer>.json (created by `setup-relayer-pool`).
 */
interface Lane { acc: Account; queue: Promise<unknown>; busy: number }
let pool: Lane[] | null = null;
function lanes(): Lane[] {
  if (pool) return pool;
  const k = fullKey(RELAYER_ID, "relayer");
  if (!k) throw new Error(`no key for relayer ${RELAYER_ID}: put it in ~/.near-credentials/testnet/ or set RELAYER_PRIVATE_KEY`);
  const keys: string[] = [k];
  if (process.env.RELAYER_POOL_PRIVATE_KEYS) keys.push(...process.env.RELAYER_POOL_PRIVATE_KEYS.split(",").filter(Boolean));
  const f = join(FC_DIR, `relayer-pool.${RELAYER_ID}.json`);
  if (existsSync(f)) keys.push(...(JSON.parse(readFileSync(f, "utf8")).private_keys as string[]));
  pool = [...new Set(keys)].map((key) => ({ acc: account(RELAYER_ID, key as KeyPairString), queue: Promise.resolve(), busy: 0 }));
  return pool;
}
export function relayerAccount(): Account {
  return lanes()[0].acc;
}
export function relayerPoolSize(): number {
  return lanes().length;
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

/** Serialise relays per key (no nonce races), spreading load over the least busy key. */
function serial<T>(fn: (acc: Account) => Promise<T>): Promise<T> {
  const lane = lanes().reduce((a, b) => (b.busy < a.busy ? b : a));
  lane.busy++;
  const run = () => fn(lane.acc);
  const p = lane.queue.then(run, run).finally(() => lane.busy--);
  lane.queue = p.catch(() => {});
  return p;
}

export async function relaySigned(sd: SignedDelegate): Promise<TxResult> {
  const err = checkPolicy(sd);
  if (err) return { txHash: "", ok: false, value: null, logs: [], events: [], error: err };
  return serial(async (acc) => {
    try {
      const res = await acc.relayMetaTransaction(sd);
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
  return metaBatch(id, key, [{ method, args }], tgas);
}

/** Several calls in ONE meta-tx (one receipt, all-or-nothing): e.g. sell + buy + start_haul = one tx per NPC turn. */
export async function metaBatch(id: string, key: KeyPairString, calls: { method: string; args: Record<string, unknown> }[], tgasEach = 40): Promise<TxResult> {
  const acc = account(id, key);
  try {
    const { signedDelegate } = await acc.createSignedMetaTransaction({
      receiverId: CONTRACT_ID,
      actions: calls.map((c) => actions.functionCall(c.method, c.args, teraToGas(tgasEach), 0n)),
      blockHeightTtl: 120,
    } as never);
    return relaySigned(signedDelegate);
  } catch (e: any) {
    return { txHash: "", ok: false, value: null, logs: [], events: [], error: String(e?.message ?? e).slice(0, 400) };
  }
}
