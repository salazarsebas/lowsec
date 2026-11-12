"use client";
/**
 * Browser side of "login without a wallet":
 *  1. generate an ed25519 key pair in the browser (it never leaves this device),
 *  2. ask the server to create <name>.<contract> holding that key as a FUNCTION-CALL key
 *     (game methods only, no deposits),
 *  3. sign every game action as a NEP-366 DelegateAction and let the relayer pay the gas.
 */
import { Account, JsonRpcProvider, KeyPair, actions, encodeSignedDelegate, teraToGas, type KeyPairString } from "near-api-js";

export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "lowsec.testnet";
const RPC = process.env.NEXT_PUBLIC_NEAR_RPC ?? "https://test.rpc.fastnear.com";
const provider = new JsonRpcProvider({ url: RPC });
const LS = "lowsec.session.v1";

export interface Session {
  accountId: string;
  key: KeyPairString;
}

export function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? "null");
  } catch {
    return null;
  }
}
export function clearSession() {
  localStorage.removeItem(LS);
}

export async function signup(name: string): Promise<Session> {
  const kp = KeyPair.fromRandom("ed25519");
  const r = await fetch("/api/onboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, publicKey: kp.getPublicKey().toString() }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "onboarding failed");
  const s: Session = { accountId: j.accountId, key: kp.toString() as KeyPairString };
  localStorage.setItem(LS, JSON.stringify(s));
  return s;
}

export interface RelayResult {
  txHash: string;
  ok: boolean;
  value: any;
  error?: string;
  events: any[];
}

/** Sign a zero-deposit game call as a meta-transaction and hand it to the relayer. */
export async function act(s: Session, method: string, args: Record<string, unknown>, label?: string): Promise<RelayResult> {
  let lastErr: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      const acc = new Account(s.accountId, provider, s.key);
      const { signedDelegate } = await acc.createSignedMetaTransaction({ receiverId: CONTRACT_ID, actions: [actions.functionCall(method, args, teraToGas(50), 0n)], blockHeightTtl: 120 } as never);
      const b64 = btoa(String.fromCharCode(...encodeSignedDelegate(signedDelegate)));
      const r = await fetch("/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signedDelegate: b64, label }) });
      return (await r.json()) as RelayResult;
    } catch (e) {
      lastErr = e; // brand-new account/key may not be visible to the RPC yet
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  throw lastErr;
}
