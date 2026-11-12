/**
 * One-time: create least-privilege function-call keys for the server, using the full-access keys
 * that NEAR CLI stored in ~/.near-credentials. New keys are written to ~/.near-credentials/<net>/lowsec-fc/
 * (chmod 600) — never into the repo.
 *   onboarder: key on the CONTRACT account, may only call create_player
 *   council:   key on the COUNCIL account, may only call council_update + record_decision
 *   hauler-N:  key on each hauler sub-account, game methods + record_decision, 0.25 NEAR allowance
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { KeyPair, parseNearAmount } from "near-api-js";
import { CONTRACT_ID, COUNCIL_ID, FC_DIR, HAULERS } from "./config.js";
import { account } from "./chain.js";
import { fullKey } from "./keys.js";

const jobs = [
  { id: CONTRACT_ID, role: "onboarder", methods: ["create_player"], allowance: "1" },
  { id: COUNCIL_ID, role: "council", methods: ["council_update", "record_decision"], allowance: "1" },
  ...HAULERS.map((h, i) => ({ id: h, role: `hauler-${i + 1}`, methods: ["register", "buy", "sell", "start_haul", "arrive", "raid", "record_decision"], allowance: "0.25" })),
];

mkdirSync(FC_DIR, { recursive: true, mode: 0o700 });
for (const j of jobs) {
  const file = join(FC_DIR, `${j.role}.${j.id}.json`);
  if (existsSync(file)) {
    console.log(`= ${j.role} key exists for ${j.id}`);
    continue;
  }
  const fk = fullKey(j.id);
  if (!fk) {
    console.log(`! no full-access key for ${j.id} in ~/.near-credentials — skipped`);
    continue;
  }
  const kp = KeyPair.fromRandom("ed25519");
  const res: any = await account(j.id, fk).addFunctionCallAccessKey({ publicKey: kp.getPublicKey().toString(), contractId: CONTRACT_ID, methodNames: j.methods, allowance: BigInt(parseNearAmount(j.allowance as `${number}`)!) } as never);
  writeFileSync(file, JSON.stringify({ account_id: j.id, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  console.log(`+ ${j.role} FC key on ${j.id} [${j.methods.join(",")}] allowance ${j.allowance} NEAR  tx ${res?.transaction?.hash}`);
}
