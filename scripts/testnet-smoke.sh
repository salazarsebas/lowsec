#!/usr/bin/env bash
# Creates the NPC hauler sub-accounts and plays one loop on testnet, printing explorer links.
# Keys live ONLY in ~/.near-credentials (legacy keychain), never in this repo.
set -euo pipefail
C=${CONTRACT_ID:-lowsec.testnet}
NET="network-config testnet"
EXP="https://testnet.nearblocks.io/txns"
LOG=${LOG:-/tmp/lowsec-smoke.log}
tx() { # label, command...
  local label=$1; shift
  local out; out=$("$@" 2>&1) || { echo "FAIL $label"; echo "$out" | grep -vE "ed25519:" | tail -20; return 1; }
  local id; id=$(echo "$out" | grep -oE "Transaction ID: [A-Za-z0-9]+" | head -1 | awk '{print $3}')
  echo "| $label | [${id:0:10}…]($EXP/$id) |" | tee -a "$LOG"
  echo "$out" | grep -E "EVENT_JSON|Function execution return value" -A2 | grep -vE "ed25519:" | head -6 >> "$LOG.events" || true
}
call() { # signer method json [label]
  tx "${4:-$2 ($1)}" near contract call-function as-transaction "$C" "$2" json-args "$3" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as "$1" $NET sign-with-legacy-keychain send
}
mk_sub() {
  near account view-account-summary "$1" $NET now >/dev/null 2>&1 && { echo "exists $1"; return; }
  tx "create $1" near account create-account fund-myself "$1" "$2" autogenerate-new-keypair save-to-legacy-keychain sign-as "$C" $NET sign-with-legacy-keychain send
}
mk_sub "hauler-1.$C" '0.5 NEAR'
mk_sub "hauler-2.$C" '0.5 NEAR'
call "$C" add_agent "{\"account_id\":\"hauler-1.$C\"}" "add_agent hauler-1"
call "$C" add_agent "{\"account_id\":\"hauler-2.$C\"}" "add_agent hauler-2"
call "$C" add_agent "{\"account_id\":\"lowsec-council.testnet\"}" "add_agent council"
call "hauler-1.$C" register '{"town":"mina"}'
call "hauler-2.$C" register '{"town":"forja"}'
call "hauler-2.$C" raid '{"lane":"mina-forja","stake":"100"}'
call "hauler-1.$C" buy '{"good":"ore","qty":20}'
call "hauler-1.$C" record_decision '{"kind":"haul","payload_hash":"smoke-test-no-llm","attestation_hash":"none","model":"none","signature_kind":"mock"}' "record_decision (mock, smoke test)"
call "hauler-1.$C" start_haul '{"to":"forja","route":"lowsec","good":"ore","qty":20}'
sleep 15
call "hauler-1.$C" arrive '{}'
call "hauler-1.$C" sell '{"good":"ore","qty":5}' "sell (hauler-1 in forja)"
near contract call-function as-read-only "$C" economy json-args '{}' $NET now 2>&1 | sed -n '/{/,$p' > /tmp/lowsec-economy.json || true
echo "done; log: $LOG"
