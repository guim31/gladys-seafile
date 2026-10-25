// -----------------------------------------------------------------------------
// An in-memory Seafile behind the request seam of src/seafile/client.js. It
// starts from the real answers of Seafile CE 12.0.14 (test/fixtures/seafile:
// the account "Alice" with a 100 MB quota, two libraries of her own, one
// shared with her and with her group, a linked desktop client) and lets the
// tests modify a library, change the quota, refuse the credentials or go down.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const BASE = 'http://192.0.2.10:8000';
export const USERNAME = 'alice@example.com';
export const PASSWORD = 'secret-password';
export const API_TOKEN = 'fedcba9876543210fedcba9876543210fedcba98';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/seafile/${name}`, import.meta.url), 'utf8'));

const json = (status, data, headers = {}) => ({ status, headers, body: JSON.stringify(data) });

export class FakeSeafile {
  constructor({ admin = false } = {}) {
    this.serverInfo = fixture('server-info.json');
    this.account = fixture(admin ? 'account-admin.json' : 'account.json');
    this.repos = fixture('repos.json');
    this.devices = fixture('devices.json');
    this.sysinfo = fixture('sysinfo.json');
    this.admin = admin;
    this.down = false;
    this.otp = false;
    this.password = PASSWORD;
    this.tokens = new Set([API_TOKEN]);
    this.logins = 0;
    this.requests = [];
    this.request = this.request.bind(this);
  }

  /** Something happened in a library: a newer mtime, a new size, the modifier. */
  touch(name, { seconds = 60, size, modifier } = {}) {
    for (const repo of this.repos.filter((r) => r.name === name)) {
      repo.mtime += seconds;
      if (size !== undefined) {
        repo.size = size;
      }
      if (modifier) {
        repo.modifier_name = modifier;
      }
    }
  }

  setUsage(usage, total = this.account.total) {
    this.account.usage = usage;
    this.account.total = total;
  }

  /** "Log out of all devices": every token issued so far is refused. */
  revokeTokens() {
    this.tokens = new Set([API_TOKEN]);
  }

  async request(url, { method = 'GET', headers = {}, body } = {}) {
    const { pathname } = new URL(url);
    const path = pathname.slice(new URL(BASE).pathname.replace(/\/$/, '').length);
    this.requests.push(`${method} ${path}`);
    if (this.down) {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }
    if (path === '/api2/server-info/') {
      return json(200, this.serverInfo);
    }
    if (path === '/api2/auth-token/' && method === 'POST') {
      this.logins += 1;
      const form = new URLSearchParams(body);
      if (form.get('username') !== USERNAME || form.get('password') !== this.password) {
        return json(400, fixture('bad-credentials.json'));
      }
      if (this.otp) {
        return json(
          400,
          { non_field_errors: ['Two factor auth token is missing.'] },
          { 'x-seafile-otp': 'required' },
        );
      }
      const token = `token-${this.logins}`;
      this.tokens.add(token);
      return json(200, { token });
    }
    const token = /^Token (.+)$/.exec(headers.authorization ?? '')?.[1];
    if (!this.tokens.has(token)) {
      return json(401, fixture('invalid-token.json'));
    }
    switch (path) {
      case '/api2/account/info/':
        return json(200, this.account);
      case '/api2/repos/':
        return json(200, this.repos);
      case '/api2/devices/':
        return json(200, this.devices);
      case '/api/v2.1/admin/sysinfo/':
        return this.admin ? json(200, this.sysinfo) : json(403, fixture('forbidden.json'));
      default:
        return { status: 404, headers: {}, body: '<h1>Not Found</h1>' };
    }
  }
}
