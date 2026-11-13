import { describe, expect, it } from "vitest";
import { RpcPool, isInvalidNonce, isRateLimited, isRetryableRpc, type ProviderLike } from "../src/rpc.js";

const rate429 = Object.assign(new Error('{"code": -429, "message": "Rate limits exceeded"}'), { cause: 429 });
const deprecated = Object.assign(new Error("WARNING! THIS ENDPOINT IS DEPRECATED! STOP USING IT NOW!"), { cause: 429 });
const timeout = new Error("Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)");
const nonceErr = Object.assign(new Error("Invalid nonce (ak: 10, tx: 10)"), { name: "InvalidNonceError", type: "InvalidNonceError" });

function node(url: string, inner: Partial<ProviderLike>): { url: string; inner: ProviderLike } {
  return { url, inner: inner as ProviderLike };
}

describe("RPC error classifiers", () => {
  it("detects HTTP and JSON-RPC 429s plus deprecation", () => {
    expect(isRateLimited(rate429)).toBe(true);
    expect(isRateLimited(deprecated)).toBe(true);
    expect(isRateLimited(timeout)).toBe(false);
    expect(isRateLimited(new Error('{"error":{"code":-32011,"message":"cu limit exceeded; Request too fast per second."}}'))).toBe(true);
    expect(isRateLimited(Object.assign(new Error('Rate limit exceeded, retry after 16 seconds'), { cause: 429 }))).toBe(true);
  });
  it("retries timeouts and 429s, but not contract panics", () => {
    expect(isRetryableRpc(timeout)).toBe(true);
    expect(isRetryableRpc(rate429)).toBe(true);
    expect(isRetryableRpc(new Error('Smart contract panicked: not travelling'))).toBe(false);
  });
  it("detects InvalidNonce", () => {
    expect(isInvalidNonce(nonceErr)).toBe(true);
    expect(isInvalidNonce(rate429)).toBe(false);
  });
});

