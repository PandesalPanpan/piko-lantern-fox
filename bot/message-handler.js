'use strict';
// messageCreate handler. Reacts to (a) a direct @mention of Piko anywhere in the configured server and
// (b) every human message in the dedicated chat channel(s) (if configured), without a mention.
// Everything else is ignored silently (no response, no logging of content).
const NO_PING = { parse: [], repliedUser: false };

function createMessageHandler({ ai, guildId, getBotId, chatChannelIds, chatChannelId }) {
  // Channels where Piko answers without a mention: a list, or the legacy single id (comma-separated also accepted).
  const raw0 = Array.isArray(chatChannelIds) ? chatChannelIds : String(chatChannelIds || chatChannelId || '').split(/[\s,;]+/);
  const dedicated = new Set(raw0.map((x) => String(x).trim()).filter((x) => /^\d{15,25}$/.test(x)));
  async function sendReply(message, p) {
    const options = { content: p.content, allowedMentions: NO_PING };
    try {
      return await message.reply(options);
    } catch (_) {
      // e.g. the original message was deleted or replying is not permitted: post plainly instead.
      try { return await message.channel.send({ content: p.content, allowedMentions: { parse: [] } }); } catch (_2) { return null; }
    }
  }

  /**
   * Does this message qualify? Returns { text, quiet } (text = member's words with Piko's mention tokens
   * removed; quiet = unmentioned message in the dedicated channel) or null.
   */
  function qualify(message) {
    const botId = getBotId();
    if (!botId || !message) return null;
    if (!message.guildId || String(message.guildId) !== String(guildId)) return null; // DMs / other servers
    const author = message.author;
    if (!author || author.bot || String(author.id) === String(botId)) return null;
    if (message.system || message.webhookId) return null;
    const raw = typeof message.content === 'string' ? message.content : '';
    if (!raw) return null; // empty or attachment-only
    const m = message.mentions;
    if (m && m.everyone) return null;
    if (/@(?:everyone|here)\b/i.test(raw)) return null;
    const tokenRe = new RegExp(`<@!?${botId}>`, 'g'); // an explicit mention token; a reply-ping alone does not count
    const hasToken = tokenRe.test(raw);
    const inDedicated = dedicated.has(String(message.channelId));

    if (inDedicated) {
      // Only ordinary messages and replies (not slash-command echoes, joins, pins, ...).
      if (message.type !== undefined && message.type !== 0 && message.type !== 19) return null;
      // Skip talk between humans: mentions of other users or roles.
      const others = [...raw.matchAll(/<@!?(\d+)>/g)].some((x) => x[1] !== String(botId));
      if (others || /<@&\d+>/.test(raw)) return null;
      if (m && m.roles && m.roles.size > 0) return null;
      if (m && m.users && typeof m.users[Symbol.iterator] === 'function') {
        for (const entry of m.users) {
          const u = Array.isArray(entry) ? entry[1] : entry;
          const id = u && u.id !== undefined ? u.id : Array.isArray(entry) ? entry[0] : undefined;
          if (id !== undefined && String(id) !== String(botId)) return null;
        }
      }
      if (m && m.repliedUser && String(m.repliedUser.id) !== String(botId)) return null;
      const text = raw.replace(tokenRe, ' ').replace(/\s+/g, ' ').trim();
      return { text, quiet: !hasToken };
    }

    if (!m || !m.users || !m.users.has(botId)) return null;
    if (!hasToken) return null;
    return { text: raw.replace(new RegExp(`<@!?${botId}>`, 'g'), ' ').replace(/\s+/g, ' ').trim(), quiet: false };
  }

  return async function onMessage(message) {
    let q;
    try { q = qualify(message); } catch (_) { return; }
    if (q === null) return;
    await ai.converse({
      messageId: message.id,
      userId: message.author.id,
      text: q.text,
      quiet: q.quiet,
      reply: (p) => sendReply(message, p),
      startTyping: () => {
        const ping = () => { try { const r = message.channel.sendTyping(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* best effort */ } };
        ping();
        const t = setInterval(ping, 8000);
        return () => clearInterval(t);
      },
    });
  };
}

module.exports = { createMessageHandler, NO_PING };
