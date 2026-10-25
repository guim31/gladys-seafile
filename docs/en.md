# Seafile

[Seafile](https://www.seafile.com/) is a self-hosted file storage and sync
service: your libraries live on your own server and the desktop and mobile apps
keep them in sync. This integration brings a Seafile account into Gladys: the
space used and the quota, the libraries, the linked devices, and a scene
trigger **when a library is modified** (a file added, changed or deleted), with
who modified it. It also warns when the quota goes above a threshold, and a
dashboard widget shows the quota and the libraries modified last. For an
administrator, a second device follows the whole server.

Tested against a real Seafile Server CE 12.0 (Docker image
`seafileltd/seafile-mc` with MariaDB and memcached): a regular account with a
quota, an administrator, libraries of its own, shared and of a group, files
uploaded, the quota changed, a linked desktop client, a wrong password. Not yet
tested on a real Gladys: feedback welcome on
[the issues](https://github.com/guim31/gladys-seafile/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- Seafile Server (Community or Professional edition, version 11 or later),
  reachable from the Gladys machine at the address of its web interface.
- A Seafile account: its email (or username) and password, or an **API token**
  if the account uses two-factor authentication. An administrator account adds
  the server device; a regular account is enough for the rest.

The integration reads Seafile every minute by default: four light requests on
your own network (account, libraries, linked devices, and the server figures
for an administrator).

## Getting started

### 1. Configure the integration

In Gladys, open **Integrations → Seafile → Configuration** and fill in:

- **Seafile address**: the address of the web interface, as in your browser,
  e.g. `http://192.168.1.2:8000` or `https://cloud.example.com`. A link copied
  from a library page works too.
- **Email or username** and **Password** of the account.
- **API token** (optional): instead of the password, needed when two-factor
  authentication is on. To get one, run on any computer
  `curl -d username=EMAIL -d password=PASSWORD -H "X-SEAFILE-OTP: CODE" https://cloud.example.com/api2/auth-token/`
  (`CODE` is the current code of your authenticator app) and copy the
  `token` it answers.
- **Refresh interval**: 30 seconds to 15 minutes. It is also the delay of the
  "A library is modified" trigger.
- **Quota alert threshold**: 70 to 95 %.
- **Language of the names**: the language of the feature names and of the
  texts sent by the integration.

Then click **Test the connection**: it answers with the version of Seafile, the
account, the space used and the number of libraries.

### 2. Add the devices

Open the **Discover** tab: the account is listed, and the server too for an
administrator. Add the ones you want to follow.

## The devices

**The account** (`Seafile <name>`):

| Feature               | Meaning                                                   |
| --------------------- | --------------------------------------------------------- |
| Online                | 1 while Seafile answers, 0 otherwise                      |
| Quota used            | percentage of the quota used (0 without a quota)          |
| Space used            | space used by the account, in MB                          |
| Quota                 | the quota of the account, in MB (nothing without a quota) |
| My libraries          | libraries the account owns                                |
| Shared libraries      | libraries shared with the account, or of its groups       |
| Linked devices        | desktop and mobile apps linked to the account             |
| Last library modified | name of the library modified last                         |
| Last modification     | its day and time                                          |

**The server** (`Seafile server`, administrator accounts only):

- Users
- Active users
- Libraries
- Files
- Groups
- Linked devices
- Connected devices
- Storage used

Storage used is in MB, for every library of the server.

The integration reads Seafile on its own timer, and only publishes what
changed (plus an unchanged value every 12 hours, so Gladys never shows "no
recent value").

## Dashboard

The **Seafile storage** widget shows the quota used as a gauge (green, orange
10 points before the threshold, red above it), the space used, the number of
libraries, then the six libraries modified last with their size and time. The
**Refresh** button reads Seafile again. It works even before the account is
added to Gladys.

## Scenes

### Triggers

- **A library is modified**: a file is added, changed, deleted or renamed in a
  library the account sees. Filters: the library (its exact name) and who
  modified it (the name shown by Seafile), empty for any. Variables: library,
  modified by, owner, size, size in bytes, and whether the library is shared
  with the account. One event per library at each reading; a library created
  is not announced, its next modification is.
- **The quota goes above the threshold**: the account goes above the
  threshold of the configuration. Once, until the usage goes back 5 points
  below it. Variables: quota used (%), threshold, space used, quota. A quota already
  above the threshold at the first reading, or when the threshold changes, is
  not announced.

A modification made while the integration or Gladys was stopped is announced
at the next reading, once. Nothing is announced at the very first reading.

### Actions

- **State of the account**: reads the account (again if the last reading is
  older than 15 seconds) and gives the space used, the quota, the quota used
  (-1 without a quota), the libraries, the linked devices, the last library
  modified with its time, and a ready-made sentence such as "Seafile: 4.2 GB of
  10.0 GB used (42 %), 3 libraries, last modified: Photos on 22/10 08:12."

### Scene ideas

- When the library "Scans" is modified, send yourself a message "New scan in
  Seafile".
- When the quota goes above the threshold, send a message with the space used
  and the quota.
- Every Sunday evening, run "State of the account" and send its sentence.
- When "Online" of the account goes to 0, send a message: Seafile is down.

## Troubleshooting

- **"Seafile does not answer"**: check the address from the Gladys machine
  (the web interface must open there), and the firewall.
- **"username, password or token refused by Seafile"**: check them in the web
  interface; an API token is deleted when the password changes or when you
  log out of all devices. A refused password is not tried again by itself (Seafile could lock the account): fix it, then save the configuration or click **Test the connection**.
- **"two-factor authentication is on: use an API token"**: create a token as
  shown above.
- **"no Seafile API at this address"**: the address is not the web interface
  of Seafile (the file server port 8082 is not enough).
- **"the address redirects"**: enter the `https://` address.
- **"certificate refused"**: the container only trusts valid certificates; use
  a valid one, or the `http://` address on your network.
- **"Seafile limits the requests"**: choose a longer refresh interval.
- **No server device**: the account is not an administrator. A promotion is
  noticed within the hour.
- The logs of the integration (Integrations → Seafile) say more, without any
  password or token.

## Limits

- One account per integration. The libraries are those the account sees.
- "A library is modified" tells which library and who, not which file.
- A library with many modifications between two readings fires one event; at
  most 20 libraries are announced per reading.
- Sizes are in decimal units (1 MB = 1,000,000 bytes), as Seafile shows them.
- The password stays in the configuration of Gladys; only the token Seafile
  gives in exchange is kept, in memory. Nothing secret is written under
  `/data`.
- Developed and tested with a real Seafile in Docker, not yet on every setup:
  feedback welcome. Not affiliated with Seafile Ltd.
