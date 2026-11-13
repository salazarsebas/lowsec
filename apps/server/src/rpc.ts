/**
 * RPC pool for free public NEAR endpoints.
 *
 * FailoverRpcProvider + the default JsonRpcProvider retry loop (12 attempts,
 * 500 ms * 1.5^n ≈ 85 s) plus the deprecated rpc.testnet.near.org fallback
 * caused 40–100 s stalls, relayer InvalidNonce errors and "not travelling"
 * panics: a send_tx that actually landed was retried on the next endpoint,
 * then re-signed with a stale nonce.
 *
 * This pool:
 *  - rate-limits and cooldowns an endpoint on 429 / deprecation / timeout
 *  - round-robins reads across healthy endpoints
 *  - pins each access key to one endpoint for tx submission
 *  - looks up a signed tx by hash before resubmitting it
 *  - uses short per-endpoint retries so failover is fast
 */
import { createHash } from "node:crypto";
import {
  JsonRpcProvider,
  baseEncode,
  encodeTransaction,
  type SignedTransaction,
  type TxExecutionStatus,
} from "near-api-js";

export const DEFAULT_TESTNET_RPCS = [
  "https://near-testnet.drpc.org",
  "https://test.rpc.fastnear.com",
  "https://testnet-rpc.intea.rs",
  "https://api.zan.top/near-testnet",
];

export const DEFAULT_MAINNET_RPCS = [
  "https://near.drpc.org",
  "https://free.rpc.fastnear.com",
  "https://rpc.intea.rs",
];

const READ_MS = 10_000;
const WRITE_MS = 20_000;
const RATE_PER_SEC = 6;
const BURST = 8;
const MAX_INFLIGHT = 4;
const INNER_RETRIES = 2;

export interface ProviderLike {
  sendTransactionUntil: (...args: any[]) => Promise<unknown>;
  viewTransactionStatus: (...args: any[]) => Promise<unknown>;
  [k: string]: any;
}

export interface RpcNode {
  url: string;
  inner: ProviderLike;
  cooldownUntil: number;
  strikes: number;
  inflight: number;
  tokens: number;
  lastRefill: number;
}

export interface RpcStatus {
  url: string;
  healthy: boolean;
  cooldownMs: number;
  strikes: number;
  inflight: number;
}

function errText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  const e = err as any;
  return [e.message, e.type, e.name, e.cause, e.toString?.()].filter(Boolean).join(" ");
}

