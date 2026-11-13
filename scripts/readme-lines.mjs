// Regenerates the exact file:line links in README's "NEAR features used (file:line)" table.
// Each link is located by a needle (a unique code fragment), so refactors never leave stale line numbers.
// Usage (repo root): node scripts/readme-lines.mjs [--check]   (--check exits 1 if README is out of date)
import { readFileSync, writeFileSync } from "node:fs";
// in table order: [file, needle]; the k-th link in the section must point to ANCHORS[k][0]
const ANCHORS = [
  ["contracts/lowsec/src/mt.rs", "pub fn mt_transfer("],
  ["contracts/lowsec/src/mt.rs", "pub fn mt_batch_balance_of"],
  ["contracts/lowsec/src/events.rs", '"mt_burn"'],
  ["contracts/lowsec/src/lib.rs", '"ambush_destroyed"'],
  ["contracts/lowsec/src/lib.rs", "pub fn create_player"],
  ["contracts/lowsec/src/lib.rs", ".add_access_key_allowance("],
  ["apps/server/src/setup-keys.ts", "addFunctionCallAccessKey"],
  ["apps/web/lib/near.ts", 'KeyPair.fromRandom("ed25519")'],
  ["apps/web/lib/near.ts", "createSignedMetaTransaction"],
  ["apps/server/src/relayer.ts", "export function checkPolicy"],
  ["apps/server/src/relayer.ts", "relayMetaTransaction(sd)"],
  ["contracts/lowsec/src/lib.rs", "pub fn council_update("],
  ["contracts/lowsec/src/lib.rs", "pub fn set_council_params("],
  ["contracts/lowsec/src/lib.rs", "pub fn council_signal("],
  ["contracts/lowsec/src/lib.rs", "pub fn record_decision("],
  ["apps/server/src/nearai.ts", "client.chat.completions.create("],
  ["apps/server/src/nearai.ts", "client.verifyResponse(completion.id)"],
  ["apps/server/src/tee-check.ts", "await client.verify(model)"],
  ["apps/server/src/nearai.ts", "class MockProvider"],
  ["apps/server/src/nearai.ts", "fail closed: fall back to the labelled mock"],
  ["apps/server/src/agents/council.ts", "export function explanationMatches"],
  ["contracts/lowsec/src/lib.rs", "dock_fee(&self.params"],
  ["apps/server/src/extras.ts", "dry: true"],
  ["apps/server/src/index.ts", 'app.get("/api/agent/observe"'],
  ["examples/external-agent.mjs", "signAndSendTransaction"],
];
const lineOf = (file, needle) => {
  const ls = readFileSync(file, "utf8").split("\n");
  const hits = ls.map((l, i) => (l.includes(needle) ? i + 1 : 0)).filter(Boolean);
  if (hits.length !== 1) throw new Error(`${file}: needle ${JSON.stringify(needle)} found ${hits.length}× (must be exactly 1)`);
  return hits[0];
};
const md = readFileSync("README.md", "utf8");
const start = md.indexOf("## NEAR features used (file:line)");
const end = md.indexOf("\n## ", start + 5);
if (start < 0) throw new Error("section not found");
let k = 0;
const sec = md.slice(start, end).replace(/\[([\w./-]+):(\d+)\]\(([\w./-]+)#L(\d+)\)/g, (all, f1) => {
  const a = ANCHORS[k++];
  if (!a || a[0] !== f1) throw new Error(`link ${k} points to ${f1}, anchor expects ${a?.[0]}`);
  const n = lineOf(a[0], a[1]);
  return `[${a[0]}:${n}](${a[0]}#L${n})`;
});
if (k !== ANCHORS.length) throw new Error(`section has ${k} links, ${ANCHORS.length} anchors`);
const out = md.slice(0, start) + sec + md.slice(end);
if (process.argv.includes("--check")) { if (out !== md) { console.error("README file:line links are stale: run node scripts/readme-lines.mjs"); process.exit(1); } console.log("README file:line links OK"); }
else { writeFileSync("README.md", out); console.log(`README: ${k} file:line links regenerated`); }
