'use strict';
// Prints NON-SECRET AI state only. Usage: node bot/ai-status.js   (or: cd bot && node ai-status.js)
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const { dayKey } = require('./usage');
const { LIMITS, TIME_ZONE_LABEL } = require('./ai-constants');
const { formatManila } = require('./ai-service');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

const run = path.join(root, 'run');
const env = process.env;
const now = Date.now();
const yes = (b) => (b ? 'yes' : 'no');

const demo = readJson(path.join(run, 'demo.json'));
const endMs = demo ? Date.parse(demo.end) : NaN;
const active = Number.isFinite(endMs) && endMs > now;
const usage = readJson(path.join(run, 'usage.json'));
const today = dayKey(now);
const count = usage && usage.date === today && Number.isInteger(usage.count) ? usage.count : 0;

console.log('Piko AI status (no secrets shown)');
console.log(`  OPENROUTER_API_KEY configured : ${yes((env.OPENROUTER_API_KEY || '').trim())}`);
console.log(`  OWNER_DISCORD_USER_ID set     : ${yes((env.OWNER_DISCORD_USER_ID || '').trim())}`);
console.log(`  Chat channel(s) configured    : ${yes(((env.PIKO_CHAT_CHANNEL_IDS || '') + (env.PIKO_CHAT_CHANNEL_ID || '')).trim())} (no-mention channel mode)`);
console.log(`  Kill switch (run/ai-disabled) : ${fs.existsSync(path.join(run, 'ai-disabled')) ? 'ON (AI disabled)' : 'off'}`);
console.log(`  Demo session active           : ${yes(active)}`);
if (active) console.log(`  Demo expires                  : ${formatManila(endMs)}`);
console.log(`  Requests today (${today}, ${TIME_ZONE_LABEL}) : ${count} / ${LIMITS.globalPerDay}`);
console.log(`  Per-user limits               : ${LIMITS.perUserPerMinute}/minute, ${LIMITS.perUserPerSession}/session`);
console.log('  Model                         : openrouter/free (fixed)');
