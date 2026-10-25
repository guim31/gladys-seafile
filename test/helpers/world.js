// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Seafile, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read Seafile with
// `world.hub.pollNow()`. (Adapted from guim31/gladys-sftpgo.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { accountIds, serverIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { API_TOKEN, BASE, FakeSeafile, PASSWORD, USERNAME, fixture } from './fakeSeafile.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';
// Dates are shown in the time zone of Gladys: the tests run in a fixed zone.
process.env.TZ = 'Europe/Paris';

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
// 25/10/2026 10:00 in Paris.
export const START = Date.UTC(2026, 9, 25, 9, 0, 0);

/** A manual clock, shared by the hub and the tests. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const baseConfig = (extra = {}) => ({
  url: BASE,
  username: USERNAME,
  password: PASSWORD,
  language: 'en',
  ...extra,
});

export async function createWorld({
  clock = createClock(),
  seafile = new FakeSeafile(),
  config = baseConfig(),
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-seafile-')),
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: seafile.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, seafile, app, hub: app.hub, clock, dataDir };
}

/** External ids of the account device (the fixture account) and of the server. */
export const accountIdsOf = (world, email = world.seafile.account.email) =>
  accountIds(world.gladys, email);
export const serverIdsOf = (world) => serverIds(world.gladys);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { API_TOKEN, BASE, FakeSeafile, PASSWORD, USERNAME, fixture };
