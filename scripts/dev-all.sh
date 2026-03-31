#!/usr/bin/env bash
set -euo pipefail

npm run dev --prefix api &
API_PID=$!
npm run dev
kill $API_PID
