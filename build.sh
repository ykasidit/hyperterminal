#!/bin/sh
set -e
cd "$(dirname "$0")"
node --check public/app.js
node --check public/logic.js
node --check public/demo.js
echo "build ok (static site - nothing to compile)"
