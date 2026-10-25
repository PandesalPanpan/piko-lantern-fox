#!/usr/bin/env bash
# Stop Piko and its supervisor.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/run"
PIDFILE="$RUN/supervisor.pid"

if [ ! -f "$PIDFILE" ] || ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Piko is not running."
  rm -f "$PIDFILE" "$RUN/bot.pid"
  exit 0
fi
PID="$(cat "$PIDFILE")"
kill -TERM "$PID" 2>/dev/null
for _ in $(seq 1 15); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 1
done
if kill -0 "$PID" 2>/dev/null; then
  echo "Supervisor did not exit in time; forcing."
  [ -f "$RUN/bot.pid" ] && kill -KILL "$(cat "$RUN/bot.pid")" 2>/dev/null
  kill -KILL "$PID" 2>/dev/null
fi
rm -f "$PIDFILE" "$RUN/bot.pid"
echo "Piko stopped."
