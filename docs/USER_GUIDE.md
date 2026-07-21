# Filament Manager - User Guide

Norwegian version: [BRUKERVEILEDNING.md](BRUKERVEILEDNING.md)

Filament Manager is a desktop-first inventory application for 3D printer filament. It keeps stock, loans, printer slots, filament usage, wishlist items, orders, catalog data, and Bambu AMS live data in one local library.

The app is designed to answer four practical questions quickly:

- What do we have in stock?
- Where is each spool, and who owns it?
- Which printer slots are loaded with which filament?
- How much filament has been used, loaned out, or ordered?

## Core Concept

Filament Manager uses a local SQLite database as the primary inventory store. Normal operation does not require an external cloud service. One machine can run fully standalone, or it can act as a host for other desktop clients and paired browsers on the same local network.

The main pieces are:

- Desktop app: the main Tauri and React application.
- Local database: stores catalog entries, spools, history, loans, printers, live observations, and settings.
- Companion/webapp: a local browser interface that can be shared on the LAN when enabled.
- Host/client sync: one desktop can host the library, while other desktop installations connect as clients.
- Bambu Live integration: optional local MQTT reading from Bambu printers for AMS slots, RFID, estimated weight, job state, and nozzle temperature.

## Operating Modes

The library can run in three roles: Standalone, Host, and Client.

### Standalone

Standalone is the default and safest single-machine mode.

- This machine uses its own local database.
- All writes go directly to the local database.
- The desktop app can still serve the webapp if webapp hosting is enabled.
- This fits a workshop where one Mac or PC is the primary machine.

Use Standalone when you do not need other desktop installations to share the same library.

### Host

Host means this desktop installation owns the shared library.

- The host's local database is the source of truth.
- Other desktop clients can pair with the host.
- Browsers can pair with the webapp on the local network.
- Client writes are sent to the host when the client is paired correctly.
- Bambu Live should usually be configured on the host, because live observations and automation then belong to the same library.

Use Host when one stable machine should serve the shared inventory for several devices.

### Client

Client means the desktop app connects to another Host.

- The client reads inventory, loans, printers, wishlist items, and settings from the host through its authenticated desktop pairing.
- When the host is reachable and the client is paired, supported writes are performed against the host.
- When the host is unavailable, the client can show a local read-only cache.
- The client's local database is not the primary library.

Use Client when this machine should use a library owned by another desktop.

### Webapp and Paired Browsers

The webapp is a local companion interface served by the desktop app.

- It runs from the machine where webapp hosting is enabled.
- Browsers are paired with a short-lived link or QR code.
- Paired browsers receive a protected local session with CSRF protection.
- Opening the LAN address does not expose inventory: library reads and writes require an authenticated paired session.
- The webapp is designed for quick use on a phone, tablet, or workshop browser.
- The host can revoke browser sessions from settings.

The webapp is useful at the printer: check stock, inspect printer slots, loan out filament, return filament, add spools, and update weight.

## Main Pages

### Dashboard

Dashboard is a quick overview of inventory health and activity.

It shows, among other things:

- total filament count
- active printers
- low-stock count
- recent usage
- ownership summary
- recent activity
- inventory health
- progress and status panels when relevant

Dashboard is meant as a quick status check, not as the main place for detailed editing.

### Inventory

Inventory is the main view for filament spools.

You can:

- search by material, color, owner, location, or QR
- filter by status such as In stock, Assigned, Loaned out, Empty, and Lost
- see low stock
- open spool details
- update weight
- change status and location
- print QR labels
- register RFID
- loan out filament
- add new spools
- manage wishlist items and orders

Inventory cards group identical filament and color entries while still showing individual spools and locations. This keeps the inventory easy to scan without losing traceability.

To create a label for one spool:

1. Open the spool details in Inventory and find the QR panel.
2. Choose **Create QR label**.
3. Select P-Touch 24 mm, Compact, Standard, or Expanded, then check the preview.
4. Choose **Save PNG to Downloads** to save the print-ready 300-DPI image.

The P-Touch profile uses a 60 × 24 mm landscape canvas with a nearly full-height
QR and large identifying text. For several on-hand spools at once, use **Settings
→ General → Create inventory label sheet** instead.

