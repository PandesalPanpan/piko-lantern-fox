'use strict';
// Shared test harness: fake clock, mocked fetch, fake timers, captured logs, temp run dir.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAiService } = require('../ai-service');

// Fake credentials are assembled at runtime so no secret-shaped literal lives in the repo.
const FAKE_KEY = ['sk', 'or', 'v1', 'testkey' + '0123456789abcdef'].join('-');
const FAKE_DISCORD_TOKEN = ['A'.repeat(24), 'B'.repeat(6), 'C'.repeat(30)].join('.');
const OWNER = '1000000000000000001';
const BOT_ID = '2000000000000000002';
const GUILD = '3000000000000000003';

const ok = (text, model = 'vendor/some-model:free') => ({
  ok: true,
  status: 200,
  json: async () => ({ model, choices: [{ message: { content: text } }] }),
});
/** Full-control 200 response: content/reasoning/finish_reason/usage variants. */
const okRaw = ({ content = null, reasoning, model = 'vendor/some-model:free', finish = 'stop', usage } = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({
    model,
    choices: [{ finish_reason: finish, message: { role: 'assistant', content, ...(reasoning !== undefined ? { reasoning } : {}) } }],
    ...(usage ? { usage } : {}),
  }),
});
const err = (status) => ({ ok: false, status, body: null, json: async () => ({ error: { message: 'hidden detail' } }) });

function makeEnv(overrides = {}) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piko-test-'));
  const clock = { t: Date.parse('2026-10-25T10:00:00Z') }; // 18:00 in Asia/Manila
  const logs = [];
  const calls = [];
  const env = { clock, logs, calls, runDir, queue: [], handler: null, timers: [] };

  env.fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    if (env.handler) return env.handler(calls.length, body, init);
    const next = env.queue.length ? env.queue.shift() : ok('A tiny reply from the lantern.');
    if (next instanceof Error) throw next;
    return next;
  };
  const timers = {
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false, unref() {} }; env.timers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cleared = true; },
    setInterval: (fn, ms) => ({ fn, ms, unref() {} }),
    clearInterval: () => {},
  };
  env.make = (extra = {}) =>
    createAiService({
      apiKey: FAKE_KEY,
      ownerId: OWNER,
      discordToken: FAKE_DISCORD_TOKEN,
      runDir,
      now: () => clock.t,
      fetchImpl: env.fetchImpl,
      log: (m) => logs.push(String(m)),
      sleep: async () => {},
      timers,
      ...overrides,
      ...extra,
    });
  env.ai = env.make();
  env.advance = (ms) => { clock.t += ms; };
  env.startDemo = (svc = env.ai) => svc.demoStart(OWNER);

  let n = 0;
  /** Send one mention-style message; returns the replies recorded. */
  env.say = async (userId, text, svc = env.ai, id) => {
    const replies = [];
    await svc.converse({ messageId: id || `m${++n}`, userId, text, reply: async (p) => { replies.push(p); } });
    return replies;
  };
  return env;
}

module.exports = { makeEnv, ok, okRaw, err, FAKE_KEY, FAKE_DISCORD_TOKEN, OWNER, BOT_ID, GUILD };
