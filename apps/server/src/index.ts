import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { gini, runSim, COUNCIL_RULE } from "@lowsec/sim";
import { AGENTS_ENABLED, CONTRACT_ID, COUNCIL_ID, COUNCIL_INTERVAL_MS, EXPLORER, HAULER_INTERVAL_MS, NETWORK, PORT, RELAYER_ID } from "./config.js";
import { account, accountExists, call, view } from "./chain.js";
import { fcKey } from "./keys.js";
import { decodeB64, relaySigned } from "./relayer.js";
import { addPlayer, getFeed, knownPlayers, push } from "./feed.js";
import { makeProvider, readAttestation } from "./nearai.js";
import { Hauler, PERSONAS, lastDecisions } from "./agents/hauler.js";
import { Council, councilLog } from "./agents/council.js";
import { GOODS, TOWNS, type ChainParams, type Economy } from "./game.js";

const ai = makeProvider();
let paramsCache: { at: number; v: ChainParams } | null = null;
async function params(): Promise<ChainParams> {
  if (!paramsCache || Date.now() - paramsCache.at > 30_000) paramsCache = { at: Date.now(), v: await view<ChainParams>("get_params") };
  return paramsCache.v;
}
const haulers = PERSONAS.map((p) => new Hauler(p, ai, params));
const council = new Council(ai);

const app = new Hono();
app.use("/api/*", cors());

app.get("/api/health", (c) =>
  c.json({
    network: NETWORK, contract: CONTRACT_ID, relayer: RELAYER_ID, council: COUNCIL_ID, explorer: EXPLORER,
    ai: { mode: ai.mode, model: ai.model, note: ai.mode === "mock" ? "MOCK MODE: set NEARAI_API_KEY to run NPCs on a NEAR AI Cloud TEE model with verified signatures" : "NEAR AI Cloud TEE; every decision verified with verifyResponse()" },
    agents: { enabled: AGENTS_ENABLED, haulers: haulers.map((h) => ({ id: h.persona.id, name: h.persona.name, ready: h.ready })), council: council.ready },
  }),
);

const TOKENS = ["gold", ...GOODS];
app.get("/api/state", async (c) => {
  const acc = c.req.query("account");
  const [eco, prm] = await Promise.all([view<Economy>("economy"), params()]);
  let me: any = null;
  if (acc) {
    const [player, bal] = await Promise.all([view<any>("get_player", { account_id: acc }), view<string[]>("mt_batch_balance_of", { account_id: acc, token_ids: TOKENS })]);
    me = { account: acc, player, balances: Object.fromEntries(TOKENS.map((t, i) => [t, Number(bal[i])])) };
  }
  const npcs = await Promise.all(
    haulers.map(async (h) => {
      const [player, bal] = await Promise.all([view<any>("get_player", { account_id: h.persona.id }), view<string[]>("mt_batch_balance_of", { account_id: h.persona.id, token_ids: TOKENS })]);
      return { id: h.persona.id, name: h.persona.name, style: h.persona.style, player, balances: Object.fromEntries(TOKENS.map((t, i) => [t, Number(bal[i])])), decisions: lastDecisions.get(h.persona.id) ?? [] };
    }),
  );
  return c.json({ economy: eco, params: prm, me, npcs, feed: getFeed(40), ai: { mode: ai.mode, model: ai.model }, serverTime: Date.now() });
});

app.get("/api/report", async (c) => {
  const eco = await view<Economy>("economy");
  const from = Math.max(0, eco.epoch - 60);
  const epochs = await view<any[]>("epochs", { from, limit: 60 });
  const players = [...knownPlayers(), ...haulers.map((h) => h.persona.id)];
  const golds = await Promise.all(players.map((p) => view<string>("mt_balance_of", { account_id: p, token_id: "gold" }).then(Number).catch(() => 0)));
  return c.json({ economy: eco, epochs, gini: gini(golds), giniPlayers: players.length, council: councilLog, councilRule: COUNCIL_RULE, contract: CONTRACT_ID, explorer: EXPLORER });
});

