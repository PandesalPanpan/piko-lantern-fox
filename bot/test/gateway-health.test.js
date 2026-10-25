'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Events } = require('discord.js');
const { shortError } = require('../config');
const { WATCHDOG, attachGatewayLogging, installProcessHandlers, createWatchdog } = require('../gateway-health');

const FAKE_TOKEN = ['A'.repeat(24), 'B'.repeat(6), 'C'.repeat(30)].join('.');

function setup() {
  const client = new EventEmitter();
  const out = [];
  attachGatewayLogging(client, {
    Events,
    log: (m) => out.push(['log', m]),
    warn: (m) => out.push(['warn', m]),
    shortError,
    secrets: [FAKE_TOKEN],
  });
  return { client, out };
}

test('gateway events are logged by name, shard id and code only', () => {
  const { client, out } = setup();
  client.emit(Events.ShardReady, 0, new Set(['a', 'b']));
  client.emit(Events.ShardDisconnect, { code: 1006, reason: 'secret message body' }, 0);
  client.emit(Events.ShardReconnecting, 0);
  client.emit(Events.ShardResume, 0, 7);
  const e = new Error(`bad frame ${FAKE_TOKEN}`); e.code = 'ECONNRESET';
  client.emit(Events.ShardError, e, 0);
  client.emit(Events.Error, e);
  client.emit(Events.Warn, `heartbeat late ${FAKE_TOKEN}`);
  const all = out.map((x) => x[1]).join('\n');
  assert.match(all, /Shard 0 ready \(unavailable guilds: 2\)/);
  assert.match(all, /Shard 0 disconnected \(code 1006\)/);
  assert.match(all, /Shard 0 reconnecting/);
  assert.match(all, /Shard 0 resumed \(replayed events: 7\)/);
  assert.match(all, /Shard 0 error: Error \(ECONNRESET\)/);
  assert.match(all, /Client error:/);
  assert.match(all, /Client warning:/);
  assert.ok(!all.includes('secret message body'));
  assert.ok(!all.includes(FAKE_TOKEN));
  assert.equal(out.filter((x) => x[0] === 'warn').length, 4);
});

test('unhandled rejections are logged without exiting; uncaught exceptions exit 1', () => {
  const proc = new EventEmitter();
  const warns = []; const exits = [];
  installProcessHandlers(proc, { warn: (m) => warns.push(m), shortError, secrets: [FAKE_TOKEN], exit: (c) => exits.push(c) });
  proc.emit('unhandledRejection', new Error(`boom ${FAKE_TOKEN}`));
  proc.emit('unhandledRejection', 'plain string');
  assert.equal(warns.length, 2);
  assert.deepEqual(exits, []);
  assert.ok(!warns.join('').includes(FAKE_TOKEN));
  proc.emit('uncaughtException', new Error('fatal'));
  assert.deepEqual(exits, [1]);
});

function wd(extra = {}) {
  const state = { ready: true, t: 0, stuck: 0, logs: [] };
  const w = createWatchdog({ isReady: () => state.ready, now: () => state.t, log: (m) => state.logs.push(m), onStuck: () => { state.stuck++; }, ...extra });
  return { state, w };
}

test('watchdog constants: 3 minutes, non-zero exit', () => {
  assert.equal(WATCHDOG.maxNotReadyMs, 180000);
  assert.equal(WATCHDOG.checkMs, 30000);
  assert.notEqual(WATCHDOG.exitCode, 0);
});

test('watchdog: a ready gateway never triggers', () => {
  const { state, w } = wd();
  for (let i = 0; i < 20; i++) { state.t += 30000; assert.equal(w.check(), 'ready'); }
  assert.equal(state.stuck, 0);
});

test('watchdog: exits only after more than 3 consecutive minutes not READY', () => {
  const { state, w } = wd();
  state.ready = false;
  const results = [];
  for (let i = 0; i < 8; i++) { results.push(w.check()); state.t += 30000; }
  // first sample at t=0 starts the clock; 180 s later is not yet "more than 3 minutes"; 210 s is
  assert.deepEqual(results, ['waiting', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting', 'stuck']);
  assert.equal(state.stuck, 1);
  assert.match(state.logs.join('\n'), /not READY for 210s; exiting/);
});

test('watchdog: a recovery inside the window resets the clock', () => {
  const { state, w } = wd();
  state.ready = false;
  for (let i = 0; i < 5; i++) { w.check(); state.t += 30000; } // 150 s down
  state.ready = true; assert.equal(w.check(), 'ready');
  assert.match(state.logs.join('\n'), /READY again/);
  state.ready = false;
  for (let i = 0; i < 7; i++) { state.t += 30000; w.check(); } // another 180 s, still not over
  assert.equal(state.stuck, 0);
});

test('watchdog: an isReady() that throws counts as not ready; start/stop use the interval', () => {
  const calls = []; let cleared = 0;
  const w = createWatchdog({
    isReady: () => { throw new Error('x'); }, now: () => 0, log() {}, onStuck() {},
    setInterval: (fn, ms) => { calls.push(ms); return { unref() {} }; },
    clearInterval: () => { cleared++; },
  });
  assert.equal(w.check(), 'waiting');
  w.start(); w.start(); w.stop(); w.stop();
  assert.deepEqual(calls, [30000]);
  assert.equal(cleared, 1);
});
