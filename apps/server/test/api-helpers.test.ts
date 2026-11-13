import { describe, expect, it } from "vitest";
import { friendlyError } from "../src/errors.js";
import { staleWhileRevalidate } from "../src/cache.js";
import { aiHealthNote, type ProviderHealth } from "../src/nearai.js";

const health = (over: Partial<ProviderHealth> = {}): ProviderHealth => ({ lastOk: null, calls: 0, verified: 0, fallbacks: 0, ...over });

describe("friendlyError", () => {
  it("unwraps a contract panic from a raw string", () => {
    expect(friendlyError("Smart contract panicked: not enough ore")).toBe("not enough ore");
  });
  it("unwraps a panic buried in an ActionError JSON blob", () => {
    const raw = '{"ActionError":{"index":0,"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: not enough ore: have 0, need 20"}}}}';
    expect(friendlyError(raw)).toBe("not enough ore: have 0, need 20");
  });
  it("keeps already-short contract messages", () => {
    expect(friendlyError("not travelling")).toBe("not travelling");
  });
});

describe("aiHealthNote", () => {
  it("does not claim every decision is verified when none are", () => {
    const note = aiHealthNote("tee", health({ calls: 53, verified: 0, fallbacks: 53 }));
    expect(note).toContain("0 decisions verified");
    expect(note).toContain("53 fallbacks");
    expect(note).not.toMatch(/every decision verified/i);
  });
  it("states verified + fallback counts when mixed", () => {
    expect(aiHealthNote("tee", health({ verified: 2, fallbacks: 1 }))).toMatch(/2 decisions verified.*1 fallback/);
  });
  it("is explicit in mock mode", () => {
    expect(aiHealthNote("mock", health())).toMatch(/MOCK MODE/);
  });
});

describe("staleWhileRevalidate", () => {
  it("serves stale data while a refresh is in flight", async () => {
    let n = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const get = staleWhileRevalidate<number>(20);
    const first = await get(async () => 1);
    expect(first).toBe(1);
    await new Promise((r) => setTimeout(r, 25)); // expire TTL
    n = 0;
    const stale = await get(async () => { n++; await gate; return 2; }); // expired: return stale, refresh in background
    expect(stale).toBe(1);
    expect(await get(async () => 99)).toBe(1); // still stale, no second load
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(await get(async () => 99)).toBe(2);
    expect(n).toBe(1);
  });
});
