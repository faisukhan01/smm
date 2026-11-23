#!/bin/bash
# SMM all-in-one — API + publishing worker in a single container.
# Used by free-tier hosts (Render free web service) where only one
# service is available: one container serves HTTP and polls the queue.
set -u

bun mini-services/api/dist/src/main.js &
API_PID=$!

bun mini-services/worker/src/main.ts &
WORKER_PID=$!

shutdown() {
  kill "$API_PID" "$WORKER_PID" 2>/dev/null
}
trap shutdown TERM INT

# Exit as soon as either process dies (container restarts, no zombies).
wait -n "$API_PID" "$WORKER_PID"
CODE=$?
shutdown
sleep 1
exit "$CODE"
