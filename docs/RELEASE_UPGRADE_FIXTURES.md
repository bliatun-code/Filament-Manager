# Release upgrade fixture preparation

Prepare a separate, private test copy on macOS or Linux:

```sh
npm run qa:release:upgrade-fixture -- --source=/absolute/path/source.db --output=/absolute/path/new-fixture.db
```

The source is opened read-only. Preparation sanitizes a private SQLite backup,
validates it, removes freed-page contents with secure deletion and `VACUUM`,
then publishes the copy without replacing an existing output. The source file
and its records remain unchanged. Preparation failures remove private staging
and do not publish an accepted fixture.

The shared validator is also called before the installed-app upgrade smoke.
Its safety marker alone is insufficient: the actual settings, runtime records
and copied diagnostic fields must satisfy the contract. The copy still
preserves business data such as catalog materials and record IDs; this is not
an anonymization of the entire library.

## Catalog jobs from schema 6

Migration `007` introduces `catalog_refresh_jobs`. Schema 6 and later must have
its known columns; earlier schemas must not contain that table. Unknown columns
or result fields are rejected so future operational metadata cannot silently
pass through preparation.

- Job IDs, vendor/material, terminal status and timestamps are preserved.
- Authority and process-owner identities are replaced with fixed QA values.
  The QA authority is inert and does not reuse the source credential profile.
- Failed/interrupted job errors and successful-job output use fixed QA text.
  Discovered source URLs, collection names and material lists are cleared.
- Successful results retain the known nonnegative integer counts. Nullable
  counters retain their null values. Invalid types or unsafe integers fail.
- A copied running job has no worker. Preparation changes it to `INTERRUPTED`,
  sets `finished_at` to its existing `started_at`, and clears its result before
  the preservation snapshot. This is fixture preparation, not evidence that
  the candidate recovered a running worker.

Sanitization returns `sanitizedCatalogJobs` and `interruptedCatalogJobs` counts.
The validator rejects retained operational identities, diagnostics and running
jobs. Upgrade comparisons continue to protect every catalog-job column;
normalization does not exclude the table from the value digests.

## Release coverage

The published v0.28.0 fixture remains the historical schema-5 migration input.
It has no catalog-job table and is unaffected by this change.

## Synthetic compatibility fixture for v0.30.0/schema 7

Prepare a separate compatibility input on macOS or Linux:

```sh
node scripts/prepare-compatibility-release-upgrade-fixture.mjs --output=/tmp/v0.30.0-compat.sqlite
node scripts/prepare-compatibility-release-upgrade-fixture.mjs --output=/tmp/v0.30.0-compat.sqlite --verify
```

The generator reconstructs schema 7 from the baseline SQL and structural
migrations 003–008 published at v0.30.0 commit
`7d2eb3a45fc78a60ad31cb88e178ba266d044c5b`. Each file must match an independently
pinned SHA-256; today's migration manifest and Git history are not inputs.
`--source-root=/path/to/checkout` optionally selects another copy of those
same pinned files. It does not select a different release.

Synthetic records cover three catalog jobs (running, successful and failed)
and one batch receipt for two distinct owned spools of the same catalog master.
The shared fixture sanitizer interrupts the copied running job, replaces
operational identities and diagnostics, and preserves the receipt's spool IDs.
The verifier checks schema, SQLite integrity, foreign keys, sanitization,
representative journal counts and agreement between the receipt and spool weights.

Preparation publishes the database and `<output>.json` manifest with owner-only
permissions, without replacing existing files or symlinks. A failed publication
cleans up this attempt's output. The pair is not published atomically; consumers
must wait for preparation to succeed and verify both files before use. The
manifest binds the database hash, source file hashes, release commit, schema and
counts. It is local consistency metadata, not a signed provenance attestation.
Verification is read-only and can also run on Windows; private preparation
requires macOS or Linux. Tests skip private preparation on other platforms.

This is generator and contract coverage only. It does not run the old app binary
or demonstrate installed-app upgrade or portable-backup restore behavior. The
v0.28.0/schema-5 fixture and existing native release gates remain unchanged.
Neither operational journal becomes portable user data through this fixture.
