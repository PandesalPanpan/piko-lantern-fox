'use strict';
// Controlled AI conversation (triggered by @mentions): demo sessions, limits, context, safety. Discord-agnostic (adapters: ai-discord.js, message-handler.js).
// Logging policy: counts, timestamps, latency, success/failure and the returned model id ONLY.
const fs = require('node:fs');
const path = require('node:path');
const C = require('./ai-constants');
const { LIMITS, MSG } = C;
const { requestCompletion } = require('./openrouter');
const { checkInput, refusalFor, sanitizeOutput } = require('./safety');
const { createContextStore } = require('./context-store');
const { createUsage, writeJsonAtomic } = require('./usage');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** e.g. "Sun, Oct 25, 6:31 PM UTC+8 (Asia/Manila)" */
function formatManila(ms) {
  const d = new Date(ms + C.TZ_OFFSET_MS);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${h12}:${mm} ${h < 12 ? 'AM' : 'PM'} ${C.TIME_ZONE_LABEL}`;
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

const payload = (content, ephemeral = false) => ({ content, ephemeral, allowedMentions: { parse: [] } });

function createAiService(opts = {}) {
  const {
    apiKey = '',
    ownerId = '',
    discordToken = '',
    runDir,
    now = Date.now,
    fetchImpl = globalThis.fetch,
    log = () => {},
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    timeoutMs = C.REQUEST_TIMEOUT_MS,
    retryDelayMs = C.RETRY_DELAY_MS,
    timers = { setTimeout, clearTimeout, setInterval, clearInterval },
  } = opts;
  if (!runDir) throw new Error('runDir is required');

  const secrets = [discordToken, apiKey].filter(Boolean);
  const demoFile = path.join(runDir, 'demo.json');
  const killFile = path.join(runDir, 'ai-disabled');
  const store = createContextStore({ now });
  const usage = createUsage({ runDir, now, log });

  let demo = null; // { start, end, id }
  let demoSeq = 0;
  let expiryTimer = null;
  let sweepTimer = null;
  let keyRejected = false; // 401/403 or unusable key: AI stays off until restart
  let paymentStop = false; // 402: AI stays off until restart
  const sessionCounts = new Map(); // userId -> requests this demo session
  const windows = new Map(); // userId -> [timestamps] (sliding 60 s window)
  const inflight = new Set(); // userIds with a request in progress
  const seen = new Map(); // message id -> ms (dedupe)
  const introduced = new Set(); // members who already saw the privacy reminder this session

  const hasKey = () => typeof apiKey === 'string' && apiKey.trim().length > 0;
  const killSwitchOn = () => { try { return fs.existsSync(killFile); } catch (_) { return true; } };
  const isOwner = (userId) => !!ownerId && String(userId) === String(ownerId);

  /** Why AI cannot run at all (independent of demo state), or null. */
  function hardBlock() {
    if (killSwitchOn()) return 'kill-switch';
    if (!hasKey()) return 'no-key';
    if (keyRejected) return 'key-rejected';
    if (paymentStop) return 'payment-stop';
    return null;
  }

  // ---------- demo session ----------
  function clearDemoFile() { try { fs.unlinkSync(demoFile); } catch (_) { /* none */ } }

  function endDemo(reason) {
    const was = demo;
    demo = null;
    if (expiryTimer) { timers.clearTimeout(expiryTimer); expiryTimer = null; }
    sessionCounts.clear();
    windows.clear();
    introduced.clear();
    store.clearAll();
    clearDemoFile();
    if (was) log(`ai demo ended reason=${reason} ended_at=${new Date(now()).toISOString()}`);
  }

  function armExpiry() {
    if (expiryTimer) timers.clearTimeout(expiryTimer);
    const ms = Math.max(0, demo.end - now());
    expiryTimer = timers.setTimeout(() => { expiryTimer = null; tick(); }, ms);
    if (expiryTimer && expiryTimer.unref) expiryTimer.unref();
  }

  function beginDemo(startMs, endMs) {
    demo = { start: startMs, end: endMs, id: ++demoSeq };
    sessionCounts.clear();
    windows.clear();
    introduced.clear();
    store.clearAll();
    try {
      fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
      writeJsonAtomic(demoFile, { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() });
    } catch (_) { log('could not persist demo window'); }
    armExpiry();
  }

  /** Expiry check + housekeeping. Called by timers and lazily on every /chat. */
  function tick() {
    const t = now();
    if (demo && t >= demo.end) endDemo('expired');
    store.sweep();
    for (const [u, arr] of windows) {
      const kept = arr.filter((x) => t - x < LIMITS.windowMs);
      if (kept.length) windows.set(u, kept); else windows.delete(u);
    }
    for (const [k, ts] of seen) if (t - ts > 15 * 60 * 1000) seen.delete(k);
  }

  function demoActive() { tick(); return !!demo; }

  /** Restore a still-valid session after a restart (demo.json holds only ISO start/end). */
  function restore() {
    try {
      if (!fs.existsSync(demoFile)) return false;
      const j = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
      const s = Date.parse(j.start);
      const e = Date.parse(j.end);
      const t = now();
      const sane = Number.isFinite(s) && Number.isFinite(e) && e > s && e - s <= LIMITS.sessionMs + 1000 && s <= t + 1000;
      if (sane && e > t && hasKey() && !killSwitchOn()) {
        beginDemo(s, e);
        log(`ai demo restored end=${new Date(e).toISOString()}`);
        return true;
      }
    } catch (_) { /* fall through */ }
    clearDemoFile();
    return false;
  }

  function start() {
    restore();
    if (!sweepTimer) {
      sweepTimer = timers.setInterval(tick, 5 * 60 * 1000);
      if (sweepTimer && sweepTimer.unref) sweepTimer.unref();
    }
  }

  function shutdown() {
    if (expiryTimer) timers.clearTimeout(expiryTimer);
    if (sweepTimer) timers.clearInterval(sweepTimer);
    expiryTimer = sweepTimer = null;
  }

  // ---------- commands ----------
  function demoStart(userId) {
    if (!isOwner(userId)) return payload(MSG.ownerOnly, true);
    if (demoActive()) {
      return payload(`My lantern is already lit! About ${formatRemaining(demo.end - now())} left, until ${formatManila(demo.end)}.`, true);
    }
    const block = hardBlock();
    if (block === 'kill-switch') return payload("AI chat can't start: the AI kill switch (run/ai-disabled) is on.", true);
    if (block) return payload("AI chat can't start right now. The lantern isn't set up for it.", true);
    if (usage.reached()) return payload("AI chat can't start: today's free allowance is used up. Try again after midnight (Asia/Manila).", true);

    const startMs = now();
    const endMs = startMs + LIMITS.sessionMs;
    beginDemo(startMs, endMs);
    log(`ai demo started start=${new Date(startMs).toISOString()} end=${new Date(endMs).toISOString()}`);
    const epoch = Math.floor(endMs / 1000);
    return payload(
      `My AI lantern is lit! Mention me in a server message with your question until ${formatManila(endMs)} (<t:${epoch}:t>, <t:${epoch}:R>).\n\n` +
        `Limits: ${LIMITS.perUserPerMinute} chats per person per minute, ${LIMITS.perUserPerSession} per person this session, ${LIMITS.globalPerDay} per day for everyone. ` +
        `I only remember your last ${LIMITS.contextMessages} messages, in memory, and **/forget** wipes them.\n` +
        MSG.privacy,
      false
    );
  }

  function demoStop(userId) {
    if (!isOwner(userId)) return payload(MSG.ownerOnly, true);
    const wasActive = demoActive();
    endDemo('stopped');
    store.clearAll();
    return payload(
      wasActive
        ? 'The AI lantern is tucked away. All chat memories are cleared. My other commands still work!'
        : 'The AI lantern was already resting. I cleared any chat memories anyway, and my other commands still work!',
      false
    );
  }

  function forget(userId) {
    store.forget(String(userId));
    return payload(MSG.forget, true);
  }

  // ---------- limits ----------
  /** Atomically check and count one outbound attempt. */
  function reserve(userId) {
    const t = now();
    const arr = (windows.get(userId) || []).filter((x) => t - x < LIMITS.windowMs);
    if (arr.length >= LIMITS.perUserPerMinute) return { ok: false, reason: 'minute' };
    if ((sessionCounts.get(userId) || 0) >= LIMITS.perUserPerSession) return { ok: false, reason: 'session' };
    if (!usage.reserve()) return { ok: false, reason: 'daily' };
    arr.push(t);
    windows.set(userId, arr);
    sessionCounts.set(userId, (sessionCounts.get(userId) || 0) + 1);
    return { ok: true };
  }

  function release(userId) {
    const arr = windows.get(userId);
    if (arr && arr.length) arr.pop();
    const n = sessionCounts.get(userId) || 0;
    if (n > 0) sessionCounts.set(userId, n - 1);
    usage.release();
  }

  // Would one more attempt (the retry) be allowed right now? (non-consuming)
  function canReserve(userId) {
    const t = now();
    const arr = (windows.get(userId) || []).filter((x) => t - x < LIMITS.windowMs);
    return arr.length < LIMITS.perUserPerMinute && (sessionCounts.get(userId) || 0) < LIMITS.perUserPerSession && !usage.reached();
  }

  const limitMessage = (reason) => (reason === 'minute' ? MSG.minute : reason === 'session' ? MSG.session : MSG.dailyLimit);

  function haltFor(category) {
    if (category === 'auth' || category === 'bad-headers') {
      keyRejected = true;
      log('ai disabled until restart: OpenRouter key was rejected (auth error)');
    } else if (category === 'payment') {
      paymentStop = true;
      log('ai disabled until restart: OpenRouter reported payment required (402); no retry');
    } else return;
    store.clearAll();
  }

  function logAttempt(r, attempt) {
    const model = r.ok ? ` model=${r.model || 'unknown'}` : '';
    const outcome = r.ok ? 'success' : `failure category=${r.category} status=${r.status}`;
    log(`ai request attempt=${attempt} ${outcome} latency=${r.latencyMs}ms${model} today=${usage.count()}/${usage.limit}`);
    if (r.ok && r.model && !/:free$/.test(r.model) && r.model !== C.MODEL) {
      log('ai note: returned model id is not tagged :free');
    }
  }

  // ---------- mention-triggered conversation ----------
  /**
   * io: { messageId, userId, text (Piko mention tokens already stripped), reply(payload), startTyping?() -> stop() }
   * Every outcome is a reply to the member's own message; nothing here knows about Discord objects.
   */
  const DAILY_NOTICE_MS = 10 * 60 * 1000;
  const COOL_NOTICE_MS = 60 * 1000;
  let dailyNoticeAt = null;
  const coolNoticeAt = new Map();
  /** Dedicated channel: at most one cool-down notice per member per 60 s. */
  function coolNoticeDue(userId) {
    const t = now();
    for (const [k, v] of coolNoticeAt) if (t - v >= COOL_NOTICE_MS) coolNoticeAt.delete(k);
    if (coolNoticeAt.has(userId)) return false;
    coolNoticeAt.set(userId, t);
    return true;
  }

  async function converse(io) {
    const { messageId, reply } = io;
    const userId = String(io.userId);
    tick();

    if (messageId != null) {
      if (seen.has(messageId)) return { skipped: 'duplicate' };
      seen.set(messageId, now());
    }

    const text = typeof io.text === 'string' ? io.text.trim() : '';
    // `quiet` = an unmentioned message in the dedicated channel: stay silent unless a short notice is due.
    const quiet = io.quiet === true;
    if (!text) return quiet ? undefined : reply(payload(MSG.greeting));

    if (hardBlock() || !demo) return quiet ? undefined : reply(payload(MSG.disabled));
    if (usage.reached()) {
      if (!quiet) return reply(payload(MSG.disabled));
      if (dailyNoticeAt !== null && now() - dailyNoticeAt < DAILY_NOTICE_MS) return undefined;
      dailyNoticeAt = now();
      return reply(payload(MSG.disabled));
    }

    if (text.length > LIMITS.maxInputChars) {
      return reply(payload(`That's a lot for my little lantern. Please keep it under ${LIMITS.maxInputChars} characters.`));
    }

    const refusal = checkInput(text);
    if (refusal) return reply(payload(refusalFor(refusal.kind))); // no fetch, no quota, not stored

    if (inflight.has(userId)) return quiet ? undefined : reply(payload(MSG.busy));
    inflight.add(userId);
    const sessionId = demo.id;
    const versionAtStart = store.version();
    let stopTyping = () => {};
    try {
      const first = reserve(userId);
      if (!first.ok) {
        if (quiet && !coolNoticeDue(userId)) return undefined;
        return await reply(payload(limitMessage(first.reason)));
      }
      try { if (io.startTyping) stopTyping = io.startTyping() || stopTyping; } catch (_) { /* best effort */ }

      const history = store.get(userId);
      const convo = [...history, { role: 'user', content: text }].slice(-LIMITS.contextMessages);
      while (convo.length && convo[0].role !== 'user') convo.shift();
      const messages = [{ role: 'system', content: C.SYSTEM_PROMPT }, ...convo];

      let result = await requestCompletion({ fetchImpl, apiKey, messages, timeoutMs, now });
      if (result.notSent) release(userId);
      logAttempt(result, 1);

      if (!result.ok && result.transient && !result.notSent) {
        // At most ONE automatic retry, only for network/timeout/5xx, and only if limits still allow it.
        if (canReserve(userId) && reserve(userId).ok) {
          await sleep(retryDelayMs);
          result = await requestCompletion({ fetchImpl, apiKey, messages, timeoutMs, now });
          if (result.notSent) release(userId);
          logAttempt(result, 2);
        }
      }

      if (!result.ok) {
        haltFor(result.category);
        return await reply(payload(MSG.unavailable));
      }

      // The session may have ended (or the member may have run /forget) while we waited.
      if (!demo || demo.id !== sessionId) return await reply(payload(MSG.disabled));

      const clean = sanitizeOutput(result.text, secrets);
      if (store.version() === versionAtStart) store.appendTurn(userId, text, clean);
      let out = clean;
      if (!introduced.has(userId)) {
        introduced.add(userId);
        out += `\n-# ${MSG.privacy}`;
      }
      return await reply(payload(out));
    } catch (_) {
      log('ai conversation handler error (details withheld)');
      try { await reply(payload(MSG.unavailable)); } catch (_2) { /* nothing more to do */ }
      return { error: true };
    } finally {
      try { stopTyping(); } catch (_) { /* ignore */ }
      inflight.delete(userId);
    }
  }

  /** Non-secret snapshot (used by tests and diagnostics). */
  function status() {
    tick();
    return {
      keyConfigured: hasKey(),
      killSwitch: killSwitchOn(),
      keyRejected,
      paymentStop,
      demoActive: !!demo,
      demoStart: demo ? new Date(demo.start).toISOString() : null,
      demoEnd: demo ? new Date(demo.end).toISOString() : null,
      todayCount: usage.count(),
      dailyLimit: usage.limit,
      contexts: store.size(),
    };
  }

  return { converse, demoStart, demoStop, forget, start, shutdown, restore, tick, status, isOwner, formatManila, _store: store };
}

module.exports = { createAiService, formatManila, formatRemaining };
