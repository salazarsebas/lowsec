/** In-memory activity feed + known players (persisted to data/ so Gini can be computed across restarts). */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./config.js";

export interface FeedItem {
  ts: number;
  actor: string;
  type: string;
  text: string;
  txHash?: string;
  ok?: boolean;
}

const feed: FeedItem[] = [];
export function push(item: Omit<FeedItem, "ts">) {
  feed.unshift({ ts: Date.now(), ...item });
  if (feed.length > 200) feed.pop();
}
export const getFeed = (n = 60) => feed.slice(0, n);

const PLAYERS = join(DATA_DIR, "players.json");
let players: string[] = existsSync(PLAYERS) ? JSON.parse(readFileSync(PLAYERS, "utf8")) : [];
export function addPlayer(id: string) {
  if (players.includes(id)) return;
  players.push(id);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PLAYERS, JSON.stringify(players));
}
export const knownPlayers = () => [...players];
