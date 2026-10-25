// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Seafile account, reached through the Web API of Seahub (the address of
// the web interface) with its username and password, or an API token.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds: the delay of
// the "library modified" trigger.
export const POLL_INTERVALS = ['30', '60', '300', '900'];

// Quota thresholds offered for the "quota above the threshold" trigger, in %.
export const QUOTA_THRESHOLDS = ['70', '80', '90', '95'];

export const DEFAULT_CONFIG = {
  url: '',
  username: '',
  password: '',
  api_token: '',
  poll_interval: '60',
  quota_threshold: '90',
  language: 'fr',
};

// Pages of the Seafile web interface: a URL copied from the browser points at
// one of them, the API lives at the root of Seahub.
const INTERFACE_PATH =
  /\/(library|libraries|my-libs|shared-libs|groups?|starred|dashboard|linked-devices|share-admin-[a-z-]+|profile|accounts|sys|org|api2|api|seafhttp)(\/.*)?$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, HTTP then), or a URL copied from the browser
 * (`https://cloud.example.com/library/…`). A path is kept (Seahub behind a
 * sub-path, SITE_ROOT), the interface pages dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const value = raw.trim();
  if (!value) {
    return null;
  }
  const bare = !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  let url;
  try {
    url = new URL(bare ? `http://${value}` : value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown in the logs (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const choice = (key, list) =>
    list.includes(String(source[key])) ? String(source[key]) : DEFAULT_CONFIG[key];
  const typed = text('url');
  return {
    url: typed ? parseServerUrl(typed) : null,
    urlTyped: Boolean(typed),
    apiToken: text('api_token'),
    username: text('username'),
    // Never trimmed: a password may end with a space.
    password: typeof source.password === 'string' ? source.password : '',
    pollIntervalMs: Number(choice('poll_interval', POLL_INTERVALS)) * 1000,
    quotaThreshold: Number(choice('quota_threshold', QUOTA_THRESHOLDS)),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

/** Whether the configuration holds credentials: an API token, or a username and a password. */
export const hasCredentials = (config) =>
  Boolean(config.apiToken || (config.username && config.password));
