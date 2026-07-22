#!/bin/sh
# Content-hash build: public/ (dev source) -> dist/ (deployed under
# www.clearevo.com/hyperterminal/ by ../ykasidit.github.io/deploy.sh).
# All rewritten references are RELATIVE so dist works at any base path.
# Hashed filenames = safe immutable caching; index.html is served no-cache
# (see _headers written by the main site's deploy.sh).
set -e
cd "$(dirname "$0")"
node --check public/app.js
node --check public/logic.js
node --check public/demo.js

rm -rf dist
mkdir -p dist/assets
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cp public/* "$WORK"

h() { sha256sum "$1" | cut -c1-8; }

# stage 1: leaves (fonts, imported js modules) - hash, then rewrite referrers
# fonts are referenced from xp.css which lives in the same assets/ dir -> bare relative name
for f in ms_sans_serif.woff ms_sans_serif.woff2 ms_sans_serif_bold.woff ms_sans_serif_bold.woff2 PerfectDOSVGA437Win.woff2; do
  hash=$(h "$WORK/$f"); name="${f%.*}"; ext="${f##*.}"
  cp "$WORK/$f" "dist/assets/$name.$hash.$ext"
  sed -i "s|url($f)|url($name.$hash.$ext)|g" "$WORK/xp.css"
done
for f in logic.js demo.js; do
  hash=$(h "$WORK/$f"); name="${f%.js}"
  cp "$WORK/$f" "dist/assets/$name.$hash.js"
  sed -i "s|'./$f'|'./$name.$hash.js'|g" "$WORK/app.js"
done

# stage 2: css + app.js (references now rewritten) - hash, rewrite index.html
for f in xp.css hyperterm.css app.js; do
  hash=$(h "$WORK/$f"); name="${f%.*}"; ext="${f##*.}"
  cp "$WORK/$f" "dist/assets/$name.$hash.$ext"
  sed -i "s|\"$f\"|\"assets/$name.$hash.$ext\"|g" "$WORK/index.html"
done

# inject version from git tags
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo dev)
sed -i "s|window.HT_VERSION='dev'|window.HT_VERSION='$VERSION'|" "$WORK/index.html"
cp "$WORK/index.html" dist/
cp "$WORK/manifest.json" "$WORK"/icon-*.png dist/

# self-check: fail loudly if any un-rewritten reference survived
! grep -q 'url(ms_sans_serif\.woff' dist/assets/xp.*.css
! grep -q 'url(PerfectDOSVGA437Win\.woff' dist/assets/xp.*.css
! grep -q "'\./logic\.js'" dist/assets/app.*.js
! grep -q "'\./demo\.js'" dist/assets/app.*.js
grep -q '"assets/app\.' dist/index.html
grep -q '"assets/xp\.' dist/index.html
grep -q '"assets/hyperterm\.' dist/index.html

echo "build ok -> dist/ ($(ls dist/assets | wc -l) hashed assets)"
