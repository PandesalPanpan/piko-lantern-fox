'use strict';
const path = require('node:path');
const dotenv = require('dotenv');

// Load /workspace/piko/.env (one level above bot/). Values already in the real environment win.
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const SNOWFLAKE = /^\d{15,25}$/;

/**
 * Read and validate configuration. Throws an Error that names the missing/invalid
 * variable but NEVER includes any value.
 */
function loadConfig({ requireToken = true, requireGuild = true } = {}) {
  const env = process.env;
  const problems = [];

  const token = (env.DISCORD_TOKEN || '').trim();
  const clientId = (env.DISCORD_CLIENT_ID || '').trim();
  const guildId = (env.DISCORD_GUILD_ID || '').trim();

  if (requireToken && !token) problems.push('DISCORD_TOKEN is missing');
  if (!clientId) problems.push('DISCORD_CLIENT_ID is missing');
  else if (!SNOWFLAKE.test(clientId)) problems.push('DISCORD_CLIENT_ID does not look like a Discord ID');
  if (requireGuild && !guildId) problems.push('DISCORD_GUILD_ID is missing');
  else if (guildId && !SNOWFLAKE.test(guildId)) problems.push('DISCORD_GUILD_ID does not look like a Discord ID');

  if (problems.length) {
    const err = new Error(
      'Configuration problem: ' + problems.join('; ') +
        '. Set these in /workspace/piko/.env (see .env.example).'
    );
    err.isConfigError = true;
    throw err;
  }

  // PAGE_URL is optional; only accept plain http(s) links.
  let pageUrl = (env.PAGE_URL || '').trim();
  if (pageUrl && !/^https?:\/\/[^\s]+$/i.test(pageUrl)) pageUrl = '';

  return { token, clientId, guildId, pageUrl };
}

/** Remove the token from any text before it is logged. */
function redact(text, token) {
  let out = String(text);
  if (token) out = out.split(token).join('[redacted]');
  // Also mask anything shaped like a Discord bot token.
  return out.replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}/g, '[redacted]');
}

function shortError(err, token) {
  const name = err && err.name ? err.name : 'Error';
  const code = err && err.code ? ` (${err.code})` : '';
  const msg = err && err.message ? err.message : String(err);
  return redact(`${name}${code}: ${msg}`, token).slice(0, 200);
}

module.exports = { loadConfig, redact, shortError };
