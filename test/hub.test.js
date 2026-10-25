// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake Seafile (real answers of
// Seafile CE 12): discovery, states, the scene events on a library modified
// and on the quota, persistence across restarts, errors, re-login, the scene
// action, the widget, quiet logs and the reading timer of the container.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { ACCOUNT_KEYS, SERVER_KEYS, accountIds } from '../src/devices.js';
import { MAX_LIBRARY_EVENTS, TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import {
  API_TOKEN,
  FakeSeafile,
  HOUR,
  MINUTE,
  accountIdsOf,
  baseConfig,
  createClock,
  createDevices,
  createWorld,
  serverIdsOf,
} from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const account = (world, key) => world.fake.lastState(accountIdsOf(world).feature(key));
const server = (world, key) => world.fake.lastState(serverIdsOf(world).feature(key));

test('one device for the account, proposed in Discovery, nothing polled by Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Seafile Alice'],
  );
  assert.equal(devices[0].should_poll, false);
  assert.equal(devices[0].poll_frequency, undefined);
  assert.deepEqual(devices[0].params, [
    { name: 'ACCOUNT', value: 'Alice' },
    { name: 'VERSION', value: '12.0.14' },
  ]);
  // Nothing is published for devices not added, and the first read fires nothing.
  assert.equal(world.fake.states.length, 0);
  assert.equal(world.fake.sceneEvents.length, 0);
  assert.equal(world.fake.connectionStatus.connected, true);
  // The administrator figures are refused for a regular account: no server device.
  assert.ok(world.seafile.requests.includes('GET /api/v2.1/admin/sysinfo/'));
});

test('the states of the account: quota, space, libraries, linked devices, last modified', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  assert.equal(account(world, ACCOUNT_KEYS.ONLINE), 1);
  assert.equal(account(world, ACCOUNT_KEYS.QUOTA_USED), 5);
  assert.equal(account(world, ACCOUNT_KEYS.USED_SPACE), 5);
  assert.equal(account(world, ACCOUNT_KEYS.QUOTA), 100);
  assert.equal(account(world, ACCOUNT_KEYS.LIBRARIES), 2);
  // "Family" is shared with Alice and with her group: counted once.
  assert.equal(account(world, ACCOUNT_KEYS.SHARED_LIBRARIES), 1);
  assert.equal(account(world, ACCOUNT_KEYS.DEVICES), 1);
  assert.equal(account(world, ACCOUNT_KEYS.LAST_MODIFIED_LIBRARY), 'Family');
  assert.equal(account(world, ACCOUNT_KEYS.LAST_MODIFIED_TIME), '25/10, 02:53');
  assert.deepEqual(
    world.fake.transports.map((t) => t.transport),
    ['local'],
  );
});

test('an account without quota: 0 %, no quota value', async (t) => {
  const seafile = new FakeSeafile();
  seafile.setUsage(5_000_000, -2);
  const world = await createWorld({ seafile });
  t.after(() => world.app.stop());
  await createDevices(world);
  assert.equal(account(world, ACCOUNT_KEYS.QUOTA_USED), 0);
  assert.equal(account(world, ACCOUNT_KEYS.QUOTA), undefined);
  const ack = await world.fake.sceneAction('get_account_status', {});
  assert.equal(ack.data.outputs.quota_percent, -1);
  assert.equal(ack.data.outputs.quota_size, '');
});

test('an administrator also gets the server device', async (t) => {
  const world = await createWorld({ seafile: new FakeSeafile({ admin: true }) });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.name),
    ['Seafile admin', 'Seafile server'],
  );
  await createDevices(world);
  assert.equal(server(world, SERVER_KEYS.USERS), 2);
  assert.equal(server(world, SERVER_KEYS.ACTIVE_USERS), 2);
  assert.equal(server(world, SERVER_KEYS.LIBRARIES), 4);
  assert.equal(server(world, SERVER_KEYS.FILES), 2);
  assert.equal(server(world, SERVER_KEYS.GROUPS), 1);
  assert.equal(server(world, SERVER_KEYS.DEVICES), 1);
  assert.equal(server(world, SERVER_KEYS.CONNECTED_DEVICES), 1);
  assert.equal(server(world, SERVER_KEYS.STORAGE), 5);
});

