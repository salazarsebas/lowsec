/**
 * One-command NEAR AI Cloud TEE check (`pnpm --filter @lowsec/server tee:check [model]`).
 * 1) client.verify(model): Gateway TEE attestation (+ attested TLS binding) and the model's TEE report
 *    (signer, TCB status, GPU evidence) are verified BEFORE any inference.
 * 2) one chat completion, then client.verifyResponse(id): the signature over the exact request+response
 *    bytes must come from that attested signer ("provider_tee").
 * Never prints the API key.
 */
import { InferenceClient } from "@nearai/inference-sdk/node";
import { NEARAI_MODEL } from "./config.js";

const key = process.env.NEARAI_API_KEY?.trim();
if (!key) {
  console.log("NEARAI_API_KEY not set: nothing to check (server runs in MOCK mode)");
  process.exit(2);
}
const model = process.argv[2] ?? NEARAI_MODEL;
const scrub = (e: any) => String(e?.message ?? e).split(key).join("[redacted]").slice(0, 300);
const client = new InferenceClient({ apiKey: key });
let code = 0;
try {
  const v = await client.verify(model);
  const m = v.models[0] as any;
  console.log(`1) attestation  OK  gateway tcb=${(v.gateway as any).tcbStatus}  model reports=${v.models.length}${m ? `  model tcb=${m.tcbStatus}  gpuEvidence=${m.gpuEvidence ? "yes" : "no"}` : "  (gateway-only model: no model TEE)"}`);
} catch (e) {
  console.log(`1) attestation  FAILED  ${scrub(e)}`);
  process.exit(1);
}
try {
  const t = Date.now();
  const c: any = await client.chat.completions.create({ model, messages: [{ role: "user", content: 'Reply only JSON {"ok":true}' }], max_tokens: 200, temperature: 0 });
  console.log(`2) completion   OK  ${Date.now() - t} ms  id=${c.id}  usage=${JSON.stringify(c.usage ?? {})}`);
  const r: any = await client.verifyResponse(c.id);
  console.log(`3) signature    ${r.signatureKind === "provider_tee" ? "OK provider_tee (signed inside the attested model TEE)" : `${r.signatureKind} (NOT a model-TEE signature)`}`);
  if (r.signatureKind !== "provider_tee") code = 1;
} catch (e) {
  console.log(`2/3) inference  FAILED  ${scrub(e)}`);
  code = 1;
}
process.exit(code);
