// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never a password or a token, at any level.
// (Adapted from guim31/gladys-photoprism.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_TOKEN, PASSWORD, baseConfig, createWorld } from './helpers/world.js';

/** Capture the lines of the SDK logger at the given level. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  t.mock.method(console, 'warn', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  assert.ok(
    logs.texts().some((text) => text.includes('Seafile 12.0.14')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(60_000);
    w.seafile.touch('Documents');
    await w.hub.pollNow();
  }
  assert.equal(w.fake.sceneEvents.length, 5, 'events were fired');
  assert.deepEqual(logs.texts(), []);
});

test('a server that stays down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  logs.clear();
  w.seafile.down = true;
  for (let i = 0; i < 6; i += 1) {
    await w.hub.pollNow();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  logs.clear();
  w.seafile.down = false;
  await w.hub.pollNow();
  await w.hub.pollNow();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /answers again/);
});

test('no password or token in the logs, even at debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.seafile.revokeTokens();
  w.seafile.touch('Photos');
  await w.hub.pollNow();
  await w.fake.configUpdated(baseConfig({ api_token: API_TOKEN, password: '' }));
  w.seafile.password = 'other';
  await w.fake.configUpdated(baseConfig());
  const all = logs.texts().join('\n');
  assert.ok(all.length > 0);
  for (const secret of [PASSWORD, API_TOKEN, 'token-1', 'token-2']) {
    assert.ok(!all.includes(secret), `"${secret}" in the logs`);
  }
});
