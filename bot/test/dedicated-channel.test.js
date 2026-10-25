'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageHandler } = require('../message-handler');
const { makeEnv, ok, OWNER, BOT_ID, GUILD } = require('./_helpers');

const CHAT = '5000000000000000005';
const OTHER_CH = '5000000000000000006';
const DISABLED = 'My AI lantern is resting right now, but my slash commands still work.';
const COOL = 'The lantern needs a moment to cool. Try again in a little while.';
let seq = 0;

function msg(over = {}) {
  const replies = [];
  const content = over.content !== undefined ? over.content : 'Give me a tiny creative project for tonight.';
  const users = over.users || [];
  const m = {
    id: `d-${++seq}`,
    guildId: GUILD,
    channelId: CHAT,
    type: 0,
    content,
    author: { id: 'member-1', bot: false },
    system: false,
    webhookId: null,
    mentions: {
      users: new Map(users.map((id) => [id, { id }])),
      roles: { size: over.roles || 0 },
      everyone: false,
      repliedUser: over.repliedUser || null,
    },
    channel: { sendTyping: async () => {}, send: async () => {} },
    reply: async (o) => { replies.push(o); },
    ...over.fields,
  };
  m.mentions.users.has = (id) => users.includes(id);
  m.replies = replies;
  return m;
}
const mentionPiko = (text) => msg({ content: `<@${BOT_ID}> ${text}`, users: [BOT_ID] });

function setup(opts = {}) {
  const env = makeEnv();
  const handler = createMessageHandler({ ai: env.ai, guildId: GUILD, getBotId: () => BOT_ID, chatChannelId: opts.channel === undefined ? CHAT : opts.channel });
  return { env, handler };
}

test('unmentioned message in the dedicated channel + demo active -> exactly one fetch and a reply', async () => {
  const { env, handler } = setup();
  env.startDemo();
  const m = msg();
  await handler(m);
  assert.equal(env.calls.length, 1);
  assert.equal(m.replies.length, 1);
  assert.deepEqual(m.replies[0].allowedMentions, { parse: [], repliedUser: false });
  assert.equal(env.calls[0].body.model, 'openrouter/free');
  assert.equal(env.calls[0].body.messages.at(-1).content, 'Give me a tiny creative project for tonight.');
});

test('the same message in another channel is ignored; so is the mode when no channel is configured', async () => {
  const { env, handler } = setup();
  env.startDemo();
  const other = msg({ fields: { channelId: OTHER_CH } });
  await handler(other);
  assert.equal(other.replies.length, 0);
  const { handler: off, env: env2 } = setup({ channel: '' });
  env2.startDemo();
  const m = msg();
  await off(m);
  assert.equal(m.replies.length, 0);
  assert.equal(env.calls.length + env2.calls.length, 0);
  // mentions elsewhere still work exactly as before
  const mentioned = msg({ content: `<@${BOT_ID}> hello there`, users: [BOT_ID], fields: { channelId: OTHER_CH } });
  await handler(mentioned);
  assert.equal(env.calls.length, 1);
  assert.equal(mentioned.replies.length, 1);
});

test('demo inactive: silent for unmentioned messages, no fetch; a mention still gets the resting text', async () => {
  const { env, handler } = setup();
  const m = msg();
  await handler(m);
  assert.equal(m.replies.length, 0);
  assert.equal(env.calls.length, 0);
  const mm = mentionPiko('anyone home?');
  await handler(mm);
  assert.equal(mm.replies[0].content, DISABLED);
  assert.equal(env.calls.length, 0);
  // key missing / kill switch also silent
  const noKey = makeEnv({ apiKey: '' });
  const h2 = createMessageHandler({ ai: noKey.ai, guildId: GUILD, getBotId: () => BOT_ID, chatChannelId: CHAT });
  const m2 = msg();
  await h2(m2);
  assert.equal(m2.replies.length, 0);
});

