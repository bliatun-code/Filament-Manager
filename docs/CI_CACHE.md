# Native CI Rust Dependency Cache

The macOS and Windows smoke jobs in [CI](../.github/workflows/ci.yml) cache Cargo
registry/git downloads and compiled dependencies. MSRV checks, full verification,
database upgrades, bundle builds, and installed application tests still run on
every relevant push and pull request. No gate depends on a cache hit.

## Scope and keys

Each native job installs Rust 1.88.0 and the reviewed compiler from
`rust-toolchain.toml` before restoring its cache. The MSRV check uses `target/msrv`;
ordinary verification uses the normal target directory. One `. -> target`
workspace mapping covers both directories, while keeping their compiler output
separate.

The SHA-pinned `Swatinem/rust-cache` v2.9.2 action includes job ID, operating
system, architecture, installed compiler identities, relevant compiler
environment variables, Cargo manifests and lockfiles, and Rust configuration in
its cache keys. We also include runner image identity (`ImageOS`, `ImageVersion`)
and macOS deployment target/SDK environment variables when present. A changed
runner image or compiler therefore needs a new cache; a changed dependency graph
can restore the preceding cache for the same environment and let Cargo rebuild
affected dependencies. The `v1-native-smoke` prefix provides a manual reset if
needed. See the pinned action's
[key implementation](https://github.com/Swatinem/rust-cache/blob/6323deb102c322ba6fcbdcafc7e3dddab59af2b6/src/config.ts).

Workspace crates and Cargo-installed binaries are excluded from saved caches.
The action cleans target output recursively, retaining dependency entries in
`deps`, `build`, and `.fingerprint` for both ordinary and nested MSRV profiles.
Application binaries and bundles are rebuilt. Database fixtures and smoke logs
use `runner.temp` outside the cached directories. See the pinned action's
[cleanup implementation](https://github.com/Swatinem/rust-cache/blob/6323deb102c322ba6fcbdcafc7e3dddab59af2b6/src/cleanup.ts).

## Writes and validation

Only successful native jobs on a `push` to `refs/heads/main` may save a cache;
pull requests only restore it. Failed jobs do not save partial state. This follows
[GitHub's cache scope rules](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache):
pull requests may restore a default-branch cache, while a pull-request cache is
not available to the default branch.

The first PR run is expected to be cold. After merge, a successful ordinary main
run populates the cache; a later ordinary PR run can demonstrate reuse. Do not
start extra smoke runs solely to warm or benchmark it. Record the restore/save
result and compare Rust check/build steps on the same runner image and toolchains
before reporting a time saving. A miss, eviction, or image update must leave all
existing checks operational. Release and audit workflows keep their current
build behavior.
