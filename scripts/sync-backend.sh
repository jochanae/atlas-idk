#!/usr/bin/env bash
# sync-backend.sh — pull latest Axiom-Atlas routes/logic from GitHub
# Run this when you're ready to migrate the Cloud Run backend here

set -e

REPO="jochanae/Axiom-Atlas"
BRANCH="main"
TMP="/tmp/axiom-sync-$$"

echo "🔄  Fetching latest $REPO @ $BRANCH..."

mkdir -p "$TMP"
curl -sL -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO/zipball/$BRANCH" \
  -o "$TMP/repo.zip"

unzip -q "$TMP/repo.zip" -d "$TMP/extracted"
EXTRACTED=$(ls "$TMP/extracted")
echo "✅  Downloaded: $EXTRACTED"
echo ""
echo "Contents:"
ls "$TMP/extracted/$EXTRACTED/"
echo ""
echo "⚠️  Backend sync is manual — review the routes before copying."
echo "    Source is at: $TMP/extracted/$EXTRACTED"
echo "    Leave this terminal open to inspect files."
