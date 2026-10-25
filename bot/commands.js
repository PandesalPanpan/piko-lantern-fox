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
];

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
      const page = pageUrl || '(character page link coming soon)';
      return {
        embeds: [
          embed(
            'About Piko',
            `${content.ABOUT.description}\n\n` +
              `**Character page:** ${page}\n` +
              `**Server invite:** ${content.ABOUT.invite}\n\n` +
              content.ABOUT.credit
          ),
        ],
        allowedMentions: NO_MENTIONS,
      };
    },
  };
}

module.exports = { definitions, createHandlers, NO_MENTIONS };
