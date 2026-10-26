# Filament Manager v0.35.0

Release date: 2026-10-26

## A clearer workspace

- Balanced layouts for Inventory, Printers, spool properties and Settings.
- Realistic filament spools keep colour, winding and shading visible on neutral cards.
- Shared Gray Soft, Gray Deep, Blue Night, Light Clean and automatic themes.
- Updated printer models, transparent artwork and a clearer model picker.
- Inventory brings owned stock, borrowed-in spools and outbound loans together.

## Safer printer changes

- A single unambiguous observed spool can fill an empty slot automatically.
- Used-spool candidates appear before unopened alternatives when appropriate.
- Registered Bambu RFID rolls keep their automatic weight and replacement handling.
- Known Bambu series stay distinct when matching rolls: white PLA Tough+ is not interchangeable with white PLA Matte.
- Sparse MQTT bursts retain job context during long ABS preparation and preserve actual per-field observation times.
- Removing or replacing a roll without registered Bambu RFID still requires its outgoing weight.

## Companion on every screen

- Matching themes, physical spool artwork and compact layouts for desktop, tablet and phone.
- Mobile inventory has a compact header, right-aligned quantities and an anchored bottom menu.
- Unlinked printer slots can open catalog creation directly, then return for explicit RFID confirmation.
- Unlinked spool names use material and colour hints instead of internal profile codes.
- Approved browsers renew automatically, with a rolling one-year credential lifetime.
- Lost access can be requested again with a device name, then approved in the Host app.
- Recovery requires the requesting browser and a six-digit Host code, valid for five minutes and three attempts.

## Easier to find your way

- A short README leads with downloads and illustrated English/Norwegian guides.
- Eight current screenshots replace the long feature list and screenshot tour.

Existing libraries are preserved. Update the Host and desktop Clients together
so every device supports the new Companion and printer-slot workflows.
