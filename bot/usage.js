'use strict';
// Global daily request counter, persisted as counts only (no users, no content) in run/usage.json.
const fs = require('node:fs');
const path = require('node:path');
const C = require('./ai-constants');

/** Calendar day (YYYY-MM-DD) in Asia/Manila (UTC+8, no DST). */
function dayKey(ms) {
  return new Date(ms + C.TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function createUsage({ runDir, now = Date.now, limit = C.LIMITS.globalPerDay, log = () => {} }) {
  const file = path.join(runDir, 'usage.json');
  let state = { date: dayKey(now()), count: 0, perDay: {} };

  try {
    if (fs.existsSync(file)) {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!j || typeof j.date !== 'string' || !Number.isInteger(j.count) || j.count < 0) throw new Error('bad shape');
      state = { date: j.date, count: j.count, perDay: j.perDay && typeof j.perDay === 'object' ? j.perDay : {} };
    }
  } catch (_) {
    // Unreadable counter: fail closed for today so a corrupt file can never raise the limit.
    log('usage file unreadable; treating today as fully used');
    state = { date: dayKey(now()), count: limit, perDay: {} };
  }

  function roll() {
    const today = dayKey(now());
    if (state.date !== today) {
      state.perDay[state.date] = state.count;
      const keys = Object.keys(state.perDay).sort().slice(-30);
      state.perDay = Object.fromEntries(keys.map((k) => [k, state.perDay[k]]));
      state.date = today;
      state.count = 0;
      save();
    }
  }

  function save() {
    try {
      fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
      writeJsonAtomic(file, { date: state.date, count: state.count, perDay: { ...state.perDay, [state.date]: state.count } });
    } catch (_) {
      log('could not persist usage counter');
    }
  }

  return {
    count() { roll(); return state.count; },
    limit,
    reached() { roll(); return state.count >= limit; },
    /** Reserve one request. Returns false (and counts nothing) if the daily limit is used up. */
    reserve() {
      roll();
      if (state.count >= limit) return false;
      state.count++;
      save();
      return true;
    },
    /** Give back a reservation that never produced an outbound request. */
    release() {
      roll();
      if (state.count > 0) { state.count--; save(); }
    },
    date() { roll(); return state.date; },
  };
}

module.exports = { createUsage, dayKey, writeJsonAtomic };
