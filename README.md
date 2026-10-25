# Seafile for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings a [Seafile](https://www.seafile.com/) account into Gladys: the
space used and the quota, the libraries, the desktop and mobile apps linked,
and a scene trigger every time a library is modified — the scanner that drops
a PDF in "Scans", the phone that backs up its photos, a relative who adds a
file to the family library.

- **One account device**: online, quota used (%), space used, quota, own and
  shared libraries, linked devices, last library modified and its time.
- **One server device** for an administrator account: users, active users,
  libraries, files, groups, linked and connected devices, storage used.
- **Scene triggers**: a library is modified (filters: library, modified by;
  variables: library, modified by, owner, size, shared), the quota goes above
  the threshold of the configuration.
- **Scene action**: state of the account, with a ready-made sentence.
- **Dashboard widget**: quota gauge, space used, the libraries modified last,
  a Refresh button.
- Username and password, or an API token (two-factor authentication).
- Texts in English, French, German and Spanish.

Tested against a real Seafile Server CE 12.0.14 (Docker image
`seafileltd/seafile-mc`, MariaDB 11, memcached): a regular account with a
quota and an administrator, own, shared and group libraries, files uploaded,
the quota changed by the administrator, a linked desktop client, a wrong
password, an unreachable server. Not yet tested on a real Gladys: feedback
welcome on [the issues](https://github.com/guim31/gladys-seafile/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- Seafile Server 11 or later (Community or Professional), its web interface
  reachable from the Gladys machine.
- A Seafile account: email (or username) and password, or an API token.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-seafile`. Then open its configuration, enter
the address of Seafile and the account, and add the account (and the server,
for an administrator) from the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in [French](docs/fr.md),
[German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

The container reads the Web API of Seahub every minute by default:
`/api2/account/info/` (usage and quota), `/api2/repos/` (the libraries and
their modification time), `/api2/devices/` (the linked apps) and, for an
administrator, `/api/v2.1/admin/sysinfo/` (asked once an hour when the account
is not one). It publishes the states of the devices added to Gladys when they
change, and fires the scene events. The last modification time of every
library is kept in `/data`, so a modification made while Gladys or the
integration restarted is still announced, once; the first read only records.
With username and password, the integration trades them once for a token
(`/api2/auth-token/`), kept in memory and asked again when Seafile refuses it.
Redirects are not followed.

## Limits

- "A library is modified" says which library and who, not which file.
- A modification is announced at the next read; twenty libraries at most per
  read.
- Read only: the integration changes nothing in Seafile.
- One Seafile account per configuration.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the Seafile
API.

## Credits

- [Seafile](https://github.com/haiwen/seafile) and
  [Seahub](https://github.com/haiwen/seahub) by Seafile Ltd. and their
  contributors: the API answers in `test/fixtures/seafile` come from the
  official Docker image (anonymized). The logo on the cover is the Seafile
  logo shipped with Seahub. No Seafile code is used.
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of [gladys-sftpgo](https://github.com/guim31/gladys-sftpgo).

Not affiliated with Seafile Ltd.
