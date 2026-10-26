# Balanced Companion — implementation and access-renewal proposal

Update 2026-10-26: the recovery proposal below is now implemented, with the
requested lifetime increased to 365 days. See
[the implementation and validation record](companion-access-recovery-2026-10-26.md).
The original investigation/proposal is retained here as historical context.

## Implemented locally

The browser Companion now follows the committed desktop direction:

- Neutral surfaces in Gray Soft, Gray Deep, Blue Night, Light Clean and Auto.
- Compact horizontal filament rows, one column on phones, two on iPad and a
  responsive grid on desktop. Existing loan, detail, add, search and printer
  workflows remain accessible.
- Physical spool artwork generated directly from the approved desktop geometry
  and renderer: same perspective, 25% narrower width, 1.75 mm winding, lighting,
  solid and composite colours. Original flat swatches remain visible.
- Official printer images use the same explicit model/variant mapping as desktop.
  All PNGs and upstream license/provenance files are served from the local app.
- Common Lucide outline icons in navigation, actions and live telemetry.
- Neutral spool properties and printer panels, with compact tablet slot content.
- Non-printing telemetry says “Live”; it does not infer an active print job.
- A smaller access-required screen. Its authentication behaviour is unchanged.

`node scripts/generate-companion-visual-assets.mjs` derives shared geometry,
SVG rendering, model mapping and icon markup from their desktop sources.
`--check` is part of the contract checks to catch drift. The small SVG adapter
runs without React in Companion; SVGs are isolated image documents and cached
by normalized filament colour.

Generated concepts are design references, not assertions of exact product
geometry, inventory values, hardware accessories or newly implemented actions.
The access-request storyboard is a proposal only.

## Refinement against the annotated screenshots

The inventory now has one shared, compact header: title and visible count,
a bounded search field, and the add action. On phones the add action sits beside
the title, with search on the next row. The descriptive subtitle was removed;
the longer associated search label remains available to assistive technology,
while a shorter placeholder is translated into all 21 supported languages.

Mobile inventory has 8 px side insets without a second inset panel. Quantity
and its meter align to the right in a separate fixed-width column, including
at 320 px. The bottom navigation attaches to all three screen edges and
includes safe-area padding. Tablet spacing remains roomier. Desktop branding
reads “Filament Manager” with “Companion” beneath it.

The P1S thumbnail now uses a **processed derivative**, not an untouched official
photograph. The built-in image generation tool extracted a transparent variant
from the official thumbnail. As with any generative edit, small product details
can differ; it should be reviewed as an illustration. The original file and
its upstream provenance remain intact. The workspace asset is
`ui/src/assets/printers/bambu-p1s-companion-cutout.png`; the exact prompt, source,
processing note, license and output checksum are recorded in
`ui/src/assets/printers/companion-derivatives.json`, also available from Companion
as `printer-image-derivatives.json`. Other model images still use their original
catalog mapping.

Browser regression checks enforce the compact mobile header, aligned add
action and quantities, bounded desktop search, edge-anchored navigation,
320 px layout, and genuinely transparent printer-background pixels.
All 21 localized inventory toolbars are also exercised at 320 px. The system UI
font now precedes regional fallback fonts, preventing unusually wide Cyrillic
glyphs on macOS. This is automated structural and visual evidence, not native
review of every translation.

## Validation

`node scripts/run-companion-balanced-qa.mjs` loads the actual Companion entry
point and assets in Playwright, with sanitized fixture API responses. It checks
all five theme choices at phone, iPad and desktop sizes, navigation, asset
loading, inventory search, spool properties, add-sheet closing, system theme
changes and expired/absent browser authorization. WCAG AA checks accompany each
view. Evidence and screenshots are under
`release-artifacts/visual-qa/companion-balanced/`.

The running installed app prevents a second desktop instance. The attempted
native screenshot launch exited through that singleton protection. It used a
separate sanitized database copy; the live library was not modified. Therefore
these browser screenshots are isolated production-client tests, not an
end-to-end test of a second running native service. Native tests separately
verify that the actual API serves all module assets and every catalog PNG.

## What the access investigation established

The screenshots show missing valid authentication, not a diagnosis of the
specific iPhone. The source currently has:

- An 8-hour in-memory session (`companion_session.rs`). Restarting the service
  also loses that short session.
