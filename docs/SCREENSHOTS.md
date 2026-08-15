# Screenshot Tour

This page is a visual product tour for Filament Manager. It complements the
text guides by showing the main desktop workflows and the Companion webapp on
wide, tablet, and phone screens.

The Companion/webapp server must be enabled, and the desktop app needs to stay
running for Companion to work from a phone, tablet, or workshop browser.

Most current captures were produced from the current UI in the English dark
theme with the committed, production-shaped, sanitized QA fixture. Every
desktop and Companion capture launches against a temporary database copy; no
real inventory library is opened or modified. Names, identifiers, QR targets,
counts, swatches, loans, printer assignments, and live observations shown here
are synthetic.

The v0.22.0 refresh regenerated Dashboard, Add Filament, Program and update
check, Bambu Live security setup, and Unsaved Printer Changes on 2026-07-29
from fixture seed SHA-256
`81832c22714d81c227ac53875b928b66d564e006d7f9e414fc2e6c4a95629970`.
The v0.22.1 candidate refreshed the Program and update-notification capture on
2026-07-30 from fixture seed SHA-256
`02920bf05064bd1ff74d546e26d2f1ea4c5acd0454d951a9ea386662d9b69c19`.
The v0.23.0 refresh regenerated the General, Program and update notification,
Library & web app network, Bambu discovery, and printer overview captures from
fixture seed SHA-256
`895204e37483af1e195cd21db69f956a9669d1e5677eaf69a4396f518358ead0`.
The v0.25.0 refresh regenerated Dashboard and Add Printer and added the
twelve-month Dashboard consumption capture on 2026-08-12. Surrounding app
data comes from the same sanitized fixture seed SHA-256
`895204e37483af1e195cd21db69f956a9669d1e5677eaf69a4396f518358ead0`;
the chart itself uses an explicitly synthetic, time-relative visual-QA series
so its twelve-month window stays representative as the calendar advances.
The General settings capture was refreshed on 2026-08-15 to show the new
background-operation and launch-at-login controls, using the same sanitized
fixture seed SHA-256.
The Bambu security setup uses only a synthetic loopback test interface and no
host, serial, access code, or trusted fingerprint. The printer overview uses
fresh synthetic Bambu telemetry; its desktop gate waits for rendered telemetry
and refuses to create an image when that readiness signal is absent.
The AMS weight-estimate capture added on 2026-08-12 uses a separate,
time-relative sanitized fixture and is captured only after the estimate card
has rendered from a fresh exact-RFID observation.

## Quick Preview

<p align="center">
  <a href="#dashboard"><img src="screenshots/dashboard-thumb.jpg" alt="Dashboard" width="150"></a>
  <a href="#twelve-month-consumption"><img src="screenshots/dashboard-consumption-thumb.jpg" alt="Twelve-month filament consumption" width="150"></a>
  <a href="#inventory"><img src="screenshots/inventory-thumb.jpg" alt="Inventory" width="150"></a>
  <a href="#individual-filament-label"><img src="screenshots/filament-label-thumb.jpg" alt="Individual filament label" width="150"></a>
  <a href="#add-filament"><img src="screenshots/add-filament-thumb.jpg" alt="Add filament" width="150"></a>
  <a href="#wishlist-and-orders"><img src="screenshots/wishlist-queue-thumb.jpg" alt="Wishlist and orders" width="150"></a>
  <a href="#loan-out"><img src="screenshots/loan-out-thumb.jpg" alt="Loan out" width="150"></a>
  <a href="#printers"><img src="screenshots/printers-thumb.jpg" alt="Printers" width="150"></a>
  <a href="#add-printer"><img src="screenshots/add-printer-thumb.jpg" alt="Add printer with optional Bambu Live" width="150"></a>
  <a href="#use-an-ams-weight-estimate"><img src="screenshots/printer-ams-weight-estimate-thumb.jpg" alt="Use an AMS weight estimate" width="150"></a>
  <a href="#settings"><img src="screenshots/settings-general-thumb.jpg" alt="Settings background operation" width="150"></a>
  <a href="#stable-local-companion-address"><img src="screenshots/settings-library-network-thumb.jpg" alt="Stable local Companion address" width="150"></a>
  <a href="#program-and-update-notifications"><img src="screenshots/settings-updates-thumb.jpg" alt="Program version, update notifications, and manual update check" width="150"></a>
  <a href="#bambu-live-security-setup"><img src="screenshots/settings-printer-editor-thumb.jpg" alt="Bambu Live security setup" width="150"></a>
  <a href="#inventory-label-sheet"><img src="screenshots/inventory-label-sheet-thumb.jpg" alt="Inventory label sheet" width="150"></a>
  <a href="#companion-tablet"><img src="screenshots/companion-tablet-inventory-thumb.jpg" alt="Companion tablet" width="150"></a>
  <a href="#companion-phone"><img src="screenshots/companion-phone-inventory-thumb.jpg" alt="Companion phone" width="150"></a>
  <a href="#phone-settings"><img src="screenshots/companion-phone-settings-thumb.jpg" alt="Companion settings" width="150"></a>
