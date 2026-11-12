import { describe, expect, it } from "vitest";
import { checkPolicy } from "../src/relayer.js";
import { makeProvider, parseJsonReply, readAttestation } from "../src/nearai.js";
import { CONTRACT_ID } from "../src/config.js";

const sd = (over: Record<string, unknown> = {}, fc: Record<string, unknown> = {}) =>
  ({ delegateAction: { senderId: `alice.${CONTRACT_ID}`, receiverId: CONTRACT_ID, actions: [{ functionCall: { methodName: "buy", deposit: 0n, gas: 30_000_000_000_000n, ...fc } }], ...over } }) as any;

describe("relayer policy", () => {
  it("sponsors game calls from game accounts", () => expect(checkPolicy(sd())).toBeNull());
  it("rejects other receivers", () => expect(checkPolicy(sd({ receiverId: "wrap.testnet" }))).toMatch(/receiver/));
  it("rejects non-game senders", () => expect(checkPolicy(sd({ senderId: "mallory.testnet" }))).toMatch(/game accounts/));
  it("rejects admin methods", () => expect(checkPolicy(sd({}, { methodName: "council_update" }))).toMatch(/not sponsored/));
  it("rejects deposits", () => expect(checkPolicy(sd({}, { deposit: 1n }))).toMatch(/deposit/));
  it("rejects non-function-call actions", () => expect(checkPolicy(sd({ actions: [{ transfer: { deposit: 1n } }] }))).toMatch(/function calls/));
});

describe("NEAR AI client", () => {
  it("parses JSON wrapped in prose / think tags", () => {
    expect(parseJsonReply<{ a: number }>("<think>{x}</think>Sure! ```json\n{\"a\": 1}\n``` done")).toEqual({ a: 1 });
    expect(parseJsonReply("no json")).toBeNull();
  });
  it("is clearly labelled mock without NEARAI_API_KEY and stores an attestation bundle", async () => {
    const saved = process.env.NEARAI_API_KEY;
    delete process.env.NEARAI_API_KEY;
    const p = makeProvider();
    expect(p.mode).toBe("mock");
    const r = await p.complete([{ role: "user", content: "hi" }], () => '{"ok":true}');
    expect(r.signatureKind).toBe("mock");
    expect(r.verified).toBe(false);
    expect(readAttestation(r.attestationHash)).toContain("MOCK MODE");
    if (saved) process.env.NEARAI_API_KEY = saved;
  });
});
