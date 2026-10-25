import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hasCredentials, normalizeConfig, parseServerUrl } from '../src/config.js';

test('the address: bare host, URL copied from the browser, sub-path kept', () => {
  assert.equal(parseServerUrl('192.0.2.10'), 'http://192.0.2.10');
  assert.equal(parseServerUrl(' 192.0.2.10:8000 '), 'http://192.0.2.10:8000');
  assert.equal(parseServerUrl('https://cloud.example.com/'), 'https://cloud.example.com');
  assert.equal(
    parseServerUrl('https://cloud.example.com/library/03823731-ee0c/Documents/'),
    'https://cloud.example.com',
  );
  assert.equal(
    parseServerUrl('https://example.com/seafile/my-libs/'),
    'https://example.com/seafile',
  );
  assert.equal(parseServerUrl('http://192.0.2.10/api2/'), 'http://192.0.2.10');
});

test('the address: refused when unusable or carrying credentials', () => {
  for (const value of ['', '   ', 'ftp://192.0.2.10', 'http://', 'http://user:pw@192.0.2.10', 12]) {
    assert.equal(parseServerUrl(value), null, String(value));
  }
});

test('normalization: defaults, choices outside the lists, the password never trimmed', () => {
  const config = normalizeConfig({
    url: 'cloud.example.com',
    username: ' alice@example.com ',
    password: ' pass ',
    poll_interval: '7',
    quota_threshold: '80',
    language: 'it',
  });
  assert.equal(config.url, 'http://cloud.example.com');
  assert.equal(config.username, 'alice@example.com');
  assert.equal(config.password, ' pass ');
  assert.equal(config.pollIntervalMs, Number(DEFAULT_CONFIG.poll_interval) * 1000);
  assert.equal(config.quotaThreshold, 80);
  assert.equal(config.language, 'fr');
  assert.equal(hasCredentials(config), true);
  assert.equal(hasCredentials(normalizeConfig({ username: 'a' })), false);
  assert.equal(hasCredentials(normalizeConfig({ api_token: 'x' })), true);
  assert.deepEqual(normalizeConfig(null).url, null);
});