</p>

## Desktop App

### Dashboard

Inventory health, printer activity, low-stock signals, recent activity, and
library/webapp status in one overview. A dismissible, data-backed setup
checklist guides a new or upgraded installation through inventory, optional
printer/browser access, and the first full backup without blocking normal use.
An enabled Bambu Live integration without trusted TLS identity produces a
clickable warning here; it opens the affected printer's Live editor directly
so an upgrade or changed identity does not fail silently behind Settings.

![Dashboard overview](screenshots/dashboard.jpg)

### Twelve-Month Consumption

The consumption chart shows the current local calendar month and the preceding
eleven months from oldest to newest. Zero-use months remain visible, the
current month is partial, and the headline total is calculated from the same
twelve buckets. This view is separate from the Dashboard's **Last 30 days**
card and summarizes recorded printer-linked print jobs and Bambu Live usage
sessions rather than all-time inventory changes.

![Dashboard twelve-month filament consumption](screenshots/dashboard-consumption.jpg)

### Inventory

Searchable spool cards with remaining weight, location, material/vendor badges,
ownership, and low-stock state. Large result sets render progressively with a
shown/total counter and **Show more** control.

![Inventory grid](screenshots/inventory.jpg)

### Add Filament

Catalog-backed stock entry for Bambu, eSUN, and generic/manual rolls. This
tour uses eSUN for ordinary manual stock entry so the flow is recognizable even
when a roll is not read automatically from a Bambu AMS.

![Add filament flow](screenshots/add-filament.jpg)

### Batch Add From Bambu Boxes

Batch entry lets you paste or scan several Bambu Filament Codes, review
ambiguous rows, choose among discontinued old-stock matches when needed, and add
all ready matches in one action.

![Bambu batch add](screenshots/bambu-batch-add.jpg)

### Wishlist And Orders

Status filters, search, result counts, stocking, and removal keep planned
purchases manageable from the same Add filament workspace.

![Wishlist and orders queue](screenshots/wishlist-queue.jpg)

### Filament Details

Roll-level maintenance for weight, tare, home location, ownership, QR companion
links, RFID, live AMS sighting, and lost-status handling.

![Filament detail panel](screenshots/filament-details.jpg)

### Individual Filament Label

The label builder previews a selected roll at its physical size before saving a
print-ready 300-DPI PNG to Downloads. P-Touch 24 mm, Compact, Standard, Expanded,
and validated custom landscape sizes share the same clear QR and filament
identity layout. The most recent custom dimensions are remembered locally, while
the panel points to the fixed 60 × 24 mm inventory label-sheet builder when
several rolls need labels at once.

![Individual filament label builder](screenshots/filament-label.jpg)

### Roll History

Roll history stays collapsed until needed, then shows a localized event timeline
with bounded expansion for long histories.

![Filament roll history](screenshots/filament-history.jpg)

### RFID Capture

RFID capture compares an AMS identity with catalog and inventory data, shows
the captured fields, and lets you save the RFID to the selected spool. The
public image uses the deterministic synthetic RFID fixture.

![RFID capture](screenshots/rfid-capture.jpg)

### Loans

The loan history tracks outgoing loans, borrowed-in rolls, returns, and CSV
export from the same place.

![Loan history](screenshots/loans.jpg)

### Loan Out

Loan-out keeps the available roll list and the selected roll/action panel side
by side, using the roll swatch color through the list, preview, and action
surface.

![Loan out roll](screenshots/loan-out.jpg)

### Return Loan

Return handling records measured return weight, calculates consumed filament,
and moves the roll back into stock or completes borrowed-in handback history.

![Return loan](screenshots/return-loan.jpg)

### Return Borrowed-In Filament

