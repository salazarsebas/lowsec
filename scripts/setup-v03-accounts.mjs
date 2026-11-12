// One-time (v0.3): create hauler-3, hauler-4 and guild sub-accounts and extra relayer keys.
// Keys go to ~/.near-credentials/testnet (never into the repo). Usage: node scripts/setup-v03-accounts.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, JsonRpcProvider, KeyPair, nearToYocto } from "near-api-js";

const NET = "testnet", CONTRACT = "lowsec.testnet", RELAYER = "lowsec-relayer.testnet";
const dir = join(homedir(), ".near-credentials", NET);
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const keyOf = (id) => JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")).private_key;
const exists = async (id) => provider.viewAccount({ accountId: id }).then(() => true, () => false);

const owner = new Account(CONTRACT, provider, keyOf(CONTRACT));
for (const sub of ["hauler-3", "hauler-4", "guild"]) {
  const id = `${sub}.${CONTRACT}`;
  if (await exists(id)) { console.log(`= ${id} exists`); continue; }
  const kp = KeyPair.fromRandom("ed25519");
  const r = await owner.createAccount({ newAccountId: id, publicKey: kp.getPublicKey().toString(), nearToTransfer: nearToYocto("0.3") });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ account_id: id, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  console.log(`+ ${id} tx ${r?.transaction?.hash}`);
}
const poolFile = join(dir, "lowsec-fc", `relayer-pool.${RELAYER}.json`);
if (existsSync(poolFile)) console.log("= relayer pool exists");
else {
  const rel = new Account(RELAYER, provider, keyOf(RELAYER));
  const keys = [];
  for (let i = 0; i < 3; i++) {
    const kp = KeyPair.fromRandom("ed25519");
    const r = await rel.addFullAccessKey(kp.getPublicKey().toString());
    keys.push(kp.toString());
    console.log(`+ relayer pool key ${i + 1} tx ${r?.transaction?.hash}`);
  }
  writeFileSync(poolFile, JSON.stringify({ account_id: RELAYER, private_keys: keys }), { mode: 0o600 });
}
