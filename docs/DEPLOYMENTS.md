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
