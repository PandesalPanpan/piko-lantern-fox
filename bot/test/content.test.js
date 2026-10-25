'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const content = require('../content');
const { createShuffleBag } = require('../shuffle-bag');
const { createHandlers, definitions } = require('../commands');

test('content has the required number of entries', () => {
  assert.ok(content.LORE.length >= 8, 'lore >= 8');
  assert.ok(content.QUESTS.length >= 12, 'quests >= 12');
  assert.ok(content.SPARKS.length >= 12, 'sparks >= 12');
  for (const list of [content.LORE, content.QUESTS, content.SPARKS]) {
    assert.equal(new Set(list).size, list.length, 'entries are unique');
    for (const s of list) assert.ok(typeof s === 'string' && s.length > 20 && s.length < 400);
  }
});

test('about content has invite and Grok Bot credit', () => {
  assert.equal(content.ABOUT.invite, 'https://discord.gg/zxkSerrxWd');
  assert.match(content.ABOUT.credit, /Created with Grok Bot/);
});

test('eight commands are defined (no /chat)', () => {
  assert.deepEqual(definitions.map((d) => d.name).sort(), ['about', 'demo-start', 'demo-stop', 'forget', 'hello', 'lore', 'quest', 'spark']);
});

test('shuffle bag never repeats consecutively and covers all entries each round', () => {
  for (const items of [content.LORE, content.QUESTS, content.SPARKS, ['a', 'b']]) {
    const bag = createShuffleBag(items);
    let prev = null;
    const picks = [];
    for (let i = 0; i < items.length * 50; i++) {
      const p = bag.next();
      assert.notEqual(p, prev, 'no immediate repeat');
      prev = p;
      picks.push(p);
    }
    for (let r = 0; r < 50; r++) {
      const round = picks.slice(r * items.length, (r + 1) * items.length);
      assert.equal(new Set(round).size, items.length, 'each round has every entry once');
    }
  }
});

test('shuffle bag no-repeat holds with a worst-case rng', () => {
  const bag = createShuffleBag(['x', 'y', 'z'], () => 0);
  let prev = null;
  for (let i = 0; i < 60; i++) {
    const p = bag.next();
    assert.notEqual(p, prev);
    prev = p;
  }
});

test('handlers never allow mentions and /about includes required info', () => {
  const h = createHandlers({ pageUrl: 'https://example.invalid/piko/' });
  for (const name of ['hello', 'lore', 'quest', 'spark', 'about']) {
    const r = h[name]();
    assert.deepEqual(r.allowedMentions, { parse: [] });
    assert.equal(r.embeds.length, 1);
  }
  const about = JSON.stringify(h.about().embeds[0].toJSON());
  assert.ok(about.includes('https://discord.gg/zxkSerrxWd'));
  assert.ok(about.includes('https://example.invalid/piko/'));
  assert.ok(about.includes('Created with Grok Bot.'));
  assert.ok(about.includes('Optional AI replies are routed through OpenRouter during controlled demo sessions.'));
  assert.ok(about.includes('To talk with Piko during an active demo, mention Piko in a server message and include your question.'));
  assert.ok(about.includes('@Piko Give me a tiny creative project for tonight.'));
  assert.match(about, /sensitive information/);
  assert.match(about, /inactive or free capacity is exhausted/);
});

test('repeated /lore, /quest, /spark calls do not repeat back-to-back', () => {
  const h = createHandlers({});
  for (const name of ['lore', 'quest', 'spark']) {
    let prev = null;
    for (let i = 0; i < 100; i++) {
      const d = h[name]().embeds[0].toJSON().description;
      assert.notEqual(d, prev);
      prev = d;
    }
  }
});