The Wishlist and orders panel has its own status filters and search field. It
shows the number of matching rows, lets you move purchases between Wishlist, On
order, and Received, stocks an arrived item as a physical spool, and removes
plans that are no longer needed.

### Loans

Loans collects both outgoing and incoming loans.

The app separates:

- Loaned out: spools owned by us and loaned to someone else.
- Borrowed in: spools owned by someone else and temporarily stored or used by us.

You can:

- create loans
- return loans
- manage borrowed-in spools
- search by person, material, or filament id
- filter by direction and status
- export loans to CSV

Loans affect inventory status. A loaned-out spool is not treated as normally available stock until it is returned.

#### Loaning Filament to Someone Else

Use Loaned out when a spool owned by us physically leaves inventory, or when another person will use it for a while.

Typical flow:

1. Find the spool in Inventory or open Loans.
2. Choose Loan out filament.
3. Select or enter the borrower.
4. Enter how many grams are loaned out if it is not the full remaining spool.
5. Add contact details or notes when useful.
6. Confirm the loan.

When the spool is loaned out:

- the spool is marked Loaned out
- it is hidden from normal available stock
- it should not be treated as printer-ready stock until it is returned
- history records who borrowed it, when it went out, and how much went out

When the spool is returned, record how much comes back. If less comes back than went out, the app can treat the difference as loan usage. That lets loans contribute to real material usage without mixing that usage with printer usage.

#### Borrowing Filament From Others

Use Borrowed in when a spool belongs to someone else but is temporarily available in our workshop.

Typical flow:

1. Choose Add filament.
2. Select the catalog item or create the spool manually.
3. Set ownership to Borrowed in.
4. Enter the owner/lender and any contact details or notes.
5. Enter weight and location.
6. Add the spool.

Borrowed-in spools can be stored, loaded into printer slots, and tracked with weight updates, but they are kept separate in ownership summaries. When the spool is handed back, use the borrowed-in return flow. That closes the inbound loan and removes the spool from active inventory.

#### Active, Returned, and Historical Loans

The Loans page has filters for direction and status.

- Direction separates Loaned out and Borrowed in.
- Status separates Active and Returned records.
- Search can match person, material, color, or spool id.
- CSV export provides a clean history for reconciliation or sharing.

Returned loans intentionally remain searchable. They are no longer active inventory movements, but they are valuable as history and as input to usage reporting.

### Printers

Printers shows configured printers and their slots.

You can:

- add printers
- choose model and multi-material configuration
- inspect loaded slots
- manually assign filament to slots
- clear slots
- update weight manually
- see Bambu AMS live state when live integration is enabled

Every printer gets at least one external slot (`EXT`). Bambu printers can use AMS profiles with AMS units and slots per unit. Prusa MMU3 and Prusa XL have their own profiles for MMU channels or toolheads.

When a printer's detailed slot grid is collapsed, the overview still shows a
compact swatch and material label for every assigned slot. These summaries use
saved assignments, so they also work for manually configured printers without
live data. Bambu printers with live data additionally show job state, progress,
nozzle and bed temperature, AMS humidity, and AMS temperature on a compact row.

### Statistics

Statistics shows aggregated usage.

It includes:

- total usage
- recorded jobs
- active loaded slots
- failed jobs
- usage per printer
- usage per material
- loan usage per person
- ownership status for stock and low stock

Usage is built from manual weight updates and automatic live observations when the live-usage rules are satisfied.

### Settings

Settings is split into several areas.

General:

- app version
- theme: Auto, Light, Dark
- language, selected from one compact list
- inventory QR label sheets

The desktop app and Companion support English, Norwegian Bokmål, German,
French, Spanish, Brazilian Portuguese, Italian, Polish, Dutch, Czech,
Simplified Chinese, Traditional Chinese, Japanese, Korean, Turkish, Ukrainian,
Russian, Hungarian, Swedish, Danish, and Finnish. The selected language is
stored locally for each surface. English remains the fallback when needed.
Corrections to community translations can be proposed through the project’s
GitHub issues or pull requests.

To create label sheets for the on-hand inventory:

1. Open **Settings → General** and choose **Create inventory label sheet**.
2. Select A4 or US Letter.
3. Review the sheet preview and use the page controls when the inventory spans
   more than one page.
