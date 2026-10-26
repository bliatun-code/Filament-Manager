# Native CI Rust Dependency Cache

The macOS and Windows smoke jobs in [CI](../../.github/workflows/ci.yml) cache Cargo
registry/git downloads and compiled dependencies. MSRV checks, full verification,
database upgrades, bundle builds, and installed application tests still run on
every relevant push and pull request. No gate depends on a cache hit.

## Scope and keys

Each native job installs Rust 1.90.0 and the reviewed compiler from
`rust-toolchain.toml` before restoring its cache. The MSRV check uses `target/msrv`;
ordinary verification uses the normal target directory. Cache paths cover both
directories while keeping their compiler output separate.

The workflow uses SHA-pinned GitHub-owned `actions/cache/restore` and
`actions/cache/save` v6.1.0, which fit the repository's Actions allowlist. Keys
include job ID, operating system, architecture, Cargo manifests and lockfile,
and Rust configuration. The
[environment reader](../../scripts/read-rust-cache-environment.mjs) hashes the two
selected compilers' actual identities, relevant compiler environment variables,
runner image identity (`ImageOS`, `ImageVersion`), and macOS deployment target/SDK
variables when present. Raw environment values are not logged. CI requires the
runner image identity before computing the key.

There are no broader fallback keys. A changed runner image, compiler, dependency
graph, or configuration gets a fresh cache. Ordinary source-only changes can
reuse compiled dependencies. The `v2-native-smoke` prefix provides a manual reset
if needed. See GitHub's
[restore action](https://github.com/actions/cache/tree/55cc8345863c7cc4c66a329aec7e433d2d1c52a9/restore).

The path allowlist includes Cargo registry index/cache/source and git
database/checkouts, plus `deps`, `build`, and `.fingerprint` in ordinary debug and
release profiles and the MSRV debug profile. Cargo-installed binaries,
incremental compilation, target-root files, and Tauri bundles are excluded.
`CARGO_INCREMENTAL=0` applies to both native jobs. Database fixtures and smoke
logs use `runner.temp` outside the cached directories.

## Writes and validation

Only successful native jobs on a `push` to `refs/heads/main` may save a cache;
pull requests only restore it. Saving happens after every smoke gate and log
upload. On a cache miss, package-scoped `cargo clean` removes both workspace
packages from debug, release, and MSRV output before saving the allowlisted
directories. Each cleanup uses the matching compiler; explicit package names
also work with Rust 1.90. Bash's fail-fast execution on macOS and explicit
PowerShell exit-code checks on Windows stop on any failed cleanup. Saving requires
the cleanup step's actual `outcome` to be `success`, even though cache maintenance
errors are tolerated. Existing cache hits are not overwritten.
See [Cargo's clean command](https://doc.rust-lang.org/cargo/commands/cargo-clean.html).

Failed jobs do not save partial state. This follows
[GitHub's cache scope rules](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache):
pull requests may restore a default-branch cache, while a pull-request cache is
not available to the default branch.

## Cache maintenance budget

Each native job records its clock in its first step, before checkout and setup.
After all verification gates and log uploads, the
[budget planner](../../scripts/plan-rust-cache-save.mjs) checks the remaining time
against the job's limit (60 minutes on both macOS and Windows). Cache
maintenance starts only when at least ten minutes remain. A missing or invalid
clock disables saving; it never authorizes a write. The reserve covers one minute
each for marker preparation and cleanup, five minutes for packing/uploading, and
three minutes for reporting and teardown.

Marker preparation and cleanup each have a one-minute step limit; saving has a
five-minute limit. These cache-only steps use `continue-on-error`, so a timeout or
cache service error cannot change a successful verification result into a failed
job. Saving still requires successful marker preparation and package cleanup;
an unsuccessful cleanup never publishes a partially cleaned archive. Skipped
budgets and failed maintenance steps produce a warning and a job-summary
explanation; reporting is also optional and limited to one minute. Cache-action
service warnings that it handles internally remain in that action's log.
GitHub distinguishes the failed step's `outcome` from the tolerated `conclusion`;
see [step contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context)
and [step timeouts/error handling](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error).

All MSRV, test, build, database and installed-application gates remain blocking
and unconditional. Both jobs retain a finite wall-clock budget. Cache paths,
exact environment keys and the successful-main-only write policy are unchanged.
Compiled debug, release and MSRV dependencies remain useful: full verification
includes release Clippy as well as debug tests.

The first PR run is expected to be cold. After merge, a successful ordinary main
run populates the cache; a later ordinary PR run can demonstrate reuse. Do not
start extra smoke runs solely to warm or benchmark it. Record the restore/save
result and compare Rust check/build steps and total job duration, including cache
transfer time, on the same runner image and toolchains before reporting a time
saving. A miss, eviction, or image update must leave all
existing checks operational. Release and audit workflows keep their current
build behavior.

## Cold native builds

Both native smoke jobs have a finite 60-minute budget. Every verification,
Companion, database-upgrade and packaged-app gate remains blocking. The cache
planner uses the actual job deadline and preserves the maintenance reserve and
step limits above. Cache packing is optional maintenance, never a substitute for
completed application checks. Publication requires a complete successful main
run on the exact commit being released.
