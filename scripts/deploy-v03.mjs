// v0.3 testnet redeploy: deploy + reset_v3 (atomic), seat the Guild in the genesis epoch, register AI agents.
// Run from the repo root with near-api-js resolvable, e.g. NODE_PATH=apps/server/node_modules node scripts/deploy-v03.mjs
// Uses the contract's full-access key from ~/.near-credentials (never in the repo). Usage: node scripts/deploy-v03.mjs
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, JsonRpcProvider, actions, teraToGas } from "near-api-js";

const CONTRACT = "lowsec.testnet", COUNCIL = "lowsec-council.testnet";
const dir = join(homedir(), ".near-credentials", "testnet");
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const acc = new Account(CONTRACT, provider, JSON.parse(readFileSync(join(dir, `${CONTRACT}.json`), "utf8")).private_key);
const wasm = readFileSync(process.env.WASM ?? "contracts/lowsec/target/near/lowsec.wasm");
const tx = async (label, acts) => {
  const r = await acc.signAndSendTransaction({ receiverId: CONTRACT, actions: acts });
  console.log(`${label}: ${r.transaction.hash}`);
  return r;
};
const fc = (m, a, g = 100) => actions.functionCall(m, a, teraToGas(g), 0n);
await tx("deploy v0.3 + reset_v3", [actions.deployContract(wasm), fc("reset_v3", { owner: CONTRACT, council: COUNCIL, params: null }, 100)]);
await tx("seed_guild", [fc("seed_guild", { account_id: `guild.${CONTRACT}`, float: "30000", town: "forja" })]);
await tx("add_agent x4", [1, 2, 3, 4].map((i) => fc("add_agent", { account_id: `hauler-${i}.${CONTRACT}` }, 20)));
const eco = await provider.callFunction({ contractId: CONTRACT, method: "economy", args: {} });
console.log("epoch", eco.epoch, "supply", eco.gold_supply, "players", eco.players, "guild", eco.guild, "faucet", eco.faucet_bps);