test('a regular account is asked the server figures once an hour, not at every read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const asked = () =>
    world.seafile.requests.filter((r) => r === 'GET /api/v2.1/admin/sysinfo/').length;
  for (let i = 0; i < 5; i += 1) {
    world.clock.advance(MINUTE);
    await world.hub.pollNow();
  }
  assert.equal(asked(), 1);
  // Promoted to administrator: the server device appears within the hour.
  world.seafile.admin = true;
  world.clock.advance(HOUR);
  await world.hub.pollNow();
  assert.equal(asked(), 2);
  assert.equal(world.fake.discoveredDevices.length, 2);
});

test('a library modified fires the trigger, once, with who modified it', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.seafile.touch('Documents', { size: 7_000_000, modifier: 'Bob' });
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.LIBRARY_MODIFIED), [
    {
      key: TRIGGERS.LIBRARY_MODIFIED,
      data: {
        library: 'Documents',
        owner: 'Alice',
        modified_by: 'Bob',
        size: '7.0 MB',
        size_bytes: 7_000_000,
        shared: false,
      },
    },
  ]);
  // Nothing new: nothing fired again.
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.LIBRARY_MODIFIED).length, 1);
  // A shared library too.
  world.seafile.touch('Family');
  await world.hub.pollNow();
  const last = events(world, TRIGGERS.LIBRARY_MODIFIED).at(-1).data;
  assert.equal(last.library, 'Family');
  assert.equal(last.shared, true);
  assert.equal(last.owner, 'admin');
});

test('a new library is recorded, not announced; a deleted one is forgotten', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.seafile.repos.push({ ...world.seafile.repos[0], id: 'new-id', name: 'Music' });
  world.seafile.repos = world.seafile.repos.filter((r) => r.name !== 'Photos');
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.LIBRARY_MODIFIED).length, 0);
  assert.deepEqual(Object.keys(world.hub.saved.mtimes).includes('new-id'), true);
  world.seafile.touch('Music');
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.LIBRARY_MODIFIED).at(-1).data.library, 'Music');
});

test('the scene events are capped per reading cycle', async (t) => {
  const seafile = new FakeSeafile();
  const template = seafile.repos[0];
  for (let i = 0; i < MAX_LIBRARY_EVENTS + 5; i += 1) {
    seafile.repos.push({ ...template, id: `id-${i}`, name: `Lib ${i}` });
  }
  const world = await createWorld({ seafile });
  t.after(() => world.app.stop());
  for (const repo of seafile.repos) {
    repo.mtime += 10;
  }
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.LIBRARY_MODIFIED).length, MAX_LIBRARY_EVENTS);
});

test('a modification made while the integration was stopped is announced after a restart, once', async (t) => {
  const clock = createClock();
  const seafile = new FakeSeafile();
  const first = await createWorld({ clock, seafile });
  await first.app.stop();
  seafile.touch('Photos');
  const second = await createWorld({ clock, seafile, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.deepEqual(
    events(second, TRIGGERS.LIBRARY_MODIFIED).map((e) => e.data.library),
    ['Photos'],
  );
  await second.app.stop();
  const third = await createWorld({ clock, seafile, dataDir: first.dataDir });
  t.after(() => third.app.stop());
  assert.equal(events(third, TRIGGERS.LIBRARY_MODIFIED).length, 0);
});

test('another account: what was seen of the previous one is not announced', async (t) => {
  const clock = createClock();
  const first = await createWorld({ clock });
  await first.app.stop();
  const other = new FakeSeafile({ admin: true });
  for (const repo of other.repos) {
    repo.mtime += 100;
  }
  const second = await createWorld({ clock, seafile: other, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.equal(second.fake.sceneEvents.length, 0);
});

test('the quota above the threshold fires once, again only after going back down', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.seafile.setUsage(91_000_000);
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.QUOTA_THRESHOLD), [
    {
      key: TRIGGERS.QUOTA_THRESHOLD,
      data: { percent: 91, threshold: 90, used_size: '91.0 MB', quota_size: '100.0 MB' },
    },
  ]);
  world.seafile.setUsage(96_000_000);
  await world.hub.pollNow();
  // Just below the threshold: still "above" (5 points of hysteresis).
  world.seafile.setUsage(87_000_000);
  await world.hub.pollNow();
  world.seafile.setUsage(92_000_000);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.QUOTA_THRESHOLD).length, 1);
  world.seafile.setUsage(50_000_000);
  await world.hub.pollNow();
  world.seafile.setUsage(90_000_000);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.QUOTA_THRESHOLD).length, 2);
});

