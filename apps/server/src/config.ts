import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
export const NETWORK = env.NEAR_NETWORK ?? "testnet";
export const RPC_URL = env.NEAR_RPC_URL ?? (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
export const CONTRACT_ID = env.CONTRACT_ID ?? "lowsec.testnet";
export const COUNCIL_ID = env.COUNCIL_ID ?? "lowsec-council.testnet";
export const RELAYER_ID = env.RELAYER_ID ?? "lowsec-relayer.testnet";
export const HAULERS = (env.HAULERS ?? `hauler-1.${CONTRACT_ID},hauler-2.${CONTRACT_ID}`).split(",");
export const PORT = Number(env.PORT ?? 8787);
export const CREDENTIALS_DIR = env.NEAR_CREDENTIALS_DIR ?? join(homedir(), ".near-credentials", NETWORK);
/** Function-call keys created by `pnpm setup-keys` (outside the repo). */
export const FC_DIR = join(CREDENTIALS_DIR, "lowsec-fc");
export const DATA_DIR = env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "data");
export const AGENTS_ENABLED = env.AGENTS !== "0";
export const HAULER_INTERVAL_MS = Number(env.HAULER_INTERVAL_MS ?? 20_000);
export const COUNCIL_INTERVAL_MS = Number(env.COUNCIL_INTERVAL_MS ?? 20_000);
export const NEARAI_MODEL = env.NEARAI_MODEL ?? "z-ai/glm-5.3-flash";
export const EXPLORER = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
/** Methods a relayed (gasless) meta-tx may call. */
export const RELAY_METHODS = new Set(["register", "buy", "sell", "start_haul", "arrive", "raid", "record_decision", "tick"]);
