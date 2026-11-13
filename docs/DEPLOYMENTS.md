# Testnet deployments

All keys live only in `~/.near-credentials/testnet/` on the build machine. Nothing secret is in this repo.

| Role | Account | Notes |
|---|---|---|
| Game contract (NEP-245 + game + council bound) | [`lowsec.testnet`](https://testnet.nearblocks.io/address/lowsec.testnet) | owner = itself; parent of every player / hauler sub-account |
| AI Economic Council | [`lowsec-council.testnet`](https://testnet.nearblocks.io/address/lowsec-council.testnet) | only account allowed to call `council_update` (±10%/epoch enforced on-chain) |
| Relayer (NEP-366 meta-tx gas payer) | [`lowsec-relayer.testnet`](https://testnet.nearblocks.io/address/lowsec-relayer.testnet) | used from Phase 2 |
| NPC hauler 1 | [`hauler-1.lowsec.testnet`](https://testnet.nearblocks.io/address/hauler-1.lowsec.testnet) | registered AI agent |
| NPC hauler 2 | [`hauler-2.lowsec.testnet`](https://testnet.nearblocks.io/address/hauler-2.lowsec.testnet) | registered AI agent |

Live params: 1 game tick = 10 s, Lowsec lane = 1 tick, Safe lane = 3 ticks, epoch = 24 ticks (4 min).
Current wasm sha256: `bfbf322685bf93fd248533db8192d3f5095a3a2550015a8cf2704ced0612e1d2` (built with `cargo near build non-reproducible-wasm`, near-sdk 5.30.1, cargo-near 0.23.0, rustc 1.100.0).

## Transactions (2026-11-12, Europe/Berlin)

| Step | Tx |
|---|---|
| create `lowsec.testnet` (faucet) | [2V3FW1bS…](https://testnet.nearblocks.io/txns/2V3FW1bSDCZ7Ka1fGS5xsMPkPFPZPAs7H9equPfRvsZf) |
| create `lowsec-council.testnet` (faucet) | [61hHVpRV…](https://testnet.nearblocks.io/txns/61hHVpRVdBLzK1XFLo4sbjrMa6m1C18ZegfFcbPjoiej) |
| create `lowsec-relayer.testnet` (faucet) | [Ae5Fh6jZ…](https://testnet.nearblocks.io/txns/Ae5Fh6jZwSMYDnmui9EV4hJxMeUh8hEFrvLue9zjLvt7) |
| deploy + `new` (v0.1, ~22:30) | tx id not captured by the CLI filter; see the account page |
| redeploy v0.1.1 (adds `create_player`, state kept) | [5DAQtfjy…](https://testnet.nearblocks.io/txns/5DAQtfjy3UfKGWoPfcS66N1Aq9SNgotduJz4MACVHpDE) |

### Smoke test (`scripts/testnet-smoke.sh`): one full loop with an ambush
| Step | Tx |
|---|---|
| create hauler-1.lowsec.testnet | [5pnPSRtMSh…](https://testnet.nearblocks.io/txns/5pnPSRtMSh7E9b7oqEb95m1MyZk8fWwnyUT89WreKDhE) |
| create hauler-2.lowsec.testnet | [5vevTTRMd4…](https://testnet.nearblocks.io/txns/5vevTTRMd44yhbyRULnK3GuE86VQqsavTXfV1UqeB9Sh) |
| add_agent hauler-1 | [HUpj7uFswb…](https://testnet.nearblocks.io/txns/HUpj7uFswbDMCE6XrcCkUXvA1MsnuEWTYNsE4mi1VTBg) |
| add_agent hauler-2 | [5QfTVMBsJP…](https://testnet.nearblocks.io/txns/5QfTVMBsJPUhNhNHm8cczhn14e2x8Vc23nkbPSdrbVbH) |
| add_agent council | [4MTtBsCVWn…](https://testnet.nearblocks.io/txns/4MTtBsCVWnLeAiNVUh2TV5H4xS69y17v5eba9TFKqnR9) |
| register (hauler-1.lowsec.testnet) | [2XvTHBqE6d…](https://testnet.nearblocks.io/txns/2XvTHBqE6db54PtoWG2FQtK872FQTeRRyEHAiMLGkpRN) |
| register (hauler-2.lowsec.testnet) | [Ep2f99oZ2U…](https://testnet.nearblocks.io/txns/Ep2f99oZ2ULn4D8j8F8wugECZsff7PLJ3scexqGAVFvq) |
| raid (hauler-2.lowsec.testnet) | [BQC3HuFaRc…](https://testnet.nearblocks.io/txns/BQC3HuFaRc4vdnGK9rFStBM3oNMDc85r7m6nAjmSc7Nb) |
| buy (hauler-1.lowsec.testnet) | [EWCpJkHQm8…](https://testnet.nearblocks.io/txns/EWCpJkHQm8QV5ViQqUmpc1M5egwZ2evrJ5aBDCTT6fna) |
| record_decision (mock, smoke test) | [6bfvmkj3Lu…](https://testnet.nearblocks.io/txns/6bfvmkj3LuknpauDexprcNTwyJV6aMjia7tRqhsfSV2E) |
| start_haul (hauler-1.lowsec.testnet) | [CLe24WfgpT…](https://testnet.nearblocks.io/txns/CLe24WfgpTht6GhkhGE68dwcjjc4NK24eDmcHZ8pBNQJ) |
| arrive (hauler-1.lowsec.testnet) | [Gq76zMaeay…](https://testnet.nearblocks.io/txns/Gq76zMaeayDSptMFdBu5n6Ce5qZWFyczqUA9uhkKDkEw) |
| sell (hauler-1 in forja) | [297FfBd54s…](https://testnet.nearblocks.io/txns/297FfBd54sYTiU2nDbTwp6CVoCU4kWyqHSkaFxSbUqWe) |

Result of `arrive` (from the tx logs): hauler-1 hauled 20 ore Mina→Forja on Lowsec while hauler-2 had 100 gold staked on that lane:
roll 471 < chance 2000 bps → **ambushed**: 6 ore burned (`mt_burn`, memo `ambush_destroyed`), 4 looted by hauler-2, 10 delivered, raid stake returned.

On-chain books after the smoke test (`economy` view): gold supply 972 = 1000 starter grants − 100 NPC sell orders − 10 raid fee − 3 toll + 85 NPC buy orders; ore supply 9 = 20 bought − 6 burned − 5 sold.

### v0.1.2 — server views + function-call keys (Phase 2)
| Step | Tx |
|---|---|
| redeploy (adds `last_council_epoch`, `genesis_ms`; wasm sha256 `ae358172…10a4e2`, state kept) | [JCU7qTGn…](https://testnet.nearblocks.io/txns/JCU7qTGnebyNQ8drLifge9Y57TzFuNVmZjDH5Gs8UBxv) |
| FC key `onboarder` on lowsec.testnet (`create_player` only, 1 NEAR allowance) | [JCwhwkv3…](https://testnet.nearblocks.io/txns/JCwhwkv3fTmkMF2ufAXTzheWgyJ29tXf6BwUSU3XEGKN) |
| FC key `council` on lowsec-council.testnet (`council_update`, `record_decision`) | [3SowfzuB…](https://testnet.nearblocks.io/txns/3SowfzuB5urNEaLn3m9SKHsK7fpJ5hHVjuye2kyyAsMx) |
| FC key hauler-1 (game methods + `record_decision`) | [2km3s7Ng…](https://testnet.nearblocks.io/txns/2km3s7Ngh1v5PYZ4gg6MQqAZbFFHgq8C2BHhsgxcmY8h) |
| FC key hauler-2 (game methods + `record_decision`) | [G9cUUNPK…](https://testnet.nearblocks.io/txns/G9cUUNPKnrHkMYCuubkuc3BDr7Gr8p6LN5MiLhahPUeb) |

The private keys live only in `~/.near-credentials/testnet/lowsec-fc/` (chmod 600), not in this repo.

### Live examples (server running with AI in MOCK mode)
| Event | Tx |
|---|---|
| Council `council_update` (epoch 2: faucets 100% → 102%) | [12aXPVHm…](https://testnet.nearblocks.io/txns/12aXPVHmt81RdubJi3sKyHnDRhykwRQ5mxuq6mpSj1fj) |
| Vex hauls 25 ore mina→forja via Lowsec (meta-tx via relayer) | [FiekyJi6…](https://testnet.nearblocks.io/txns/FiekyJi6T6aQYzjMKiZfx8heLMAQpC8s3QP8ARmkpXa5) |
| Kestrel arrives in mina with 25 parts | [2pVQD162…](https://testnet.nearblocks.io/txns/2pVQD162ECdg3HHkUWZrVeACnKvtBepAj16jd38hLcXa) |
| Vex sells 25 fuel in mina for 450 gold | [ZEbmcGsT…](https://testnet.nearblocks.io/txns/ZEbmcGsTrTs95NsHExzDzqCaMaEFZ8JcxPhfjhzB93d) |

Players created by the headless e2e run (`scripts/e2e.mjs`): `pilot132871`, `pilot270474` and `pilot135756.lowsec.testnet`. Each one joined, bought ore, hauled it via Lowsec, sold it and posted a raid, all gasless.

### v0.2: economy fixes and state reset (Nov 12, ~23:00 CET)
v0.2 changes the state layout (new params, `EpochRecord.span`, `Ledger.burned_dock_fees`), so the testnet contract was redeployed with `reset_v2`. That is an `#[init(ignore_state)]` method that only the contract account itself can call, and it writes the new state under new storage prefixes. The v0.1 transactions above stay on the explorer.

| Step | Tx |
|---|---|
| deploy v0.2 + `reset_v2` | [2qaVhZim…](https://testnet.nearblocks.io/txns/2qaVhZimVtCmzZDerGPKjErrSwiy6onoSUejSRviE46Y) |
| `add_agent` hauler-1 / hauler-2 / council | [2j3aCDrj…](https://testnet.nearblocks.io/txns/2j3aCDrj33VHmJWvFbfzVNKxjDbLTMtzoimysQre431D) · [9Ti1FjyP…](https://testnet.nearblocks.io/txns/9Ti1FjyPYfJo7Kcx9XQferuiggGjDWn7n9FF1fp3sgU3) · [8VVJTeu7…](https://testnet.nearblocks.io/txns/8VVJTeu7z1yyAGLz4qQaBWfk52HojpPq3B6w97pnrLqk) |
| code update: the Council signal ignores the genesis epoch (supply 0) | [GJwd14B5…](https://testnet.nearblocks.io/txns/GJwd14B5Mbe9FjKdBpR1bCPwJd9EEDh6LNjUTJko1LH8) |
| code update: the on-chain bound uses ceil, so the rule's own −10% cut is accepted (wasm sha256 `fd4535aa…d82a017`) | [6jPmQNA5…](https://testnet.nearblocks.io/txns/6jPmQNA5ADy659wandTLPeM2pNNwwqiSfoNJ9AfTScSQ) |
| create `lowsec-agent-demo.testnet` (faucet) for the external agent example | [86hHAaPr…](https://testnet.nearblocks.io/txns/86hHAaPrwL854bkYQwqrwAEFSizRD2NHGTCocbrFs1Wi) |

Live examples on v0.2:
| Event | Tx |
|---|---|
| Council `council_update` epoch 6: 3-epoch growth 28.74%/epoch > 1% target → faucets 82.62% → 74.35% | [CYZoU7E2…](https://testnet.nearblocks.io/txns/CYZoU7E2fHqo8CS3AGwoPcy6ojYJrrPz3A185RtV2wFQ) |
| Vex arrives in Puerto and pays a 197 ◎ docking fee (progressive sink) | [DLo5Gidp…](https://testnet.nearblocks.io/txns/DLo5Gidpd2UD77Mf1dpbmsJVV4ieRbqQh1UGAVyBj4Kx) |

The rejected update (before the ceil fix) was [GrCGXqKz…](https://testnet.nearblocks.io/txns/GrCGXqKzFgMbbFN3yMG8eq487Nkmpq1gMSfEz2Qi92HJ): "change exceeds the per-epoch bound". The rule asked for 8262 → 7435 (exactly −10%, truncated), and the old bound check rejected it by one unit.

e2e pilots on v0.2: `raider44541` and `pilot44541` (pilot44541 was ambushed by raider44541: 6 ore burned, 4 looted), `raider69623` and `pilot69623` (14 Lowsec runs, no ambush).

## v0.3 — NPC competition + the Guild (2026-11-12, ~23:40 CET)
v0.3 changes the state layout (`Ledger.minted_guild_float`, `guild`), so the contract was redeployed with `reset_v3` (same `#[init(ignore_state)]` + contract-account-only pattern, new storage prefixes). Earlier transactions stay on the explorer. Scripts: `scripts/setup-v03-accounts.mjs`, `scripts/deploy-v03.mjs`, `scripts/redeploy-code.mjs` (keys are read from `~/.near-credentials`, never from the repo).

| What | Tx |
|---|---|
| create `hauler-3.lowsec.testnet` (Moss) | [FECGk6FZ…](https://testnet.nearblocks.io/txns/FECGk6FZyFXSGiNCiNZZcchdHppJZaZ9XJn8f4Nd1jJs) |
| create `hauler-4.lowsec.testnet` (Ryo) | [423SNUCw…](https://testnet.nearblocks.io/txns/423SNUCwQCtAHqMARaTbXeNN5WaNirPFGJw1m4UGGz7i) |
| create `guild.lowsec.testnet` (the Guild) | [56PVFACm…](https://testnet.nearblocks.io/txns/56PVFACmiy4JBZpnD83D2suVUiio4Z67fhAJNvPmbtox) |
| relayer key pool (3 extra keys on `lowsec-relayer.testnet`, parallel meta-txs) | [8mTykwdn…](https://testnet.nearblocks.io/txns/8mTykwdn7o7myLPsvc7uVTQjdd4mq68rQGgUrf1gEJD5), [GYdHgFgz…](https://testnet.nearblocks.io/txns/GYdHgFgzibtAMx7LTGtuczwtqRemrU6Wfc1EC6nzJcZ6), [7aKeuG6a…](https://testnet.nearblocks.io/txns/7aKeuG6awLQJRiEMDNhBPetWsi7h2igCatfMLfTPY3Ve) |
| deploy v0.3 + `reset_v3` (atomic, one tx) | [4qNFJLcS…](https://testnet.nearblocks.io/txns/4qNFJLcSttJxjifKM3gSGvBbERjsDtKZGRxmqu9ksNqs) |
| `seed_guild` (30,000 ◎ float, genesis epoch 0) | [EXDKXM9y…](https://testnet.nearblocks.io/txns/EXDKXM9yfKbAaMW4Atws6Dcm9zxrA8KgNRX58pW8pYe) |
| `add_agent` × 4 (hauler-1..4) | [DwUp8CkH…](https://testnet.nearblocks.io/txns/DwUp8CkHVY2b7xfkvKVTQbL8F4AvD7NUYy3Nt6Whnee6) |
| redeploy (adds `turn`: one call per NPC turn; state kept) | [AEHzt3C1…](https://testnet.nearblocks.io/txns/AEHzt3C17HaZXFUND5pmAKUkGL5PUp4CJgR4fscV5iVb) |
| new FC keys incl. `turn`: hauler-1 · hauler-2 · hauler-3 · hauler-4 · guild | [GUxDJm56…](https://testnet.nearblocks.io/txns/GUxDJm56Yx25TtsCo6TVMzG3fC2mzjnJQqFxxeAsF11A) · [68K7M2Px…](https://testnet.nearblocks.io/txns/68K7M2PxLYskM3rkPxMY28AW3JeQsQu1HPCq94k9oXU5) · [AappL46A…](https://testnet.nearblocks.io/txns/AappL46AsABqKr7dxoHr6e5bVGMiDT8qbPD1n7ssyyGh) · [8n4DkkE5…](https://testnet.nearblocks.io/txns/8n4DkkE5VgwVVhvPaUX3NT9r8gaQVmUinpsgcUumAsDq) · [iGZQkoCh…](https://testnet.nearblocks.io/txns/iGZQkoChFAZUcDBh1sS7semDQTaWtjVQTCmdtfEteBS) |

Why `turn`: NEAR function-call access keys can only sign a single FunctionCall action, so a batched sell+buy+start_haul meta-tx was rejected ("Access key requires full access"). `turn` does the same three steps with the same rules in one call.

Demo recording (real ambush, 2026-11-12 ~23:52 CET): three raider pilots (`raider5082x0..2.lowsec.testnet`) staked raids on Mina–Forja, then `pilot5082.lowsec.testnet` was ambushed on its 4th Lowsec run (6 cargo burned, 4 looted by `raider5082x0`).

## v0.3.1 — Council signal excludes starter grants (2026-11-13, ~00:25 CET)
Code-only redeploy (state kept): `council_signal` subtracts the window's `minted_starter_grants` before computing growth; `COUNCIL_RULE` text updated.
- deploy tx: `4KBrndk1qvtANC3ys9j6NEyPp37vG38SmqDjSGNguXnd` (wasm sha256 `331d7ddf…fb9c16`)
- right after: epoch 10, raw supply growth 1.82%/epoch → signal without grants 0.31%/epoch → rule says faucet 70% → 70.96% at the next Council turn.

## NEAR AI Cloud TEE check (2026-11-13, ~12:40 CET)
`pnpm --filter @lowsec/server tee:check` (`apps/server/src/tee-check.ts`) with the account's key:
- model list: `z-ai/glm-5.3-flash` and `z-ai/glm-5.3` are available; `client.verify()` returns a model TEE report for glm-5.3-flash and Qwen3.8-27B, and gateway-only for deepseek/openai models.
- 1) attestation: **OK**. Gateway TCB `UpToDate` with attested TLS binding; model `z-ai/glm-5.3-flash` TCB `UpToDate`, GPU evidence present.
- 2) inference: **FAILED, HTTP 402 "No spending limit configured. Please contact support to set up credits."** The same result for 4 different models: it is the account, not the model.
- So there is no verified decision yet: no `provider_tee` signature exists, and no "TEE verified" `record_decision` tx. The server runs with the key and falls back per decision to the labelled MOCK policy (`/api/health` → `ai.health.lastError`).