export function isRateLimited(err: unknown): boolean {
  const cause = (err as any)?.cause;
  const s = errText(err);
  return (
    cause === 429 ||
    /(?:code"?\s*[:=]\s*-?429|-32011|-32003)\b|Rate limits? exceeded|cu limit exceeded|Request too fast|ENDPOINT IS DEPRECATED|statusCode"?:\s*429|You've reached the usage limit|exceeded your limit/i.test(s)
  );
}

export function isRetryableRpc(err: unknown): boolean {
  const cause = (err as any)?.cause;
  const s = errText(err);
  return (
    isRateLimited(err) ||
    [408, 410, 500, 502, 503].includes(cause) ||
    /timeout|FetchError|Failed to fetch|ECONN|ENOTFOUND|UND_ERR|unavailable|Bad Gateway|discontinued|RetriesExceeded|Exceeded \d+ providers/i.test(s)
  );
}

export function isInvalidNonce(err: unknown): boolean {
  const s = errText(err);
  return (err as any)?.name === "InvalidNonceError" || (err as any)?.type === "InvalidNonceError" || /InvalidNonce|Invalid nonce/i.test(s);
}

export function signedTxHash(signed: SignedTransaction): string {
  return baseEncode(createHash("sha256").update(encodeTransaction(signed)).digest());
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) => {
        t = setTimeout(() => rej(new Error(`RPC timeout after ${ms}ms (${label})`)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export class RpcPool {
  nodes: RpcNode[];
  rr = 0;
  /** Access-key public key → last successful write endpoint. */
  sticky = new Map<string, string>();
  hashOf: (signed: SignedTransaction) => string;

  constructor(nodes: { url: string; inner: ProviderLike }[], opts?: { hashOf?: (signed: SignedTransaction) => string }) {
    if (!nodes.length) throw new Error("At least one RPC URL is required");
    this.hashOf = opts?.hashOf ?? signedTxHash;
    this.nodes = nodes.map((n) => ({
      url: n.url,
      inner: n.inner,
      cooldownUntil: 0,
      strikes: 0,
      inflight: 0,
      tokens: BURST,
      lastRefill: Date.now(),
    }));
  }

  status(): RpcStatus[] {
    const now = Date.now();
    return this.nodes.map((n) => ({
      url: n.url,
      healthy: now >= n.cooldownUntil,
      cooldownMs: Math.max(0, n.cooldownUntil - now),
      strikes: n.strikes,
      inflight: n.inflight,
    }));
  }

  private refill(n: RpcNode) {
    const now = Date.now();
    const add = ((now - n.lastRefill) / 1000) * RATE_PER_SEC;
    if (add > 0) {
      n.tokens = Math.min(BURST, n.tokens + add);
      n.lastRefill = now;
    }
  }

  private async acquire(n: RpcNode) {
    for (;;) {
      this.refill(n);
      if (n.tokens >= 1 && n.inflight < MAX_INFLIGHT) {
        n.tokens -= 1;
        n.inflight++;
        return;
      }
      await sleep(40);
    }
  }

  private release(n: RpcNode) {
    n.inflight = Math.max(0, n.inflight - 1);
  }

  private markOk(n: RpcNode) {
    n.strikes = 0;
    n.cooldownUntil = 0;
  }

  private markFail(n: RpcNode, err: unknown) {
    n.strikes++;
    if (isRateLimited(err) || /DEPRECATED|discontinued|410/.test(errText(err))) {
      n.cooldownUntil = Date.now() + Math.min(30_000, 2000 * 2 ** Math.min(n.strikes - 1, 4));
    } else if (isRetryableRpc(err)) {
      n.cooldownUntil = Date.now() + Math.min(8_000, 800 * n.strikes);
    }
    if (isRateLimited(err) || isRetryableRpc(err)) {
      console.warn(`[lowsec] RPC ${n.url} failed (${n.strikes}): ${errText(err).slice(0, 180)}`);
    }
  }

  private healthy(exclude: Set<string>): RpcNode[] {
    const now = Date.now();
    return this.nodes.filter((n) => now >= n.cooldownUntil && !exclude.has(n.url));
  }

  private pickRead(exclude: Set<string>): RpcNode | undefined {
    const ok = this.healthy(exclude);
    if (ok.length) {
      const n = ok[this.rr % ok.length];
      this.rr++;
      return n;
    }
    return this.nodes
      .filter((n) => !exclude.has(n.url))
      .sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0];
  }

  private pickWrite(stickyId: string, exclude: Set<string>): RpcNode | undefined {
    const pinned = this.sticky.get(stickyId);
    if (pinned) {
      const n = this.nodes.find((x) => x.url === pinned && !exclude.has(x.url) && Date.now() >= x.cooldownUntil);
      if (n) return n;
    }
    return this.pickRead(exclude);
  }

  async withRead<T>(fn: (p: ProviderLike) => Promise<T>, opts?: { stickyId?: string; timeoutMs?: number }): Promise<T> {
    const tried = new Set<string>();
    const errors: unknown[] = [];
    const timeout = opts?.timeoutMs ?? READ_MS;
    while (tried.size < this.nodes.length) {
      const node = opts?.stickyId ? this.pickWrite(opts.stickyId, tried) : this.pickRead(tried);
      if (!node) break;
      tried.add(node.url);
      await this.acquire(node);
      try {
        const result = await withTimeout(fn(node.inner), timeout, node.url);
        this.markOk(node);
        if (opts?.stickyId) this.sticky.set(opts.stickyId, node.url);
        return result;
      } catch (e) {
        this.markFail(node, e);
        errors.push(e);
        if (!isRetryableRpc(e) && !isRateLimited(e)) throw e;
      } finally {
        this.release(node);
      }
    }
    const last = errors[errors.length - 1];
    throw last ?? new Error("all RPC endpoints failed");
  }

  /** Try every endpoint (the tx may have landed on the node we just sent to). "Not found" is not a cooldown. */
  async lookupTx(hash: string, accountId: string, preferUrl?: string): Promise<any | null> {
    const order = [
      ...this.nodes.filter((n) => n.url === preferUrl),
      ...this.nodes.filter((n) => n.url !== preferUrl),
    ];
    for (const node of order) {
      try {
        await this.acquire(node);
        try {
          const result = await withTimeout(
            node.inner.viewTransactionStatus({ txHash: hash, accountId, waitUntil: "NONE" }),
            8_000,
            `tx ${node.url}`,
          );
          if (result) return result;
        } finally {
          this.release(node);
        }
      } catch {
        // not found / lag / timeout — try the next node
      }
    }
    return null;
  }

  async sendTransactionUntil(signed: SignedTransaction, waitUntil: TxExecutionStatus = "EXECUTED_OPTIMISTIC"): Promise<any> {
    const hash = this.hashOf(signed);
    const signerId = (signed as any).transaction?.signerId as string;
    const stickyId = (signed as any).transaction?.publicKey?.toString?.() ?? signerId ?? "tx";
    const tried = new Set<string>();
    const errors: unknown[] = [];
    while (tried.size < this.nodes.length) {
      const node = this.pickWrite(stickyId, tried);
      if (!node) break;
      tried.add(node.url);
      this.sticky.set(stickyId, node.url);
      await this.acquire(node);
      try {
        const result = await withTimeout(node.inner.sendTransactionUntil(signed, waitUntil), WRITE_MS, `send_tx ${node.url}`);
        this.markOk(node);
        return result;
      } catch (e) {
        this.markFail(node, e);
        errors.push(e);
        const landed = signerId ? await this.lookupTx(hash, signerId, node.url) : null;
        if (landed) return landed;
        // Let Account's NonceManager refresh and re-sign; do not hop endpoints with the same nonce.
        if (isInvalidNonce(e)) throw e;
        if (!isRetryableRpc(e) && !isRateLimited(e)) throw e;
      } finally {
        this.release(node);
      }
    }
    const landed = signerId ? await this.lookupTx(hash, signerId) : null;
    if (landed) return landed;
    throw errors[errors.length - 1] ?? new Error("all RPC endpoints failed to submit the transaction");
  }

  sendTransaction(signed: SignedTransaction) {
    return this.sendTransactionUntil(signed, "EXECUTED_OPTIMISTIC");
  }

  sendTransactionAsync(signed: SignedTransaction) {
    return this.sendTransactionUntil(signed, "NONE");
  }
}

const READ_METHODS = [
  "getNetworkId",
  "getCurrentEpochSeatPrice",
  "getNextEpochSeatPrice",
  "viewAccessKey",
  "viewAccessKeyList",
  "viewGasKeyNonces",
  "viewAccount",
  "viewContractCode",
  "viewGlobalContractCode",
  "viewContractState",
  "callFunction",
  "callFunctionRaw",
  "viewBlock",
  "viewChunk",
  "viewGasPrice",
  "viewNodeStatus",
  "viewValidators",
  "viewTransactionStatus",
  "viewTransactionStatusWithReceipts",
  "viewTransactionReceipt",
  "query",
  "blockChanges",
  "experimental_protocolConfig",
  "lightClientProof",
  "nextLightClientBlock",
  "accessKeyChanges",
  "accountChanges",
  "contractCodeChanges",
] as const;

export type PooledProvider = RpcPool & ProviderLike;

export function createRpcPool(urls: string[]): PooledProvider {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const pool = new RpcPool(
    unique.map((url) => ({
      url,
      inner: new JsonRpcProvider({ url }, { retries: INNER_RETRIES, wait: 200, backoff: 1.5 }),
    })),
  );
  return new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === "then") return undefined;
      if (typeof prop === "string" && prop in target) {
        const val = Reflect.get(target, prop, receiver);
        return typeof val === "function" ? val.bind(target) : val;
      }
      if (typeof prop === "string" && (READ_METHODS as readonly string[]).includes(prop)) {
        return (...args: any[]) => {
          const stickyId =
            prop === "viewAccessKey" || prop === "viewGasKeyNonces"
              ? args[0]?.publicKey?.toString?.() ?? (args[0]?.publicKey ? String(args[0].publicKey) : undefined)
              : undefined;
          return target.withRead((p) => {
            const fn = p[prop];
            if (typeof fn !== "function") throw new Error(`RPC provider has no method ${prop}`);
            return fn.apply(p, args);
          }, stickyId ? { stickyId } : undefined);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as PooledProvider;
}
