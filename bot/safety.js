'use strict';
// Local input screening and output sanitising. No network, no logging.
const C = require('./ai-constants');

const ZWSP = '\u200b';

// ---------- input ----------
// Only genuine attempts to extract secrets are refused: a strong secret noun (api key, bot token, .env, credentials,
// private key...) near a reveal verb, or a generic noun (password, token, key, secret) only when it clearly belongs to
// the bot, its owner or the server ("your password", "the bot's token"). Ordinary talk about keys/tokens passes.
const STRONG_NOUN =
  '(?:api[\\s_-]?keys?|apikeys?|access[\\s_-]?tokens?|bot[\\s_-]?tokens?|auth(?:orization)?[\\s_-]?tokens?|secret[\\s_-]?(?:keys?|tokens?)|credentials|private[\\s_-]?keys?|\\.env\\b|env(?:ironment)?[\\s_-]?(?:vars?|variables?|files?)|login details|auth(?:orization)? headers?)';
const OWNED = '(?:your|ur|the\\s+bot\'?s|the\\s+bot|piko\'?s|the\\s+owner\'?s|the\\s+admin\'?s|the\\s+server\'?s|the\\s+discord|the\\s+openrouter|openrouter|discord)';
const GENERIC_NOUN = '(?:passwords?|passcodes?|passphrases?|tokens?|secrets?|keys?|api|credentials?)';
const SECRET_NOUN = `(?:${STRONG_NOUN}|${OWNED}\\s+(?:\\w+\\s+)?${GENERIC_NOUN})`;
const REVEAL_VERB =
  '(?:reveal|show|tell|give|share|print|leak|dump|display|expose|send|output|repeat|echo|paste|spill|what(?:\'s| is| are)|list|disclose|provide|recite|type out)';
