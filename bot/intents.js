'use strict';
// Gateway intents: Guilds + GuildMessages + MessageContent.
// MessageContent is privileged (enabled in the Developer Portal by the owner). It is needed ONLY to read
// unmentioned messages in the dedicated chat channel(s) (PIKO_CHAT_CHANNEL_IDS) during an active demo.
// Everywhere else Piko still requires a direct @mention and never looks at other messages.
const { GatewayIntentBits } = require('discord.js');

const INTENTS = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent];

module.exports = { INTENTS };
