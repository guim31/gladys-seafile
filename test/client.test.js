// -----------------------------------------------------------------------------
// The Seafile client on the real answers of Seafile CE 12.0.14 (fixtures) and
// on the errors a user meets: wrong address, redirect, refused token, a page
// that is not Seafile, a refused certificate, throttling.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_KINDS,
  SeafileClient,
  normalizeAccount,
  normalizeRepos,
} from '../src/seafile/client.js';
import {
  API_TOKEN,
  BASE,
  FakeSeafile,
  PASSWORD,
  USERNAME,
  fixture,
} from './helpers/fakeSeafile.js';

const client = (request, extra = {}) =>
  new SeafileClient({ url: BASE, username: USERNAME, password: PASSWORD, request, ...extra });

const answer =
  (status, body = '', headers = {}) =>
  async () => ({ status, headers, body });

test('the account: bytes, a quota of -2 is unlimited', () => {
  const alice = normalizeAccount(fixture('account.json'));
  assert.deepEqual(alice, {
    email: 'e161e60e5af34c2c863fc284344896e3@auth.local',
    name: 'Alice',
    usage: 5_000_000,
    quota: 100_000_000,
    isStaff: false,
  });
  const admin = normalizeAccount(fixture('account-admin.json'));
  assert.equal(admin.quota, null);
  assert.equal(admin.isStaff, true);
});

test('the libraries: each once, own ones kept as own, mtime in milliseconds', () => {
  const repos = normalizeRepos(fixture('repos.json'));
  assert.deepEqual(
    repos.map((r) => [r.name, r.kind, r.owner, r.size]),
    [
      ['Documents', 'mine', 'Alice', 5_000_000],
      ['Photos', 'mine', 'Alice', 0],
      ['Family', 'shared', 'admin', 0],
    ],
  );
  assert.equal(repos[0].mtime, 1792889622_000);
});

test('the linked devices never keep their token', async () => {
  const seafile = new FakeSeafile();
  const devices = await client(seafile.request).devices();
  assert.deepEqual(devices, [
    {
      name: 'laptop',
      platform: 'linux',
      desktop: true,
      lastAccessed: Date.parse('2026-10-25T02:53:42+02:00'),
    },
  ]);
  assert.ok(!JSON.stringify(devices).includes(fixture('devices.json')[0].key));
});

test('login: the form sent, the token kept, the API token used as is', async () => {
  const seafile = new FakeSeafile();
  const c = client(seafile.request);
  assert.equal((await c.account()).name, 'Alice');
  assert.equal((await c.repos()).length, 3);
  assert.equal(seafile.logins, 1);
  const withToken = new SeafileClient({ url: BASE, apiToken: API_TOKEN, request: seafile.request });
  assert.equal((await withToken.account()).name, 'Alice');
  assert.equal(seafile.logins, 1);
  // A refused API token is not "logged in again".
  seafile.tokens.clear();
  await assert.rejects(withToken.account(), { kind: ERROR_KINDS.AUTH });
});

test('the server figures: null for a regular account', async () => {
  assert.equal(await client(new FakeSeafile().request).sysinfo(), null);
  const info = await client(new FakeSeafile({ admin: true }).request).sysinfo();
  assert.equal(info.users, 2);
  assert.equal(info.storage, 5_000_000);
});

test('errors are classified for the user', async () => {
  const cases = [
    [answer(302, '', { location: 'https://x' }), ERROR_KINDS.REDIRECT],
    [answer(404, '<html>'), ERROR_KINDS.NOT_SEAFILE],
    [answer(200, '<html>'), ERROR_KINDS.NOT_SEAFILE],
    [answer(200, '{"hello":1}'), ERROR_KINDS.NOT_SEAFILE],
    [answer(429, '{}'), ERROR_KINDS.THROTTLED],
    [answer(500, ''), ERROR_KINDS.HTTP],
    [
      async () => {
        throw Object.assign(new Error('x'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
      },
      ERROR_KINDS.TLS,
    ],
    [
      async () => {
        throw Object.assign(new Error('x'), { code: 'EHOSTUNREACH' });
      },
      ERROR_KINDS.UNREACHABLE,
    ],
  ];
  for (const [request, kind] of cases) {
    await assert.rejects(client(request).version(), { kind }, kind);
  }
  await assert.rejects(client(answer(400, '{"non_field_errors":[]}')).account(), {
    kind: ERROR_KINDS.AUTH,
  });
});

test('no secret in an error message', async () => {
  const seafile = new FakeSeafile();
  seafile.password = 'other';
  const error = await client(seafile.request)
    .account()
    .catch((err) => err);
  assert.equal(error.kind, ERROR_KINDS.AUTH);
  assert.ok(!error.message.includes(PASSWORD));
});
