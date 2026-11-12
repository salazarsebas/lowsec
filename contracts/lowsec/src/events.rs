//! NEP-297 events: `nep245` (mt_mint / mt_burn / mt_transfer) and `lowsec` game events.
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, AccountId};

fn emit(standard: &str, version: &str, event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": standard, "version": version, "event": event, "data": [data] })
    ));
}

pub fn mt_mint(owner: &AccountId, token: &str, amount: u128, memo: &str) {
    emit("nep245", "1.0.0", "mt_mint", json!({ "owner_id": owner, "token_ids": [token], "amounts": [amount.to_string()], "memo": memo }));
}

pub fn mt_burn(owner: &AccountId, token: &str, amount: u128, memo: &str) {
    emit("nep245", "1.0.0", "mt_burn", json!({ "owner_id": owner, "token_ids": [token], "amounts": [amount.to_string()], "memo": memo }));
}

pub fn mt_transfer(from: &AccountId, to: &AccountId, tokens: &[String], amounts: &[u128], memo: Option<&str>) {
    let amounts: Vec<String> = amounts.iter().map(|a| a.to_string()).collect();
    emit("nep245", "1.0.0", "mt_transfer", json!({ "old_owner_id": from, "new_owner_id": to, "token_ids": tokens, "amounts": amounts, "memo": memo }));
}

pub fn game(event: &str, data: Value) {
    emit("lowsec", "1.0.0", event, data);
}
