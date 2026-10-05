# Native CI Rust Dependency Cache

The macOS and Windows smoke jobs in [CI](../.github/workflows/ci.yml) cache Cargo
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
[environment reader](../scripts/read-rust-cache-environment.mjs) hashes the two
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
[budget planner](../scripts/plan-rust-cache-save.mjs) checks the remaining time
against the job's existing limit (45 minutes on macOS, 60 on Windows). Cache
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
and unconditional. Their existing job timeouts remain in force. Cache paths,
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

## Initial main-run follow-up

The first main [CI run](https://github.com/bliatun-code/Filament-Manager/actions/runs/34381229276)
after #103, on `e751dcd29a380f35f407fbba1ba073e5a8cf06df`, failed in
`Clean workspace artifacts for cache` on both macOS and Windows: Cargo rejected
`target` because its `CACHEDIR.TAG` was missing or invalid. Neither job saved a
Rust cache.

The preparation step now writes valid cache-directory markers in the two fixed
CI build directories, `target` and `target/msrv`, before package cleanup. It uses
the same successful-main/cache-miss condition as cleanup and saving. Cargo's
cleanup checks and all verification gates remain in place. A successful ordinary
main run and a later PR run have now confirmed saving and reuse, as recorded below.

## Observed cache reuse on 2026-09-09

The main run after #104, [CI 34393298624](https://github.com/bliatun-code/Filament-Manager/actions/runs/34393298624),
passed cache preparation, workspace cleanup, and saving on both native jobs.
In #106, [CI 34402027229](https://github.com/bliatun-code/Filament-Manager/actions/runs/34402027229),
both the [macOS job](https://github.com/bliatun-code/Filament-Manager/actions/runs/34402027229/job/102635967542)
and the [Windows job](https://github.com/bliatun-code/Filament-Manager/actions/runs/34402027229/job/102635967460)
logged `Cache hit for:` and `Cache restored successfully` in **Restore Rust dependencies**.
Both jobs passed all verification and packaged application gates. As expected for
a PR, cleanup and saving were skipped.

These durations come from the jobs' recorded start and completion timestamps;
total job time includes cache transfer and all other steps, but excludes queue time.

| Step | macOS main #104 | macOS PR #106 | Windows main #104 | Windows PR #106 |
| --- | ---: | ---: | ---: | ---: |
| Restore Rust dependencies | 1 s | 30 s | 0 s | 58 s |
| Check Rust MSRV | 2 m 23 s | 19 s | 3 m 9 s | 22 s |
| Run full verification | 18 m 59 s | 16 m | 27 m 10 s | 15 m 57 s |
| Build native smoke bundle | 2 m 59 s | 2 m 52 s | 1 m 48 s | 1 m 21 s |
| Save Rust dependencies | 35 s | Skipped | 4 m 13 s | Skipped |
| Total job | 28 m 9 s | 22 m 47 s | 44 m 51 s | 21 m 52 s |

Cache reuse is confirmed; **cache-only time savings remain unmeasured**. These
ordinary runs used different commits and workloads, and this comparison does not
independently establish equal runner images and compiler environments between
them. Full verification also includes work beyond Rust compilation. The shorter
observed totals therefore cannot be attributed entirely to caching, particularly
because the main run also uploaded caches. No extra benchmark run was started.

## Windows timeout after #144 on 2026-10-01

In [main CI 36875290437](https://github.com/bliatun-code/Filament-Manager/actions/runs/36875290437),
Windows missed its exact Rust cache. Setup and MSRV checks took about eight
minutes, full verification passed in 29 minutes 20 seconds, and MSI build,
verification and clean installation also passed. Cache preparation and cleanup
completed around minute 43. `Save Rust dependencies` then spent over 17 minutes
in `tar`/`zstd` packing before the whole job reached its 60-minute limit and was
cancelled. No cache upload was visible in the log. macOS, migration integrity,
shared contracts and CodeQL passed.

This demonstrates an unbounded optional packing step, not a failing application
test. Previously saved Windows caches were about 1.3 GB compressed; the failed
archive's size and the reason for that unusually slow compression were not
recorded. The new budget bounds the optional work while preserving demonstrated
compiled-dependency reuse. It does not claim that compression itself is faster;
actual save/reuse behavior must be confirmed in ordinary main/PR runs.

That follow-up passed in the ordinary [main run after #145](https://github.com/bliatun-code/Filament-Manager/actions/runs/36895418581)
on `d757c341`: Windows missed the same exact cache key as the failed run, had
22.4 minutes remaining when planning maintenance, and logged a successful cache
save in about 1 minute 33 seconds. Its complete job passed in about 39 minutes
18 seconds. macOS restored its exact cache and skipped maintenance as intended;
all other CI and CodeQL jobs passed. This confirms normal save/reuse behavior,
not that the change itself accelerated compression or experimentally exercised
the timeout path. The timeout/budget contracts remain covered by focused tests.
