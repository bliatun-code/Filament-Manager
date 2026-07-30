# Public Repository Security

`bliatun-code/Filament-Manager` is the canonical public source repository.
Treat every committed object, release, workflow log, and uploaded artifact as
public information.

## Current repository controls

Repository settings complement the fail-closed checks kept in source:

- GitHub secret scanning and push protection are enabled.
- Private vulnerability reporting is enabled and is the preferred disclosure
  path described in [SECURITY.md](../SECURITY.md).
- Dependabot vulnerability alerts and security updates are enabled.
- GitHub Actions receives read-only repository access by default, cannot
  approve pull requests, and must reference actions by a full commit SHA.
- CodeQL runs for JavaScript/TypeScript, Rust, and GitHub Actions on public
  `main` changes, pull requests, a schedule, and manual requests.
- `main` requires the macOS and Windows smoke checks. Direct maintainer pushes
  remain an intentional solo-maintainer exception until the project adopts a
  pull-request-only workflow.
- The `github-release` environment accepts only `v*` tags. The
  `macos-release` environment accepts `main` and `v*` and is the only location
  holding Apple signing credentials.
- One tag ruleset limits creation of `v*` tags to the release maintainer. A
  separate ruleset prevents release-tag updates, non-fast-forward changes, and
  deletion.
- Release immutability protects releases created after the repository setting
  was enabled. The workflow creates a draft, uploads and verifies the exact
  asset set, and publishes only after those checks pass.

Required reviewers are not configured on the release environments while there
is only one maintainer. Adding a reviewer who is also the sole person starting
the workflow does not provide independent approval and can deadlock a release.
Add this gate when a second trusted maintainer is available.

## Current-tree checks

Before every public push, run:

```bash
npm run check:public-readiness
npm run check:github-actions-pinning
npm run verify
```

The public-readiness check rejects recognized credentials, private filesystem
paths, local databases, signing material, internal notes, and unsafe tracked
artifacts in the current tree. It is not a substitute for scanning history.

## Full-history secret scanning

The repository contains already-published development history. Do not rewrite
that history merely to make it resemble a squash mirror: existing clones,
caches, links, and commit identifiers would remain outside the rewrite.

Run a pinned, checksum-verified independent scanner against all refs after any
publication-candidate change. The initial public audit used Gitleaks `8.30.1`
for Apple Silicon; the official archive SHA-256 was:

```text
b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5
```

The all-ref scan command was:

```bash
gitleaks git . \
  --log-opts="--all --full-history" \
  --redact \
  --no-banner \
  --no-color
```

Three `generic-api-key` candidates were reviewed as deterministic UI test
identifiers, not credentials. Their exact historical fingerprints are recorded
in `.gitleaksignore`; the current source lines also carry narrow
`gitleaks:allow` comments. The reviewed all-ref rescan reported no remaining
findings.

Also scan a clean tracked-file archive so raw binary bytes are included. Do not
scan dependency caches, build outputs, databases, or ignored local artifacts
as though they were source:

```bash
git archive --format=tar HEAD -o source-tree.tar
mkdir source-tree
tar -xf source-tree.tar -C source-tree
gitleaks dir source-tree --max-archive-depth=0 --redact --no-banner --no-color
```

If GitHub secret scanning or the independent scan reports a possible
credential:

1. Do not publish the value in an issue, log, screenshot, or review comment.
2. Revoke or rotate it before any history-cleanup work.
3. Determine whether the value was ever valid and which systems it reached.
4. Follow GitHub's
   [sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
5. Coordinate any rewrite as a separate maintenance event. A rewrite is not a
   substitute for revocation.

## Clean source exports

`npm run audit:public-mirror` remains available for a new one-commit source
export, acquisition review, or future repository migration. It intentionally
requires:

- one raw root commit with no parents;
- only `refs/heads/main`;
- a clean worktree and no unreachable Git objects;
- the public maintainer identity from `config/publication-policy.json`; and
- no forbidden historical paths or recognized secret patterns.

It is not expected to pass in the canonical repository because that repository
has established public history. Never weaken the mirror audit merely to make
it accept a different publication model.

## Release setting checklist

Before creating a version tag:

1. Confirm macOS and Windows smoke are green on the exact `main` commit.
2. Confirm scheduled dependency/security checks are green.
3. Confirm CodeQL has no unresolved applicable findings.
4. Confirm both release environments retain their branch/tag filters.
5. Confirm both release-tag rulesets are active.
6. Confirm the public update metadata endpoint is anonymously reachable.
7. Push an annotated `v<version>` tag only from the release maintainer account.
8. Independently verify the published checksums, installers, SBOM, public
   provenance, and immutable release state.

GitHub environments and rulesets are repository settings, while the workflow
source performs its own tag, commit, artifact, signing, and provenance checks.
Neither layer replaces the other:

- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub immutable releases](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes)