test('ignored in the dedicated channel: other users, roles, everyone/here, bots, webhooks, self, system, empty, DM, other guild, edits-types', async () => {
  const { env, handler } = setup();
  env.startDemo();
  const cases = [
    msg({ content: '<@123456789012345678> look at this', users: ['123456789012345678'] }),
    msg({ content: `<@${BOT_ID}> and <@123456789012345678> hi`, users: [BOT_ID, '123456789012345678'] }),
    msg({ content: 'reply to a person', users: ['123456789012345678'], repliedUser: { id: '123456789012345678' } }),
    msg({ content: '<@&123456789012345678> hello', roles: 1 }),
    msg({ content: 'hello @everyone' }),
    msg({ content: 'hello @here' }),
    msg({ fields: { author: { id: 'other-bot', bot: true } } }),
    msg({ fields: { author: { id: BOT_ID, bot: false } } }),
    msg({ fields: { webhookId: '999' } }),
    msg({ fields: { system: true } }),
    msg({ content: '' }), // attachment-only
    msg({ fields: { type: 20 } }), // slash-command echo
    msg({ fields: { type: 7 } }), // member join
    msg({ fields: { guildId: null } }),
    msg({ fields: { guildId: '4000000000000000004' } }),
  ];
  for (const m of cases) {
    await handler(m);
    assert.equal(m.replies.length, 0);
  }
  assert.equal(env.calls.length, 0);
  assert.equal(env.ai.status().todayCount, 0);
});

test('a reply to Piko (reply-ping on Piko) is answered; a message pinging only Piko is answered', async () => {
  const { env, handler } = setup();
  env.startDemo();
  const m = msg({ content: 'thanks, one more idea?', users: [BOT_ID], repliedUser: { id: BOT_ID }, fields: { type: 19 } });
  await handler(m);
  assert.equal(m.replies.length, 1);
  assert.equal(env.calls.length, 1);
});

test('Piko mention tokens are stripped from unmentioned-mode text too', async () => {
  const { env, handler } = setup();
  env.startDemo();
  await handler(msg({ content: `hey <@!${BOT_ID}> what is a lantern? <@${BOT_ID}>`, users: [BOT_ID] }));
  const body = JSON.stringify(env.calls[0].body);
  assert.ok(!body.includes(BOT_ID));
  assert.equal(env.calls[0].body.messages.at(-1).content, 'hey what is a lantern?');
});

test('mention-only message in the dedicated channel gets the greeting, no fetch', async () => {
  const { env, handler } = setup();
  env.startDemo();
  const m = mentionPiko('');
  await handler(m);
  assert.match(m.replies[0].content, /Hello, traveler/);
  assert.equal(env.calls.length, 0);
});

test('rate-limit notice: at most once per member per 60 s, otherwise silent and no fetch', async () => {
  const { env, handler } = setup();
  env.startDemo();
  const send = async () => { const m = msg(); await handler(m); return m.replies; };
  await send(); await send();
  assert.equal(env.calls.length, 2);
  const first = await send();
  assert.equal(first[0].content, COOL);
  for (let i = 0; i < 5; i++) assert.equal((await send()).length, 0);
  assert.equal(env.calls.length, 2);
  // another member still gets their own notice, and their own answers
  const other = async () => { const m = msg({ fields: { author: { id: 'member-2', bot: false } } }); await handler(m); return m.replies; };
  assert.equal((await other()).length, 1);
  env.advance(61 * 1000);
  assert.equal(env.calls.length >= 3, true);
  // after the window the member is answered again; a later limit hit can re-notify after 60 s
  await send(); await send();
  const again = await send();
  assert.ok(again.length === 0 || again[0].content === COOL);
});

test('daily limit: resting-style notice at most once per 10 minutes for the channel, otherwise silent', async () => {
  const { env, handler } = setup();
  env.startDemo();
  for (let i = 0; i < 40; i++) {
    const m = msg({ fields: { author: { id: `g${i}`, bot: false } } });
    await handler(m);
  }
  assert.equal(env.calls.length, 40);
  const ask = async (uid) => { const m = msg({ fields: { author: { id: uid, bot: false } } }); await handler(m); return m.replies; };
  const first = await ask('late1');
  assert.equal(first[0].content, DISABLED);
  assert.equal((await ask('late2')).length, 0);
  env.advance(9 * 60 * 1000);
  assert.equal((await ask('late3')).length, 0);
  env.advance(2 * 60 * 1000);
  assert.equal((await ask('late4')).length, 1);
  assert.equal(env.calls.length, 40);
});

