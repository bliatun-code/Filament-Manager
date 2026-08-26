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

Maintainers will acknowledge valid reports as soon as practical, triage the
impact, and coordinate a fix or mitigation before public disclosure where
appropriate.

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
screenshots, logs, or database exports, remove private LAN addresses, printer
serials, access codes, pairing links and tokens, full RFID/tray identifiers,
user names, notes, scannable QR payloads, and any real-world inventory data you
do not want to publish.

## Trusted-LAN Companion Safeguards

Companion is served directly by the desktop app on the selected private LAN
interface. It does not trust forwarded-client headers. Host and Origin
allowlists, pairing sessions, and CSRF checks remain the primary authorization
boundary.

The HTTP boundary also applies these defense-in-depth controls:

- Every response carries a same-origin Content Security Policy, framing and
  MIME-sniffing protection, a no-referrer policy, restrictive browser feature
  permissions, and same-origin opener/resource isolation. Inline scripts are
  blocked. Inline styles remain allowed because inventory and printer swatches
  use validated dynamic color styles.
- Request bodies are buffered only up to 64 KiB and rejected with `413` when
  larger. Requests are bounded to 30 seconds and return `408` on timeout.
- Each direct TCP peer receives a bounded token bucket of 240 requests per
  minute. Pair and renew attempts have a separate limit of 10 per minute.
  Excess requests return `429` with `Retry-After`.
- At most 512 peer buckets are retained. Requests without peer metadata and
  peers beyond that bounded set share a limited fallback bucket; they are never
  allowed to bypass throttling.

Do not place Companion behind a forwarding proxy without reviewing this trust
model. Since proxy headers are intentionally ignored, proxied clients share the
proxy peer's rate limit.
