#!/usr/bin/env bash
# Show whether Piko is running, plus the last few log lines.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/run"
PIDFILE="$RUN/supervisor.pid"
LOG="$RUN/piko.log"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  SP="$(cat "$PIDFILE")"
  echo "Status: RUNNING (supervisor pid $SP, uptime $(ps -o etime= -p "$SP" | tr -d ' '))"
  [ -f "$RUN/bot.pid" ] && kill -0 "$(cat "$RUN/bot.pid")" 2>/dev/null && echo "Bot process pid: $(cat "$RUN/bot.pid")"
  RC=0
else
  echo "Status: STOPPED"
  RC=1
fi
if [ -f "$LOG" ]; then
  echo "--- last log lines ($LOG) ---"
  tail -n 8 "$LOG"
fi
exit $RC
