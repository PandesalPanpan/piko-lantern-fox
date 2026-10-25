'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../ai-constants');
const { buildHeaders, buildBody, requestCompletion } = require('../openrouter');
const { makeEnv, ok, err, FAKE_KEY } = require('./_helpers');

test('model is exactly the openrouter/free constant', () => {
  assert.equal(C.MODEL, 'openrouter/free');
  assert.equal(C.BASE_URL, 'https://openrouter.ai/api/v1');
  assert.equal(C.ENDPOINT, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(C.MAX_TOKENS, 400);
  assert.equal(C.REQUEST_TIMEOUT_MS, 30000);
  assert.equal(C.LIMITS.maxOutputChars, 900);
  assert.deepEqual(
    [C.LIMITS.perUserPerMinute, C.LIMITS.perUserPerSession, C.LIMITS.globalPerDay, C.LIMITS.contextMessages, C.LIMITS.maxInputChars],
    [6, 40, 45, 12, 1000]
  );
  assert.match(C.SYSTEM_PROMPT, /1-3 short sentences/);
});

test('request body: one fixed model, no fallback list, no tools, no streaming', async () => {
  const env = makeEnv();
  env.startDemo();
  await env.say('u1', 'Tell me about your lantern');
  assert.equal(env.calls.length, 1);
  const { body, url, init } = env.calls[0];
  assert.equal(url, C.ENDPOINT);
  assert.equal(init.method, 'POST');
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'reasoning', 'stream', 'temperature']);
  assert.equal(body.model, 'openrouter/free');
  assert.equal('models' in body, false);
  assert.equal('tools' in body, false);
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 400);
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal('provider' in body, false);
  assert.ok(Math.abs(body.temperature - 0.8) < 0.2);
  assert.equal(JSON.stringify(body).match(/"model"/g).length, 1);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /You are Piko, the Lantern Fox/);
  assert.equal(init.redirect, 'error');
});

test('request carries no secrets or internal details', async () => {
  const env = makeEnv();
  env.startDemo();
  await env.say('u1', 'hello there');
  const body = JSON.stringify(env.calls[0].body);
  assert.ok(!body.includes(FAKE_KEY));
  assert.ok(!/OWNER|DISCORD_TOKEN|OPENROUTER/.test(body));
  assert.ok(!body.includes('u1'));
});

test('headers: referer, bearer, ASCII title fallback when the em dash is not a valid ByteString', () => {
  // Real Node fetch rejects the em dash in a header value:
  assert.throws(() => new Headers({ 'X-Title': C.TITLE }), TypeError);
  const h = buildHeaders(FAKE_KEY);
  assert.equal(h['X-Title'], 'Piko - The Lantern Fox');
  assert.equal(h['HTTP-Referer'], 'https://pandesalpanpan.github.io/piko-lantern-fox/');
  assert.equal(h.Authorization, `Bearer ${FAKE_KEY}`);
  assert.doesNotThrow(() => new Headers(h));
  // When the runtime accepts the em dash, the original title is used.
  const permissive = buildHeaders(FAKE_KEY, class { constructor() {} });
  assert.equal(permissive['X-Title'], 'Piko \u2014 The Lantern Fox');
});

test('an invalid key format does not crash and sends nothing', async () => {
  let called = false;
  const r = await requestCompletion({ fetchImpl: async () => { called = true; }, apiKey: 'bad\u2014key', messages: [] });
  assert.equal(r.ok, false);
  assert.equal(r.notSent, true);
  assert.equal(called, false);
});

test('a real fetch-style validation of the headers passes (request never fails on the title)', async () => {
  let seen;
  const r = await requestCompletion({
    fetchImpl: async (u, init) => { new Headers(init.headers); seen = init.headers; return ok('hi'); },
    apiKey: FAKE_KEY,
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.equal(r.ok, true);
  assert.equal(seen['X-Title'], 'Piko - The Lantern Fox');
  assert.equal(r.model, 'vendor/some-model:free');
});

test('timeout aborts a hung request and is reported as transient', async () => {
  const r = await requestCompletion({
    fetchImpl: (u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    apiKey: FAKE_KEY,
    messages: [],
    timeoutMs: 20,
  });
  assert.equal(r.ok, false);
  assert.equal(r.category, 'timeout');
  assert.equal(r.transient, true);
});

test('status classification', async () => {
  for (const [status, category, transient] of [[401, 'auth', false], [403, 'auth', false], [402, 'payment', false], [429, 'rate', false], [500, 'server', true], [503, 'server', true], [404, 'other', false]]) {
    const r = await requestCompletion({ fetchImpl: async () => err(status), apiKey: FAKE_KEY, messages: [] });
    assert.equal(r.category, category);
    assert.equal(r.transient, transient);
  }
});

test('buildBody never includes extra model fields', () => {
  const b = buildBody([{ role: 'user', content: 'x' }]);
  assert.equal(b.model, 'openrouter/free');
  assert.equal(b.models, undefined);
});

test('requestCompletion reports reasoning only as a boolean and never uses it as text', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: 'vendor/reasoner:free',
      choices: [{ finish_reason: 'length', message: { content: null, reasoning: 'secret thoughts' } }],
      usage: { prompt_tokens: 50, completion_tokens: 180, total_tokens: 230, completion_tokens_details: { reasoning_tokens: 180 } },
    }),
  });
  const r = await requestCompletion({ fetchImpl, apiKey: FAKE_KEY, messages: [{ role: 'user', content: 'hi' }], timeoutMs: 1000, now: Date.now });
  assert.equal(r.ok, true);
  assert.equal(r.text, '');
  assert.equal(r.hasReasoning, true);
  assert.equal(r.finishReason, 'length');
  assert.deepEqual(r.usage, { prompt: 50, completion: 180, total: 230, reasoning: 180 });
  assert.ok(!JSON.stringify(r).includes('secret thoughts'));
});

test('an abort while the response body is still arriving is reported as a transient timeout', async () => {
  const fetchImpl = async (url, init) => ({
    ok: true,
    status: 200,
    json: () => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
  });
  const r = await requestCompletion({ fetchImpl, apiKey: FAKE_KEY, messages: [{ role: 'user', content: 'hi' }], timeoutMs: 20, now: Date.now });
  assert.equal(r.ok, false);
  assert.equal(r.category, 'timeout');
  assert.equal(r.transient, true);
});
