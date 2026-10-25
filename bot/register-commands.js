'use strict';
// Registers Piko's slash commands for ONE guild (instant availability).
// Usage: node register-commands.js     (reads /workspace/piko/.env)
const { REST, Routes } = require('discord.js');
const { loadConfig, shortError } = require('./config');
const { definitions } = require('./commands');

async function main() {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(cfg.token);
  const body = definitions.map((c) => c.toJSON());
  try {
    const result = await rest.put(Routes.applicationGuildCommands(cfg.clientId, cfg.guildId), { body });
    console.log(`Registered ${result.length} guild commands: ${result.map((c) => '/' + c.name).join(', ')}`);
  } catch (err) {
    console.error('Could not register commands: ' + shortError(err, cfg.token));
    process.exit(1);
  }
}

main();
