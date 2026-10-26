# Filament Manager — User Guide

[Download the latest release](https://github.com/bliatun-code/Filament-Manager/releases/latest) · [Norsk veiledning](BRUKERVEILEDNING.md)

Keep track of your filament, remaining weight, loans and loaded printer slots.

## Get started

1. Install the macOS DMG or Windows MSI from the latest release.
2. Add the filament you own under **Inventory → Add filament**.
3. Add your printers and assign spools to their slots.
4. Choose your language and theme under **Settings → General**.

## One library, several ways to use it

**Standalone** keeps the library on this computer. **Host** shares its library
with other devices. **Client** connects another desktop to that Host.
Choose the role under **Settings → Library & web app**; keep the Host running
while other devices use its library.

## Overview

![Overview](images/v0.35.0/overview.png)

Check available rolls, loaded printers and low-stock reminders. Purchase suggestions stay collapsed until you need them.

## Inventory

![Inventory](images/v0.35.0/inventory.png)

Search or filter by material and colour, then open a spool for its location and remaining weight. Loans, storage locations and orders have their own Inventory tabs.

## Printers

![Printers](images/v0.35.0/printers.png)

Assign, replace or remove spools in each printer slot. Link an observed roll to an inventory candidate, or add it from the catalog. Weigh outgoing rolls without registered Bambu RFID.

## Statistics

![Statistics](images/v0.35.0/statistics.png)

Follow consumption, inventory value and printer use. Select a period to see the figures behind your workshop activity.

## Settings

![Settings](images/v0.35.0/settings.png)

Choose language, theme, low-stock limits and filament defaults. Enable optional Bambu Live and library sharing when you need them.

## Companion in the browser

![Companion in the browser](images/v0.35.0/companion-desktop.png)

Enable Companion under Library & web app, then open a pairing link or scan its QR code. Approved browsers use the same library and can be revoked from the Host.

## Companion on a tablet

![Companion on a tablet](images/v0.35.0/companion-tablet.png)

Use the tablet layout to check printer slots and select filament beside the printer. The Host must stay running and reachable on your local network.

## Companion on a phone

![Companion on a phone](images/v0.35.0/companion-mobile.png)

Find a spool, update its weight or handle a loan from your phone. If access is lost, request it again and enter the six-digit code after approval in the Host app.

## Keep weights and data useful

Enter the **total measured roll weight** when a weighing form asks for it; the
app subtracts the selected empty-spool tare. Check that tare before saving.
Incoming untagged rolls can use their recorded weight; outgoing weighing keeps
remaining stock and printer consumption up to date.

## Renew access or make a backup

Approved browsers renew automatically, with a rolling one-year lifetime.
A recovery code is valid for five minutes and at most three attempts; approve
only devices you recognize. The original pairing link/QR route remains available.

Export a full backup under **Settings → Program maintenance** before moving or
restoring a library. Update the Host and Clients together when a new release arrives.