- A 30-day HttpOnly, SameSite=Strict device cookie. This cookie is issued when
  pairing and scoped to `/api/v1/auth`.
- Renewal of the short session when that device credential is still present
  and maps to a non-revoked browser in the current library.
- The ordinary renew handler issues a new session cookie but passes no device
  token to the response builder, so it does not refresh the 30-day cookie.
- Paired-browser database entries have revocation and last-seen fields, but no
  independent expiry field for the device credential. Cookie retention is not
  the same thing as server-side credential expiry.

A browser can consequently remain listed on the host after its cookie has
expired or been removed. A different hostname, cleared browser data, private
browsing, a changed library or explicit revocation can also result in missing
access. This investigation did not inspect Safari storage on the user's iPhone
or establish which cause actually occurred. The generic seven-day rule for
script-written Safari storage is not proof here: this is a server-set HttpOnly
cookie.

## Recommended access design — not implemented

### Prevent unnecessary interruptions

Refresh the persistent cookie only after verifying its existing credential
against the authoritative library and a non-revoked browser. A sliding period
of 30 days from the most recent successful renewal would keep regularly used
browsers working. Preserve immediate revocation. Choose and document whether
server-side inactivity expiry is also desired; currently the database has none.
Do not use a list entry, device name, IP address or browser fingerprint as
proof that a requester is an already authorized browser.

### Recover lost access

1. Mobile shows “Tilgangen må fornyes”, an editable device name and
   “Be om tilgang på nytt”. Suggest a browser/platform hint where available;
   a user-assigned iPhone name is not reliably exposed to a web application.
2. After the service actually accepts the request, show “Forespørsel sendt.
   Tilgang må godkjennes på verten.” Include cancel and pending/expired states.
3. On the desktop running this Companion service, show a non-blocking banner
   like the update banner, with “Se forespørsel”. It opens the existing
   Library/webapp browser-access area. Show supplied name, approximate browser,
   request time and “Godta bare enheter du kjenner”. Provide reject/approve.
4. After approval, display a six-digit one-use code on the host. The person
   communicating approval gives that code to the mobile user. Entering it on
   the requesting browser completes authorization and creates its normal
   HttpOnly device/session cookies. Then resume the original Companion page.

Six digits, five minutes and at most three guesses are proposed defaults. Four
could be considered, but has less guessing resistance. The code is a human
confirmation step, never the sole credential: the request is also bound to an
unpredictable secret held by that browser. Another client cannot redeem it with
just the short code or a guessed request identifier.

Implementation must include bounded request storage, expiry, deduplication,
request and guess limits, strict host/origin validation, safe displayed names,
no inventory disclosure before authorization, and atomic one-use redemption.
Pending requests must not grant access or reactivate revoked credentials.
Only the service-owning desktop can approve them. Declines and expirations
must reach the requester, and service restarts must not accidentally authorize
old requests. Keep the current pairing link/QR route as a fallback.

This remains a trusted-LAN design. A short confirmation code does not encrypt
HTTP traffic. A future passkey/Face ID route could provide stronger returning-
device recognition, but would require a suitable HTTPS origin first.

References:

- User-agent hints are not reliable device identities:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent
- Short user codes require expiry, entropy and throttling; this proposal uses
  the separation of a human code and secret request credential as a design
  pattern, not a claim of OAuth compliance:
  https://www.rfc-editor.org/rfc/rfc8628.html#section-5.1
- Passkeys/WebAuthn require a secure context:
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API
- Safari storage behaviour and private browsing:
  https://webkit.org/tracking-prevention/

Final local review results:

- 411 Companion module tests passed.
- 113 native Companion tests and 1 Companion service-contract integration test passed.
- 901 project script tests passed.
- 77 browser view/state checks across all themes and three device sizes passed,
  with zero automated WCAG AA findings, page overflow or broken image reports.
- Shared-asset generation, project contracts, localization readiness, desktop
  production build, UI lint and Rust formatting checks passed.

The mockup PNGs were generated using the built-in image generation tool. Copies
are kept alongside review artifacts in `concepts/mobil.png`, `ipad.png`,
`datamaskin.png` and `reaktivering.png`. None is used as application UI or as a
source of inventory or printer truth. Live Companion deployment, committing and
pushing are outside this review step.