The inbound return flow confirms the external owner, measured hand-back weight,
and removal of the borrowed spool from active inventory.

![Return borrowed-in filament](screenshots/return-inbound-loan.jpg)

### Printers

Printer and multi-material slot state with current assignments, collapsed slot
swatches/material labels, usage statistics, and manual/non-live printer
coverage. Optional live observations, RFID matching, and candidate suggestions
appear in the same workspace when Bambu Live is enabled. This capture includes
fresh, connected Bambu telemetry from the sanitized rich QA fixture described
above.

![Printer slot overview](screenshots/printers.jpg)

### Add Printer

Printer setup first chooses model, name, and multi-material capacity. Supported
Bambu models then offer a second, optional Bambu Live step in the same flow.
Live can be skipped for later setup; when enabled, the printer host, serial,
access code, and explicit TLS identity review are required before the printer
is created with Live. The public capture is driven by the sanitized fixture and
contains no printer address, access code, serial, or trusted fingerprint.

![Add printer](screenshots/add-printer.jpg)

### Slot Assignment

Slot assignment filters compatible rolls, shows placement and remaining weight,
and keeps the current slot context visible while changing assignment. With
Bambu Live and Bambu RFID filament, much of this can be observed from the
printer; other filament brands can still be assigned and weighed manually when
you want usage and remaining weight to stay accurate.

![Printer slot assignment](screenshots/printer-slot-assignment.jpg)

### AMS Catalog Onboarding

When the AMS reports a Bambu roll that is not yet in inventory, catalog
onboarding can create the spool and save the observed RFID in one guarded flow.

![AMS catalog onboarding](screenshots/printer-slot-onboarding.jpg)

### Use An AMS Weight Estimate

For a freshly observed Bambu roll with an exact RFID inventory match, **Update
weight** shows the AMS percentage and estimated net filament alongside the
empty-spool tare and calculated total. **Use AMS estimate** explicitly rebases
the inventory weight without recording synthetic print usage. This public
capture uses a sanitized fixture with a 1,000 g inventory
weight and a fresh 30% estimate on a 1,000 g AMS spool basis.

![Use an AMS weight estimate](screenshots/printer-ams-weight-estimate.jpg)

### Slot Replacement Weight

Replacing a loaded non-Bambu spool records outgoing and incoming measured
totals so remaining filament and usage stay accurate when the printer cannot
automatically identify or weigh the roll.

![Printer slot replacement](screenshots/printer-slot-replacement.jpg)

### Slot Clear Weight

Clearing a loaded non-Bambu slot records the outgoing measured total and
returns the spool to its home location when it is no longer loaded.

![Printer slot clear](screenshots/printer-slot-clear.jpg)

### Statistics

Material use, printer activity, ownership split, loan consumption, and filtered
breakdowns across manual jobs and live printer usage.

![Statistics overview](screenshots/statistics.jpg)

### Loan Usage Statistics

Loan statistics separate active and returned movements, borrower usage, and
material consumed outside printer sessions.

![Loan usage statistics](screenshots/statistics-loans.jpg)

## Settings

### General

Appearance and language controls, plus the separate opt-in settings for
continuing in the menu bar or system tray after the window closes and starting
hidden when the current user signs in.

![Settings General tab with background-operation controls](screenshots/settings-general.jpg)

### Program And Update Notifications

The Program section shows the exact version, license/source links, and
documentation shortcuts. In configured release builds, **Check automatically**
runs after a short startup delay at most once per 24 hours and shows a banner
only for a newer version. Up-to-date and failure results stay silent
automatically; the retained manual check reports explicit status, including an
unavailable or disabled channel. **Later** dismisses the banner for now, while
**View release** opens the fixed release page. Download and installation remain
manual, and `v0.22.0` requires one manual bridge upgrade before automatic
notifications can work.

![Update notifications and manual check](screenshots/settings-updates.jpg)

### Inventory Label Sheet

The inventory label-sheet builder arranges all on-hand rolls on A4 or US Letter
pages with the same 60 × 24 mm layout as an individual P-Touch label. Page
controls provide an in-app preview before the print-ready PDF is saved to
Downloads, and the panel points back to Inventory when only one roll needs a
label.

![Inventory label-sheet builder](screenshots/inventory-label-sheet.jpg)

### Library And Web App

Host/client library mode and local Companion/webapp controls. Companion must be
enabled and running here before a phone, tablet, or workshop browser can use the
LAN Companion address.