test('a quota already above the threshold at the first read is not announced', async (t) => {
  const seafile = new FakeSeafile();
  seafile.setUsage(95_000_000);
  const world = await createWorld({ seafile });
  t.after(() => world.app.stop());
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.QUOTA_THRESHOLD).length, 0);
  // A lower threshold chosen: recorded again, not announced.
  await world.fake.configUpdated(baseConfig({ quota_threshold: '70' }));
  assert.equal(events(world, TRIGGERS.QUOTA_THRESHOLD).length, 0);
});

test('Seafile down: online 0, unreachable badge, status, back again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.seafile.down = true;
  await world.hub.pollNow();
  assert.equal(account(world, ACCOUNT_KEYS.ONLINE), 0);
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(world.fake.connectionStatus.message.en, 'Seafile does not answer');
  // The Discovery list is kept.
  assert.equal(world.fake.discoveredDevices.length, 1);
  world.seafile.down = false;
  await world.hub.pollNow();
  assert.equal(account(world, ACCOUNT_KEYS.ONLINE), 1);
  assert.equal(world.fake.transports.at(-1).transport, 'local');
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('wrong password, two-factor authentication: a readable status', async (t) => {
  const seafile = new FakeSeafile();
  seafile.password = 'other';
  const world = await createWorld({ seafile });
  t.after(() => world.app.stop());
  assert.equal(
    world.fake.connectionStatus.message.fr,
    'identifiant, mot de passe ou jeton refusé par Seafile',
  );
  seafile.password = baseConfig().password;
  seafile.otp = true;
  await world.fake.action('test_connection', {});
  assert.equal(
    world.fake.connectionStatus.message.en,
    'two-factor authentication is on: use an API token',
  );
});

test('the token is asked once, and again when Seafile revokes it', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.equal(world.seafile.logins, 1);
  world.seafile.revokeTokens();
  await world.hub.pollNow();
  assert.equal(world.seafile.logins, 2);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('an API token instead of the password: no login', async (t) => {
  const world = await createWorld({
    config: baseConfig({ username: '', password: '', api_token: API_TOKEN }),
  });
  t.after(() => world.app.stop());
  assert.equal(world.seafile.logins, 0);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.discoveredDevices.length, 1);
});

test('the configuration incomplete: a status saying what is missing', async (t) => {
  const world = await createWorld({ config: { url: '', language: 'en' } });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /address of your Seafile server/);
  await world.fake.configUpdated({ url: 'http://192.0.2.10:8000', language: 'en' });
  assert.match(world.fake.connectionStatus.message.en, /username and password/);
  await world.fake.configUpdated({ url: 'ftp://x', username: 'a', password: 'b' });
  assert.match(world.fake.connectionStatus.message.en, /Address not understood/);
  assert.deepEqual(world.seafile.requests, []);
});

test('"State of the account": figures and a sentence in the chosen language', async (t) => {
  const world = await createWorld({ config: baseConfig({ language: 'fr' }) });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('get_account_status', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    account: 'Alice',
    used_size: '5.0 MB',
    quota_size: '100.0 MB',
    quota_percent: 5,
    libraries: 2,
    shared_libraries: 1,
    devices: 1,
    last_modified_library: 'Family',
    last_modified_time: '25/10 02:53',
    sentence:
      'Seafile : 5.0 MB utilisés sur 100.0 MB (5 %), 2 bibliothèques, dernière modification : Family le 25/10 02:53.',
  });
});

test('"State of the account" fails with a readable error when Seafile is down', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.seafile.down = true;
  world.clock.advance(MINUTE);
  const ack = await world.fake.sceneAction('get_account_status', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /Seafile does not answer/);
});

test('"Test the connection" reports the version, the account and the libraries', async (t) => {
  const world = await createWorld({ seafile: new FakeSeafile({ admin: true }) });
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  const message = ack.data?.message ?? ack.message;
  assert.match(JSON.stringify(message), /connected to 12\.0\.14 as admin/);
  assert.match(JSON.stringify(message), /administrator/);
});

