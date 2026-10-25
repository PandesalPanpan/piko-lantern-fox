'use strict';
// Minimal OpenRouter client. Free router only: the model is the constant MODEL.
// Never logs or returns request/response contents; callers get a small result object.
const C = require('./ai-constants');

/** Build request headers. The title falls back to ASCII if the em dash is not a valid header ByteString. */
function buildHeaders(apiKey, HeadersImpl = globalThis.Headers) {
  const make = (title) => ({
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': C.REFERER,
    'X-Title': title,
  });
  for (const title of [C.TITLE, C.TITLE_ASCII]) {
    const h = make(title);
    try {
      new HeadersImpl(h); // throws TypeError when a value is not a valid ByteString
      return h;
    } catch (_) {
      /* try the next (ASCII) title */
    }
  }
  const err = new Error('Request headers could not be built (check the configured key format).');
  err.code = 'BAD_HEADERS';
  throw err;
}

/** The exact JSON body. One fixed model, no `models` array, no tools, no streaming. */
function buildBody(messages) {
  return {
    model: C.MODEL,
    messages,
    max_tokens: C.MAX_TOKENS,
    temperature: C.TEMPERATURE,
    reasoning: { ...C.REASONING },
    stream: false,
  };
}

function categorize(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'payment';
  if (status === 429) return 'rate';
  if (status >= 500) return 'server';
  return 'other';
}

function safeModelId(m) {
  return typeof m === 'string' && /^[A-Za-z0-9._:\/-]{1,100}$/.test(m) ? m : null;
}

/**
 * One outbound request attempt. Resolves (never rejects) with:
 *  { ok: true, text, model, status, latencyMs }
 *  { ok: false, category: 'auth'|'payment'|'rate'|'server'|'network'|'timeout'|'other'|'bad-response',
 *    transient: boolean, status, latencyMs }
 */
async function requestCompletion({ fetchImpl = globalThis.fetch, apiKey, messages, timeoutMs = C.REQUEST_TIMEOUT_MS, now = Date.now }) {
  const started = now();
  const lat = () => Math.max(0, now() - started);
  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ac.abort(); }, timeoutMs);
  try {
    const headers = buildHeaders(apiKey);
    const res = await fetchImpl(C.ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildBody(messages)),
      signal: ac.signal,
      redirect: 'error',
    });
    const status = res.status;
    if (!res.ok) {
      const category = categorize(status);
      try { if (res.body && res.body.cancel) res.body.cancel(); } catch (_) { /* ignore */ }
      return { ok: false, category, transient: category === 'server', status, latencyMs: lat() };
    }
    let data;
    try { data = await res.json(); } catch (_) {
      // An abort while the body was still arriving is a timeout (transient), not a malformed response.
      if (timedOut) return { ok: false, category: 'timeout', transient: true, status: 0, latencyMs: lat() };
      return { ok: false, category: 'bad-response', transient: false, status, latencyMs: lat() };
    }
    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const msg = choice && choice.message ? choice.message : null;
    // ONLY `content` is ever used as reply text. `reasoning` / `reasoning_content` / `reasoning_details` are
    // never read into the text (their presence is reported as a boolean for diagnostics).
    let text = '';
    if (msg && typeof msg.content === 'string') text = msg.content;
    else if (msg && Array.isArray(msg.content)) text = msg.content.filter((p) => p && p.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('');
    if (data && data.error && !text) {
      return { ok: false, category: 'other', transient: false, status, latencyMs: lat() };
    }
    const u = data && data.usage && typeof data.usage === 'object' ? data.usage : {};
    const num = (v) => (Number.isFinite(v) ? v : null);
    const details = u.completion_tokens_details && typeof u.completion_tokens_details === 'object' ? u.completion_tokens_details : {};
    return {
      ok: true,
      text,
      model: safeModelId(data && data.model),
      status,
      latencyMs: lat(),
      finishReason: choice && typeof choice.finish_reason === 'string' && /^[a-z_]{1,30}$/.test(choice.finish_reason) ? choice.finish_reason : null,
      hasReasoning: !!(msg && (msg.reasoning || msg.reasoning_content || (Array.isArray(msg.reasoning_details) && msg.reasoning_details.length))),
      usage: { prompt: num(u.prompt_tokens), completion: num(u.completion_tokens), total: num(u.total_tokens), reasoning: num(details.reasoning_tokens) },
    };
  } catch (err) {
    if (err && err.code === 'BAD_HEADERS') {
      return { ok: false, category: 'bad-headers', transient: false, status: 0, latencyMs: lat(), notSent: true };
    }
    return { ok: false, category: timedOut ? 'timeout' : 'network', transient: true, status: 0, latencyMs: lat() };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { buildHeaders, buildBody, requestCompletion, categorize };