4. Choose **Save PDF to Downloads**.

Each page holds up to 30 labels in the same readable 60 × 24 mm layout as the
P-Touch QR label. For one spool, or for a different label size, open its QR panel
under **Inventory** and choose **Create QR label**.

Library and webapp:

- library role: Standalone, Host, or Client
- local device name used when identifying this installation
- webapp server
- network interface and port
- browser pairing
- connected browsers and revocation
- desktop client pairing against a host

3D printers:

- printer list
- model and slot profile
- Bambu Live configuration
- live diagnostics and capture
- guarded reconfiguration with a discard confirmation for unsaved changes

Filament catalog:

- catalog overview
- catalog refresh for Bambu and eSUN
- separate vendor audit and selected-material update actions
- color/swatch data
- handling catalog items that are no longer found during import

Program maintenance:

- backup
- import/export
- reset and maintenance functions
- validation before larger role or host migrations

## Add Filament

Add filament supports several practical flows, not just a single registration form.

### Directly to Inventory

Use this when the spool physically exists on the shelf now.

Typical flow:

1. Choose source: Bambu, eSUN, or generic/manual.
2. Search for or select the correct catalog filament.
3. Choose ownership: Owned or Borrowed in.
4. Enter initial or remaining weight.
5. Enter home location if useful.
6. Add the spool to inventory.

For catalog-based spools, the app fills material, color, vendor, default weight, and swatch when those data exist. For manual spools, you enter those details yourself.

### Bambu Filament Code

Bambu boxes include a five digit `Filament Code` on the box label, for example `53400`.

In the Bambu source flow:

- type or paste the code in the catalog search field to select one matching active catalog item
- choose manually if the same code appears on several active catalog items
- add a single discontinued-only match as old stock, or choose the correct row when a discontinued code has several catalog matches
- use manual entry if no catalog item uses the code yet

Desktop/client also has a batch Filament Code modal in the Bambu flow. Paste one code per line, use the small scan/type field to append one detected code at a time, add barcode values from a still image, or keep the webcam running while you show Bambu box labels one after another. Live scanning gives feedback in the video overlay when a code is added, keeps scanning for the next label, and avoids repeating the same visible label until you move it away. If a barcode contains a five digit Filament Code, that code is added as a ready/review row; if it only contains another barcode value, that raw value stays visible for manual review. The app lists which rows are ready and creates rows with a ready catalog match, including a single discontinued-only old-stock match. Ambiguous active matches, discontinued codes with several possible catalog rows, invalid codes, or missing codes stay visible for manual review.

Batch-created Bambu spools use the stock details on the right side of the modal, including ownership, owner/contact fields for Borrowed in, weight, and location. Companion/webapp uses the same catalog matching rules for manual code lookup, but does not use camera or webcam scanning.

See [Camera And Batch Scanning](CAMERA_AND_BATCH_SCANNING.md) for a short walkthrough, supported inputs, and camera troubleshooting. Desktop/client keeps code, image, and webcam barcode input in the same review-first batch workflow. The scanner reads barcodes and Filament Codes rather than arbitrary label text through OCR.

### Owned Filament

Owned means the spool belongs to this library.

Owned spools:

- count as normal stock
- can be loaned out
- can be assigned to printer slots
- can participate in automatic Bambu Live usage
- appear in inventory health and low-stock views

### Borrowed-In Filament

Borrowed in means the spool belongs to someone else but is temporarily used by us.

Borrowed-in spools:

- get an inbound loan record
- are kept separate in statistics and ownership summaries
- can be managed and returned
- should include owner/contact/note when useful

### Wishlist and Orders

The wishlist flow is for filament that may not physically be in stock yet.

The statuses are:

- Wishlist: something we want or are considering buying.
- Ordered: something that has been ordered but not fully handled yet.
- Received: something that has arrived or has been closed in the wishlist/order flow.

You can add the current catalog selection to the wishlist from Add filament. When the item later becomes a physical spool, register it as inventory with the correct weight and location. The wishlist is for planning and purchasing follow-up; inventory is the stock you can actually use.

Use the status tabs to focus the queue, the search field to find a planned
purchase by name, color, or vendor, and **Stock roll now** when an ordered item
arrives. **Remove** deletes only the wishlist/order entry; it does not delete an
inventory spool.

