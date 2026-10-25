#!/usr/bin/env bash
# Simple supervisor: runs the bot and restarts it if it crashes, with exponential backoff.
# Started by start.sh; do not run directly unless you know why.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/run"
LOG="$RUN/piko.log"
BOT_PID_FILE="$RUN/bot.pid"
BACKOFF_MIN=2
BACKOFF_MAX=60
HEALTHY_SECS=60   # a run this long resets the backoff

umask 077
mkdir -p "$RUN"
STOP=0
CHILD=""

say() { printf '[%s] supervisor: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$LOG"; }

on_term() {
  STOP=1
  if [ -n "$CHILD" ] && kill -0 "$CHILD" 2>/dev/null; then kill -TERM "$CHILD" 2>/dev/null; fi
}
trap on_term TERM INT

delay=$BACKOFF_MIN
say "started (pid $$)"
while [ "$STOP" -eq 0 ]; do
  started=$(date +%s)
  ( cd "$ROOT/bot" && exec node index.js ) >> "$LOG" 2>&1 &
  CHILD=$!
  echo "$CHILD" > "$BOT_PID_FILE"
  say "bot started (pid $CHILD)"
  wait "$CHILD"; code=$?
  # `wait` returns early (>128) when a trapped signal arrives; wait again for the real exit.
  while kill -0 "$CHILD" 2>/dev/null; do wait "$CHILD" 2>/dev/null; code=$?; done
  rm -f "$BOT_PID_FILE"
  [ "$STOP" -eq 1 ] && break
  ran=$(( $(date +%s) - started ))
  case "$code" in
    0) say "bot exited cleanly (code 0); not restarting"; break ;;
    2) say "configuration error (code 2); fix /workspace/piko/.env and run ./start.sh again"; break ;;
    3) say "login rejected (code 3); check DISCORD_TOKEN, then run ./start.sh again"; break ;;
  esac
  if [ "$ran" -ge "$HEALTHY_SECS" ]; then delay=$BACKOFF_MIN; fi
  say "bot exited with code $code after ${ran}s; restarting in ${delay}s"
  # interruptible sleep
  slept=0
  while [ "$slept" -lt "$delay" ] && [ "$STOP" -eq 0 ]; do sleep 1; slept=$((slept + 1)); done
  delay=$(( delay * 2 )); [ "$delay" -gt "$BACKOFF_MAX" ] && delay=$BACKOFF_MAX
done
rm -f "$RUN/supervisor.pid" "$BOT_PID_FILE"
say "stopped"