const RE_ASK_SECRET = new RegExp(`\\b${REVEAL_VERB}\\b[^.!?\\n]{0,60}${SECRET_NOUN}|${SECRET_NOUN}[^.!?\\n]{0,40}\\b${REVEAL_VERB}\\b`, 'i');
const RE_ASK_HIDDEN = /\b(?:system|hidden|initial|internal|original|developer)\s+(?:prompt|instructions?|message)\b|\byour\s+(?:prompt|instructions)\b|\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier|your|these|the)\b[^.!?\n]{0,30}\b(?:instructions?|rules|safeguards?|guidelines|prompt)\b|\bjailbreak\b|\bdeveloper mode\b|\bbypass\b[^.!?\n]{0,30}\b(?:safeguards?|filters?|restrictions?|safety)\b/i;
const RE_HARM = /\b(?:write|create|build|make|code|generate|develop)\b[^.!?\n]{0,50}\b(?:malware|ransomware|keylogger|trojan|rootkit|botnet|spyware|phishing|credential[\s-]?(?:theft|stealer|harvest\w*)|(?:password|token|cookie|credential)[\s-]?stealer)\b|\bsteal(?:ing)?\b[^.!?\n]{0,30}\b(?:passwords?|credentials?|tokens?|cookies|accounts?)\b|\bhow (?:do i|to|can i)\s+(?:hack\s+(?:into|someone|a person|his|her|their|my ex|an? (?:account|wifi|server|website|facebook|instagram))|phish|ddos|dox|doxx|swat)\b|\b(?:dox|doxx)\b|\bharass(?:ing)?\b[^.!?\n]{0,30}\b(?:someone|people|user|him|her|them)\b/i;
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
const RE_SENSITIVE_PHRASE = /\bmy\s+(?:\w+\s+){0,2}(?:password|passcode|pin|ssn|social security(?: number)?|api[\s_-]?key|token|secret|credit card|card number|iban|home address|phone number)\s*(?:is|:|=)/i;
const RE_TOKENISH = /\bsk-[A-Za-z0-9_-]{10,}|\bghp_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{12,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|\bBearer\s+[A-Za-z0-9._~+\/-]{16,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}/;
const RE_LONG_TOKEN = /(?<![A-Za-z0-9_\/.-])(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/;

function luhn(digits) {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (dbl) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function looksLikeCard(text) {
  const m = text.match(/(?:\d[ -]?){13,19}/g);
  if (!m) return false;
  return m.some((s) => {
    const digits = s.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits);
  });
}

/** @returns {null | {kind: 'secrets'|'sensitive'|'harm'}} */
function checkInput(text) {
  const t = String(text || '');
  if (RE_SENSITIVE_PHRASE.test(t) || RE_EMAIL.test(t) || RE_TOKENISH.test(t) || RE_LONG_TOKEN.test(t) || looksLikeCard(t)) {
    return { kind: 'sensitive' };
  }
  if (RE_ASK_SECRET.test(t) || RE_ASK_HIDDEN.test(t)) return { kind: 'secrets' };
  if (RE_HARM.test(t)) return { kind: 'harm' };
  return null;
}

function refusalFor(kind) {
  if (kind === 'sensitive') return C.MSG.refuseSensitive;
  if (kind === 'harm') return C.MSG.refuseHarm;
  return C.MSG.refuseSecrets;
}

// ---------- output ----------
function redactSecrets(text, secrets = []) {
  let out = String(text);
  for (const s of secrets) {
    if (typeof s === 'string' && s.length >= 8) out = out.split(s).join('[redacted]');
  }
  return out
    .replace(/\bsk-or-[A-Za-z0-9_-]*/gi, '[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}/g, '[redacted]')
    .replace(/\b(?:ghp|gho|ghs|github_pat|xox[abprs])[_-][A-Za-z0-9_-]{16,}/g, '[redacted]')
    .replace(/(?<![A-Za-z0-9_\/.:-])[A-Za-z0-9_+=-]{32,}(?![A-Za-z0-9_\/.-])/g, (m) => (/https?:/i.test(m) ? m : '[redacted]'));
}

function neutralizeMentions(text) {
  return String(text)
    .replace(/@/g, '@' + ZWSP) // @everyone, @here, <@id>, <@&id>, <@!id>
    .replace(/<(?=[#@&!\/:]|a:)/g, '<' + ZWSP); // channels, slash-command and emoji tags
}

function wrapUrls(text) {
  return String(text).replace(/(?<!<)((?:https?:\/\/|www\.)[^\s<>]+)/gi, (m) => {
    const trail = m.match(/[.,;:!?)\]'"*_~]+$/);
    const core = trail ? m.slice(0, m.length - trail[0].length) : m;
    return `<${core}>${trail ? trail[0] : ''}`;
  });
}

/** Remove URLs and Discord invite links entirely (no wrapping), tidying leftover brackets and spaces. */
function stripLinks(text) {
  let t = String(text);
  const tail = "[^\\s<>.,;:!?)\\]'\"*_~]";
  const url = `(?:https?:\\/\\/|www\\.)[^\\s<>]*${tail}`;
  const invite = `(?:discord(?:app)?\\.com\\/invite|discord\\.gg)\\/[^\\s<>]*${tail}`;
  t = t
    .replace(new RegExp(`\\[([^\\]\\n]*)\\]\\(\\s*<?(?:${url}|${invite})>?\\s*\\)`, 'gi'), '$1') // [text](url) -> text
    .replace(new RegExp(`<(?:${url}|${invite})>`, 'gi'), '')
    .replace(new RegExp(url, 'gi'), '')
    .replace(new RegExp(`(?<![\\w@.])${invite}`, 'gi'), '')
    .replace(/\(\s*\)|\[\s*\]|<\s*>/g, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n');
  return t.trim();
}

function cap(text, max) {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  let out = chars.slice(0, max - 1).join('').trimEnd();
  out = out.replace(/<(?:https?:\/\/|www\.)[^>\s]*$/i, '').trimEnd(); // never leave a half-wrapped link
  return out + '\u2026';
}

/** Hard-limit to `max` characters, preferring to end on a sentence boundary (never beyond Discord's limit). */
function capReply(text, max) {
  const limit = Math.min(max, C.LIMITS.discordMaxChars - 200);
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  const head = chars.slice(0, limit).join('');
  let best = -1;
  const re = /[.!?\u2026](?=\s|$)/g;
  let m;
  while ((m = re.exec(head))) best = m.index + 1;
  if (best >= Math.floor(limit * 0.4)) {
    const cut = head.slice(0, best).trimEnd();
    if (!/<(?:https?:\/\/|www\.)[^>\s]*$/i.test(cut)) return cut;
  }
  return cap(text, limit);
}

/** Treat model output as untrusted text; returns a string that is safe to post. */
function sanitizeOutput(raw, secrets = [], maxChars = C.LIMITS.maxOutputChars) {
  let t = typeof raw === 'string' ? raw : '';
  t = redactSecrets(t, secrets);
  t = stripLinks(t); // model output never carries links or invites
  t = t
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/```[A-Za-z0-9_+.-]*[ \t]*\n?/g, '') // no code blocks: plain text only
    .replace(/\]\(/g, '] (') // no masked links: [text](url)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  t = neutralizeMentions(t);
  t = capReply(t, maxChars);
  t = redactSecrets(t, secrets);
  return t.trim() ? t : C.MSG.emptyOutput;
}

/** Remove <think>…</think> blocks (also an unterminated one, and anything before a stray closing tag). */
function stripThink(raw) {
  let t = typeof raw === 'string' ? raw : '';
  t = t.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  const stray = t.search(/<\/think(?:ing)?>/i);
  if (stray !== -1) t = t.slice(t.search(/<\/think(?:ing)?>/i)).replace(/^<\/think(?:ing)?>/i, '');
  t = t.replace(/<think(?:ing)?>[\s\S]*$/i, '');
  return t.trim();
}

const GUARD_MODEL = /safety|guard|moderation|classif/i;
const CLASSIFIER_LINE = /^\s*(?:User|Response)\s+Safety\s*:|^\s*Safety\s+Categories\s*:/im;
// A bare verdict such as "safe", "unsafe\nS1,S5", "Safe." with no other prose.
const BARE_VERDICT = /^\s*(?:safe|unsafe)\.?(?:\s*[\n,;]\s*(?:S\d{1,2}|[A-Za-z ]{1,30}:\s*\w+))*\s*$/i;
// A JSON object that only carries safety labels.
const LABEL_JSON = /^\s*\{\s*"(?:user[ _]?safety|response[ _]?safety|safety|safe|label|categories|category|violation|verdict)"[\s\S]*\}\s*$/i;

/**
 * Decide whether a model reply may be posted. Returns { usable: true, text } or
 * { usable: false, reason: 'empty' | 'guard' | 'classifier' } (reason codes only, never content).
 */
function assessReply(raw, model) {
  if (typeof model === 'string' && GUARD_MODEL.test(model)) return { usable: false, reason: 'guard' };
  const text = stripThink(raw);
  if (!text.replace(/[\s\u200b-\u200d\u2060\ufeff]/g, '')) return { usable: false, reason: 'empty' };
  if (CLASSIFIER_LINE.test(text) || BARE_VERDICT.test(text) || LABEL_JSON.test(text)) return { usable: false, reason: 'classifier' };
  return { usable: true, text };
}

module.exports = { stripLinks, stripThink, assessReply, checkInput, refusalFor, sanitizeOutput, redactSecrets, neutralizeMentions, wrapUrls, cap, ZWSP };
