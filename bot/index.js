'use strict';
const { Client, GatewayIntentBits, Events, ActivityType, MessageFlags } = require('discord.js');
const { loadConfig, shortError } = require('./config');
const { createHandlers } = require('./commands');

let cfg;
try {
  cfg = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(2); // 2 = configuration error (the supervisor will not retry this)
}

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const warn = (msg) => console.error(`[${new Date().toISOString()}] ${msg}`);

process.on('unhandledRejection', (reason) => warn('Unhandled rejection: ' + shortError(reason, cfg.token)));
process.on('uncaughtException', (err) => {
  warn('Uncaught exception: ' + shortError(err, cfg.token));
  process.exit(1);
});

// Only the Guilds intent: no privileged intents, no message content, no DMs.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [] },
  presence: {
    status: 'online',
    activities: [{ name: 'listening for lost ideas', type: ActivityType.Custom }],
  },
});

const handlers = createHandlers({ pageUrl: cfg.pageUrl });

// Each interaction id is handled once, even if the gateway redelivers it.
const handled = new Map();
function firstTime(id) {
  const now = Date.now();
  for (const [k, t] of handled) if (now - t > 15 * 60 * 1000) handled.delete(k);
  if (handled.has(id)) return false;
  handled.set(id, now);
  return true;
}

client.once(Events.ClientReady, (c) => {
  log(`Piko is awake and listening for lost ideas (${c.guilds.cache.size} server(s)).`);
  c.user.setPresence({
    status: 'online',
    activities: [{ name: 'listening for lost ideas', type: ActivityType.Custom }],
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) return; // no DM use
  if (!firstTime(interaction.id)) return;
  if (interaction.replied || interaction.deferred) return;

  const handler = handlers[interaction.commandName];
  if (!handler) return;

  try {
    await interaction.reply(handler());
  } catch (err) {
    warn(`Command /${interaction.commandName} failed: ${shortError(err, cfg.token)}`);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'The lantern flickered. Please try again in a moment.',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      }
    } catch (err2) {
      warn('Could not send the error reply: ' + shortError(err2, cfg.token));
    }
  }
});

client.on(Events.Error, (err) => warn('Client error: ' + shortError(err, cfg.token)));
client.on(Events.ShardDisconnect, (ev, id) => warn(`Shard ${id} disconnected (code ${ev && ev.code}).`));
client.on(Events.ShardReconnecting, (id) => log(`Shard ${id} reconnecting.`));

function shutdown(signal) {
  log(`Received ${signal}; putting the lantern down.`);
  client.destroy().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(cfg.token).catch((err) => {
  warn('Login failed: ' + shortError(err, cfg.token));
  // Invalid token / disallowed intents will not fix themselves: exit 3 so the supervisor stops.
  process.exit(/TokenInvalid|DisallowedIntents|invalid token/i.test(String(err && (err.code || err.message))) ? 3 : 1);
});
