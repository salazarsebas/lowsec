//! End-to-end on a local NEAR sandbox (near-workspaces): real wasm, real accounts,
//! a sub-account hauler with a FUNCTION-CALL key (no deposit methods), an ambush, the Council.
use near_workspaces::types::{AccessKey, NearToken, SecretKey};
use serde_json::{json, Value};

const TICK: u64 = 1; // 1 s per game tick in the sandbox

#[tokio::test]
async fn full_loop_on_sandbox() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = near_workspaces::compile_project("./").await?;
    let contract = worker.dev_deploy(&wasm).await?;
    let root = worker.root_account()?;
    let council = root.create_subaccount("council").initial_balance(NearToken::from_near(5)).transact().await?.into_result()?;
    let alice = root.create_subaccount("alice").initial_balance(NearToken::from_near(5)).transact().await?.into_result()?;
    let raider = root.create_subaccount("raider").initial_balance(NearToken::from_near(5)).transact().await?.into_result()?;

    // always-ambush lowsec + 1s ticks so the test is deterministic and fast
    let params = json!({
        "base_price": [10, 20, 14], "target_stock": 400, "min_price_bps": 2500, "max_price_bps": 40000,
        "npc_spread_bps": 9000, "faucet_bps": 10000, "home_goal_bps": 20000, "away_goal_bps": 5000,
        "reversion_bps": 600, "max_stock_factor": 4, "travel_ticks": [3, 1], "toll_gold": [12, 3],
        "cargo_cap": 25, "ambush_base_bps": 10000, "ambush_per_raid_bps": 1200, "ambush_max_bps": 10000,
        "ambush_loss_bps": 5000, "raider_loot_bps": 2000, "raid_min_stake": 100, "raid_fee_bps": 1000,
        "raid_ttl_ticks": 600, "new_player_grant": 500, "epoch_ticks": 5,
        "council_target_inflation_bps": 100, "council_gain": 2, "council_max_step_bps": 1000,
        "council_min_faucet_bps": 7000, "council_max_faucet_bps": 11000, "tick_seconds": TICK
    });
    contract
        .call("new")
        .args_json(json!({ "owner": contract.id(), "council": council.id(), "params": params }))
        .transact()
        .await?
        .into_result()?;

    // --- a hauler sub-account that only has a function-call key (like our NPCs / players)
    let hauler = contract.as_account().create_subaccount("hauler-1").initial_balance(NearToken::from_near(2)).transact().await?.into_result()?;
    let fc_sk = SecretKey::from_random(near_workspaces::types::KeyType::ED25519);
    let fc_key = AccessKey::function_call_access(contract.id(), &["register", "buy", "sell", "start_haul", "arrive", "raid", "record_decision"], Some(NearToken::from_millinear(250)));
    hauler.batch(hauler.id()).add_key(fc_sk.public_key(), fc_key).transact().await?.into_result()?;
    let hauler_fc = near_workspaces::Account::from_secret_key(hauler.id().clone(), fc_sk, &worker);
    contract.call("add_agent").args_json(json!({ "account_id": hauler.id() })).transact().await?.into_result()?;

    // raider posts a raid on mina-forja
    raider.call(contract.id(), "register").args_json(json!({ "town": "forja" })).transact().await?.into_result()?;
    raider.call(contract.id(), "raid").args_json(json!({ "lane": "mina-forja", "stake": "100" })).transact().await?.into_result()?;

    // hauler (FC key only) plays the loop
    hauler_fc.call(contract.id(), "register").args_json(json!({ "town": "mina" })).transact().await?.into_result()?;
    let cost: u128 = hauler_fc.call(contract.id(), "buy").args_json(json!({ "good": "ore", "qty": 20 })).transact().await?.json()?;
    assert!(cost > 0);
    let r = hauler_fc
        .call(contract.id(), "record_decision")
        .args_json(json!({ "kind": "haul", "payload_hash": "aa".repeat(32), "attestation_hash": "bb".repeat(32), "model": "z-ai/glm-5.3-flash", "signature_kind": "mock" }))
        .transact()
        .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let started = hauler_fc.call(contract.id(), "start_haul").args_json(json!({ "to": "forja", "route": "lowsec", "good": "ore", "qty": 20 })).transact().await?;
    assert!(started.is_success(), "{:?}", started.failures());
    let ev = started.logs().iter().any(|l| l.contains("\"standard\":\"nep245\"") && l.contains("mt_transfer"));
    assert!(ev, "nep245 mt_transfer event for the escrow");

    // a function-call key cannot move tokens (mt_transfer needs 1 yocto and is not in the allow-list)
    let steal = hauler_fc.call(contract.id(), "mt_transfer").args_json(json!({ "receiver_id": alice.id(), "token_id": "gold", "amount": "1" })).deposit(NearToken::from_yoctonear(1)).transact().await;
    assert!(steal.is_err() || steal.unwrap().is_failure());

    // wait for arrival, anyone (alice) resolves it
    tokio::time::sleep(std::time::Duration::from_secs(3 * TICK)).await;
    let arrived = alice.call(contract.id(), "arrive").args_json(json!({ "account_id": hauler.id() })).transact().await?;
    assert!(arrived.is_success(), "{:?}", arrived.failures());
    assert!(arrived.logs().iter().any(|l| l.contains("mt_burn") && l.contains("ambush_destroyed")));
    let res: Value = arrived.json()?;
    assert_eq!(res["ambushed"], true);
    assert_eq!(res["burned"], 6);

    let bal = |acc: &near_workspaces::AccountId, t: &str| {
        let c = contract.clone();
        let acc = acc.clone();
        let t = t.to_string();
        async move { c.view("mt_balance_of").args_json(json!({ "account_id": acc, "token_id": t })).await.unwrap().json::<String>().unwrap() }
    };
    assert_eq!(bal(hauler.id(), "ore").await, "10");
    assert_eq!(bal(raider.id(), "ore").await, "4");

    // --- Council: wait for an epoch to close, then a bounded update succeeds and an unbounded one fails
    tokio::time::sleep(std::time::Duration::from_secs(6 * TICK)).await;
    let too_big = council.call(contract.id(), "council_update").args_json(json!({ "faucet_bps": 5000, "rationale_hash": "x" })).transact().await?;
    assert!(too_big.is_failure());
    let ok = council.call(contract.id(), "council_update").args_json(json!({ "faucet_bps": 9000, "rationale_hash": "x" })).transact().await?;
    assert!(ok.is_success(), "{:?}", ok.failures());
    let mallory = alice.call(contract.id(), "council_update").args_json(json!({ "faucet_bps": 9500, "rationale_hash": "x" })).transact().await?;
    assert!(mallory.is_failure());

    let eco: Value = contract.view("economy").await?.json()?;
    assert_eq!(eco["faucet_bps"], 9000);
    assert_eq!(eco["total"]["cargo_burned_units"], 6);
    assert_eq!(eco["decisions"], 1);
    Ok(())
}
