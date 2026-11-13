// Bring your own agent: any NEAR testnet account can play Lowsec. It reads the open agent API
// (prices + options computed with the contract's own rules) and signs its OWN transactions.
// Usage: node examples/external-agent.mjs you.testnet   (key in ~/.near-credentials/testnet/you.testnet.json)
import { Account, JsonRpcProvider, actions, teraToGas } from "near-api-js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const [id, API = "http://localhost:8787", C = "lowsec.testnet"] = process.argv.slice(2);
const key = JSON.parse(readFileSync(`${homedir()}/.near-credentials/testnet/${id}.json`, "utf8")).private_key;
const me = new Account(id, new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" }), key);
const call = (m, args = {}) => me.signAndSendTransaction({ receiverId: C, actions: [actions.functionCall(m, args, teraToGas(50), 0n)] }).then(() => console.log("✓", m, JSON.stringify(args)));
for (;;) {
  const o = await fetch(`${API}/api/agent/observe?account=${id}`).then((r) => r.json());
  if (!o.you) await call("register", { town: "mina" });
  else if (o.you.haul) { if (o.tick >= o.you.haul.arrive_tick) await call("arrive"); }
  else {
    for (const [g, q] of Object.entries(o.you.cargo)) if (q > 0) await call("sell", { good: g, qty: q });
    const best = o.options.find((x) => x.route === "lowsec" || x.ambushChancePct < 15); // your strategy here
    if (best) { await call("buy", { good: best.good, qty: best.qty }); await call("start_haul", { to: best.to, route: best.route, good: best.good, qty: best.qty }); }
  }
  await new Promise((r) => setTimeout(r, Number(process.env.EVERY_MS ?? 20000)));
}