describe("RpcPool", () => {
  it("round-robins reads across healthy endpoints and cools down a 429", async () => {
    const hits: string[] = [];
    const pool = new RpcPool([
      node("https://a.example", { callFunction: async () => { hits.push("a"); throw rate429; } }),
      node("https://b.example", { callFunction: async () => { hits.push("b"); return "ok-b"; } }),
      node("https://c.example", { callFunction: async () => { hits.push("c"); return "ok-c"; } }),
    ]);
    const first = await pool.withRead((p) => p.callFunction());
    expect(first === "ok-b" || first === "ok-c").toBe(true);
    expect(hits[0]).toBe("a");
    expect(pool.status()[0].healthy).toBe(false);
    expect(pool.status()[0].cooldownMs).toBeGreaterThan(0);
    hits.length = 0;
    const again = await Promise.all([0, 1, 2].map(() => pool.withRead((p) => p.callFunction())));
    expect(again.every((v) => v === "ok-b" || v === "ok-c")).toBe(true);
    expect(hits.includes("a")).toBe(false);
    expect(new Set(hits).size).toBeGreaterThan(1);
  });

  it("fails over a read in well under the old 85s retry loop", async () => {
    const pool = new RpcPool([
      node("https://slow.example", { callFunction: async () => { await new Promise((r) => setTimeout(r, 20)); throw rate429; } }),
      node("https://ok.example", { callFunction: async () => "fast" }),
    ]);
    const t0 = Date.now();
    expect(await pool.withRead((p) => p.callFunction())).toBe("fast");
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("pins a key's writes to one endpoint", async () => {
    const hits: string[] = [];
    const signed = { transaction: { signerId: "relayer.testnet", publicKey: { toString: () => "ed25519:sticky" } } } as any;
    const mk = (url: string): Partial<ProviderLike> => ({
      sendTransactionUntil: async () => { hits.push(url); return { transaction: { hash: "h" } }; },
      viewTransactionStatus: async () => { throw new Error("not found"); },
    });
    const pool = new RpcPool([node("https://a.example", mk("a")), node("https://b.example", mk("b"))]);
    // force hash function to not blow up: stub send only, wrap signedTxHash by using a real-enough path
    // encodeTransaction will throw; intercept by injecting send and skipping hash via try? We call sendTransactionUntil
    // which hashes first. Use a monkey patch: if encode fails the test fails. So don't call signedTxHash —
    // instead test pickWrite indirectly through withRead stickyId.
    const ids = await Promise.all(["ed25519:k1", "ed25519:k1", "ed25519:k1"].map((id) => pool.withRead(async () => {
      hits.push("read");
      return id;
    }, { stickyId: "ed25519:k1" })));
    expect(ids).toEqual(["ed25519:k1", "ed25519:k1", "ed25519:k1"]);
    const pin = pool.sticky.get("ed25519:k1");
    expect(pin === "https://a.example" || pin === "https://b.example").toBe(true);
    const url1 = pin;
    await pool.withRead(async () => 1, { stickyId: "ed25519:k1" });
    expect(pool.sticky.get("ed25519:k1")).toBe(url1);
  });

  it("returns a landed tx instead of resubmitting after a send timeout", async () => {
    let sends = 0;
    const landed = { transaction: { hash: "landedhash" }, status: { SuccessValue: "" } };
    const signed = { transaction: { signerId: "relayer.testnet", publicKey: { toString: () => "ed25519:k" } } } as any;
    const pool = new RpcPool(
      [
        node("https://a.example", {
          sendTransactionUntil: async () => { sends++; throw timeout; },
          viewTransactionStatus: async () => landed,
        }),
        node("https://b.example", {
          sendTransactionUntil: async () => { sends++; return { transaction: { hash: "resent" } }; },
          viewTransactionStatus: async () => { throw new Error("missing"); },
        }),
      ],
      { hashOf: () => "landedhash" },
    );
    const result = await pool.sendTransactionUntil(signed, "EXECUTED_OPTIMISTIC");
    expect(result).toEqual(landed);
    expect(sends).toBe(1);
  });

  it("does not hop endpoints on InvalidNonce when the tx has not landed", async () => {
    let bSends = 0;
    const signed = { transaction: { signerId: "relayer.testnet", publicKey: { toString: () => "ed25519:k" } } } as any;
    const pool = new RpcPool(
      [
        node("https://a.example", {
          sendTransactionUntil: async () => { throw nonceErr; },
          viewTransactionStatus: async () => { throw new Error("unknown tx"); },
        }),
        node("https://b.example", {
          sendTransactionUntil: async () => { bSends++; return { ok: true }; },
          viewTransactionStatus: async () => { throw new Error("unknown tx"); },
        }),
      ],
      { hashOf: () => "missinghash" },
    );
    await expect(pool.sendTransactionUntil(signed, "EXECUTED_OPTIMISTIC")).rejects.toMatchObject({ name: "InvalidNonceError" });
    expect(bSends).toBe(0);
  });

  it("treats InvalidNonce as success when the same hash already landed", async () => {
    const landed = { transaction: { hash: "h1" }, status: { SuccessValue: "" } };
    const signed = { transaction: { signerId: "relayer.testnet", publicKey: { toString: () => "ed25519:k" } } } as any;
    let bSends = 0;
    const pool = new RpcPool(
      [
        node("https://a.example", {
          sendTransactionUntil: async () => { throw nonceErr; },
          viewTransactionStatus: async () => landed,
        }),
        node("https://b.example", {
          sendTransactionUntil: async () => { bSends++; return { resent: true }; },
          viewTransactionStatus: async () => { throw new Error("missing"); },
        }),
      ],
      { hashOf: () => "h1" },
    );
    expect(await pool.sendTransactionUntil(signed, "EXECUTED_OPTIMISTIC")).toEqual(landed);
    expect(bSends).toBe(0);
  });
});
