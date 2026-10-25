// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Is the quota above 90 %?" is already a scene condition on the device
// features, once the account is added to Gladys. The reading action is about
// what a condition cannot do: put the state in a message ("Seafile: 4.2 GB of
// 10 GB used (42 %), 3 libraries, last modified: Photos on 22/10 08:12"). It
// reads Seafile again when the last read is older than 15 seconds.
// -----------------------------------------------------------------------------

import { lastModified, quotaPercent } from './devices.js';
import { SENTENCE_TEXT, formatBytes, formatTime, labelled } from './texts.js';

export const SCENE_ACTIONS = {
  async get_account_status(hub) {
    const account = await hub.currentAccount();
    const language = hub.config.language;
    const words = SENTENCE_TEXT[language] ?? SENTENCE_TEXT.en;
    const percent = quotaPercent(account);
    const used = formatBytes(account.usage);
    const quota = account.quota ? formatBytes(account.quota) : '';
    const last = lastModified(hub.repos);
    const lastTime = last ? formatTime(last.mtime, language) : '';
    const own = hub.repos.filter((repo) => repo.kind === 'mine').length;
    const parts = [
      percent === null ? words.noQuota(used) : words.quota(percent, used, quota),
      words.libraries(own),
      ...(last ? [words.last(last.name, lastTime)] : []),
    ];
    return {
      account: account.name,
      used_size: used,
      quota_size: quota,
      quota_percent: percent ?? -1,
      libraries: own,
      shared_libraries: hub.repos.length - own,
      devices: hub.linkedDevices.length,
      last_modified_library: last?.name ?? '',
      last_modified_time: lastTime,
      sentence: `${labelled('Seafile', parts.join(', '), language)}.`,
    };
  },
};
