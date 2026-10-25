'use strict';
// In-memory conversation context, one list per Discord user id. Never written to disk.
const C = require('./ai-constants');

function createContextStore({ now = Date.now, max = C.LIMITS.contextMessages, idleMs = C.LIMITS.contextIdleMs } = {}) {
  const map = new Map(); // userId -> { messages: [{role, content}], last: ms }
  let version = 0; // bumped by forget/clearAll so in-flight replies can detect an erase

  function fresh(entry) {
    return entry && now() - entry.last < idleMs;
  }

  return {
    /** A copy of this user's messages (empty if none or idle for over an hour). */
    get(userId) {
      const e = map.get(userId);
      if (!fresh(e)) {
        if (e) map.delete(userId);
        return [];
      }
      return e.messages.map((m) => ({ role: m.role, content: m.content }));
    },
    /** Store one completed turn (user + assistant) and keep only the last `max` messages. */
    appendTurn(userId, userText, assistantText) {
      const e = fresh(map.get(userId)) ? map.get(userId) : { messages: [], last: 0 };
      e.messages.push({ role: 'user', content: userText }, { role: 'assistant', content: assistantText });
      if (e.messages.length > max) e.messages = e.messages.slice(-max);
      e.last = now();
      map.set(userId, e);
    },
    forget(userId) {
      version++;
      return map.delete(userId);
    },
    clearAll() {
      version++;
      map.clear();
    },
    sweep() {
      for (const [k, e] of map) if (!fresh(e)) map.delete(k);
    },
    size: () => map.size,
    version: () => version,
  };
}

module.exports = { createContextStore };
