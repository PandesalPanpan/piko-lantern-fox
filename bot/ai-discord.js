'use strict';
// Thin adapter between discord.js interactions and the AI service.
const { MessageFlags } = require('discord.js');

function toReply(p) {
  const o = { content: p.content, allowedMentions: { parse: [] } };
  if (p.ephemeral) o.flags = MessageFlags.Ephemeral;
  return o;
}

async function handleAiCommand(ai, interaction) {
  const userId = interaction.user.id;
  switch (interaction.commandName) {
    case 'forget':
      return interaction.reply(toReply(ai.forget(userId)));
    case 'demo-start':
      return interaction.reply(toReply(ai.demoStart(userId)));
    case 'demo-stop':
      return interaction.reply(toReply(ai.demoStop(userId)));
    default:
      return undefined;
  }
}

module.exports = { handleAiCommand, toReply };
