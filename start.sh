#!/usr/bin/env bash
# Start Piko in the background (supervised, with pidfile and log in ./run).
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/run"
PIDFILE="$RUN/supervisor.pid"
LOG="$RUN/piko.log"
umask 077
mkdir -p "$RUN"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Piko is already running (supervisor pid $(cat "$PIDFILE")). Use ./restart.sh to restart."
  exit 0
fi
rm -f "$PIDFILE"

if [ ! -f "$ROOT/.env" ]; then
  echo "Missing $ROOT/.env. Copy .env.example to .env, fill it in, and chmod 600 it." >&2
  exit 1
fi
if [ ! -d "$ROOT/bot/node_modules" ]; then
  echo "Dependencies missing. Run: (cd $ROOT/bot && npm install)" >&2
  exit 1
fi
# Keep the log small: rotate once it passes ~5 MB.
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 5242880 ]; then mv -f "$LOG" "$LOG.1"; fi

setsid nohup "$ROOT/supervisor.sh" >/dev/null 2>&1 < /dev/null &
echo $! > "$PIDFILE"
sleep 1
if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Piko started (supervisor pid $(cat "$PIDFILE")). Log: $LOG"
else
  echo "Piko failed to start. See $LOG" >&2
  exit 1
fi
