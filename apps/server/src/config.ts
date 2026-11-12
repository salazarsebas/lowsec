import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
export const NETWORK = env.NEAR_NETWORK ?? "testnet";
export const RPC_URL = env.NEAR_RPC_URL ?? (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
/** Failover list: free public RPCs rate-limit (429) under 5 NPCs + players, so the server rolls over to the next one. */
export const RPC_URLS = (env.NEAR_RPC_URLS ?? [RPC_URL, ...(NETWORK === "mainnet" ? ["https://near.drpc.org"] : ["https://near-testnet.drpc.org", "https://rpc.testnet.near.org"])].join(",")).split(",").filter(Boolean);
export const CONTRACT_ID = env.CONTRACT_ID ?? "lowsec.testnet";
export const COUNCIL_ID = env.COUNCIL_ID ?? "lowsec-council.testnet";
export const RELAYER_ID = env.RELAYER_ID ?? "lowsec-relayer.testnet";
export const HAULERS = (env.HAULERS ?? [1, 2, 3, 4].map((i) => `hauler-${i}.${CONTRACT_ID}`).join(",")).split(",");
/** v0.3: the Guild — rule-based NPC market maker (no LLM) seated with a float in the genesis epoch. */
export const GUILD_ID = env.GUILD_ID ?? `guild.${CONTRACT_ID}`;
export const GUILD_FLOAT = Number(env.GUILD_FLOAT ?? 30_000);
/** NPCs and Council pause when no browser has polled for this long (saves testnet gas; idle epochs merge on-chain). 0 = never pause. */
export const AGENTS_IDLE_PAUSE_MS = Number(env.AGENTS_IDLE_PAUSE_MS ?? 15 * 60_000);
/** How often each NPC trader asks the model for a new strategy (moves in between are rule-based). */
export const STRATEGY_EVERY_MS = Number(env.STRATEGY_EVERY_MS ?? 4 * 60_000);
export const PORT = Number(env.PORT ?? 8787);
export const CREDENTIALS_DIR = env.NEAR_CREDENTIALS_DIR ?? join(homedir(), ".near-credentials", NETWORK);
/** Function-call keys created by `pnpm setup-keys` (outside the repo). */
export const FC_DIR = join(CREDENTIALS_DIR, "lowsec-fc");
export const DATA_DIR = env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "data");
export const AGENTS_ENABLED = env.AGENTS !== "0";
export const HAULER_INTERVAL_MS = Number(env.HAULER_INTERVAL_MS ?? 10_000);
export const COUNCIL_INTERVAL_MS = Number(env.COUNCIL_INTERVAL_MS ?? 20_000);
export const NEARAI_MODEL = env.NEARAI_MODEL ?? "z-ai/glm-5.3-flash";
export const EXPLORER = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
/** Methods a relayed (gasless) meta-tx may call. */
export const RELAY_METHODS = new Set(["register", "buy", "sell", "start_haul", "arrive", "raid", "record_decision", "tick", "turn"]);