test('the widget: quota gauge, space, libraries newest first, a Refresh button', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await world.fake.widgetGet(WIDGET_KEY, { language });
    assert.equal(ack.success, true, ack.error);
    const content = ack.data.content;
    assert.deepEqual(validateWidgetContent(content), []);
    const types = content.components.map((c) => c.type);
    assert.deepEqual(types, ['gauge', 'value', 'value', 'status', 'button']);
  }
  const data = (await world.fake.widgetGet(WIDGET_KEY, { language: 'en' })).data.content;
  assert.equal(data.components[0].value, 5);
  assert.equal(data.components[1].value, '5.0 MB');
  assert.equal(data.components[2].value, 3);
  assert.deepEqual(
    data.components[3].items.map((item) => item.label),
    ['Family', 'Documents', 'Photos'],
  );
  const action = await world.fake.widgetAction(WIDGET_KEY, 'refresh');
  assert.equal(action.success, true, action.error);
});

test('the widget says what is wrong: not configured, Seafile down', async (t) => {
  const world = await createWorld({ config: { url: '', language: 'en' } });
  t.after(() => world.app.stop());
  let data = (await world.fake.widgetGet(WIDGET_KEY, { language: 'en' })).data.content;
  assert.equal(data.components[0].type, 'text');
  await world.fake.configUpdated(baseConfig());
  world.seafile.down = true;
  await world.hub.pollNow();
  data = (await world.fake.widgetGet(WIDGET_KEY, { language: 'en' })).data.content;
  assert.ok(data.components.some((c) => c.type === 'text' && c.text === 'Seafile does not answer'));
  assert.deepEqual(validateWidgetContent(data), []);
});

test('the widget is refreshed when what it shows changed, and on a device added', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = world.fake.widgetRefreshes.length;
  await world.hub.pollNow();
  assert.equal(world.fake.widgetRefreshes.length, before);
  world.seafile.touch('Photos');
  await world.hub.pollNow();
  assert.equal(world.fake.widgetRefreshes.length, before + 1);
  await createDevices(world);
  assert.equal(world.fake.widgetRefreshes.length, before + 2);
});

test('the container reads Seafile on its own timer', async (t) => {
  const world = await createWorld({ timers: true, config: baseConfig({ poll_interval: '30' }) });
  t.after(() => world.app.stop());
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // The timer of the first read was set before the mock: schedule again.
  world.hub.schedulePoll();
  const reads = () => world.seafile.requests.filter((r) => r === 'GET /api2/repos/').length;
  const before = reads();
  t.mock.timers.tick(30_000);
  await new Promise((resolve) => setImmediate(resolve));
  await world.hub.polling;
  assert.equal(reads(), before + 1);
});

test('Seafile down at a restart: the account added goes offline all the same', async (t) => {
  const clock = createClock();
  const seafile = new FakeSeafile();
  const first = await createWorld({ clock, seafile });
  const device = first.fake.discoveredDevices[0];
  await first.app.stop();
  seafile.down = true;
  const second = await createWorld({ clock, seafile, dataDir: first.dataDir, devices: [device] });
  t.after(() => second.app.stop());
  assert.equal(account(second, ACCOUNT_KEYS.ONLINE), 0);
  assert.equal(second.fake.transports.at(-1).transport, 'unreachable');
});

test('a refused password is not tried again at every read, only on "Test the connection"', async (t) => {
  const seafile = new FakeSeafile();
  seafile.password = 'other';
  const world = await createWorld({ seafile });
  t.after(() => world.app.stop());
  for (let i = 0; i < 3; i += 1) {
    await world.hub.pollNow();
  }
  assert.equal(seafile.logins, 1);
  seafile.password = baseConfig().password;
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(seafile.logins, 2);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the server figures failing only hide the server device, the account still reads', async (t) => {
  const seafile = new FakeSeafile({ admin: true });
  seafile.sysinfoStatus = 500;
  const world = await createWorld({ seafile });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.name),
    ['Seafile admin'],
  );
});

test('another account: the device of the previous one goes offline', async (t) => {
  const clock = createClock();
  const first = await createWorld({ clock });
  const device = first.fake.discoveredDevices[0];
  await first.app.stop();
  const second = await createWorld({
    clock,
    seafile: new FakeSeafile({ admin: true }),
    dataDir: first.dataDir,
    devices: [device],
  });
  t.after(() => second.app.stop());
  assert.equal(
    second.fake.lastState(accountIds(second.gladys, first.seafile.account.email).feature('online')),
    0,
  );
});
