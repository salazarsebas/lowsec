/**
 * Session goals + integrations that live off-chain:
 *  - leaderboard: richest pilots now, and who gained the most gold this epoch
 *  - contract of the day: a daily delivery goal (bragging rights only — no gold is minted for it)
 *  - NEAR Intents 1Click: a REAL quote with dry:true ("deposit from any chain"), nothing is executed
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./config.js";
import { view } from "./chain.js";
import { GOODS, TOWNS } from "./game.js";

// ------------------------------------------------------------------ contract of the day
export interface DailyContract { date: string; good: string; to: string; qty: number; text: string }
export function contractOfTheDay(d = new Date()): DailyContract {
  const date = d.toISOString().slice(0, 10);
  let h = 0;
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const g = h % 3;
  // deliver a good to a town that does NOT make it (forces a real trade route)
  const others = [0, 1, 2].filter((t) => t !== g);
  const to = others[(h >> 3) % 2];
  const qty = 40;
  return { date, good: GOODS[g], to: TOWNS[to], qty, text: `Deliver ${qty} ${GOODS[g]} to ${TOWNS[to]} today` };
}
const COTD = () => join(DATA_DIR, "cotd.json");
interface CotdState { date: string; progress: Record<string, number>; done: { account: string; ts: number }[] }
function loadCotd(): CotdState {
  const today = contractOfTheDay().date;
  try {
    const s = JSON.parse(readFileSync(COTD(), "utf8")) as CotdState;
    if (s.date === today) return s;
  } catch {}
  return { date: today, progress: {}, done: [] };
}
let cotd = loadCotd();
/** Record a delivery (called after a successful arrive). Returns true when it completes the contract. */
export function recordDelivery(account: string, good: string, town: string, qty: number): boolean {
  const c = contractOfTheDay();
  if (cotd.date !== c.date) cotd = { date: c.date, progress: {}, done: [] };
  if (good !== c.good || town !== c.to || qty <= 0) return false;
  const before = cotd.progress[account] ?? 0;
  cotd.progress[account] = before + qty;
  const completed = before < c.qty && cotd.progress[account] >= c.qty;
  if (completed) cotd.done.push({ account, ts: Date.now() });
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(COTD(), JSON.stringify(cotd));
  return completed;
}
export function cotdStatus(account?: string) {
  const c = contractOfTheDay();
  if (cotd.date !== c.date) cotd = { date: c.date, progress: {}, done: [] };
  return { ...c, reward: "bragging rights + a ★ on the leaderboard (no gold is minted: the economy stays honest)", mine: account ? cotd.progress[account] ?? 0 : 0, done: cotd.done };
}

// ------------------------------------------------------------------ leaderboard
let snap: { epoch: number; gold: Record<string, number> } | null = null;
let cache: { at: number; v: unknown } | null = null;
export async function leaderboard(accounts: string[], names: Record<string, string>) {
  if (cache && Date.now() - cache.at < 8000) return cache.v;
  const eco = await view<{ epoch: number }>("economy");
  const gold = Object.fromEntries(await Promise.all(accounts.map(async (a) => [a, Number(await view<string>("mt_balance_of", { account_id: a, token_id: "gold" }).catch(() => "0"))] as const)));
  if (!snap || snap.epoch !== eco.epoch) snap = { epoch: eco.epoch, gold: { ...gold } };
  const done = new Set(cotdStatus().done.map((d) => d.account));
  const rows = accounts.map((a) => ({ account: a, name: names[a] ?? a.split(".")[0], gold: gold[a], gainThisEpoch: gold[a] - (snap!.gold[a] ?? gold[a]), contractDone: done.has(a) }));
  const v = { epoch: eco.epoch, richest: [...rows].sort((a, b) => b.gold - a.gold).slice(0, 8), topEarners: [...rows].sort((a, b) => b.gainThisEpoch - a.gainThisEpoch).slice(0, 5) };
  cache = { at: Date.now(), v };
  return v;
}

// ------------------------------------------------------------------ NEAR Intents 1Click (quote only)
const ONECLICK = "https://1click.chaindefuser.com/v0";
export const DEPOSIT_ORIGINS: Record<string, { assetId: string; decimals: number; label: string; refundPlaceholder: string }> = {
  "usdc-base": { assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", decimals: 6, label: "USDC on Base", refundPlaceholder: "0x0000000000000000000000000000000000000001" },
  "eth-ethereum": { assetId: "nep141:eth.omft.near", decimals: 18, label: "ETH on Ethereum", refundPlaceholder: "0x0000000000000000000000000000000000000001" },
  "sol-solana": { assetId: "nep141:sol.omft.near", decimals: 9, label: "SOL on Solana", refundPlaceholder: "So11111111111111111111111111111111111111112" },
  "btc-bitcoin": { assetId: "nep141:btc.omft.near", decimals: 8, label: "BTC on Bitcoin", refundPlaceholder: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" },
};
function toUnits(amount: string, decimals: number): string {
  const [i, f = ""] = amount.trim().split(".");
  return (BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
}
export async function intentsQuote(origin: string, amount: string, recipient = "root.near") {
  const o = DEPOSIT_ORIGINS[origin];
  if (!o) throw new Error(`origin must be one of ${Object.keys(DEPOSIT_ORIGINS).join(", ")}`);
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("amount must be a positive decimal");
  const body = {
    dry: true, // QUOTE ONLY: 1Click validates and prices the swap but nothing is executed and no deposit address is reserved
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: o.assetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: "nep141:wrap.near",
    amount: toUnits(amount, o.decimals),
    refundTo: o.refundPlaceholder,
    refundType: "ORIGIN_CHAIN",
    recipient,
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  const r = await fetch(`${ONECLICK}/quote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`1Click ${r.status}: ${j.message ?? "error"}`);
  return {
    quoteOnly: true,
    note: "REAL 1Click quote with dry:true on NEAR mainnet prices. Nothing was executed; Lowsec itself runs on testnet. Refund address is a placeholder.",
    from: o.label,
    amountIn: j.quote?.amountInFormatted,
    amountInUsd: j.quote?.amountInUsd,
    amountOutNear: j.quote?.amountOutFormatted,
    minAmountOutNear: j.quote?.minAmountOut ? Number(BigInt(j.quote.minAmountOut) / 10n ** 18n) / 1e6 : null,
    timeEstimateSec: j.quote?.timeEstimate,
    recipient,
    request: j.quoteRequest,
    endpoint: `${ONECLICK}/quote`,
    at: new Date().toISOString(),
  };
}

export const ensureData = () => existsSync(DATA_DIR) || mkdirSync(DATA_DIR, { recursive: true });
