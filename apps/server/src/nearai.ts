/**
 * NEAR AI Cloud inference behind one interface.
 *  - TEE mode (NEARAI_API_KEY set): z-ai/glm-5.3-flash via @nearai/inference-sdk; every completion is
 *    checked with client.verifyResponse(id) -> signatureKind "provider_tee" binds the exact request and
 *    response bytes to a signer whose TEE attestation report was verified BEFORE the request.
 *  - MOCK mode (no key): deterministic local policy, clearly labelled "mock" everywhere (UI badge,
 *    on-chain signature_kind = "mock"). Nothing in mock mode claims to be verified.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, NEARAI_MODEL } from "./config.js";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface Attested {
  /** model output text */
  text: string;
  model: string;
  mode: "tee" | "mock";
  /** "provider_tee" | "gateway" when verified, "unverified" if verification failed, "mock" in mock mode */
  signatureKind: string;
  verified: boolean;
  completionId: string;
  /** sha256 hex of the stored attestation bundle (anchored on-chain via record_decision) */
  attestationHash: string;
  error?: string;
}

export interface ProviderHealth {
  /** null until the first call; false when the last call fell back to MOCK */
  lastOk: boolean | null;
  lastError?: string;
  at?: number;
  calls: number;
  verified: number;
  fallbacks: number;
}

export interface InferenceProvider {
  readonly mode: "tee" | "mock";
  readonly model: string;
  readonly health: ProviderHealth;
  complete(messages: ChatMessage[], mock: () => string): Promise<Attested>;
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** Truthful one-line status for /api/health — never claims "every decision verified" unless counts say so. */
export function aiHealthNote(mode: "tee" | "mock", health: ProviderHealth): string {
  if (mode === "mock") return "MOCK MODE: set NEARAI_API_KEY to run NPCs on a NEAR AI Cloud TEE model with verified signatures";
  const { verified, fallbacks, calls } = health;
  if (verified > 0 && fallbacks === 0) return `NEAR AI Cloud TEE; ${verified} decision${verified === 1 ? "" : "s"} verified with verifyResponse()`;
  if (verified > 0) return `NEAR AI Cloud TEE; ${verified} decision${verified === 1 ? "" : "s"} verified with verifyResponse(), ${fallbacks} fallback${fallbacks === 1 ? "" : "s"} (unverified)`;
  if (fallbacks > 0 || calls > 0) return `NEAR AI Cloud TEE configured, but 0 decisions verified (${fallbacks} fallback${fallbacks === 1 ? "" : "s"})`;
  return "NEAR AI Cloud TEE configured; no decisions recorded yet";
}

const ATT_DIR = join(DATA_DIR, "attestations");

function safeJson(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? Buffer.from(v).toString("hex") : v), 2);
}

/** Persist the bundle; its sha256 is what goes on-chain. Returns the hash. */
export function storeAttestation(bundle: Record<string, unknown>): string {
  mkdirSync(ATT_DIR, { recursive: true });
  const body = safeJson(bundle);
  const h = sha256(body);
  writeFileSync(join(ATT_DIR, `${h}.json`), body);
  return h;
}

export function readAttestation(hash: string): string | null {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const p = join(ATT_DIR, `${hash}.json`);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

class MockProvider implements InferenceProvider {
  readonly mode = "mock" as const;
  readonly model = "mock-policy (no NEARAI_API_KEY)";
  readonly health: ProviderHealth = { lastOk: null, calls: 0, verified: 0, fallbacks: 0 };
  async complete(messages: ChatMessage[], mock: () => string): Promise<Attested> {
    const text = mock();
    const completionId = `mock-${sha256(text + Date.now()).slice(0, 16)}`;
    const attestationHash = storeAttestation({ mode: "mock", warning: "MOCK MODE: no NEAR AI call was made; nothing here is verified", completionId, messages, text, at: new Date().toISOString() });
    return { text, model: this.model, mode: "mock", signatureKind: "mock", verified: false, completionId, attestationHash };
  }
}

class TeeProvider implements InferenceProvider {
  readonly mode = "tee" as const;
  readonly model = NEARAI_MODEL;
  readonly health: ProviderHealth = { lastOk: null, calls: 0, verified: 0, fallbacks: 0 };
  private client: any;
  constructor(private apiKey: string) {}
  /** never let the key reach logs, the feed, the UI or an attestation bundle */
  private scrub(e: any): string {
    const msg = String(e?.message ?? e);
    const raw = `${e?.failure?.code ? e.failure.code + " " : ""}${e?.status && !msg.startsWith(String(e.status)) ? e.status + " " : ""}${msg}`;
    return raw.split(this.apiKey).join("[redacted]").replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]").slice(0, 200);
  }
  private note(ok: boolean, verified: boolean, error?: string) {
    this.health.calls++;
    if (verified) this.health.verified++;
    if (!ok) this.health.fallbacks++;
    this.health.lastOk = ok;
    this.health.lastError = error;
    this.health.at = Date.now();
  }
  private async getClient() {
    if (!this.client) {
      const { InferenceClient } = await import("@nearai/inference-sdk/node");
      this.client = new InferenceClient({ apiKey: this.apiKey });
    }
    return this.client;
  }
  async complete(messages: ChatMessage[], mock: () => string): Promise<Attested> {
    const client = await this.getClient();
    let completion: any;
    try {
      completion = await client.chat.completions.create({ model: this.model, messages, temperature: 0.3, max_tokens: 700 });
    } catch (e: any) {
      // fail closed: fall back to the labelled mock policy for this decision
      const err = `NEAR AI call failed: ${this.scrub(e)}`;
      this.note(false, false, err);
      const m = await new MockProvider().complete(messages, mock);
      return { ...m, error: err };
    }
    const text: string = completion.choices?.[0]?.message?.content ?? "";
    let verified: any = null;
    let error: string | undefined;
    for (let i = 0; i < 4 && !verified; i++) {
      try {
        verified = await client.verifyResponse(completion.id);
      } catch (e: any) {
        error = this.scrub(e);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    const signatureKind = verified?.signatureKind ?? "unverified";
    this.note(true, !!verified, verified ? undefined : error);
    const attestationHash = storeAttestation({
      mode: "tee",
      model: this.model,
      completionId: completion.id,
      signatureKind,
      verification: verified,
      verificationError: verified ? undefined : error,
      messages,
      text,
      verifiedAt: new Date().toISOString(),
      howToVerify: "https://docs.near.ai/cloud/verification — GET /v1/signature/{completionId} and /v1/attestation/report?model=" + this.model,
    });
    return { text, model: this.model, mode: "tee", signatureKind, verified: !!verified, completionId: completion.id, attestationHash, error: verified ? undefined : error };
  }
}

export function makeProvider(): InferenceProvider {
  const key = process.env.NEARAI_API_KEY?.trim();
  return key ? new TeeProvider(key) : new MockProvider();
}

/** Extract the first JSON object from a model reply (models sometimes wrap it in prose or fences). */
export function parseJsonReply<T>(text: string): T | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  for (let end = cleaned.lastIndexOf("}"); end > start; end = cleaned.lastIndexOf("}", end - 1)) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {}
  }
  return null;
}
