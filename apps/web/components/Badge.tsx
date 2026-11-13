import type { Decision } from "@/lib/types";

/** Honest labelling: only a verified provider_tee signature earns the green check.
 *  Conditions are unchanged. Visual style lives in styles/intel.css (small seal; MOCK is
 *  neutral, never the loudest element). */
export function AttestationBadge({ d }: { d: Pick<Decision, "signatureKind" | "verified" | "mode" | "attestationHash" | "error"> }) {
  let cls = "badge mock";
  let text = "MOCK · not verified";
  let title = "Mock mode: NEARAI_API_KEY not set, decision made by a local rule policy. Nothing is claimed as verified.";
  if (d.mode === "mock" && d.error) {
    text = "MOCK fallback · NEAR AI error";
    title = `The NEAR AI call failed, so this decision used the labelled local policy. Nothing is claimed as verified. ${d.error}`;
  }
  if (d.mode === "tee" && d.verified && d.signatureKind === "provider_tee") {
    cls = "badge tee";
    text = "◆ TEE VERIFIED";
    title = "Signature kind provider_tee: request+response bytes signed by a model-serving TEE whose attestation was verified before the call (NEAR AI Cloud).";
  } else if (d.mode === "tee" && d.verified) {
    cls = "badge gw";
    text = `${d.signatureKind} signed`;
    title = "Signed by the attested NEAR AI gateway (not bound to a model TEE).";
  } else if (d.mode === "tee") {
    cls = "badge bad";
    text = "unverified";
    title = "NEAR AI response signature could not be verified.";
  }
  return (
    <a className={cls} title={title} href={`/api/attestations/${d.attestationHash}`} target="_blank" rel="noreferrer">
      {text}
    </a>
  );
}
