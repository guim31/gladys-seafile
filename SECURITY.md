# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes. The
integration reads one Seafile account through the Web API of Seahub, read-only:
it never changes a file, a library or a setting. The password (or API token)
stays in the configuration of Gladys; the token Seafile gives in exchange for
the password is kept in memory only, and neither appears in the logs. The only
file written under `/data` holds the last modification time of every library
and whether the quota is above the threshold, nothing secret. The container
opens no port and only talks to the address entered in the configuration.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Seafile itself (see its [security page](https://www.seafile.com/en/security/)).