app.post("/api/onboard", async (c) => {
  const { name, publicKey } = await c.req.json<{ name: string; publicKey: string }>();
  const clean = String(name ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  if (!clean || !String(publicKey).startsWith("ed25519:")) return c.json({ error: "name (a-z0-9_-) and ed25519 publicKey required" }, 400);
  const accountId = `${clean}.${CONTRACT_ID}`;
  if (await accountExists(accountId)) return c.json({ error: `${accountId} is taken — pick another name` }, 409);
  const k = fcKey(CONTRACT_ID, "onboarder");
  if (!k) return c.json({ error: "onboarder key missing: run `pnpm --filter @lowsec/server setup-keys`" }, 500);
  const r = await call(account(CONTRACT_ID, k), "create_player", { name: clean, public_key: publicKey }, 50);
  if (!r.ok) return c.json({ error: r.error, txHash: r.txHash }, 400);
  addPlayer(accountId);
  push({ actor: clean, type: "join", text: `${clean} created ${accountId} (no wallet, no gas)`, txHash: r.txHash, ok: true });
  return c.json({ accountId, txHash: r.txHash, explorer: `${EXPLORER}/txns/${r.txHash}` });
});

app.post("/api/relay", async (c) => {
  const { signedDelegate, label } = await c.req.json<{ signedDelegate: string; label?: string }>();
  let sd;
  try {
    sd = decodeB64(signedDelegate);
  } catch {
    return c.json({ error: "bad signedDelegate" }, 400);
  }
  const r = await relaySigned(sd);
  const sender = (sd as any).delegateAction.senderId as string;
  const method = (sd as any).delegateAction.actions?.[0]?.functionCall?.methodName;
  const short = sender.split(".")[0];
  const v: any = r.value;
  let text = label ?? `${short} → ${method}`;
  if (method === "arrive" && v) text = v.ambushed ? `${short} was AMBUSHED: ${v.burned} burned, ${v.looted} looted${v.raider ? ` by ${String(v.raider).split(".")[0]}` : " by pirates"}` : `${short} arrived in ${v.town} with ${v.delivered}`;
  push({ actor: short, type: method === "arrive" && v?.ambushed ? "ambush" : method, text: r.ok ? text : `${text} failed: ${r.error}`, txHash: r.txHash, ok: r.ok });
  return c.json(r, r.ok ? 200 : 400);
});

app.get("/api/attestations/:hash", (c) => {
  const a = readAttestation(c.req.param("hash"));
  return a ? c.body(a, 200, { "content-type": "application/json" }) : c.json({ error: "not found" }, 404);
});

app.post("/api/sim", async (c) => {
  const { weeks = 1, seed = 42 } = await c.req.json<{ weeks?: number; seed?: number }>().catch(() => ({}) as any);
  const w = Math.min(Math.max(Number(weeks) || 1, 1), 8);
  const pick = (r: ReturnType<typeof runSim>) => ({ daily: r.daily.map((d) => ({ day: d.period + 1, inflationBps: d.inflationBps, supply: d.supplyEnd, faucetBps: d.faucetBps, gini: d.gini, minted: d.minted, burned: d.burned, ambushes: d.ambushes, cargoBurned: d.cargoBurnedUnits, players: d.players })), final: r.final, events: r.events.filter((e) => e.type !== "haul").slice(-12) });
  return c.json({ weeks: w, seed, rule: COUNCIL_RULE, council: pick(runSim({ weeks: w, seed, council: true })), baseline: pick(runSim({ weeks: w, seed, council: false })) });
});

app.get("/api/feed", (c) => c.json(getFeed(100)));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[lowsec] server on http://localhost:${PORT}  contract=${CONTRACT_ID}  AI=${ai.mode} (${ai.model})`);
  if (ai.mode === "mock") console.log("[lowsec] MOCK MODE: NEARAI_API_KEY not set — NPC decisions use a labelled local policy, not a TEE model");
});

if (AGENTS_ENABLED) {
  const ready = haulers.filter((h) => h.ready);
  console.log(`[lowsec] agents: ${ready.map((h) => h.persona.name).join(", ") || "none (run setup-keys)"}; council ${council.ready ? "ready" : "missing key"}`);
  ready.forEach((h, i) => setTimeout(() => setInterval(() => h.step(), HAULER_INTERVAL_MS), i * (HAULER_INTERVAL_MS / 2)));
  setInterval(() => council.step(), COUNCIL_INTERVAL_MS);
  setTimeout(() => council.step(), 3000);
}