### Missing Filament?

If the filament does not exist in the catalog, add it manually. This is useful for specialty filament, older spools, vendors without catalog import, or labels that do not match catalog data.

## QR and RFID

Each spool can have QR and RFID data.

### QR

QR is used for robust spool identification.

The app can generate a QR code containing the spool reference. It can be printed on labels and used in the companion/webapp to open the correct spool quickly.

### RFID

RFID is especially important with Bambu AMS.

When a Bambu AMS reports an RFID identity, the app can match it against a saved spool. When RFID is registered on the correct spool, the app can automatically choose the correct filament when the AMS slot is observed live.

RFID registration is therefore a key to reliable automation. Without RFID, the app can often see material, color, and slot, but it cannot always know which physical spool is loaded. With saved RFID, the identity becomes much stronger and automatic assignment becomes safer.

Typical RFID flow for an existing inventory spool:

1. Put the spool in an AMS slot on a Bambu printer with Live Bambu status enabled.
2. Open the spool detail panel in Inventory.
3. Go to the QR/RFID panel.
4. Select the correct live slot if the app does not already suggest it.
5. Refresh/read live data from the printer.
6. Verify that observed RFID, color, and slot look correct.
7. Save RFID on the spool.

From a printer slot, an unknown Bambu RFID can also be handled directly in the slot card:

- If exactly one inventory spool looks like the live roll, use **Save RFID** to register the observed identity on that spool.
- If several inventory spools match, choose the correct spool from the shortlist before saving RFID.
- If no inventory spool matches but the Bambu catalog has a likely entry, use **Add + save RFID**, choose whether the new spool is owned or borrowed-in, then confirm the new spool and RFID registration together.

The slot flow never silently replaces an already assigned spool. If the slot already has a different roll, clear or change the assignment deliberately first. The app also asks for a fresh confirmation when the live RFID disappears, the slot unloads, or the observed identity changes while you are deciding.

After this, the app can use RFID as a strong identity. If several spools share unclear or conflicting data, the app will be more cautious and ask for manual review before saving or creating anything.

#### Before Registering RFID

Check this first:

- The printer must be a Bambu printer with Live Bambu status enabled.
- The printer must be configured with the correct AMS setup.
- The spool should already exist in Inventory, unless you are using the slot card's **Add + save RFID** flow to create a new Bambu catalog spool from the live AMS signal.
- The spool must be in an AMS slot where the live panel sees an observed RFID/AMS identity.
- If you use Host/Client mode, register RFID against the host library, not a disconnected client cache.

#### What to Verify

When you open the RFID panel for a spool, the app may show possible live slots and observed data. Verify that the signal matches the physical situation:

- correct printer
- correct AMS and slot
- correct color or material hint
- observed RFID/AMS id exists
- the app shows the correct candidate, or at least no dangerous conflict

If several spools could be the same candidate, stop and resolve it manually instead of saving the wrong RFID. Incorrect RFID on a spool can cause AMS automation to select the wrong spool later.

#### After RFID Is Saved

When RFID is saved on a spool:

- live AMS slots can match the spool directly
- the printer view can show the correct spool without manual assignment
- automatic usage can be tied more safely to the correct spool
- unknown live slots can become known when the same RFID appears again
- manual slot changes are less likely to be overwritten by stale live data

RFID should be registered once per physical spool when you have a confident observation. If a spool is replaced, rewound, or moved to a different core in a way that changes its AMS identity, verify RFID again.

## Live Bambu Printers

Bambu Live is an optional local integration for Bambu printers with AMS.

Important: a live printer must first be added as a normal printer. After the printer exists in the app, Live Bambu status must be configured on the printer card in Settings -> 3D printers.

### Configuration

Typical setup:

1. Go to Settings -> 3D printers.
2. Add a printer with the correct Bambu model.
3. Choose the AMS setup, for example 1 AMS x 4 slots.
4. Save the printer.
5. Open the printer card again.
6. Enable Live Bambu status.
7. Enter the printer IP/host.
8. Enter the access code.
9. Enter the printer serial if needed.
10. Open live details and verify that AMS slots are visible.

Live Bambu status is local and reads printer data on the same network. It should be configured on the host machine when using a Host/Client setup.

