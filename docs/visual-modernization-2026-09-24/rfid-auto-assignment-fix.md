# RFID slot assignment after partial live updates

The reported symptom was an exact inventory RFID match in observed details while
slot 4 had no stored assignment in the printer overview. The summary renders
assigned slots; it does not limit the list to three slots.

A synthetic four-slot reproduction confirmed one cause: automatic assignment
required the RFID observation itself to be less than ten minutes old. The tray
merger can retain that identity while receiving fresh weight-only updates, so
matching still succeeds while assignment is skipped. The supplied diagnostics
did not include observation timestamps; this reproduces the symptom without
claiming to have inspected the production state.

The assignment gate now also accepts a retained exact RFID identity when the
printer is online and MQTT-connected, the tray is loaded, and a recent weight
observation is newer than the identity. An empty observation after that identity
prevents this recovery. The RFID timestamp is never rewritten: a manual clear
still requires a newer RFID observation. Existing unique-match, inventory
availability, replacement, and AMS-reading guards remain in place.

Validation used synthetic in-memory databases only:

- The four-slot regression failed before the fix (slot 4 was unassigned) and passes afterward.
- Recovery is rejected for stale weight, missing identity time, offline or disconnected state, removal, manual clear, replacement, and duplicate RFID.
- All 173 Bambu-related tests passed.
- The printer summary component test passed.
- Clippy with all targets and warnings denied passed; formatting and diff checks passed.

No production database or printer was accessed. This is a source-code change;
the installed application needs a build containing the fix before it takes effect.
