#!/usr/bin/env bash
# Run before every commit: scans the working tree + full git history for secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v gitleaks >/dev/null; then
  # staged changes (what is about to be committed) + the whole history; ignored files (target/, node_modules/) are never scanned
  gitleaks git . --pre-commit --staged --no-banner --redact -v --exit-code 1 || { echo "gitleaks: possible secret in staged changes"; exit 1; }
  if git rev-parse HEAD >/dev/null 2>&1; then gitleaks git . --no-banner --redact --exit-code 1 || exit 1; fi
fi
# belt and braces: NEAR private keys / API keys
if git grep -nE "ed25519:[1-9A-HJ-NP-Za-km-z]{60,}|secp256k1:[1-9A-HJ-NP-Za-km-z]{60,}|sk-[A-Za-z0-9]{20,}|NEARAI_API_KEY=.+" -- . ':!scripts/check-secrets.sh' ':!.env.example' ; then
  echo "possible secret found"; exit 1
fi
git diff --cached --name-only | grep -E "(^|/)\.env$|near-credentials|\.pem$" && { echo "secret file staged"; exit 1; }
echo "secret check: clean"
