// -----------------------------------------------------------------------------
// The Gladys devices, proposed in the Discovery tab (the user adds the ones to
// follow, nothing is created on their behalf):
//
//   - one device for the Seafile account, identified by a hash of its internal
//     email (the same account at another address keeps its device):
//       online                 input/binary            1 while Seafile answers
//       quota_used             level-sensor/liquid-level-percent  (0 without quota)
//       used_space             data/size (MB)          space used by the account
//       quota                  data/size (MB)          its quota, when it has one
//       libraries              counter-sensor/integer  libraries it owns
//       shared_libraries       counter-sensor/integer  shared with it, or of its groups
//       devices                counter-sensor/integer  desktop and mobile clients linked
//       last_modified_library  text/text               library modified last
//       last_modified_time     text/text               its day/month hours:minutes
//
//   - one "Seafile server" device, only when the account is an administrator:
//       users, active_users, libraries, files, groups, devices,
//       connected_devices      counter-sensor/integer
//       storage                data/size (MB)          storage of every library
//
// Published with should_poll: false: the integration reads Seafile on its own
// timer (src/hub.js).
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { formatTime } from './texts.js';

export const ACCOUNT_TYPE = 'account';
export const SERVER_TYPE = 'server';
export const SERVER_ID = 'main';
export const MODEL = 'Seafile';

// Suffixes of the feature external ids: permanent once published.
export const ACCOUNT_KEYS = Object.freeze({
  ONLINE: 'online',
  QUOTA_USED: 'quota_used',
  USED_SPACE: 'used_space',
  QUOTA: 'quota',
  LIBRARIES: 'libraries',
  SHARED_LIBRARIES: 'shared_libraries',
  DEVICES: 'devices',
  LAST_MODIFIED_LIBRARY: 'last_modified_library',
  LAST_MODIFIED_TIME: 'last_modified_time',
});

