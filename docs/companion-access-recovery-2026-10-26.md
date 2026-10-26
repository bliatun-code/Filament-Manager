# Companion access recovery — 2026-10-26

Implemented locally after the approved recovery concept. The installed app and
live library were not changed. No commit or push is included in this task.

## User flow

An approved browser with a valid persistent credential renews automatically on
entry and when its short session needs renewal. Both the persistent cookie and
server-side inactivity check use **365 days**; successful renewal updates
`last_seen_at` and issues the persistent cookie again. Short sessions still last
eight hours. Revoked credentials cannot renew, regardless of either lifetime.
The browser-access list can retain an old record after its credential expires;
that record or its name is never used as proof of identity.

Without valid access, Companion offers an editable device name and “Request
access again”. The suggested browser/platform name is only a hint. A real
accepted request shows the waiting screen. The native app on the computer
running this Companion service polls while visible and shows a banner. The
banner respects the inventory navigation guard and opens/focuses the request
area under **Settings → Library & web app**.

The Host reviews the supplied name, approximate browser/platform and request
time, with an explicit reminder to approve only recognized devices. “Decline”
rejects the request; “Allow access” displays a six-digit code and its expiry.
The requesting browser must then enter the code. Only successful confirmation
creates its normal device/session credentials, restores Companion and resumes
any original QR spool URL. Cancellation, decline, expiry and exhausted attempts
have distinct states and let the user start again. Existing pairing links/QR
codes remain available as an alternative.

HOST and STANDALONE library owners can approve locally. Desktop Clients and
other Companion browsers cannot approve: there is no HTTP approval route.
An explicit new approval creates a new browser credential; it never silently
un-revokes a previous device record.

## Protocol and bounds

- Requests are volatile and tied to the exact library ID and database path.
  A listener/library rebind or service restart discards them. “Revoke all” also
  discards pending/approved requests under the same authority gate as issuance.
- The requester receives a random 256-bit secret in an HttpOnly, SameSite=Strict
  cookie, scoped to `/api/v1/auth/recovery`. Only its hash is stored. It never
  appears in JavaScript, a URL, a host request row or a response JSON body.
- The separate six-digit code is uniformly generated with OS randomness and
  rejection sampling. Approval starts its five-minute monotonic deadline.
  Three incorrect guesses lock the request. Repeated approval cannot reset the
  deadline, code or attempt budget. A wrong requester secret cannot consume
  somebody else's guesses.
- Confirmation requires both credentials and holds the store lock through
  browser-credential issuance. Concurrent/replayed confirmations cannot grant
  twice. A database failure does not consume an otherwise valid code.
- Pending requests expire after ten minutes. Storage is bounded to 32 entries;
  creation is globally limited to ten per minute in addition to the existing
  per-client HTTP authentication limiter. Existing in-progress requests from
  the same requester are deduplicated. Terminal records retain a short replay
  window and are pruned as new requests arrive.
- Public operations are POSTs with strict Host/Origin validation, a custom
  same-origin request header, no-store responses, body limits and request
  timeouts. Status polling uses the general limiter rather than spending code
  attempt tokens. Unauthenticated requests disclose no inventory or approval
  codes. Names are bounded, reject control/bidi formatting characters and are
  escaped on both presentation surfaces.
- These are the existing Trusted-LAN transport and credential semantics; the
  flow does not add HTTPS or claim to implement OAuth. The separation of the
  human confirmation code from a high-entropy request credential, expiry and
  throttling follows the design principles in
  [RFC 8628 §5.1–5.2](https://www.rfc-editor.org/rfc/rfc8628.html#section-5.1).

## Validation and limits

Native tests exercise the actual HTTP router, cookies, Host commands, library
authority and durable database records. They cover successful recovery,
unapproved requests, wrong secrets/libraries/origins, absent request headers,
missing remote approval endpoints, five-minute expiry, three guesses,
idempotent approval, replay/concurrency, cancellation, rejection, restart,
creation limits, revocation and a refreshed 365-day cookie. Core tests also
check server-side inactivity expiry and successful renewal extending it.

`scripts/run-companion-balanced-qa.mjs` runs the real browser entry point with
sanitized fixture API replies. It covers request/wait/code/success, a wrong
code, cancellation, decline, expiry and locking; checks the request/code forms
in all 21 languages at 320 px; and keeps the existing layout/theme/overlay
regressions. It does not modify a real browser pairing or user library.

`scripts/run-companion-access-host-qa.mjs` uses the actual React banner, access
state hook and review panel against a native-command fixture. It verifies
opening/focus, approval/code display and decline, with WCAG AA checks in all
five themes. Run the UI dev server on port 5189 first. Its temporary Vite entry
is removed on completion. This is a focused component preview, not a second
running native desktop or an end-to-end installed iPhone/service test.

Screenshots and reports are in:

- `release-artifacts/visual-qa/companion-balanced/`
- `release-artifacts/visual-qa/companion-access-recovery/`

New translations were checked for keys, formats, loading and layout. Automated
QA is not named native-language review.

Completed checks: 326 core tests, 123 native Companion tests plus one service
integration test, 415 browser-module tests, 2,219 UI tests and 901 script tests.
The 149 Companion browser views and ten Host component views reported no WCAG
AA findings. Production UI build, UI lint, generated-asset/locale and project
contracts, Rust formatting and whitespace checks passed. The final name-policy
and recovery suite also passed all ten focused native tests.

## Printer artwork follow-up

The related question was audited separately in
`printer-artwork-background-audit-2026-10-26.md`. Eight original Bambu thumbnails
have an opaque light frame; P1S already uses its approved Companion derivative,
leaving seven other models to review. No additional printer images were edited
as part of access recovery. Prefer transparent official sources and review
separate, provenance-recorded derivatives where necessary.
