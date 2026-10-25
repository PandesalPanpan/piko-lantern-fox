'use strict';
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const content = require('./content');
const { createShuffleBag } = require('./shuffle-bag');

const LANTERN_CYAN = 0x3fd0f0;
const NO_MENTIONS = { parse: [] };

const definitions = [
  new SlashCommandBuilder().setName('hello').setDescription('Meet Piko, the lantern fox.'),
  new SlashCommandBuilder().setName('lore').setDescription("Hear a piece of Piko's story."),
  new SlashCommandBuilder().setName('quest').setDescription('Get one small creative quest (10-30 minutes).'),
  new SlashCommandBuilder().setName('spark').setDescription('Get a creative prompt or project idea.'),
  new SlashCommandBuilder().setName('about').setDescription('About Piko, the character page, and the server.'),
  new SlashCommandBuilder().setName('forget').setDescription("Erase Piko's short memory of your chat."),
  new SlashCommandBuilder().setName('demo-start').setDescription('Owner only: turn on AI chat for one hour.'),
  new SlashCommandBuilder().setName('demo-stop').setDescription('Owner only: turn off AI chat now and clear all chat memory.'),
];

/** Commands handled by the AI service (everything else is scripted and offline). */
const AI_COMMAND_NAMES = ['forget', 'demo-start', 'demo-stop'];

function embed(title, description, footer) {
  const e = new EmbedBuilder().setColor(LANTERN_CYAN).setTitle(title).setDescription(description);
  if (footer) e.setFooter({ text: footer });
  return e;
}

/** Build the handlers. Each returns reply options and never touches the network. */
function createHandlers({ pageUrl = '', rng = Math.random } = {}) {
  const lore = createShuffleBag(content.LORE, rng);
  const quests = createShuffleBag(content.QUESTS, rng);
  const sparks = createShuffleBag(content.SPARKS, rng);

  return {
    hello: () => ({
      embeds: [embed('Piko, The Lantern Fox', `${content.HELLO.greeting}\n\n${content.HELLO.details}`, content.HELLO.footer)],
      allowedMentions: NO_MENTIONS,
    }),
    lore: () => ({
      embeds: [embed('From the lantern: lore', lore.next())],
      allowedMentions: NO_MENTIONS,
    }),
    quest: () => ({
      embeds: [embed('A small quest', quests.next(), 'Take your time. Come back and tell the lantern how it went.')],
      allowedMentions: NO_MENTIONS,
    }),
    spark: () => ({
      embeds: [embed('A spark for you', sparks.next())],
      allowedMentions: NO_MENTIONS,
    }),
    about: () => {
      const page = pageUrl || content.PAGE_URL_DEFAULT;
      return {
        embeds: [
          embed(
            'About Piko',
            `${content.ABOUT.description}\n\n` +
              `**Character page:** ${page}\n` +
              `**Server invite:** ${content.ABOUT.invite}\n\n` +
              `${content.ABOUT.credit}\n\n` +
              `${content.ABOUT.ai}\n${content.ABOUT.availability}`
          ),
        ],
        allowedMentions: NO_MENTIONS,
      };
    },
  };
}

module.exports = { definitions, createHandlers, NO_MENTIONS, AI_COMMAND_NAMES };