export const SERVER_KEYS = Object.freeze({
  USERS: 'users',
  ACTIVE_USERS: 'active_users',
  LIBRARIES: 'libraries',
  FILES: 'files',
  GROUPS: 'groups',
  DEVICES: 'devices',
  CONNECTED_DEVICES: 'connected_devices',
  STORAGE: 'storage',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
// Keys: `account_<key>` and `server_<key>`; `server` is the device name.
export const NAMES = {
  en: {
    server: 'Seafile server',
    account_online: 'Online',
    account_quota_used: 'Quota used',
    account_used_space: 'Space used',
    account_quota: 'Quota',
    account_libraries: 'My libraries',
    account_shared_libraries: 'Shared libraries',
    account_devices: 'Linked devices',
    account_last_modified_library: 'Last library modified',
    account_last_modified_time: 'Last modification',
    server_users: 'Users',
    server_active_users: 'Active users',
    server_libraries: 'Libraries',
    server_files: 'Files',
    server_groups: 'Groups',
    server_devices: 'Linked devices',
    server_connected_devices: 'Connected devices',
    server_storage: 'Storage used',
  },
  fr: {
    server: 'Serveur Seafile',
    account_online: 'En ligne',
    account_quota_used: 'Quota utilisé',
    account_used_space: 'Espace utilisé',
    account_quota: 'Quota',
    account_libraries: 'Mes bibliothèques',
    account_shared_libraries: 'Bibliothèques partagées',
    account_devices: 'Appareils liés',
    account_last_modified_library: 'Dernière bibliothèque modifiée',
    account_last_modified_time: 'Dernière modification',
    server_users: 'Utilisateurs',
    server_active_users: 'Utilisateurs actifs',
    server_libraries: 'Bibliothèques',
    server_files: 'Fichiers',
    server_groups: 'Groupes',
    server_devices: 'Appareils liés',
    server_connected_devices: 'Appareils connectés',
    server_storage: 'Stockage utilisé',
  },
  de: {
    server: 'Seafile-Server',
    account_online: 'Online',
    account_quota_used: 'Belegtes Kontingent',
    account_used_space: 'Belegter Speicher',
    account_quota: 'Kontingent',
    account_libraries: 'Meine Bibliotheken',
    account_shared_libraries: 'Geteilte Bibliotheken',
    account_devices: 'Verknüpfte Geräte',
    account_last_modified_library: 'Zuletzt geänderte Bibliothek',
    account_last_modified_time: 'Letzte Änderung',
    server_users: 'Benutzer',
    server_active_users: 'Aktive Benutzer',
    server_libraries: 'Bibliotheken',
    server_files: 'Dateien',
    server_groups: 'Gruppen',
    server_devices: 'Verknüpfte Geräte',
    server_connected_devices: 'Verbundene Geräte',
    server_storage: 'Belegter Speicher',
  },
  es: {
    server: 'Servidor Seafile',
    account_online: 'En línea',
    account_quota_used: 'Cuota usada',
    account_used_space: 'Espacio usado',
    account_quota: 'Cuota',
    account_libraries: 'Mis bibliotecas',
    account_shared_libraries: 'Bibliotecas compartidas',
    account_devices: 'Dispositivos vinculados',
    account_last_modified_library: 'Última biblioteca modificada',
    account_last_modified_time: 'Última modificación',
    server_users: 'Usuarios',
    server_active_users: 'Usuarios activos',
    server_libraries: 'Bibliotecas',
    server_files: 'Archivos',
    server_groups: 'Grupos',
    server_devices: 'Dispositivos vinculados',
    server_connected_devices: 'Dispositivos conectados',
    server_storage: 'Almacenamiento usado',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_COUNT = 1_000_000_000;
export const MAX_SIZE_MB = 1_000_000_000;

/** The id of an account in Gladys: a hash of its internal email (external ids are forever). */
export const accountId = (email) => createHash('sha256').update(email).digest('hex').slice(0, 16);

export const accountIds = (gladys, email) => gladys.externalIds(ACCOUNT_TYPE, accountId(email));
export const serverIds = (gladys) => gladys.externalIds(SERVER_TYPE, SERVER_ID);

/** Percentage of the quota used, one decimal; null without a quota. */
export function quotaPercent(account) {
  return account.quota ? Math.round((account.usage / account.quota) * 1000) / 10 : null;
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  });

const counter = (name, externalId) =>
  sensor(
    name,
    externalId,
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max: MAX_COUNT },
  );

const size = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.DATA, DEVICE_FEATURE_TYPES.DATA.SIZE, {
    unit: DEVICE_FEATURE_UNITS.MEGABYTE,
    keep_history: true,
    min: 0,
    max: MAX_SIZE_MB,
  });

const namesOf = (language) => NAMES[language] ?? NAMES.en;

/** The discovery payload of the account. */
export function buildAccountDevice(gladys, account, language = 'en', version = '') {
  const ids = accountIds(gladys, account.email);
  const names = namesOf(language);
  const name = (key) => names[`account_${key}`];
  const feature = (build, key) => build(name(key), ids.feature(key));
  return {
    name: `Seafile ${account.name}`.slice(0, 255),
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [
      { name: 'ACCOUNT', value: account.name.slice(0, 255) },
      ...(version ? [{ name: 'VERSION', value: version.slice(0, 255) }] : []),
    ],
    features: [
      sensor(
        name(ACCOUNT_KEYS.ONLINE),
        ids.feature(ACCOUNT_KEYS.ONLINE),
        DEVICE_FEATURE_CATEGORIES.INPUT,
        DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        { keep_history: true, min: 0, max: 1 },
      ),
      sensor(
        name(ACCOUNT_KEYS.QUOTA_USED),
        ids.feature(ACCOUNT_KEYS.QUOTA_USED),
        DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR,
        DEVICE_FEATURE_TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
        { unit: DEVICE_FEATURE_UNITS.PERCENT, keep_history: true, min: 0, max: 100 },
      ),
      feature(size, ACCOUNT_KEYS.USED_SPACE),
      feature(size, ACCOUNT_KEYS.QUOTA),
      feature(counter, ACCOUNT_KEYS.LIBRARIES),
      feature(counter, ACCOUNT_KEYS.SHARED_LIBRARIES),
      feature(counter, ACCOUNT_KEYS.DEVICES),
      feature(text, ACCOUNT_KEYS.LAST_MODIFIED_LIBRARY),
      feature(text, ACCOUNT_KEYS.LAST_MODIFIED_TIME),
    ],
  };
}

/** The discovery payload of the server (administrator accounts). */
export function buildServerDevice(gladys, language = 'en', version = '') {
  const ids = serverIds(gladys);
  const names = namesOf(language);
  const feature = (build, key) => build(names[`server_${key}`], ids.feature(key));
  return {
    name: names.server,
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: version ? [{ name: 'VERSION', value: version.slice(0, 255) }] : [],
    features: [
      feature(counter, SERVER_KEYS.USERS),
      feature(counter, SERVER_KEYS.ACTIVE_USERS),
      feature(counter, SERVER_KEYS.LIBRARIES),
      feature(counter, SERVER_KEYS.FILES),
      feature(counter, SERVER_KEYS.GROUPS),
      feature(counter, SERVER_KEYS.DEVICES),
      feature(counter, SERVER_KEYS.CONNECTED_DEVICES),
      feature(size, SERVER_KEYS.STORAGE),
    ],
  };
}

const megabytes = (bytes) => Math.round((bytes / 1_000_000) * 10) / 10;
const capped = (value, max) => Math.min(Math.max(value, 0), max);
const withIds = (ids, values) =>
  values.map(({ key, ...value }) => ({
    key,
    device_feature_external_id: ids.feature(key),
    ...value,
  }));

/** The library modified last, null when the account sees none. */
export function lastModified(repos) {
  return repos.reduce((last, repo) => (!last || repo.mtime > last.mtime ? repo : last), null);
}

/**
 * The values of the account device: `{ key, device_feature_external_id,
 * state|text }`. Offline: only `online`.
 */
export function accountValues(
  gladys,
  email,
  { online, account, repos = [], devices = [], language },
) {
  const values = [{ key: ACCOUNT_KEYS.ONLINE, state: online ? 1 : 0 }];
  if (online && account) {
    const last = lastModified(repos);
    values.push(
      { key: ACCOUNT_KEYS.QUOTA_USED, state: capped(quotaPercent(account) ?? 0, 100) },
      { key: ACCOUNT_KEYS.USED_SPACE, state: capped(megabytes(account.usage), MAX_SIZE_MB) },
    );
    if (account.quota) {
      values.push({
        key: ACCOUNT_KEYS.QUOTA,
        state: capped(megabytes(account.quota), MAX_SIZE_MB),
      });
    }
    values.push(
      {
        key: ACCOUNT_KEYS.LIBRARIES,
        state: capped(repos.filter((r) => r.kind === 'mine').length, MAX_COUNT),
      },
      {
        key: ACCOUNT_KEYS.SHARED_LIBRARIES,
        state: capped(repos.filter((r) => r.kind !== 'mine').length, MAX_COUNT),
      },
      { key: ACCOUNT_KEYS.DEVICES, state: capped(devices.length, MAX_COUNT) },
      { key: ACCOUNT_KEYS.LAST_MODIFIED_LIBRARY, text: last ? last.name.slice(0, 255) : '-' },
      {
        key: ACCOUNT_KEYS.LAST_MODIFIED_TIME,
        text: last ? formatTime(last.mtime, language) : '-',
      },
    );
  }
  return withIds(accountIds(gladys, email), values);
}

/** The values of the server device. */
export function serverValues(gladys, sysinfo) {
  const values = [
    { key: SERVER_KEYS.USERS, state: capped(sysinfo.users, MAX_COUNT) },
    { key: SERVER_KEYS.ACTIVE_USERS, state: capped(sysinfo.activeUsers, MAX_COUNT) },
    { key: SERVER_KEYS.LIBRARIES, state: capped(sysinfo.libraries, MAX_COUNT) },
    { key: SERVER_KEYS.FILES, state: capped(sysinfo.files, MAX_COUNT) },
    { key: SERVER_KEYS.GROUPS, state: capped(sysinfo.groups, MAX_COUNT) },
    { key: SERVER_KEYS.DEVICES, state: capped(sysinfo.devices, MAX_COUNT) },
    { key: SERVER_KEYS.CONNECTED_DEVICES, state: capped(sysinfo.connectedDevices, MAX_COUNT) },
    { key: SERVER_KEYS.STORAGE, state: capped(megabytes(sysinfo.storage), MAX_SIZE_MB) },
  ];
  return withIds(serverIds(gladys), values);
}