![Settings library and web app](screenshots/settings-library.jpg)

### Stable Local Companion Address

The network details make the short library-bound `.local` address visible for
new Companion and desktop-client pairings, while retaining the current numeric
address only as diagnostics. The address remains usable after a DHCP change
when the selected private network allows mDNS/Bonjour traffic.

The isolated visual-QA capture uses a synthetic short `.local` name to show the
same address form as a normal Host. Its loopback direct address and "Loopback
QA" interface are test-only diagnostics; no real LAN address or mDNS service
is exposed in the public image.

![Stable local Companion address](screenshots/settings-library-network.jpg)

### Guided Library Role Change

Changing between Standalone, Host, and Client opens a guided review. Nothing is
saved until the migration impact and required backup or connection details are
confirmed.

![Guided library role change](screenshots/settings-library-role-change.jpg)

### Bambu Live Diagnostics

Bambu Live diagnostics show connection health, observed AMS slots, matching
signals, and a field-capture session that can be paused for review. Those three
screens are intentionally not included in the public image set: a meaningful
capture requires a real printer and fresh telemetry. The private visual-QA gate
waits up to its bounded readiness timeout and fails without creating an image
when live data never arrives.

### Bambu Live Security Setup

Live status keeps the access code in the operating system credential store and
checks the printer certificate identity before credentials may be sent. A new
or changed identity remains untrusted until the user explicitly reviews it.
The example below uses only the synthetic Visual QA interface and contains no
host, serial, access code, or trusted identity.

![Bambu Live security setup](screenshots/settings-printer-editor.jpg)

### Unsaved Printer Changes

Printer reconfiguration keeps save state visible and asks before discarding
unsaved model, capacity, name, or Bambu Live changes.

![Discard unsaved printer changes](screenshots/settings-printer-editor-discard.jpg)

### Filament Catalogue

Catalogue settings group vendor catalogues, material filters, missing swatches,
and refresh/maintenance actions.

![Settings catalogue](screenshots/settings-catalog.jpg)

### Program Maintenance

Backup validation, import/export, reset actions, and other local maintenance
tools live in the maintenance tab. Portable full backups omit device-local
credentials and pairing state. A full restore requires confirmation and creates
a validated local SQLite recovery snapshot before replacing library data.

![Settings maintenance](screenshots/settings-maintenance.jpg)

## Companion Webapp

Companion is a local webapp served by the desktop app on the same LAN. Enable
the Companion/webapp server in **Settings -> Library & web app**, pair the
browser, and keep the desktop app running while using Companion from a phone,
tablet, or workshop browser. Inventory and other library data remain unavailable
until the browser has an authenticated paired session.

### Wide Companion

The wide Companion view is useful for a workshop browser or secondary screen
when you want quick stock, printer, and loan access away from the desktop app.
Long inventory and loan lists use incremental shown/total controls.

![Companion wide inventory](screenshots/companion-wide-inventory.jpg)

### Companion Tablet

Tablet layout keeps the inventory readable with touch-friendly rows, swatches,
remaining weights, and quick actions.

![Companion tablet inventory](screenshots/companion-tablet-inventory.jpg)

### Companion Phone

The phone inventory view is optimized for fast lookup near the printer, with
stacked rows and large touch targets.

![Companion phone inventory](screenshots/companion-phone-inventory.jpg)

### Phone Add Spool

Companion can add owned or borrowed-in stock from the browser when the desktop
host allows writes for the paired browser.

![Companion phone add spool](screenshots/companion-phone-add-spool.jpg)

### Phone Lend Spool

The lending sheet keeps the selected roll, borrower, outgoing weight, and note
fields in a compact phone flow.

![Companion phone lend spool](screenshots/companion-phone-lend-spool.jpg)

### Phone Detail

The detail sheet exposes current roll metadata, history, usage, status, and
maintenance actions in the mobile Companion.

![Companion phone detail](screenshots/companion-phone-detail.jpg)

### Phone Printer Board

The phone printer board shows AMS slots, loaded rolls, live observations, and
slot actions in the Companion view.

![Companion phone printer board](screenshots/companion-phone-printers.jpg)

### Phone Settings

Companion uses the same compact language selector as the desktop app, so all
published languages remain practical on a phone without turning the settings
panel into a long row of buttons.

![Companion phone settings](screenshots/companion-phone-settings.jpg)
