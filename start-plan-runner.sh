#!/bin/zsh
# Install this project's plan runner where login can start it, then restart it.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)/plan-runner"
DEST="$HOME/.ai-server/plan-runner"
LABEL="gui/$UID/com.brianhannan.ai-server.plan-runner"
PLIST="$HOME/Library/LaunchAgents/com.brianhannan.ai-server.plan-runner.plist"

mkdir -p "$DEST"
cp "$SRC/engine.py" "$SRC/server.py" "$SRC/index.html" "$DEST/"

launchctl bootout "$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
launchctl enable "$LABEL"
launchctl kickstart -k "$LABEL"
echo "Plan runner: http://127.0.0.1:8791"
echo "Repo:        $HOME/Documents/sports-betting"
