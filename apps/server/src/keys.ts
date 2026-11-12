/**
 * Key loading. Keys are NEVER stored in the repo: they come from ~/.near-credentials (NEAR CLI
 * legacy keychain) or from env vars (<ROLE>_PRIVATE_KEY) on a host like Railway/Fly.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyPairString } from "near-api-js";
import { CREDENTIALS_DIR, FC_DIR } from "./config.js";

function readKeyFile(path: string): KeyPairString | null {
  if (!existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, "utf8"));
  return (j.private_key ?? j.secret_key) as KeyPairString;
}

const envName = (role: string) => `${role.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PRIVATE_KEY`;

/** Full-access key (legacy keychain) for an account, or env override. */
export function fullKey(accountId: string, role = accountId): KeyPairString | null {
  return (process.env[envName(role)] as KeyPairString) ?? readKeyFile(join(CREDENTIALS_DIR, `${accountId}.json`));
}

/** Function-call key created by setup-keys for a role (e.g. onboarder, hauler-1). */
export function fcKey(accountId: string, role: string): KeyPairString | null {
  return (process.env[envName(role)] as KeyPairString) ?? readKeyFile(join(FC_DIR, `${role}.${accountId}.json`));
}
