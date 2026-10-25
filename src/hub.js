// -----------------------------------------------------------------------------
// The Seafile hub: the account read on a timer of the container (the interval
// chosen in the configuration); the states of the added devices published when
// they change, the scene events fired when a library is modified or the quota
// crosses the threshold, and the views the widget and the scene action read.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 15 minutes, beyond the fixed list of the core scheduler, and the scene
// events must fire whether the devices are added or not.
//
// A library is "modified" when its modification time (`mtime` of /api2/repos/,
// moved by every commit: file added, changed, deleted, renamed) goes forward.
// The last one seen of every library is kept in /data (src/store.js), so a
// modification made while the integration or Gladys restarted is still
// announced, once. The first read only records.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  accountIds,
  accountValues,
  buildAccountDevice,
  buildServerDevice,
  quotaPercent,
  serverIds,
  serverValues,
} from './devices.js';
import { SeafileClient, SeafileError } from './seafile/client.js';
import { hasCredentials, hostOf, normalizeConfig } from './config.js';
import { ProblemLog } from './problems.js';
import { CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, formatBytes, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'seafile-hub' });

export const WIDGET_KEY = 'storage';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  LIBRARY_MODIFIED: 'library_modified',
  QUOTA_THRESHOLD: 'quota_threshold_reached',
});

export const HUB_TIMINGS = {
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // A scene action reads Seafile again when the last read is older.
  freshMs: 15_000,
  // A non-administrator account is asked again this often (it may be promoted).
  adminRetryMs: 3600_000,
};

// Scene events per reading cycle: a sync of 300 libraries does not start 300 scenes.
export const MAX_LIBRARY_EVENTS = 20;
// A quota event fires again once the usage went this many points below the threshold.
export const QUOTA_HYSTERESIS = 5;

