#!/bin/sh
set -e
cd "$(dirname "$0")"
npx wrangler deploy
