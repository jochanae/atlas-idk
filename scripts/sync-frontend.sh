#!/usr/bin/env bash
# sync-frontend.sh — pull latest atlas-idk from GitHub into Replit
# Run this anytime Lovable pushes changes to jochanae/atlas-idk

set -e

REPO="jochanae/atlas-idk"
BRANCH="main"
DEST="/home/runner/workspace/artifacts/atlas-frontend"
TMP="/tmp/atlas-sync-$$"

echo "🔄  Fetching latest $REPO @ $BRANCH..."

mkdir -p "$TMP"
curl -sL -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO/zipball/$BRANCH" \
  -o "$TMP/repo.zip"

echo "📦  Extracting..."
unzip -q "$TMP/repo.zip" -d "$TMP/extracted"
EXTRACTED=$(ls "$TMP/extracted")

echo "🔍  Comparing files..."
CHANGED=0
find "$TMP/extracted/$EXTRACTED/src" -type f | while read zipfile; do
  relpath="${zipfile#$TMP/extracted/$EXTRACTED/}"
  ourfile="$DEST/$relpath"
  mkdir -p "$(dirname "$ourfile")"
  
  if [ ! -f "$ourfile" ]; then
    cp "$zipfile" "$ourfile"
    echo "  + NEW: $relpath"
  else
    z=$(md5sum "$zipfile" | cut -d' ' -f1)
    o=$(md5sum "$ourfile"  | cut -d' ' -f1)
    if [ "$z" != "$o" ]; then
      # Skip vite.config.ts and onboarding.tsx (Replit-patched files)
      base=$(basename "$relpath")
      if [[ "$base" == "vite.config.ts" ]]; then
        echo "  ⏭   SKIP (Replit-patched): $relpath"
      else
        cp "$zipfile" "$ourfile"
        echo "  ✏️   UPDATE: $relpath"
        CHANGED=$((CHANGED+1))
      fi
    fi
  fi
done

# Re-apply the onboarding scroll fix after any sync
# (onboarding.tsx is pulled but needs the overflow patch)
node -e "
const fs = require('fs');
const f = '$DEST/src/pages/onboarding.tsx';
let c = fs.readFileSync(f, 'utf8');
c = c.replace('overflow: \"hidden\"', 'overflowX: \"hidden\",\n  overflowY: \"auto\"');
fs.writeFileSync(f, c);
" 2>/dev/null && echo "  🩹  onboarding scroll fix applied" || true

rm -rf "$TMP"
echo ""
echo "✅  Sync complete. Vite will hot-reload automatically."
echo "    If you don't see changes, restart the frontend workflow."