export class SeafileHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/seafile/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    // Defaults until start(): a handler reached after a failed start still
    // answers with a readable message.
    this.config = normalizeConfig({});
    this.client = null;
    this.signature = null;
    this.resetView();
    this.polling = null;
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.widgetKey = null;
    this.saved = this.emptySaved();
    this.pollTimer = null;
    this.stopped = false;
    // What fails again at every cycle (Gladys refusing, the reading loop):
    // one line when it starts, one when it ends.
    this.problems = new ProblemLog(logger);
  }

  resetView() {
    this.account = null;
    this.repos = [];
    this.linkedDevices = [];
    this.sysinfo = null;
    this.admin = null; // null before the first answer of /admin/sysinfo/
    this.adminAt = 0;
    this.version = null;
    this.readAt = 0;
    this.error = null;
  }

  emptySaved(email = null) {
    return { email, mtimes: null, quotaAbove: null, quotaThreshold: null };
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const object = (value) => (value && typeof value === 'object' ? value : null);
    this.saved = {
      email: typeof saved?.email === 'string' ? saved.email : null,
      mtimes: object(saved?.mtimes),
      quotaAbove: typeof saved?.quotaAbove === 'boolean' ? saved.quotaAbove : null,
      quotaThreshold: saved?.quotaThreshold ?? null,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const languageChanged = this.signature !== null && this.config.language !== config.language;
    this.config = config;
    const signature = JSON.stringify([
      config.url,
      config.apiToken,
      config.username,
      config.password,
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.client =
        config.url && hasCredentials(config)
          ? new SeafileClient({
              url: config.url,
              apiToken: config.apiToken,
              username: config.username,
              password: config.password,
              request: this.request,
            })
          : null;
      this.resetView();
      this.polling = null;
    }
    if (languageChanged) {
      this.discovered = null; // new names for the Discovery tab
    }
    try {
      if (this.client) {
        await this.pollNow({ publish: true });
      } else {
        await this.afterChanges({ publish: true });
      }
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading Seafile works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Reading Seafile -----------------------------------------------------------

  /** Read the account now and publish what changed. */
  async pollNow({ publish = false } = {}) {
    await this.poll();
    await this.afterChanges({ publish });
  }

  /** Read again when the last read is older than `freshMs` (scene actions). */
  async refreshIfStale() {
    if (this.client && this.now() - this.readAt >= this.timings.freshMs) {
      await this.pollNow();
    }
  }

  /** Read the account and apply what changed. Concurrent calls share the read. */
  poll() {
    if (!this.client) {
      return Promise.resolve();
    }
    if (!this.polling) {
      const polling = this.read(this.client).finally(() => {
        // A read of a previous client must not drop the promise of the current one.
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    return this.polling;
  }

  async read(client) {
    let snapshot;
    try {
      snapshot = await this.fetch(client);
    } catch (err) {
      if (!(err instanceof SeafileError)) {
        throw err;
      }
      if (client === this.client) {
        this.applyFailure(err);
        await this.publishStates(); // "Online" goes to 0
      }
      return;
    }
    if (client === this.client) {
      await this.applySuccess(snapshot);
    }
  }

  /** Everything Seafile says. The server figures are asked again later for a non-admin. */
  async fetch(client) {
    const version = this.version ?? (await client.version());
    const account = await client.account();
    const repos = await client.repos();
    const devices = await client.devices();
    const now = this.now();
    const askAdmin = this.admin !== false || now - this.adminAt >= this.timings.adminRetryMs;
    const sysinfo = askAdmin ? await client.sysinfo() : null;
    return { version, account, repos, devices, sysinfo, askAdmin };
  }

  async applySuccess({ version, account, repos, devices, sysinfo, askAdmin }) {
    if (this.error) {
      logger.info('Seafile answers again');
    }
    const admin = askAdmin ? sysinfo !== null : this.admin;
    if (this.readAt === 0) {
      logger.info(
        `Seafile ${version} (${hostOf(this.config.url)}): ${repos.length} library(ies)` +
          `${admin ? ', administrator' : ''}`,
      );
    } else if (admin !== this.admin) {
      logger.info(
        admin ? 'The account is an administrator now' : 'The account is no longer an administrator',
      );
    }
    const now = this.now();
    this.error = null;
    this.readAt = now;
    this.version = version;
    this.account = account;
    this.repos = repos;
    this.linkedDevices = devices;
    if (askAdmin) {
      this.admin = admin;
      this.adminAt = now;
      this.sysinfo = sysinfo;
    }

    let dirty = false;
    if (this.saved.email !== account.email) {
      // Another account: what was seen of the previous one means nothing here.
      this.saved = this.emptySaved(account.email);
      dirty = true;
    }
    dirty = (await this.applyLibraries()) || dirty;
    dirty = (await this.applyQuota()) || dirty;
    // Written only when something changed: no wear of the SD card at every read.
    if (dirty) {
      this.store.save(this.saved);
    }
    await this.publishStates();
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`Seafile: ${err.message}`);
    }
  }

  /** The libraries modified since the last read; the first read (or a new library) only records. */
  async applyLibraries() {
    const before = this.saved.mtimes;
    const mtimes = Object.fromEntries(this.repos.map((repo) => [repo.id, repo.mtime]));
    const modified = before
      ? this.repos
          .filter((repo) => before[repo.id] !== undefined && repo.mtime > before[repo.id])
          .sort((a, b) => b.mtime - a.mtime)
      : [];
    const dirty = JSON.stringify(mtimes) !== JSON.stringify(before);
    this.saved.mtimes = mtimes;
    for (const repo of modified.slice(0, MAX_LIBRARY_EVENTS)) {
      logger.debug(`Library "${repo.name}" modified by ${repo.modifier}`);
      await this.fire(TRIGGERS.LIBRARY_MODIFIED, {
        library: repo.name,
        owner: repo.owner,
        modified_by: repo.modifier,
        size: formatBytes(repo.size),
        size_bytes: repo.size,
        shared: repo.kind !== 'mine',
      });
    }
    if (modified.length > MAX_LIBRARY_EVENTS) {
      logger.info(
        `${modified.length} libraries modified since the last read: the first ${MAX_LIBRARY_EVENTS} announced`,
      );
    }
    return dirty;
  }

  /** The quota crossing the threshold; the first read only records. */
  async applyQuota() {
    let dirty = false;
    const threshold = this.config.quotaThreshold;
    if (this.saved.quotaThreshold !== threshold) {
      // Another threshold: recorded again, not announced.
      this.saved.quotaThreshold = threshold;
      this.saved.quotaAbove = null;
      dirty = true;
    }
    const percent = quotaPercent(this.account);
    const before = this.saved.quotaAbove;
    if (percent === null) {
      if (before !== null) {
        this.saved.quotaAbove = null;
        dirty = true;
      }
      return dirty;
    }
    let above = before ?? percent >= threshold;
    if (before === false && percent >= threshold) {
      above = true;
      logger.info(`Seafile quota ${percent} % used`);
      await this.fire(TRIGGERS.QUOTA_THRESHOLD, {
        percent,
        threshold,
        used_size: formatBytes(this.account.usage),
        quota_size: formatBytes(this.account.quota),
      });
    } else if (before === true && percent < threshold - QUOTA_HYSTERESIS) {
      above = false;
    }
    if (above !== before) {
      this.saved.quotaAbove = above;
      dirty = true;
    }
    return dirty;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  discoveredDevices() {
    const language = this.config.language;
    if (!this.client || this.readAt === 0 || !this.account) {
      return null; // nothing read: keep the list Gladys has
    }
    const devices = [buildAccountDevice(this.gladys, this.account, language, this.version ?? '')];
    if (this.admin) {
      devices.push(buildServerDevice(this.gladys, language, this.version ?? ''));
    }
    return devices;
  }

  /** Publish the Discovery list when it changed (the account became an administrator…). */
  async publishDevices({ force = false } = {}) {
    if (this.error && this.client) {
      return; // Seafile does not answer: keep the list Gladys has
    }
    const devices = this.discoveredDevices() ?? (this.client ? null : []);
    if (devices === null) {
      return;
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Seafile, publish the list again. */
  async rediscover() {
    await this.poll();
    await this.afterChanges({ publish: true });
  }

  /**
   * The user added (or updated) a device: its states sent before were dropped
   * by Gladys, and a device deleted then added again needs its badge.
   */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device.external_id);
    this.transports.delete(device.external_id);
    await this.publishStates();
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll, only if it polls anyway). */
  async pollDevice() {
    await this.pollNow();
  }

  /** The external ids of our devices (account known once read). */
  deviceIds() {
    const ids = [serverIds(this.gladys).device];
    if (this.account) {
      ids.unshift(accountIds(this.gladys, this.account.email).device);
    }
    return ids;
  }

  /**
   * The states of the added devices. The SDK skips the values Gladys already
   * has (and sends an unchanged one again after `heartbeatMs`).
   */
  async publishStates() {
    if (this.readAt === 0 || !this.account) {
      return;
    }
    const states = [];
    const push = (values) => {
      for (const { key: _key, ...state } of values) {
        states.push(state);
      }
    };
    if (this.isCreated(accountIds(this.gladys, this.account.email).device)) {
      push(
        accountValues(this.gladys, this.account.email, {
          online: !this.error,
          account: this.account,
          repos: this.repos,
          devices: this.linkedDevices,
          language: this.config.language,
        }),
      );
    }
    if (!this.error && this.sysinfo && this.isCreated(serverIds(this.gladys).device)) {
      push(serverValues(this.gladys, this.sysinfo));
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges({ publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    // The widget reloads when what it shows changed.
    const widgetKey = JSON.stringify([
      this.error?.kind,
      this.account?.usage,
      this.account?.quota,
      this.repos.map((repo) => [repo.id, repo.name, repo.size, repo.mtime]),
    ]);
    if (widgetKey !== this.widgetKey) {
      this.widgetKey = widgetKey;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: local, or unreachable. */
  async publishTransports() {
    if (!this.client || this.readAt === 0 || !this.account) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const entries = this.deviceIds()
      .filter((id) => this.isCreated(id) && this.transports.get(id) !== transport)
      .map((id) => ({ external_id: id, transport }));
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.problems.recover('transports', 'Transports accepted again');
    } catch (err) {
      this.problems.fail('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.urlTyped) {
      return { connected: false, message: CONNECTION_TEXT.noUrl };
    }
    if (!this.config.url) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (!hasCredentials(this.config)) {
      return { connected: false, message: CONNECTION_TEXT.noCredentials };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Views (widget, scene action, report) ------------------------------------------

  /** Throws the reason Seafile cannot answer, if any. */
  assertReadable() {
    const status = this.connectionStatus();
    if (!status.connected) {
      throw new Error(pick(status.message, this.config.language));
    }
  }

  /** The account, read again if stale; throws a readable error. */
  async currentAccount() {
    // Only the configuration first: a past error is what the read below clears.
    if (!this.client) {
      this.assertReadable();
    }
    await this.refreshIfStale();
    this.assertReadable();
    return this.account;
  }

  /** "Test the connection": read Seafile now, one line. */
  async testConnection() {
    await this.pollNow({ publish: true });
    const message = {};
    const status = this.connectionStatus();
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!status.connected) {
        message[language] = labelled('Seafile', pick(status.message, language), language);
        continue;
      }
      const account = this.account;
      const parts = [
        text.ok(this.version, account.name),
        text.usage(formatBytes(account.usage), account.quota ? formatBytes(account.quota) : null),
        text.libraries(this.repos.length),
        ...(this.admin ? [text.admin] : []),
      ];
      message[language] = labelled('Seafile', parts.join(', '), language);
    }
    logger.info('Connection tested from Gladys');
    return message;
  }
}
