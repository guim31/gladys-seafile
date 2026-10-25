// -----------------------------------------------------------------------------
// Seafile client: the Web API of Seahub, checked against a real Seafile Server
// CE 12.0.14 (Docker image `seafileltd/seafile-mc`, MariaDB, memcached).
//
//   GET  /api2/server-info/          { version } (no authentication)
//   POST /api2/auth-token/           username + password -> a token (no expiry)
//   GET  /api2/account/info/         usage and quota of the account, in bytes
//   GET  /api2/repos/                the libraries the account sees: its own
//                                    ("repo"), shared with it ("srepo"), of its
//                                    groups ("grepo", once per group)
//   GET  /api2/devices/              the desktop and mobile clients linked
//   GET  /api/v2.1/admin/sysinfo/    the server: users, libraries, files,
//                                    storage, clients (HTTP 403 when the account
//                                    is not an administrator)
//
// Either an API token (`Authorization: Token …`), or the username (email or
// login id) and password of the account, traded once for a token that is kept
// in memory and asked again when refused. An account with two-factor
// authentication needs the token. Redirects are not followed.
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // username, password or token refused
  OTP: 'otp', // two-factor authentication: a token is needed
  NOT_SEAFILE: 'not_seafile', // something answers, not the Seafile API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  THROTTLED: 'throttled', // too many requests (HTTP 429)
  HTTP: 'http', // any other HTTP error
});

export class SeafileError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'SeafileError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * The one function that talks to the network. The client takes it as a
 * parameter: the tests replace it with an in-memory Seafile
 * (test/helpers/fakeSeafile.js).
 * @returns {Promise<{ status: number, headers: object, body: string }>}
 */
export function httpRequest(
  address,
  { method = 'GET', headers = {}, body, timeoutMs = 15_000 } = {},
) {
  const url = new URL(address);
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(
      url,
      { method, headers, timeout: timeoutMs, agent: false },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            response.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    const timeout = () =>
      request.destroy(Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' }));
    request.on('timeout', timeout);
    // `timeout` above is an idle timeout: a server that trickles bytes is cut here.
    const deadline = setTimeout(timeout, timeoutMs);
    request.on('close', () => clearTimeout(deadline));
    request.on('error', reject);
    request.end(body);
  });
}

// --- Parsing ---------------------------------------------------------------------

const count = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
const text = (value) => (typeof value === 'string' ? value : '');

/**
 * The account, as the integration needs it. Seafile says -2 for an unlimited
 * quota (and -1 when it cannot tell): `quota` is null then.
 */
export function normalizeAccount(raw) {
  return {
    email: text(raw.email),
    name: text(raw.name) || text(raw.contact_email) || text(raw.email),
    usage: count(raw.usage),
    quota: Number.isFinite(raw.total) && raw.total > 0 ? raw.total : null,
    isStaff: raw.is_staff === true,
  };
}

const REPO_TYPES = { repo: 'mine', srepo: 'shared', grepo: 'group' };

/**
 * The libraries, each once (a library shared with two groups is listed twice),
 * the account's own first. `mtime` in milliseconds.
 */
export function normalizeRepos(raw) {
  const repos = new Map();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id) {
      continue;
    }
    const kind = REPO_TYPES[item.type] ?? 'shared';
    const existing = repos.get(item.id);
    if (existing && (existing.kind === 'mine' || kind !== 'mine')) {
      continue;
    }
    repos.set(item.id, {
      id: item.id,
      name: text(item.name) || item.id,
      kind,
      owner: text(item.owner_name) || text(item.owner_nickname) || text(item.owner),
      modifier: text(item.modifier_name) || text(item.modifier_contact_email),
      size: count(item.size),
      mtime: count(item.mtime) * 1000,
      encrypted: item.encrypted === true || item.encrypted === 'true',
    });
  }
  return [...repos.values()];
}

/** A linked client (desktop or mobile app). Its `key` is a token: never kept. */
export function normalizeDevice(raw) {
  const accessed = Date.parse(text(raw.last_accessed));
  return {
    name: text(raw.device_name) || text(raw.platform),
    platform: text(raw.platform),
    desktop: raw.is_desktop_client === true,
    lastAccessed: Number.isFinite(accessed) ? accessed : null,
  };
}

export function normalizeSysinfo(raw) {
  return {
    users: count(raw.users_count),
    activeUsers: count(raw.active_users_count),
    libraries: count(raw.repos_count),
    files: count(raw.total_files_count),
    groups: count(raw.groups_count),
    storage: count(raw.total_storage),
    devices: count(raw.total_devices_count),
    connectedDevices: count(raw.current_connected_devices_count),
    pro: raw.is_pro === true,
  };
}

