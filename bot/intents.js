'use strict';
// Gateway intents: Guilds + GuildMessages only. Both are non-privileged.
// Discord still includes the text of messages that directly mention the bot, so no privileged
// content intent is needed or enabled.
const { GatewayIntentBits } = require('discord.js');

const INTENTS = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];

module.exports = { INTENTS };
