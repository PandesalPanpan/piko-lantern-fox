#!/usr/bin/env bash
# Restart Piko.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$ROOT/stop.sh"
sleep 1
exec "$ROOT/start.sh"
