#!/bin/sh
# NFL betting desk. Refresh FanDuel, then keep the LAN UI up.
set -eu

INTERVAL="${NFL_BETS_INTERVAL_SECONDS:-600}"
BIND="${NFL_BETS_BIND:-0.0.0.0}"
PORT="${NFL_BETS_PORT:-8793}"
export PYTHONPATH="${PYTHONPATH:-/app}"

echo "[nfl-bets] starting (interval=${INTERVAL}s ui=${BIND}:${PORT})"

python -m nfl_bets.refresh || echo "[nfl-bets] WARN: initial refresh failed" >&2

NFL_BETS_BIND="$BIND" NFL_BETS_PORT="$PORT" python -m nfl_bets.server &
UI_PID=$!
sleep 0.4
if ! kill -0 "$UI_PID" 2>/dev/null; then
  echo "[nfl-bets] ERROR: UI failed to stay up" >&2
  exit 1
fi

while true; do
  echo "[nfl-bets] sleeping ${INTERVAL}s"
  sleep "$INTERVAL"
  python -m nfl_bets.refresh || echo "[nfl-bets] WARN: refresh failed" >&2
done
