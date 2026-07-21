#!/bin/sh
# The app now lives at www.clearevo.com/hyperterminal/ - the main site's deploy
# script builds this repo's dist/ into the combined site and deploys it all.
set -e
cd "$(dirname "$0")"
./build.sh
../ykasidit.github.io/deploy.sh
