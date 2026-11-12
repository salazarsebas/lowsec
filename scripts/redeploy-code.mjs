// Code-only redeploy (state kept). Run with near-api-js resolvable, e.g. from apps/server. Usage: node redeploy-code.mjs <label>
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, JsonRpcProvider, actions } from "near-api-js";
const CONTRACT = "lowsec.testnet";
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const acc = new Account(CONTRACT, provider, JSON.parse(readFileSync(join(homedir(), ".near-credentials", "testnet", `${CONTRACT}.json`), "utf8")).private_key);
const r = await acc.signAndSendTransaction({ receiverId: CONTRACT, actions: [actions.deployContract(readFileSync(process.env.WASM ?? "/workspace/lowsec/contracts/lowsec/target/near/lowsec.wasm"))] });
console.log(`redeploy ${process.argv[2] ?? ""}: ${r.transaction.hash}`);
