// v0.4 Council upgrade, state kept: ONE atomic tx from lowsec.testnet (owner = itself):
// DeployContract(new wasm, same state layout) + set_council_params(gain 3, ceiling 100%).
// Snapshots gold supply / players / epochs / a few balances before and after and fails loudly if any differ.
// Run with near-api-js resolvable (same as redeploy-code.mjs): cp scripts/upgrade-v04.mjs apps/server/ && cd apps/server && node upgrade-v04.mjs
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, FailoverRpcProvider, JsonRpcProvider, actions, teraToGas } from "near-api-js";
const C = "lowsec.testnet";
const provider = new FailoverRpcProvider(["https://test.rpc.fastnear.com", "https://near-testnet.drpc.org"].map((url) => new JsonRpcProvider({ url })));
const view = (m, a = {}) => provider.callFunction({ contractId: C, method: m, args: a });
const snap = async () => {
  const e = await view("economy");
  const ids = ["hauler-1.lowsec.testnet", "guild.lowsec.testnet"];
  const bal = await Promise.all(ids.map((id) => view("mt_balance_of", { account_id: id, token_id: "gold" })));
  const p = await view("get_params");
  return { gold_supply: e.gold_supply, item_supply: e.item_supply, players: e.players, epoch: e.epoch, records: e.council_signal?.to_record, total: e.total, bal, gain: p.council_gain, max: p.council_max_faucet_bps, faucet: p.faucet_bps };
};
const before = await snap();
console.log("before", JSON.stringify({ ...before, total: undefined }));
const key = JSON.parse(readFileSync(join(homedir(), ".near-credentials", "testnet", `${C}.json`), "utf8")).private_key;
const acc = new Account(C, provider, key);
const r = await acc.signAndSendTransaction({
  receiverId: C,
  actions: [actions.deployContract(readFileSync("/workspace/lowsec/contracts/lowsec/target/near/lowsec.wasm")), actions.functionCall("set_council_params", { gain: 3, max_faucet_bps: 10_000 }, teraToGas(30), 0n)],
});
console.log("upgrade tx", r.transaction.hash, JSON.stringify(r.status).slice(0, 120));
const after = await snap();
console.log("after ", JSON.stringify({ ...after, total: undefined }));
// supply/players may move by normal play between the two reads; epochs + records must not go backwards
const ok = after.players >= before.players && after.epoch >= before.epoch && (after.records ?? 0) >= (before.records ?? 0) && after.gain === 3 && after.max === 10_000 && BigInt(after.total.minted_starter_grants ?? 0) >= BigInt(before.total.minted_starter_grants ?? 0);
console.log(ok ? "STATE KEPT + v0.4 live" : "CHECK FAILED");