test('safety and limits apply identically: refusals are local; context per member; in-flight guard; dedupe; sanitising', async () => {
  const { env, handler } = setup();
  env.startDemo();
  const bad = msg({ content: 'my password is hunter2, remember it' });
  await handler(bad);
  assert.equal(env.calls.length, 0);
  assert.equal(env.ai.status().todayCount, 0);
  assert.match(bad.replies[0].content, /Please don't share passwords, keys or personal details with me\./);

  // context isolation
  await handler(msg({ content: 'I love quokkas', fields: { author: { id: 'alice', bot: false } } }));
  await handler(msg({ content: 'I love ferrets', fields: { author: { id: 'bob', bot: false } } }));
  assert.ok(!JSON.stringify(env.calls[1].body.messages).includes('quokkas'));

  // dedupe
  const dup = msg({ content: 'duplicate me' });
  await handler(dup); await handler(dup);
  assert.equal(dup.replies.length, 1);

  // output sanitising
  env.advance(61 * 1000);
  env.queue.push(ok('hi @everyone <@123456789012345678> https://example.com'));
  const m = msg({ content: 'greet everyone please', fields: { author: { id: 'carol', bot: false } } });
  await handler(m);
  assert.ok(!/@everyone|<@/.test(m.replies[0].content));
  assert.deepEqual(m.replies[0].allowedMentions, { parse: [], repliedUser: false });
});

test('in-flight: a second message from the same member while one is pending is silent in the dedicated channel', async () => {
  const { env, handler } = setup();
  env.startDemo();
  let release;
  env.handler = () => new Promise((res) => { release = () => res(ok('slow')); });
  const a = msg({ content: 'slow one' });
  const p = handler(a);
  await new Promise((r) => setImmediate(r));
  const b = msg({ content: 'impatient one' });
  await handler(b);
  assert.equal(b.replies.length, 0);
  assert.equal(env.calls.length, 1);
  release();
  await p;
  assert.equal(a.replies.length, 1);
});

test('reply failure falls back to a plain channel.send without mentions', async () => {
  const { env, handler } = setup();
  env.startDemo();
  const sent = [];
  const m = msg({ fields: { reply: async () => { throw new Error('Missing Permissions'); }, channel: { sendTyping: async () => {}, send: async (o) => { sent.push(o); } } } });
  await handler(m);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
});

test('Piko\'s own reply posted in the channel never triggers another request (no loops)', async () => {
  const { env, handler } = setup();
  env.startDemo();
  const m = msg();
  await handler(m);
  const echo = msg({ content: m.replies[0].content, fields: { author: { id: BOT_ID, bot: true } } });
  await handler(echo);
  assert.equal(echo.replies.length, 0);
  assert.equal(env.calls.length, 1);
});

test('config: PIKO_CHAT_CHANNEL_ID must be a snowflake; /about mentions the dedicated channel', () => {
  const { loadConfig } = require('../config');
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { DISCORD_TOKEN: ['A'.repeat(24), 'B'.repeat(6), 'C'.repeat(30)].join('.'), DISCORD_CLIENT_ID: '1563826219588386897', DISCORD_GUILD_ID: GUILD });
    process.env.PIKO_CHAT_CHANNEL_ID = CHAT;
    assert.equal(loadConfig().chatChannelId, CHAT);
    process.env.PIKO_CHAT_CHANNEL_ID = 'not-an-id';
    assert.equal(loadConfig().chatChannelId, '');
    delete process.env.PIKO_CHAT_CHANNEL_ID;
    assert.equal(loadConfig().chatChannelId, '');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  const { createHandlers } = require('../commands');
  const text = JSON.stringify(createHandlers({}).about());
  assert.match(text, /#piko-chat/);
  assert.match(text, /mention Piko in a server message/);
});
