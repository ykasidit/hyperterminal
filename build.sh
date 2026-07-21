#!/bin/sh
# Content-hash build: public/ (dev source) -> dist/ (deployed).
# Hashed filenames = safe immutable caching; index.html is no-cache so a new
# deploy is picked up immediately and old versions can never be mixed.
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
for f in ms_sans_serif.woff ms_sans_serif.woff2 ms_sans_serif_bold.woff ms_sans_serif_bold.woff2 PerfectDOSVGA437Win.woff2; do
  hash=$(h "$WORK/$f"); name="${f%.*}"; ext="${f##*.}"
  cp "$WORK/$f" "dist/assets/$name.$hash.$ext"
  sed -i "s|url($f)|url(/assets/$name.$hash.$ext)|g" "$WORK/xp.css"
done
for f in logic.js demo.js; do
  hash=$(h "$WORK/$f"); name="${f%.js}"
  cp "$WORK/$f" "dist/assets/$name.$hash.js"
  sed -i "s|'./$f'|'/assets/$name.$hash.js'|g" "$WORK/app.js"
done

# stage 2: css + app.js (references now rewritten) - hash, rewrite index.html
for f in xp.css hyperterm.css app.js; do
  hash=$(h "$WORK/$f"); name="${f%.*}"; ext="${f##*.}"
  cp "$WORK/$f" "dist/assets/$name.$hash.$ext"
  sed -i "s|\"$f\"|\"/assets/$name.$hash.$ext\"|g" "$WORK/index.html"
done
# inject version from git tags
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo dev)
sed -i "s|window.HT_VERSION='dev'|window.HT_VERSION='$VERSION'|" "$WORK/index.html"
cp "$WORK/index.html" dist/

cat > dist/_headers << 'EOF'
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
EOF

# robots.txt + sitemap for the subdomain (main site's sitemap can't list other hosts)
cat > dist/robots.txt << 'EOF'
User-agent: *
Allow: /
Sitemap: https://hyperterminal.clearevo.com/sitemap.xml
EOF
cat > dist/sitemap.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://hyperterminal.clearevo.com/</loc><lastmod>$(date -u +%Y-%m-%d)</lastmod></url>
</urlset>
EOF

# self-check: fail loudly if any un-rewritten reference survived
! grep -q 'url(ms_sans_serif' dist/assets/xp.*.css
! grep -q 'url(PerfectDOS' dist/assets/xp.*.css
! grep -q "'\./logic\.js'" dist/assets/app.*.js
! grep -q "'\./demo\.js'" dist/assets/app.*.js
grep -q '/assets/app\.' dist/index.html
grep -q '/assets/xp\.' dist/index.html
grep -q '/assets/hyperterm\.' dist/index.html

echo "build ok -> dist/ ($(ls dist/assets | wc -l) hashed assets)"
