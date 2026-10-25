# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-25

### Added

- A Seafile account in Gladys, proposed in the Discover tab: online, quota used
  (%), space used, quota, own and shared libraries, linked devices, last
  library modified and its time.
- For an administrator account, a "Seafile server" device: users, active
  users, libraries, files, groups, linked and connected devices, storage used.
- Scene trigger "A library is modified" (filters: library, modified by), for
  the account's own, shared and group libraries, also after a restart.
- Scene trigger "The quota goes above the threshold" (70 to 95 %, chosen in
  the configuration).
- Scene action "State of the account", with a ready-made sentence.
- Dashboard widget "Seafile storage": quota gauge, space used, libraries
  modified last, Refresh button.
- Username and password, or an API token (accounts with two-factor
  authentication); a "Test the connection" button.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-seafile/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-seafile/releases/tag/v1.0.0
