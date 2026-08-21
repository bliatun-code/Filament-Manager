# Database migrations

Database schema history is append-only. A released migration file must never be
edited, deleted, renamed, reused, or renumbered. Fixes are made in a new
migration.

## Current layout

- `src/database/schema.sql` is the published structural baseline used while a
  schema-0 database is normalized to baseline schema 1. Its hash is locked too;
  new structural changes belong in migrations rather than in the baseline.
- The schema-0 entrypoint and its five `database_*_schema.rs` helper files are
  the rest of that same frozen baseline. The manifest locks the exact
  `apply_structural_baseline` function, every helper file, and the complete set
  of `ensure_*` calls against v0.27.0. This prevents clean installs from gaining
  unversioned DDL that versioned upgrades would skip.
- `001_init.sql` and `002_sync_queue.sql` reconstruct old databases that were
  released before `PRAGMA user_version` was authoritative. They remain locked
  historical fixtures; they are not replayed as schema versions 1 and 2.
- `STRUCTURAL_MIGRATIONS` in
  `src/backend/database_schema_setup.rs` is the authoritative runtime order for
  versioned transitions. It currently contains `003` (schema 1 to 2), `004`
  (schema 2 to 3), and `005` (schema 3 to 4).
- `src/database/migrations/manifest.json` records every numbered SQL file, its
  role and SHA-256. Entries through `publishedThroughSequence` are checked
  against the pinned release tag and commit as well as the working tree.

The runtime applies the baseline and every pending versioned migration in one
transaction. It writes `user_version` after each successful step and rolls the
entire structural change back if any step fails. Catalog seeding remains a
separate recurring data-maintenance operation after structural migration
succeeds; catalog data and swatch backfills are deliberately outside the
structural source lock.

## Append the next migration

Assume the manifest ends at sequence `005` and schema version 4:

1. Add `src/database/migrations/006_short_description.sql`. Use the next
   sequence exactly once. Do not add `BEGIN`, `COMMIT`, or `PRAGMA user_version`;
   the Rust runner owns the transaction and version update.
2. Append one `StructuralMigration` row with `from_version: 4` and
   `to_version: 5`. Never insert or reorder rows in the existing sequence.
3. Do not edit `src/database/schema.sql` or add new structural DDL to the legacy
   normalization helpers. A clean database reaches the current structure by
   applying the frozen baseline and the same migration sequence as an upgrade.
4. Append the matching manifest entry, set `currentSchemaVersion` to 5, and
   record the lowercase SHA-256 of the exact SQL bytes. Leave
   `publishedThroughSequence` and `publishedReference` unchanged while the
   migration is unreleased.
5. Add or extend Rust behavior tests for both a clean database and every
   supported starting version. Verify preserved user data, foreign keys,
   `quick_check`, the final `user_version`, and a second idempotent startup.
6. Run:

   ```bash
   npm run check:database-migrations
   node --test ./scripts/check-database-migrations.test.mjs
   cargo test --locked --lib database_schema_setup::tests
   npm run check:database-migrations -- --verify-published-reference
   ```

The local manifest check allows a correctly appended migration beyond the
published boundary, but rejects gaps, duplicate numbers, non-contiguous schema
versions, unlisted SQL files, and hash drift.

## Advance the published boundary

Only after a release tag containing the new migration has been published:

1. Set `publishedReference.ref` and `publishedReference.commit` to that exact
   release tag and its full commit SHA.
2. Advance `publishedThroughSequence` to the last migration present in that
   release. Never reduce it.
3. Run the strict published-reference check with full Git history available.

CI checks out full history for `Database Migration Integrity`, compares every
published SQL blob plus the frozen schema-0 entrypoint and helper source set to
the pinned release, exercises clean and historical database paths through the
real Rust migration runner, and makes that check a required release-publishing
condition.
