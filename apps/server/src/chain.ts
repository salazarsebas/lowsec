import { Account, FailoverRpcProvider, JsonRpcProvider, actions, getTransactionLastResult, teraToGas, type KeyPairString } from "near-api-js";
import { CONTRACT_ID, RPC_URLS } from "./config.js";

export const provider = new FailoverRpcProvider([...new Set(RPC_URLS)].map((url) => new JsonRpcProvider({ url })));

/** Views are cached for ~1.5 s and de-duplicated in flight: many browser tabs polling must not hit the RPC rate limit. */
const viewCache = new Map<string, { at: number; p: Promise<unknown> }>();
export async function view<T>(method: string, args: Record<string, unknown> = {}, maxAgeMs = 1500): Promise<T> {
  const k = method + JSON.stringify(args);
  const hit = viewCache.get(k);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.p as Promise<T>;
  const p = provider.callFunction({ contractId: CONTRACT_ID, method, args, blockQuery: { finality: "optimistic" } } as never) as Promise<T>;
  viewCache.set(k, { at: Date.now(), p });
  p.catch(() => viewCache.delete(k));
  if (viewCache.size > 2000) for (const [key, v] of viewCache) if (Date.now() - v.at > 10_000) viewCache.delete(key);
  return p;
}

export function account(id: string, key: KeyPairString): Account {
  return new Account(id, provider, key);
}

export interface TxResult {
  txHash: string;
  ok: boolean;
  value: unknown;
  logs: string[];
  events: { standard: string; event: string; data: any[] }[];
  error?: string;
}

/** Normalise an RPC tx response into hash/value/logs/events. */
export function parseOutcome(res: any): TxResult {
  const txHash = res?.transaction?.hash ?? res?.transaction_outcome?.id ?? "";
  const logs: string[] = [...(res?.transaction_outcome?.outcome?.logs ?? []), ...(res?.receipts_outcome ?? []).flatMap((r: any) => r.outcome.logs)];
  const events = logs.filter((l) => l.startsWith("EVENT_JSON:")).map((l) => JSON.parse(l.slice(11)));
  const failure = res?.status?.Failure ?? (res?.receipts_outcome ?? []).map((r: any) => r.outcome.status?.Failure).find(Boolean);
  // For meta-txs the outer receipt (Delegate) returns nothing: take the game contract's own return value.
  let value: unknown = null;
  for (const r of res?.receipts_outcome ?? []) {
    const sv = r?.outcome?.status?.SuccessValue;
    if (r?.outcome?.executor_id === CONTRACT_ID && sv) {
      try {
        value = JSON.parse(Buffer.from(sv, "base64").toString("utf8"));
        break;
      } catch {}
    }
  }
  if (value === null) {
    try {
      value = getTransactionLastResult(res);
    } catch {}
  }
  return { txHash, ok: !failure, value, logs, events, error: failure ? JSON.stringify(failure).slice(0, 400) : undefined };
}

export async function call(acc: Account, method: string, args: Record<string, unknown>, tgas = 50): Promise<TxResult> {
  try {
    const res = await acc.signAndSendTransaction({
      receiverId: CONTRACT_ID,
      actions: [actions.functionCall(method, args, teraToGas(tgas), 0n)],
      throwOnFailure: false,
    } as never);
    return parseOutcome(res);
  } catch (e: any) {
    return { txHash: e?.context?.transactionHash ?? "", ok: false, value: null, logs: [], events: [], error: String(e?.message ?? e).slice(0, 400) };
  }
}

export async function accountExists(id: string): Promise<boolean> {
  try {
    await provider.viewAccount({ accountId: id } as never);
    return true;
  } catch {
    return false;
  }
}
