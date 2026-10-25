'use strict';
const { Client, Events, ActivityType, MessageFlags } = require('discord.js');
const { loadConfig, shortError } = require('./config');
const path = require('node:path');
const { createHandlers, AI_COMMAND_NAMES } = require('./commands');
const { INTENTS } = require('./intents');
const { createAiService } = require('./ai-service');
const { handleAiCommand } = require('./ai-discord');
const { createMessageHandler } = require('./message-handler');
const { Status } = require('discord.js');
const { attachGatewayLogging, installProcessHandlers, createWatchdog } = require('./gateway-health');

let cfg;
try {
  cfg = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(2); // 2 = configuration error (the supervisor will not retry this)
}

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const warn = (msg) => console.error(`[${new Date().toISOString()}] ${msg}`);

installProcessHandlers(process, { warn, shortError, secrets: cfg.secrets, exit: (code) => process.exit(code) });

// Guilds + GuildMessages + MessageContent (privileged, approved): MessageContent is needed only to read
// unmentioned messages in the dedicated chat channel(s); elsewhere a direct mention is required.
// No DMs, no voice.
const client = new Client({
  intents: INTENTS,
  partials: [],
  allowedMentions: { parse: [] },
  presence: {
    status: 'online',
    activities: [{ name: 'listening for lost ideas', type: ActivityType.Custom }],
  },
});

const handlers = createHandlers({ pageUrl: cfg.pageUrl });

// AI conversation: disabled on start unless a still-valid demo session is restored from run/demo.json.
// Logs only counts, timestamps, latency, success/failure and the returned model id; never message text.
const ai = createAiService({
  apiKey: cfg.openrouterKey,
  ownerId: cfg.ownerId,
  chatChannelIds: cfg.chatChannelIds,
  discordToken: cfg.token,
  runDir: path.resolve(__dirname, '..', 'run'),
  log: (m) => log(m),
});
ai.start();
const onMessage = createMessageHandler({ ai, guildId: cfg.guildId, getBotId: () => client.user && client.user.id, chatChannelIds: cfg.chatChannelIds });

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
  const st = ai.status();
  log(`AI chat: ${st.demoActive ? 'demo active' : 'disabled (no active demo)'}; key configured: ${st.keyConfigured ? 'yes' : 'no'}; today ${st.todayCount}/${st.dailyLimit}.`);
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

  const isAi = AI_COMMAND_NAMES.includes(interaction.commandName);
  const handler = handlers[interaction.commandName];
  if (!handler && !isAi) return;

  try {
    if (isAi) await handleAiCommand(ai, interaction);
    else await interaction.reply(handler());
  } catch (err) {
    warn(`Command /${interaction.commandName} failed: ${shortError(err, cfg.secrets)}`);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'The lantern flickered. Please try again in a moment.',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      }
    } catch (err2) {
      warn('Could not send the error reply: ' + shortError(err2, cfg.secrets));
    }
  }
});

// No handler for edited messages: edits are never processed.
client.on(Events.MessageCreate, (message) => {
  onMessage(message).catch((err) => warn('Message handler failed: ' + shortError(err, cfg.secrets)));
});

attachGatewayLogging(client, { Events, log, warn, shortError, secrets: cfg.secrets });

// Watchdog: if the gateway is not READY for more than 3 consecutive minutes, exit non-zero so supervisor.sh
// restarts the process (with its backoff). The AI demo session is restored from run/demo.json on restart.
const watchdog = createWatchdog({
  isReady: () => client.ws && client.ws.status === Status.Ready,
  log,
  onStuck: () => {
    try { ai.shutdown(); } catch (_) { /* ignore */ }
    process.exit(1);
  },
});
watchdog.start();

function shutdown(signal) {
  ai.shutdown();
  log(`Received ${signal}; putting the lantern down.`);
  client.destroy().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(cfg.token).catch((err) => {
  warn('Login failed: ' + shortError(err, cfg.secrets));
  // Invalid token / disallowed intents will not fix themselves: exit 3 so the supervisor stops.
  process.exit(/TokenInvalid|DisallowedIntents|invalid token/i.test(String(err && (err.code || err.message))) ? 3 : 1);
});
