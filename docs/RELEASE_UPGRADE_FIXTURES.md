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
It has no catalog-job table and is unaffected by this change. A future separate
v0.30.0 fixture should include synthetic terminal jobs and batch receipts while
retaining the historical fixture. This sanitizer change does not add that new
release fixture or claim installed v0.30.0 restore coverage.

The application's portable backup rules remain separate: refresh jobs are
cleared on restore, and catalog batch receipts remain installation-local to
prevent duplicate replay. Neither journal becomes portable user data here.