### What the Live Integration Observes

When active, the app can observe:

- AMS slot loaded or empty state
- material, color, and vendor data reported by the printer
- RFID/AMS identity when available
- Bambu Studio filament settings profile hints such as `tray_info_idx`, `tray_id_name`, and recommended nozzle range when the printer sends them
- estimated remaining AMS weight
- printer job state and AMS status codes when they appear in the MQTT stream
- subtask/job id and name when the printer sends it
- progress and remaining time
- nozzle temperature
- raw MQTT data for diagnostics/capture

Bambu Studio filament settings data is not the same as RFID. `tray_info_idx` and `tray_id_name` point to print settings for a material/profile, not a physical spool or a complete product catalog entry. The app shows this for diagnostics and can treat it as a weak material hint, but it should not replace saved RFID on the spool.

Recommended nozzle range from a settings profile is also diagnostic data. It describes the profile's temperature window, while live nozzle temperature describes what the printer is actually doing right now.

The printer model list is shared between the desktop app, webapp, and host. For Bambu Lab models it also stores the Bambu Studio printer profile code, so diagnostics can use familiar upstream labels such as `BBL P1S` while still keeping printer model selection separate from spool/RFID identity.

`job_state` and `ams_status` are shown as diagnostic codes. They can help explain the printer's internal state, but they are not used by themselves to count jobs or record usage. Automatic usage still depends on a combination of job identity, `gcode_state`, progress, nozzle temperature, active AMS slot, and sane AMS weight changes.

When you export a capture to CSV, the app adds dedicated `tray_snapshot` rows before the raw field and sample logs. Those rows collect AMS/slot, loaded state, physical slot presence, RFID read state, Bambu tag bit, material, color, AMS weight estimate, RFID/tray UUID, settings profile, and nozzle range so a capture is faster to analyze without losing the raw data.

### Automatic Slot Selection

Automatic selection is strongest when RFID is registered.

Practical priority:

- Exact RFID on a spool gives the best match.
- A previously known spool in the same slot can be used when the signal is stable.
- Material/color can provide candidates, but is weaker than RFID.
- Unclear or conflicting evidence requires manual confirmation.

The goal is to automate what is safe and stop before the app makes confident mistakes.

## Automatic Weight and Usage

Bambu AMS weight is not a physical scale measurement. It is an estimate based on spool geometry/circumference and AMS data from the printer. Measurements can therefore swing by a few percent, and some readings can be obviously unrealistic.

The app treats live weight cautiously.

### What Can Be Recorded Automatically

When a live printer has a matched AMS slot and an active print, the app can:

- record decreases in remaining weight as filament usage
- link usage to the printer
- link usage to the spool
- link usage to a live print session
- count jobs when a session has enough evidence to be considered completed
- separate completed, cancelled, failed, and uncertain observations as far as the data allows

### Noise Filtering

The app rejects or ignores measurements that should not become usage.

Examples:

- weight increases are not treated as negative usage
- large jumps can be rejected as implausible
- small AMS rebound readings can be corrected
- cold nozzle is a strong signal that extrusion is not happening
- low temperatures below the extrusion threshold prevent false usage after job end
- tail measurements after a recently completed job can attach to the right session only inside safe limits

A useful rule of thumb in the app is that a nozzle below 180 C means the printer can no longer extrude. A stable temperature above normal print temperature is a strong signal that a job is actually running.

### Job Registration

Automatic job registration uses several signals together:

- printer job fields
- subtask/job id
- progress and remaining time
- AMS slot and matched spool
- weight drop
- nozzle temperature
- completed/cancelled/failed state from the printer

A job should not be counted just because AMS weight changed. It should have a plausible print session around it. This matters because AMS data often arrives in bursts and may contain old or partial fields.

## Manual Weight and Manual Usage

You can always update weight manually.

Manual weight updates are useful when:

- the printer has no live integration
- the spool is used outside AMS
- live data is missing or unclear
- you want to correct against a physical check

A manual update can affect the spool's remaining weight and usage statistics when it is connected to the correct printer/slot context.

## Printer Slots and Assignment

Printer slots can be managed manually or through live data.

Manual flow:

