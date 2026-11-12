# lowsec contract (Rust, near-sdk 5.30.1)

```bash
cargo test --lib                    # 18 unit tests incl. TS<->Rust parity vectors
cargo test --test integration       # near-workspaces sandbox: FC-key hauler, ambush, Council bound
cargo near build non-reproducible-wasm   # -> target/near/lowsec.wasm
```

| Area | Methods |
|---|---|
| NEP-245 | `mt_transfer`, `mt_batch_transfer`, `mt_transfer_call`, `mt_batch_transfer_call`, `mt_balance_of`, `mt_batch_balance_of`, `mt_supply`, `mt_batch_supply`, `mt_token`; events `mt_mint` / `mt_burn` / `mt_transfer` |
| Game (no deposit → callable with function-call keys / meta-tx) | `register`, `buy`, `sell`, `start_haul`, `arrive`, `raid`, `tick` |
| Council | `council_update` (only council account; ±10%/epoch and [70%,110%] enforced on-chain; once per epoch), view `rule_next_faucet_bps` |
| AI attestations | `record_decision` (only registered agents / council), views `decisions`, `get_decision` |
| Reports | `economy`, `epochs`, `get_player`, `get_params`, `current_tick` |

Token ids: `gold`, `ore`, `parts`, `fuel`. Rules live in `src/rules.rs`, mirrored from `packages/sim/src/pricing.ts`.
Randomness: `env::random_seed()` hashed with haul id + account. Validators can bias it; acceptable for a testnet game, documented as a limitation.
