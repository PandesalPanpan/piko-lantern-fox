'use strict';
// Gateway connection logging and a lightweight watchdog. Logs only event names, shard ids and numeric
// codes (never message content, tokens or request bodies).

const WATCHDOG = {
  checkMs: 30 * 1000, // how often the connection state is sampled
  maxNotReadyMs: 3 * 60 * 1000, // exit after this long without a READY gateway
  exitCode: 1, // non-zero: the supervisor restarts the bot with its normal backoff
};

/** Safe one-line description of an error/warning: name, code and a redacted, truncated message. */
function describe(err, shortError, secrets) {
  try { return shortError(err, secrets); } catch (_) { return 'unknown'; }
}

function attachGatewayLogging(client, { Events, log, warn, shortError, secrets }) {
  const d = (e) => describe(e, shortError, secrets);
  client.on(Events.ShardReady, (id, unavailable) => log(`Shard ${id} ready (unavailable guilds: ${unavailable ? unavailable.size : 0}).`));
  client.on(Events.ShardDisconnect, (ev, id) => warn(`Shard ${id} disconnected (code ${ev && ev.code}).`));
  client.on(Events.ShardReconnecting, (id) => log(`Shard ${id} reconnecting.`));
  client.on(Events.ShardResume, (id, replayed) => log(`Shard ${id} resumed (replayed events: ${Number.isFinite(replayed) ? replayed : 0}).`));
  client.on(Events.ShardError, (err, id) => warn(`Shard ${id} error: ${d(err)}`));
  client.on(Events.Error, (err) => warn('Client error: ' + d(err)));
  client.on(Events.Warn, (m) => warn('Client warning: ' + d(new Error(String(m)))));
}

/** Process-level handlers: unhandled rejections are logged (no crash); uncaught exceptions exit 1. */
function installProcessHandlers(proc, { warn, shortError, secrets, exit }) {
  proc.on('unhandledRejection', (reason) => warn('Unhandled rejection: ' + describe(reason, shortError, secrets)));
  proc.on('uncaughtException', (err) => {
    warn('Uncaught exception: ' + describe(err, shortError, secrets));
    exit(1);
  });
}

/**
 * Watchdog: if the websocket is not READY for more than `maxNotReadyMs` of consecutive samples, call `onStuck`.
 * `isReady()` and `now()` are injected so it can be tested without Discord or real time.
 */
function createWatchdog({ isReady, now = Date.now, log, onStuck, checkMs = WATCHDOG.checkMs, maxNotReadyMs = WATCHDOG.maxNotReadyMs, setInterval: si = setInterval, clearInterval: ci = clearInterval }) {
  let notReadySince = null;
  let timer = null;
  function check() {
    let ready = false;
    try { ready = !!isReady(); } catch (_) { ready = false; }
    const t = now();
    if (ready) {
      if (notReadySince !== null) log(`Watchdog: gateway READY again after ${Math.round((t - notReadySince) / 1000)}s.`);
      notReadySince = null;
      return 'ready';
    }
    if (notReadySince === null) { notReadySince = t; return 'waiting'; }
    if (t - notReadySince > maxNotReadyMs) {
      log(`Watchdog: gateway not READY for ${Math.round((t - notReadySince) / 1000)}s; exiting so the supervisor restarts Piko.`);
      onStuck();
      return 'stuck';
    }
    return 'waiting';
  }
  return {
    check,
    start() { if (!timer) { timer = si(check, checkMs); if (timer && timer.unref) timer.unref(); } },
    stop() { if (timer) { ci(timer); timer = null; } },
  };
}

module.exports = { WATCHDOG, attachGatewayLogging, installProcessHandlers, createWatchdog };
