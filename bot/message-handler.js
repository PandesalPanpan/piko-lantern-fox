'use strict';
// messageCreate handler: reacts ONLY to a direct @mention of Piko in the configured server.
// Everything else is ignored silently (no response, no logging of content).
const NO_PING = { parse: [], repliedUser: false };

function createMessageHandler({ ai, guildId, getBotId }) {
  async function sendReply(message, p) {
    const options = { content: p.content, allowedMentions: NO_PING };
    try {
      return await message.reply(options);
    } catch (_) {
      // e.g. the original message was deleted or replying is not permitted: post plainly instead.
      try { return await message.channel.send({ content: p.content, allowedMentions: { parse: [] } }); } catch (_2) { return null; }
    }
  }

  /** Does this message qualify? Returns the member's text with Piko's mention tokens removed, or null. */
  function qualify(message) {
    const botId = getBotId();
    if (!botId || !message) return null;
    if (!message.guildId || String(message.guildId) !== String(guildId)) return null; // DMs / other servers
    const author = message.author;
    if (!author || author.bot || String(author.id) === String(botId)) return null;
    if (message.system || message.webhookId) return null;
    const raw = typeof message.content === 'string' ? message.content : '';
    if (!raw) return null;
    const m = message.mentions;
    if (!m || !m.users || !m.users.has(botId)) return null;
    if (m.everyone || /@(?:everyone|here)\b/i.test(raw)) return null;
    const token = new RegExp(`<@!?${botId}>`, 'g'); // an explicit mention token; a reply-ping alone does not count
    if (!token.test(raw)) return null;
    return raw.replace(new RegExp(`<@!?${botId}>`, 'g'), ' ').replace(/\s+/g, ' ').trim();
  }

  return async function onMessage(message) {
    let text;
    try { text = qualify(message); } catch (_) { return; }
    if (text === null) return;
    await ai.converse({
      messageId: message.id,
      userId: message.author.id,
      text,
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
