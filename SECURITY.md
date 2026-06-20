# Security Policy

## Supported Versions

Security fixes are handled for the latest released version and the current
`main` branch.

## Reporting a Vulnerability

Please do not open a public issue with exploit details, private keys, logs with
tokens, database contents, or other sensitive information.

Preferred reporting path:

1. Use GitHub private vulnerability reporting for this repository.
2. Include the affected version or commit, operating system, a concise impact
   summary, and reproduction steps.
3. If private vulnerability reporting is not available, open a minimal public
   issue asking for a security contact without publishing technical exploit
   details.

I will acknowledge valid reports as soon as practical, triage the impact, and
coordinate a fix or mitigation before public disclosure where appropriate.

## Scope

In scope:

- Desktop app behavior and local data handling.
- Trusted-LAN companion access, pairing, session renewal, and CSRF handling.
- Import/export, backup, and QR/link flows.
- Bambu Live and printer integration surfaces that could expose local data.

Out of scope:

- Vulnerabilities in unsupported operating systems or modified builds where the
  source changes are not available.
- Issues requiring physical access to the unlocked workstation unless they also
  expose a broader app flaw.
- Denial-of-service findings that only affect a developer test environment.

## Sensitive Data

Filament Manager is designed as a local-first app. Before sharing diagnostics,
screenshots, logs, or database exports, remove private LAN addresses, pairing
tokens, user names, notes, and any real-world inventory data you do not want to
publish.