- Choose printer and slot.
- Select a spool from inventory.
- Load the spool into the slot.
- Update weight when needed.
- Clear the slot when the spool is removed.

The collapsed printer card keeps assigned slot swatches and material names
visible. Expand **Show slots** only when you need assignment, weight, RFID, or
clear-slot actions.

With Bambu Live:

- Live data shows what AMS reports.
- The app attempts to match the live slot with inventory.
- RFID makes automatic matching much safer.
- Manual assignment can fix or override unclear situations.
- After manual changes, the app can suppress stale live cache so old data does not immediately pull the slot back to the previous state.

## Catalog

The catalog prevents manual entry of common filament data.

The app supports:

- Bambu catalog
- eSUN catalog
- generic/manual registration
- swatch/color data
- discontinued marking when old Bambu items are no longer found during import

Catalog entries are templates. A physical spool is a separate inventory record based on a catalog entry or manual registration.

The app ships with a local seed catalog for known filament. This keeps older rolls searchable even after the manufacturer no longer lists them in the store. The seed catalog is normalized and cleaned of pure case duplicates, so the same eSUN color should not appear both as `BLACK` and `Black`.

Catalog repair restores the bundled seed catalog and removes only unused non-seeded catalog rows. Inventory spools, wishlist links, loans, printer data, RFID, locations, and history should be preserved.

Vendor audit checks what the upstream Bambu or eSUN source currently reports.
Updating selected materials applies chosen catalog changes deliberately. This
separation lets you review a vendor change before replacing local catalog
metadata.

## Data, History, and Safety

The app keeps history for important actions.

Examples:

- spool creation
- status changes
- weight updates
- printer assignment
- loans and returns
- RFID updates
- live usage
- deletion and lifecycle events

The roll detail panel initially keeps history collapsed. The event count stays
visible; open **Show** to inspect the timeline. Normal histories are shown in
full, while long histories start with a bounded recent set and offer a further
show-more action.

Deleting a spool is normally a soft delete from active views so history remains intact. Permanent purge is available when the spool and its related data really should be removed.

## Backup and Moving Libraries

Use Program maintenance for backup, import, and reset.

Full JSON backups are portable. They include library data such as inventory,
history, catalog data, and printer profiles, but omit device-local connection
credentials and pairing state. Bambu Live connection details, local network
settings, desktop-client sessions, and Companion/browser pairings must be
configured or paired again on the destination machine. Import also ignores
machine-local credentials or pairings found in older backup files.
The file still contains your inventory, QR/RFID references, and loan details,
so treat it as private data even though it contains no usable device credentials.

When you select a valid full backup, the app asks for confirmation because the
restore replaces the current library. Before replacing anything, it creates
and validates a local SQLite recovery snapshot next to the active database. If
that snapshot cannot be created and validated, the restore does not start.

Unlike the portable export, the recovery snapshot is a local copy of the
pre-restore database and can contain this machine's credentials and pairings.
Keep the application-data directory private.

When switching between Host, Client, and Standalone, decide which machine should own the library. A full backup from the old host is the safest way to move library history to a new host.

## Recommended Practical Setup

For one user:

- Use Standalone.
- Enable the webapp if you want to use a phone/tablet in the workshop.
- Configure Bambu Live on the same machine if you use Bambu AMS.

For several devices:

- Choose one stable desktop as Host.
- Enable the webapp on the host.
- Pair desktop clients with the host.
- Configure Bambu Live on the host.
- Register RFID on spools used in AMS.

For the best automation:

- Add printers with the correct AMS setup.
- Enable Live Bambu status after the printer has been created.
- Register RFID on spools used in AMS.
- Keep inventory spools updated with realistic starting weight.
- Use manual weight correction when a physical check shows that the AMS estimate has drifted.

## Limitations and Expected Behavior

Bambu live data is useful, but not perfect.

- MQTT data often arrives in bursts.
- Some payloads omit fields that were present in a previous burst.
- AMS weight is estimated, not physically weighed.
- RFID can be missing or unknown for third-party filament.
- Color/material alone is not always enough for safe automatic matching.
- Cold nozzle means usage should not continue to be recorded.

The app is therefore intentionally conservative: it is better for an uncertain situation to require manual confirmation than for the inventory to gain false jobs or false usage.