export class SeafileClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of Seahub, `http(s)://host[:port][/path]`
   * @param {string} [options.apiToken] API token of the account
   * @param {string} [options.username] email or login id (without token)
   * @param {string} [options.password]
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({
    url,
    apiToken = '',
    username = '',
    password = '',
    request = httpRequest,
    timeoutMs = 15_000,
  }) {
    this.url = url;
    this.apiToken = apiToken;
    this.username = username;
    this.password = password;
    this.request = request;
    this.timeoutMs = timeoutMs;
    this.token = apiToken || null;
    // The refusal of the password: not tried again at every read (Seahub counts
    // the failed logins and may freeze the account), only on retryLogin().
    this.loginRefused = null;
  }

  /** "Test the connection": the password may have been fixed in Seafile. */
  retryLogin() {
    this.loginRefused = null;
  }

  async send(path, { method = 'GET', headers = {}, body } = {}) {
    try {
      return await this.request(`${this.url}${path}`, {
        method,
        headers: { accept: 'application/json', ...headers },
        body,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new SeafileError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      throw new SeafileError(ERROR_KINDS.UNREACHABLE, code ?? err.message);
    }
  }

  static check(response) {
    const { status } = response;
    if (status >= 300 && status < 400) {
      throw new SeafileError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 401) {
      throw new SeafileError(ERROR_KINDS.AUTH, 'Token refused (HTTP 401)', { status });
    }
    if (status === 404) {
      throw new SeafileError(ERROR_KINDS.NOT_SEAFILE, 'Not found (HTTP 404)', { status });
    }
    if (status === 429) {
      throw new SeafileError(ERROR_KINDS.THROTTLED, 'Too many requests (HTTP 429)', { status });
    }
    if (status < 200 || status >= 300) {
      throw new SeafileError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
    }
  }

  static json(response) {
    try {
      return JSON.parse(response.body);
    } catch {
      throw new SeafileError(ERROR_KINDS.NOT_SEAFILE, 'The answer is not JSON');
    }
  }

  /** The version of the server: also tells that the address is a Seafile. */
  async version() {
    const response = await this.send('/api2/server-info/');
    SeafileClient.check(response);
    const data = SeafileClient.json(response);
    if (typeof data?.version !== 'string') {
      throw new SeafileError(ERROR_KINDS.NOT_SEAFILE, 'The answer is not a Seafile version');
    }
    return data.version;
  }

  async login() {
    if (this.loginRefused) {
      throw this.loginRefused;
    }
    try {
      await this.requestToken();
    } catch (err) {
      if (err.kind === ERROR_KINDS.AUTH || err.kind === ERROR_KINDS.OTP) {
        this.loginRefused = err;
      }
      throw err;
    }
  }

  async requestToken() {
    const body = new URLSearchParams({ username: this.username, password: this.password });
    const response = await this.send('/api2/auth-token/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const otp = response.headers?.['x-seafile-otp'];
    if (otp === 'required' || (response.status === 400 && /two.?factor/i.test(response.body))) {
      throw new SeafileError(ERROR_KINDS.OTP, 'Two-factor authentication: a token is needed');
    }
    // Wrong credentials: HTTP 400, "Unable to login with provided credentials."
    if (response.status === 400) {
      throw new SeafileError(ERROR_KINDS.AUTH, 'Username or password refused (HTTP 400)', {
        status: 400,
      });
    }
    SeafileClient.check(response);
    const data = SeafileClient.json(response);
    if (typeof data?.token !== 'string' || !data.token) {
      throw new SeafileError(ERROR_KINDS.NOT_SEAFILE, 'The answer is not a token');
    }
    this.token = data.token;
  }

  /** The raw answer of an API call; logs in again once when the token is refused. */
  async raw(path) {
    if (!this.token) {
      await this.login();
    }
    let response = await this.send(path, { headers: { authorization: `Token ${this.token}` } });
    if (response.status === 401 && !this.apiToken) {
      // The token was deleted (password changed, "log out of all devices").
      this.token = null;
      await this.login();
      response = await this.send(path, { headers: { authorization: `Token ${this.token}` } });
    }
    return response;
  }

  async call(path) {
    const response = await this.raw(path);
    SeafileClient.check(response);
    return SeafileClient.json(response);
  }

  async account() {
    const data = await this.call('/api2/account/info/');
    if (!data || typeof data !== 'object' || typeof data.email !== 'string') {
      throw new SeafileError(ERROR_KINDS.NOT_SEAFILE, 'The answer is not a Seafile account');
    }
    return normalizeAccount(data);
  }

  async repos() {
    const data = await this.call('/api2/repos/');
    if (!Array.isArray(data)) {
      throw new SeafileError(ERROR_KINDS.NOT_SEAFILE, 'The answer is not a library list');
    }
    return normalizeRepos(data);
  }

  async devices() {
    const data = await this.call('/api2/devices/');
    if (!Array.isArray(data)) {
      throw new SeafileError(ERROR_KINDS.NOT_SEAFILE, 'The answer is not a device list');
    }
    return data.filter((d) => d && typeof d === 'object').map(normalizeDevice);
  }

  /** The server figures; null when the account is not an administrator (HTTP 403). */
  async sysinfo() {
    const response = await this.raw('/api/v2.1/admin/sysinfo/');
    if (response.status === 403) {
      return null;
    }
    SeafileClient.check(response);
    const data = SeafileClient.json(response);
    if (!data || typeof data !== 'object' || !('users_count' in data)) {
      throw new SeafileError(ERROR_KINDS.NOT_SEAFILE, 'The answer is not a Seafile sysinfo');
    }
    return normalizeSysinfo(data);
  }
}
